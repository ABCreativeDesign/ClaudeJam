// claudejam/src/code.ts
/// <reference types="@figma/plugin-typings" />

// Bundled at build time by esbuild, so the panel can never show a stale version.
import { version as PLUGIN_VERSION } from "../package.json";

figma.showUI(__html__, { width: 320, height: 480, themeColors: true });

// The live plugin keeps its Figma-issued ID; the dev build (imported from the
// dev repo's manifest) has its own. Any other ID is treated as a dev build: it
// shows a DEV badge and defaults to the dev server's port so dev and live can
// run side by side.
const LIVE_PLUGIN_ID = "1623785803318635174";
const IS_DEV = figma.pluginId !== LIVE_PLUGIN_ID;
const DEFAULT_WS_PORT = IS_DEV ? 3767 : 3766;

// Send onboarding status and saved settings once UI is ready
Promise.all([
  figma.clientStorage.getAsync("onboardingComplete"),
  figma.clientStorage.getAsync("wsPort"),
]).then(([onboardingComplete, wsPort]) => {
  // Migrate stale port 3056 (old default) to the current default
  const resolvedPort =
    (wsPort as number) === 3056
      ? DEFAULT_WS_PORT
      : (wsPort as number) || DEFAULT_WS_PORT;
  if ((wsPort as number) === 3056) {
    figma.clientStorage.setAsync("wsPort", DEFAULT_WS_PORT);
  }
  figma.ui.postMessage({
    type: "onboarding-status",
    complete: !!onboardingComplete,
    wsPort: resolvedPort,
    isDev: IS_DEV,
    defaultWsPort: DEFAULT_WS_PORT,
    version: PLUGIN_VERSION,
    // Known locally, so the breadcrumb is filled before any connection
    file: figma.root.name,
    page: figma.currentPage.name,
  });
});

// ─── Page tracking ───────────────────────────────────────────────────────────

let claudeTargetPageId: string | null = null;
let isClaudeSwitching = false;

figma.on("currentpagechange", () => {
  const newId = figma.currentPage.id;
  const newName = figma.currentPage.name;

  figma.ui.postMessage({
    type: "page-update",
    file: figma.root.name,
    page: newName,
  });

  if (isClaudeSwitching) {
    isClaudeSwitching = false;
    claudeTargetPageId = newId;
    figma.ui.postMessage({ type: "page-warning-clear" });
    return;
  }

  // User manually navigated
  if (claudeTargetPageId && newId !== claudeTargetPageId) {
    const claudePage = figma.root.children.find(
      (p) => p.id === claudeTargetPageId,
    );
    figma.ui.postMessage({
      type: "page-warning",
      claudePage: claudePage?.name ?? "another page",
      claudePageId: claudeTargetPageId,
    });
  } else if (claudeTargetPageId && newId === claudeTargetPageId) {
    figma.ui.postMessage({ type: "page-warning-clear" });
  }
});

// ─── Message handler from UI ────────────────────────────────────────────────

figma.ui.onmessage = async (msg: Record<string, unknown>) => {
  switch (msg.type) {
    case "open-external": {
      figma.openExternal(msg.url as string);
      break;
    }
    case "set-onboarding-complete": {
      await figma.clientStorage.setAsync("onboardingComplete", true);
      break;
    }
    case "save-settings": {
      await figma.clientStorage.setAsync("wsPort", msg.wsPort as number);
      break;
    }
    case "execute-command": {
      // Only update the target page for non-switch commands — switch_page sets
      // claudeTargetPageId itself after the page change lands, preventing a
      // race where the current page (the user's page) gets stamped as the target
      // before the switch completes.
      if ((msg.commandType as string) !== "switch_page") {
        claudeTargetPageId = figma.currentPage.id;
      }
      try {
        const result = await dispatch(
          msg.commandType as string,
          msg.params as Record<string, unknown>,
        );
        const activity = describeCommand(
          msg.commandType as string,
          msg.params as Record<string, unknown>,
          result as Record<string, unknown>,
        );
        figma.ui.postMessage({
          type: "command-result",
          id: msg.id,
          result,
          ...activity,
        });
      } catch (e) {
        figma.ui.postMessage({
          type: "command-result",
          id: msg.id,
          error: (e as Error).message,
        });
      }
      break;
    }
    case "return-to-claude-page": {
      if (claudeTargetPageId) {
        const page = figma.root.children.find(
          (p) => p.id === claudeTargetPageId,
        );
        if (page) {
          isClaudeSwitching = true;
          await figma.setCurrentPageAsync(page as PageNode);
        }
      }
      break;
    }
    case "get-board-state": {
      try {
        const state = readBoard();
        figma.ui.postMessage({ type: "board-state", ...state });
      } catch (e) {
        figma.ui.postMessage({ type: "error", message: (e as Error).message });
      }
      break;
    }
    case "resize": {
      figma.ui.resize(msg.width as number, msg.height as number);
      break;
    }
    case "fit-to-board": {
      figma.viewport.scrollAndZoomIntoView(
        figma.currentPage.children as unknown as SceneNode[],
      );
      break;
    }
    case "clear-board": {
      try {
        for (const node of [...figma.currentPage.children]) node.remove();
        figma.ui.postMessage({
          type: "board-state",
          file: figma.root.name,
          page: figma.currentPage.name,
          nodes: [],
        });
      } catch (e) {
        figma.ui.postMessage({ type: "error", message: (e as Error).message });
      }
      break;
    }
    case "close-plugin": {
      figma.closePlugin();
      break;
    }
  }
};

// ─── Command dispatcher ─────────────────────────────────────────────────────

async function dispatch(
  commandType: string,
  params: Record<string, unknown>,
): Promise<unknown> {
  switch (commandType) {
    case "read_board":
      return readBoard();
    case "create_node":
      return await createNode(params);
    case "create_connector":
      return await createConnector(params);
    case "update_node":
      return await updateNode(params);
    case "delete_nodes":
      return deleteNodes(params);
    case "get_selection":
      return getSelection();
    case "list_pages":
      return listPages();
    case "switch_page":
      return switchPage(params);
    case "set_z_order":
      return setZOrder(params);
    default:
      throw new Error(`Unknown command: ${commandType}`);
  }
}

// ─── Canvas helpers ─────────────────────────────────────────────────────────

function hexToRGB(hex: string): RGB | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return null;
  return {
    r: parseInt(result[1], 16) / 255,
    g: parseInt(result[2], 16) / 255,
    b: parseInt(result[3], 16) / 255,
  };
}

function applyTextColor(node: SceneNode, hex: string) {
  const color = hexToRGB(hex);
  if (!color) return;
  const paint: SolidPaint = { type: "SOLID", color, visible: true, opacity: 1 };
  if (node.type === "STICKY") {
    (node as StickyNode).text.fills = [paint];
  } else if (node.type === "SHAPE_WITH_TEXT") {
    (node as ShapeWithTextNode).text.fills = [paint];
  } else if (node.type === "TEXT") {
    (node as TextNode).fills = [paint];
  }
}

function applyColor(node: SceneNode, hex: string) {
  const color = hexToRGB(hex);
  if (!color) return;
  const paint: SolidPaint = { type: "SOLID", color, visible: true, opacity: 1 };
  if (node.type === "CONNECTOR") {
    (node as ConnectorNode).strokes = [paint];
  } else {
    // Attempt to clear any applied fill style — fillStyleId takes precedence
    // over fills. Wrapped in try/catch because some FigJam node types throw
    // when you attempt to set fillStyleId (e.g. SHAPE_WITH_TEXT), which would
    // otherwise abort the function before fills is set.
    try {
      const withStyle = node as unknown as { fillStyleId?: string };
      if (withStyle.fillStyleId !== undefined && withStyle.fillStyleId !== "") {
        withStyle.fillStyleId = "";
      }
    } catch {
      // not settable on this node type — proceed to set fills directly
    }
    const withFills = node as unknown as { fills: Paint[] };
    if (withFills.fills !== undefined) {
      withFills.fills = [paint];
    }
  }
}

function nodeToSummary(node: SceneNode) {
  let content = "";
  if (node.type === "STICKY") content = (node as StickyNode).text.characters;
  else if (node.type === "SHAPE_WITH_TEXT")
    content = (node as ShapeWithTextNode).text.characters;
  else if (node.type === "TEXT") content = (node as TextNode).characters;
  else if (node.type === "SECTION") content = node.name;
  else if (node.type === "CONNECTOR") {
    const c = node as ConnectorNode;
    // Endpoints pinned to a canvas position (not a node) have no node id
    const endpointId = (e: ConnectorEndpoint | undefined) =>
      e && "endpointNodeId" in e ? e.endpointNodeId : "";
    content = `${endpointId(c.connectorStart)} → ${endpointId(c.connectorEnd)}`;
  }

  return {
    id: node.id,
    type: node.type,
    content,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    color: (() => {
      const n = node as { fills?: readonly Paint[] };
      const fill = n.fills?.[0];
      if (fill && fill.type === "SOLID") {
        const r = Math.round(fill.color.r * 255)
          .toString(16)
          .padStart(2, "0");
        const g = Math.round(fill.color.g * 255)
          .toString(16)
          .padStart(2, "0");
        const b = Math.round(fill.color.b * 255)
          .toString(16)
          .padStart(2, "0");
        return `#${r}${g}${b}`;
      }
      return "";
    })(),
  };
}

// ─── Canvas operations ──────────────────────────────────────────────────────

function collectNodes(nodes: readonly SceneNode[]): SceneNode[] {
  const result: SceneNode[] = [];
  for (const node of nodes) {
    result.push(node);
    if (node.type === "SECTION") {
      result.push(...collectNodes((node as SectionNode).children));
    }
  }
  return result;
}

function readBoard() {
  return {
    file: figma.root.name,
    page: figma.currentPage.name,
    nodes: collectNodes(figma.currentPage.children).map(nodeToSummary),
  };
}

function getSelection() {
  return { nodes: figma.currentPage.selection.map(nodeToSummary) };
}

// Tool-facing shape names → FigJam shapeType. Typed against the plugin API so
// an invalid FigJam value is a compile error rather than a runtime failure.
// Several tool names have no same-named FigJam equivalent.
const SHAPE_TYPES: Record<string, ShapeWithTextNode["shapeType"]> = {
  rounded_rectangle: "ROUNDED_RECTANGLE",
  square: "SQUARE",
  rectangle: "SQUARE", // FigJam has no RECTANGLE; SQUARE resizes freely
  ellipse: "ELLIPSE",
  diamond: "DIAMOND",
  triangle: "TRIANGLE_UP",
  parallelogram: "PARALLELOGRAM_RIGHT",
  star: "STAR",
  cross: "PLUS",
};

// figma.create*() places the node on the page immediately, so any error after
// creation would strand an empty node at 0,0. Remove it before rethrowing.
async function withOrphanCleanup<T extends SceneNode, R>(
  create: () => T,
  configure: (node: T) => Promise<R>,
): Promise<R> {
  const node = create();
  try {
    return await configure(node);
  } catch (e) {
    if (!node.removed) node.remove();
    throw e;
  }
}

async function createNode(params: Record<string, unknown>) {
  const type = params.type as string;

  // Validate enums before anything touches the canvas
  let shapeType: ShapeWithTextNode["shapeType"] = "ROUNDED_RECTANGLE";
  if (type === "shape" && params.shape !== undefined) {
    const resolved = SHAPE_TYPES[params.shape as string];
    if (!resolved) {
      throw new Error(
        `Unknown shape "${params.shape}". Valid: ${Object.keys(SHAPE_TYPES).join(", ")}`,
      );
    }
    shapeType = resolved;
  }

  // Fonts load before creation so a font failure can't strand a node either
  if (type === "sticky") {
    await figma.loadFontAsync({ family: "Inter", style: "Medium" });
  } else if (type === "shape") {
    await Promise.all([
      figma.loadFontAsync({ family: "Inter", style: "Regular" }),
      figma.loadFontAsync({ family: "Inter", style: "Medium" }),
    ]);
  } else if (type === "text") {
    await Promise.all([
      figma.loadFontAsync({ family: "Inter", style: "Regular" }),
      figma.loadFontAsync({ family: "Inter", style: "Medium" }),
      figma.loadFontAsync({ family: "Inter", style: "Bold" }),
    ]);
  } else if (type === "code_block") {
    // FigJam code blocks render in Source Code Pro; setting .code throws
    // without it loaded.
    await figma.loadFontAsync({ family: "Source Code Pro", style: "Medium" });
  }

  const create = (): SceneNode => {
    switch (type) {
      case "sticky":
        return figma.createSticky();
      case "shape":
        return figma.createShapeWithText();
      case "text":
        return figma.createText();
      case "section":
        return figma.createSection();
      case "table":
        return figma.createTable(
          (params.rows as number) ?? 3,
          (params.cols as number) ?? 3,
        );
      case "code_block":
        return figma.createCodeBlock();
      default:
        throw new Error(`Unknown node type: ${type}`);
    }
  };

  return withOrphanCleanup(create, (node) =>
    configureNode(node, type, shapeType, params),
  );
}

async function configureNode(
  node: SceneNode,
  type: string,
  shapeType: ShapeWithTextNode["shapeType"],
  params: Record<string, unknown>,
) {
  if (type === "sticky") {
    const sticky = node as StickyNode;
    if (params.content) sticky.text.characters = params.content as string;
  } else if (type === "shape") {
    const shape = node as ShapeWithTextNode;
    shape.shapeType = shapeType;
    if (params.font_size) shape.text.fontSize = params.font_size as number;
    if (params.content) shape.text.characters = params.content as string;
    if (params.font_size) shape.text.fontSize = params.font_size as number;
  } else if (type === "text") {
    const text = node as TextNode;
    const fontStyle = params.bold ? "Bold" : "Regular";
    // Set fontName and fontSize before characters — FigJam may lock size
    // once content is present
    if (params.bold) text.fontName = { family: "Inter", style: fontStyle };
    if (params.font_size) text.fontSize = params.font_size as number;
    if (params.content) text.characters = params.content as string;
    // Re-apply in case setting characters reset either property
    if (params.bold) text.fontName = { family: "Inter", style: fontStyle };
    if (params.font_size) text.fontSize = params.font_size as number;
  } else if (type === "section") {
    if (params.content) node.name = params.content as string;
  } else if (type === "code_block") {
    const cb = node as CodeBlockNode;
    if (params.code) cb.code = params.code as string;
    if (params.language) {
      cb.codeLanguage = (
        params.language as string
      ).toUpperCase() as CodeBlockNode["codeLanguage"];
    }
  }

  // Apply color BEFORE appendChild — FigJam's theme system resets fills
  // on append, overwriting any color set after the node hits the canvas.
  if (params.color !== undefined) {
    try {
      applyColor(node, params.color as string);
    } catch {
      // some node types don't support fills — ignore
    }
  }

  figma.currentPage.appendChild(node);

  if (params.x !== undefined) node.x = params.x as number;
  if (params.y !== undefined) node.y = params.y as number;
  if (params.width !== undefined && params.height !== undefined) {
    try {
      if ("resize" in node) {
        node.resize(params.width as number, params.height as number);
      }
    } catch {
      // some node types don't support resize — ignore
    }
  }

  // Re-apply color after append in case FigJam's theme reset it
  if (params.color !== undefined) {
    try {
      applyColor(node, params.color as string);
    } catch {
      // ignore
    }
  }

  // Apply text color (separate from fill color)
  if (params.text_color !== undefined) {
    try {
      applyTextColor(node, params.text_color as string);
    } catch {
      // ignore
    }
  }

  // Read back the stored fill so callers can verify what FigJam actually applied
  const storedColor = (() => {
    const n = node as { fills?: readonly Paint[] };
    const fill = n.fills?.[0];
    if (fill && fill.type === "SOLID") {
      const r = Math.round(fill.color.r * 255)
        .toString(16)
        .padStart(2, "0");
      const g = Math.round(fill.color.g * 255)
        .toString(16)
        .padStart(2, "0");
      const b = Math.round(fill.color.b * 255)
        .toString(16)
        .padStart(2, "0");
      return `#${r}${g}${b}`;
    }
    return null;
  })();

  // Report stored size too: FigJam silently clamps shapes to a 16px minimum
  // in both dimensions, so callers can't assume the requested size landed.
  return {
    id: node.id,
    color: storedColor,
    width: node.width,
    height: node.height,
  };
}

async function createConnector(params: Record<string, unknown>) {
  const fromNode = figma.currentPage.findOne((n) => n.id === params.from_id);
  const toNode = figma.currentPage.findOne((n) => n.id === params.to_id);
  if (!fromNode) throw new Error(`Node not found: ${params.from_id}`);
  if (!toNode) throw new Error(`Node not found: ${params.to_id}`);

  return withOrphanCleanup(
    () => figma.createConnector(),
    (connector) => configureConnector(connector, fromNode, toNode, params),
  );
}

async function configureConnector(
  connector: ConnectorNode,
  fromNode: BaseNode,
  toNode: BaseNode,
  params: Record<string, unknown>,
) {
  // Use explicit magnets based on relative node positions so FigJam can't
  // reverse the path direction. AUTO lets FigJam re-normalise the start/end
  // which causes arrowheads to appear at the wrong end for horizontal,
  // vertical, and some diagonal connectors.
  type Magnet = "AUTO" | "TOP" | "BOTTOM" | "LEFT" | "RIGHT" | "CENTER";
  let fromMagnet: Magnet = "AUTO";
  let toMagnet: Magnet = "AUTO";
  const fb = (fromNode as SceneNode).absoluteBoundingBox;
  const tb = (toNode as SceneNode).absoluteBoundingBox;
  if (fb && tb) {
    const dx = tb.x + tb.width / 2 - (fb.x + fb.width / 2);
    const dy = tb.y + tb.height / 2 - (fb.y + fb.height / 2);
    if (Math.abs(dx) >= Math.abs(dy)) {
      // Primary axis is horizontal — exit left/right from source
      fromMagnet = dx >= 0 ? "RIGHT" : "LEFT";
      // If there's a meaningful vertical offset, enter from top/bottom
      // (L-shaped elbow). Otherwise enter from the opposite side.
      if (Math.abs(dy) > 50) {
        toMagnet = dy >= 0 ? "TOP" : "BOTTOM";
      } else {
        toMagnet = dx >= 0 ? "LEFT" : "RIGHT";
      }
    } else {
      // Primary axis is vertical — exit top/bottom from source
      fromMagnet = dy >= 0 ? "BOTTOM" : "TOP";
      // If there's a meaningful horizontal offset, enter from left/right
      if (Math.abs(dx) > 50) {
        toMagnet = dx >= 0 ? "LEFT" : "RIGHT";
      } else {
        toMagnet = dy >= 0 ? "TOP" : "BOTTOM";
      }
    }
  }

  // Explicit magnet overrides (from MCP params)
  if (params.from_magnet) {
    fromMagnet = (
      params.from_magnet as string
    ).toUpperCase() as typeof fromMagnet;
  }
  if (params.to_magnet) {
    toMagnet = (params.to_magnet as string).toUpperCase() as typeof toMagnet;
  }

  // Set line type BEFORE assigning magnets — FigJam throws if non-CENTER
  // magnets are applied to a connector that is still in STRAIGHT (default) mode.
  const style = (params.style as string) ?? "elbowed";
  connector.connectorLineType =
    style === "straight"
      ? "STRAIGHT"
      : style === "curved"
        ? "CURVED"
        : "ELBOWED";

  // Straight connectors may only attach at CENTER — FigJam rejects side
  // magnets on them (enforced in development builds now, published later).
  // The line still stops at the node edge, aimed at the node's center.
  if (style === "straight") {
    fromMagnet = "CENTER";
    toMagnet = "CENTER";
  }

  connector.connectorStart = {
    endpointNodeId: fromNode.id,
    magnet: fromMagnet,
  };
  connector.connectorEnd = { endpointNodeId: toNode.id, magnet: toMagnet };

  // Set both caps explicitly. FigJam's default end cap is an arrow, so leaving
  // either unset makes "none" and "back" silently render a forward arrow.
  // ARROW_LINES is FigJam's own default arrowhead. Don't use TRIANGLE_FILLED:
  // its tip points away from the node it's attached to, so it reads backwards.
  const arrow = (params.arrow as string) ?? "forward";
  connector.connectorStartStrokeCap =
    arrow === "back" || arrow === "both" ? "ARROW_LINES" : "NONE";
  connector.connectorEndStrokeCap =
    arrow === "forward" || arrow === "both" ? "ARROW_LINES" : "NONE";

  figma.currentPage.appendChild(connector);

  let labelWarning: string | undefined;
  if (params.label) {
    try {
      await figma.loadFontAsync({ family: "Inter", style: "Medium" });
      (connector as ConnectorNode).text.characters = params.label as string;
    } catch (e) {
      labelWarning = `Label could not be set: ${(e as Error).message}`;
    }
  }

  return labelWarning
    ? { id: connector.id, warning: labelWarning }
    : { id: connector.id };
}

async function updateNode(params: Record<string, unknown>) {
  const node = figma.currentPage.findOne((n) => n.id === params.node_id);
  if (!node) throw new Error(`Node not found: ${params.node_id}`);

  if (params.content !== undefined) {
    if (node.type === "STICKY") {
      await figma.loadFontAsync({ family: "Inter", style: "Medium" });
      (node as StickyNode).text.characters = params.content as string;
    } else if (node.type === "SHAPE_WITH_TEXT") {
      await Promise.all([
        figma.loadFontAsync({ family: "Inter", style: "Regular" }),
        figma.loadFontAsync({ family: "Inter", style: "Medium" }),
      ]);
      const shapeNode = node as ShapeWithTextNode;
      if (params.font_size)
        shapeNode.text.fontSize = params.font_size as number;
      shapeNode.text.characters = params.content as string;
      if (params.font_size)
        shapeNode.text.fontSize = params.font_size as number;
    } else if (node.type === "TEXT") {
      await Promise.all([
        figma.loadFontAsync({ family: "Inter", style: "Regular" }),
        figma.loadFontAsync({ family: "Inter", style: "Medium" }),
      ]);
      (node as TextNode).characters = params.content as string;
      if (params.font_size)
        (node as TextNode).fontSize = params.font_size as number;
    } else if (node.type === "SECTION") {
      node.name = params.content as string;
    }
  }
  if (params.x !== undefined) node.x = params.x as number;
  if (params.y !== undefined) node.y = params.y as number;
  if (params.width !== undefined && params.height !== undefined) {
    try {
      if ("resize" in node) {
        node.resize(params.width as number, params.height as number);
      }
    } catch {
      // ignore
    }
  }
  if (params.color !== undefined) {
    try {
      applyColor(node, params.color as string);
    } catch {
      // ignore
    }
  }

  if (params.text_color !== undefined) {
    try {
      applyTextColor(node, params.text_color as string);
    } catch {
      // ignore
    }
  }

  if (
    node.type === "TEXT" &&
    (params.font_size !== undefined || params.bold !== undefined)
  ) {
    await Promise.all([
      figma.loadFontAsync({ family: "Inter", style: "Regular" }),
      figma.loadFontAsync({ family: "Inter", style: "Medium" }),
      figma.loadFontAsync({ family: "Inter", style: "Bold" }),
    ]);
    const textNode = node as TextNode;
    const existingSize =
      typeof textNode.fontSize === "number" ? textNode.fontSize : 12;
    if (params.bold !== undefined) {
      textNode.fontName = {
        family: "Inter",
        style: params.bold ? "Bold" : "Regular",
      };
      // Re-apply font size — changing fontName can reset it
      textNode.fontSize =
        params.font_size !== undefined
          ? (params.font_size as number)
          : existingSize;
    } else if (params.font_size !== undefined) {
      textNode.fontSize = params.font_size as number;
    }
  }

  return { id: node.id };
}

function listPages() {
  return {
    pages: figma.root.children.map((p) => ({
      id: p.id,
      name: p.name,
      isCurrent: p.id === figma.currentPage.id,
    })),
  };
}

async function switchPage(params: Record<string, unknown>) {
  const page = figma.root.children.find(
    (p) => p.name === params.name || p.id === params.id,
  );
  if (!page) throw new Error(`Page not found: ${params.name ?? params.id}`);
  isClaudeSwitching = true;
  await figma.setCurrentPageAsync(page as PageNode);
  // Explicitly reset flag and update target here. If switching to the page
  // already active, currentpagechange won't fire and isClaudeSwitching would
  // stay true, causing the next user navigation to be misread as Claude's.
  isClaudeSwitching = false;
  claudeTargetPageId = page.id;
  figma.ui.postMessage({ type: "page-warning-clear" });
  return { id: page.id, name: page.name };
}

function setZOrder(params: Record<string, unknown>) {
  const node = figma.currentPage.findOne((n) => n.id === params.node_id);
  if (!node) throw new Error(`Node not found: ${params.node_id}`);
  const parent = node.parent;
  if (!parent) throw new Error(`Node has no parent: ${params.node_id}`);
  if (params.z_order === "back") {
    (parent as ChildrenMixin).insertChild(0, node);
  } else if (params.z_order === "front") {
    (parent as ChildrenMixin).appendChild(node);
  } else {
    throw new Error(
      `Invalid z_order: ${params.z_order}. Use "front" or "back".`,
    );
  }
  return { id: node.id, z_order: params.z_order };
}

function deleteNodes(params: Record<string, unknown>) {
  const ids = Array.isArray(params.node_ids)
    ? (params.node_ids as string[])
    : [params.node_ids as string];

  const deleted: string[] = [];
  for (const id of ids) {
    const node = figma.currentPage.findOne((n) => n.id === id);
    if (node) {
      node.remove();
      deleted.push(id);
    }
  }
  return { deleted };
}

// ─── Activity descriptions ──────────────────────────────────────────────────

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function describeCommand(
  type: string,
  params: Record<string, unknown>,
  result: Record<string, unknown>,
) {
  const label = escHtml(
    (params.content as string) || (result.id as string) || "",
  );
  switch (type) {
    case "create_node":
      return {
        activityIcon: "+",
        activityClass: "create",
        activityText: `Created ${escHtml(params.type as string)} <span class="activity-name">"${label}"</span>`,
      };
    case "create_connector":
      return {
        activityIcon: "→",
        activityClass: "connect",
        activityText: `Connected <span class="activity-name">${escHtml(params.from_id as string)}</span> → <span class="activity-name">${escHtml(params.to_id as string)}</span>`,
      };
    case "update_node":
      return {
        activityIcon: "✎",
        activityClass: "edit",
        activityText: `Updated node <span class="activity-name">${escHtml(params.node_id as string)}</span>`,
      };
    case "delete_nodes": {
      const count = Array.isArray(params.node_ids)
        ? (params.node_ids as string[]).length
        : 1;
      return {
        activityIcon: "−",
        activityClass: "delete",
        activityText: `Deleted ${count} node${count !== 1 ? "s" : ""}`,
      };
    }
    case "set_z_order":
      return {
        activityIcon: "⇕",
        activityClass: "edit",
        activityText: `Moved node <span class="activity-name">${escHtml(params.node_id as string)}</span> to ${escHtml(params.z_order as string)}`,
      };
    default:
      return {};
  }
}
