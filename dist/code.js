"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getOwnPropSymbols = Object.getOwnPropertySymbols;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __propIsEnum = Object.prototype.propertyIsEnumerable;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __spreadValues = (a, b) => {
    for (var prop in b || (b = {}))
      if (__hasOwnProp.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    if (__getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(b)) {
        if (__propIsEnum.call(b, prop))
          __defNormalProp(a, prop, b[prop]);
      }
    return a;
  };
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
  var __async = (__this, __arguments, generator) => {
    return new Promise((resolve, reject) => {
      var fulfilled = (value) => {
        try {
          step(generator.next(value));
        } catch (e) {
          reject(e);
        }
      };
      var rejected = (value) => {
        try {
          step(generator.throw(value));
        } catch (e) {
          reject(e);
        }
      };
      var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
      step((generator = generator.apply(__this, __arguments)).next());
    });
  };

  // src/code.ts
  var require_code = __commonJS({
    "src/code.ts"(exports) {
      figma.showUI(__html__, { width: 320, height: 480, themeColors: true });
      Promise.all([
        figma.clientStorage.getAsync("onboardingComplete"),
        figma.clientStorage.getAsync("wsPort")
      ]).then(([onboardingComplete, wsPort]) => {
        const resolvedPort = wsPort === 3056 ? 3766 : wsPort || 3766;
        if (wsPort === 3056) {
          figma.clientStorage.setAsync("wsPort", 3766);
        }
        figma.ui.postMessage({
          type: "onboarding-status",
          complete: !!onboardingComplete,
          wsPort: resolvedPort
        });
      });
      var claudeTargetPageId = null;
      var isClaudeSwitching = false;
      figma.on("currentpagechange", () => {
        var _a;
        const newId = figma.currentPage.id;
        const newName = figma.currentPage.name;
        figma.ui.postMessage({
          type: "page-update",
          file: figma.root.name,
          page: newName
        });
        if (isClaudeSwitching) {
          isClaudeSwitching = false;
          claudeTargetPageId = newId;
          figma.ui.postMessage({ type: "page-warning-clear" });
          return;
        }
        if (claudeTargetPageId && newId !== claudeTargetPageId) {
          const claudePage = figma.root.children.find(
            (p) => p.id === claudeTargetPageId
          );
          figma.ui.postMessage({
            type: "page-warning",
            claudePage: (_a = claudePage == null ? void 0 : claudePage.name) != null ? _a : "another page",
            claudePageId: claudeTargetPageId
          });
        } else if (claudeTargetPageId && newId === claudeTargetPageId) {
          figma.ui.postMessage({ type: "page-warning-clear" });
        }
      });
      figma.ui.onmessage = (msg) => __async(exports, null, function* () {
        switch (msg.type) {
          case "open-external": {
            figma.openExternal(msg.url);
            break;
          }
          case "set-onboarding-complete": {
            yield figma.clientStorage.setAsync("onboardingComplete", true);
            break;
          }
          case "save-settings": {
            yield figma.clientStorage.setAsync("wsPort", msg.wsPort);
            break;
          }
          case "execute-command": {
            if (msg.commandType !== "switch_page") {
              claudeTargetPageId = figma.currentPage.id;
            }
            try {
              const result = yield dispatch(
                msg.commandType,
                msg.params
              );
              const activity = describeCommand(
                msg.commandType,
                msg.params,
                result
              );
              figma.ui.postMessage(__spreadValues({
                type: "command-result",
                id: msg.id,
                result
              }, activity));
            } catch (e) {
              figma.ui.postMessage({
                type: "command-result",
                id: msg.id,
                error: e.message
              });
            }
            break;
          }
          case "return-to-claude-page": {
            if (claudeTargetPageId) {
              const page = figma.root.children.find(
                (p) => p.id === claudeTargetPageId
              );
              if (page) {
                isClaudeSwitching = true;
                yield figma.setCurrentPageAsync(page);
              }
            }
            break;
          }
          case "get-board-state": {
            try {
              const state = readBoard();
              figma.ui.postMessage(__spreadValues({ type: "board-state" }, state));
            } catch (e) {
              figma.ui.postMessage({ type: "error", message: e.message });
            }
            break;
          }
          case "resize": {
            figma.ui.resize(msg.width, msg.height);
            break;
          }
          case "fit-to-board": {
            figma.viewport.scrollAndZoomIntoView(
              figma.currentPage.children
            );
            break;
          }
          case "clear-board": {
            try {
              for (const node of [...figma.currentPage.children])
                node.remove();
              figma.ui.postMessage({
                type: "board-state",
                file: figma.root.name,
                page: figma.currentPage.name,
                nodes: []
              });
            } catch (e) {
              figma.ui.postMessage({ type: "error", message: e.message });
            }
            break;
          }
          case "close-plugin": {
            figma.closePlugin();
            break;
          }
        }
      });
      function dispatch(commandType, params) {
        return __async(this, null, function* () {
          switch (commandType) {
            case "read_board":
              return readBoard();
            case "create_node":
              return yield createNode(params);
            case "create_connector":
              return yield createConnector(params);
            case "update_node":
              return yield updateNode(params);
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
        });
      }
      function hexToRGB(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        if (!result)
          return null;
        return {
          r: parseInt(result[1], 16) / 255,
          g: parseInt(result[2], 16) / 255,
          b: parseInt(result[3], 16) / 255
        };
      }
      function applyTextColor(node, hex) {
        const color = hexToRGB(hex);
        if (!color)
          return;
        const paint = { type: "SOLID", color, visible: true, opacity: 1 };
        if (node.type === "STICKY") {
          node.text.fills = [paint];
        } else if (node.type === "SHAPE_WITH_TEXT") {
          node.text.fills = [paint];
        } else if (node.type === "TEXT") {
          node.fills = [paint];
        }
      }
      function applyColor(node, hex) {
        const color = hexToRGB(hex);
        if (!color)
          return;
        const paint = { type: "SOLID", color, visible: true, opacity: 1 };
        if (node.type === "CONNECTOR") {
          node.strokes = [paint];
        } else {
          try {
            const withStyle = node;
            if (withStyle.fillStyleId !== void 0 && withStyle.fillStyleId !== "") {
              withStyle.fillStyleId = "";
            }
          } catch (e) {
          }
          const withFills = node;
          if (withFills.fills !== void 0) {
            withFills.fills = [paint];
          }
        }
      }
      function nodeToSummary(node) {
        let content = "";
        if (node.type === "STICKY")
          content = node.text.characters;
        else if (node.type === "SHAPE_WITH_TEXT")
          content = node.text.characters;
        else if (node.type === "TEXT")
          content = node.characters;
        else if (node.type === "SECTION")
          content = node.name;
        else if (node.type === "CONNECTOR") {
          const c = node;
          const endpointId = (e) => e && "endpointNodeId" in e ? e.endpointNodeId : "";
          content = `${endpointId(c.connectorStart)} \u2192 ${endpointId(c.connectorEnd)}`;
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
            var _a;
            const n = node;
            const fill = (_a = n.fills) == null ? void 0 : _a[0];
            if (fill && fill.type === "SOLID") {
              const r = Math.round(fill.color.r * 255).toString(16).padStart(2, "0");
              const g = Math.round(fill.color.g * 255).toString(16).padStart(2, "0");
              const b = Math.round(fill.color.b * 255).toString(16).padStart(2, "0");
              return `#${r}${g}${b}`;
            }
            return "";
          })()
        };
      }
      function collectNodes(nodes) {
        const result = [];
        for (const node of nodes) {
          result.push(node);
          if (node.type === "SECTION") {
            result.push(...collectNodes(node.children));
          }
        }
        return result;
      }
      function readBoard() {
        return {
          file: figma.root.name,
          page: figma.currentPage.name,
          nodes: collectNodes(figma.currentPage.children).map(nodeToSummary)
        };
      }
      function getSelection() {
        return { nodes: figma.currentPage.selection.map(nodeToSummary) };
      }
      var SHAPE_TYPES = {
        rounded_rectangle: "ROUNDED_RECTANGLE",
        square: "SQUARE",
        rectangle: "SQUARE",
        // FigJam has no RECTANGLE; SQUARE resizes freely
        ellipse: "ELLIPSE",
        diamond: "DIAMOND",
        triangle: "TRIANGLE_UP",
        parallelogram: "PARALLELOGRAM_RIGHT",
        star: "STAR",
        cross: "PLUS"
      };
      function withOrphanCleanup(create, configure) {
        return __async(this, null, function* () {
          const node = create();
          try {
            return yield configure(node);
          } catch (e) {
            if (!node.removed)
              node.remove();
            throw e;
          }
        });
      }
      function createNode(params) {
        return __async(this, null, function* () {
          const type = params.type;
          let shapeType = "ROUNDED_RECTANGLE";
          if (type === "shape" && params.shape !== void 0) {
            const resolved = SHAPE_TYPES[params.shape];
            if (!resolved) {
              throw new Error(
                `Unknown shape "${params.shape}". Valid: ${Object.keys(SHAPE_TYPES).join(", ")}`
              );
            }
            shapeType = resolved;
          }
          if (type === "sticky") {
            yield figma.loadFontAsync({ family: "Inter", style: "Medium" });
          } else if (type === "shape") {
            yield Promise.all([
              figma.loadFontAsync({ family: "Inter", style: "Regular" }),
              figma.loadFontAsync({ family: "Inter", style: "Medium" })
            ]);
          } else if (type === "text") {
            yield Promise.all([
              figma.loadFontAsync({ family: "Inter", style: "Regular" }),
              figma.loadFontAsync({ family: "Inter", style: "Medium" }),
              figma.loadFontAsync({ family: "Inter", style: "Bold" })
            ]);
          } else if (type === "code_block") {
            yield figma.loadFontAsync({ family: "Source Code Pro", style: "Medium" });
          }
          const create = () => {
            var _a, _b;
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
                  (_a = params.rows) != null ? _a : 3,
                  (_b = params.cols) != null ? _b : 3
                );
              case "code_block":
                return figma.createCodeBlock();
              default:
                throw new Error(`Unknown node type: ${type}`);
            }
          };
          return withOrphanCleanup(
            create,
            (node) => configureNode(node, type, shapeType, params)
          );
        });
      }
      function configureNode(node, type, shapeType, params) {
        return __async(this, null, function* () {
          if (type === "sticky") {
            const sticky = node;
            if (params.content)
              sticky.text.characters = params.content;
          } else if (type === "shape") {
            const shape = node;
            shape.shapeType = shapeType;
            if (params.font_size)
              shape.text.fontSize = params.font_size;
            if (params.content)
              shape.text.characters = params.content;
            if (params.font_size)
              shape.text.fontSize = params.font_size;
          } else if (type === "text") {
            const text = node;
            const fontStyle = params.bold ? "Bold" : "Regular";
            if (params.bold)
              text.fontName = { family: "Inter", style: fontStyle };
            if (params.font_size)
              text.fontSize = params.font_size;
            if (params.content)
              text.characters = params.content;
            if (params.bold)
              text.fontName = { family: "Inter", style: fontStyle };
            if (params.font_size)
              text.fontSize = params.font_size;
          } else if (type === "section") {
            if (params.content)
              node.name = params.content;
          } else if (type === "code_block") {
            const cb = node;
            if (params.code)
              cb.code = params.code;
            if (params.language) {
              cb.codeLanguage = params.language.toUpperCase();
            }
          }
          if (params.color !== void 0) {
            try {
              applyColor(node, params.color);
            } catch (e) {
            }
          }
          figma.currentPage.appendChild(node);
          if (params.x !== void 0)
            node.x = params.x;
          if (params.y !== void 0)
            node.y = params.y;
          if (params.width !== void 0 && params.height !== void 0) {
            try {
              if ("resize" in node) {
                node.resize(params.width, params.height);
              }
            } catch (e) {
            }
          }
          if (params.color !== void 0) {
            try {
              applyColor(node, params.color);
            } catch (e) {
            }
          }
          if (params.text_color !== void 0) {
            try {
              applyTextColor(node, params.text_color);
            } catch (e) {
            }
          }
          const storedColor = (() => {
            var _a;
            const n = node;
            const fill = (_a = n.fills) == null ? void 0 : _a[0];
            if (fill && fill.type === "SOLID") {
              const r = Math.round(fill.color.r * 255).toString(16).padStart(2, "0");
              const g = Math.round(fill.color.g * 255).toString(16).padStart(2, "0");
              const b = Math.round(fill.color.b * 255).toString(16).padStart(2, "0");
              return `#${r}${g}${b}`;
            }
            return null;
          })();
          return {
            id: node.id,
            color: storedColor,
            width: node.width,
            height: node.height
          };
        });
      }
      function createConnector(params) {
        return __async(this, null, function* () {
          const fromNode = figma.currentPage.findOne((n) => n.id === params.from_id);
          const toNode = figma.currentPage.findOne((n) => n.id === params.to_id);
          if (!fromNode)
            throw new Error(`Node not found: ${params.from_id}`);
          if (!toNode)
            throw new Error(`Node not found: ${params.to_id}`);
          return withOrphanCleanup(
            () => figma.createConnector(),
            (connector) => configureConnector(connector, fromNode, toNode, params)
          );
        });
      }
      function configureConnector(connector, fromNode, toNode, params) {
        return __async(this, null, function* () {
          var _a, _b;
          let fromMagnet = "AUTO";
          let toMagnet = "AUTO";
          const fb = fromNode.absoluteBoundingBox;
          const tb = toNode.absoluteBoundingBox;
          if (fb && tb) {
            const dx = tb.x + tb.width / 2 - (fb.x + fb.width / 2);
            const dy = tb.y + tb.height / 2 - (fb.y + fb.height / 2);
            if (Math.abs(dx) >= Math.abs(dy)) {
              fromMagnet = dx >= 0 ? "RIGHT" : "LEFT";
              if (Math.abs(dy) > 50) {
                toMagnet = dy >= 0 ? "TOP" : "BOTTOM";
              } else {
                toMagnet = dx >= 0 ? "LEFT" : "RIGHT";
              }
            } else {
              fromMagnet = dy >= 0 ? "BOTTOM" : "TOP";
              if (Math.abs(dx) > 50) {
                toMagnet = dx >= 0 ? "LEFT" : "RIGHT";
              } else {
                toMagnet = dy >= 0 ? "TOP" : "BOTTOM";
              }
            }
          }
          if (params.from_magnet) {
            fromMagnet = params.from_magnet.toUpperCase();
          }
          if (params.to_magnet) {
            toMagnet = params.to_magnet.toUpperCase();
          }
          const style = (_a = params.style) != null ? _a : "elbowed";
          connector.connectorLineType = style === "straight" ? "STRAIGHT" : style === "curved" ? "CURVED" : "ELBOWED";
          if (style === "straight") {
            fromMagnet = "CENTER";
            toMagnet = "CENTER";
          }
          connector.connectorStart = {
            endpointNodeId: fromNode.id,
            magnet: fromMagnet
          };
          connector.connectorEnd = { endpointNodeId: toNode.id, magnet: toMagnet };
          const arrow = (_b = params.arrow) != null ? _b : "forward";
          connector.connectorStartStrokeCap = arrow === "back" || arrow === "both" ? "ARROW_LINES" : "NONE";
          connector.connectorEndStrokeCap = arrow === "forward" || arrow === "both" ? "ARROW_LINES" : "NONE";
          figma.currentPage.appendChild(connector);
          let labelWarning;
          if (params.label) {
            try {
              yield figma.loadFontAsync({ family: "Inter", style: "Medium" });
              connector.text.characters = params.label;
            } catch (e) {
              labelWarning = `Label could not be set: ${e.message}`;
            }
          }
          return labelWarning ? { id: connector.id, warning: labelWarning } : { id: connector.id };
        });
      }
      function updateNode(params) {
        return __async(this, null, function* () {
          const node = figma.currentPage.findOne((n) => n.id === params.node_id);
          if (!node)
            throw new Error(`Node not found: ${params.node_id}`);
          if (params.content !== void 0) {
            if (node.type === "STICKY") {
              yield figma.loadFontAsync({ family: "Inter", style: "Medium" });
              node.text.characters = params.content;
            } else if (node.type === "SHAPE_WITH_TEXT") {
              yield Promise.all([
                figma.loadFontAsync({ family: "Inter", style: "Regular" }),
                figma.loadFontAsync({ family: "Inter", style: "Medium" })
              ]);
              const shapeNode = node;
              if (params.font_size)
                shapeNode.text.fontSize = params.font_size;
              shapeNode.text.characters = params.content;
              if (params.font_size)
                shapeNode.text.fontSize = params.font_size;
            } else if (node.type === "TEXT") {
              yield Promise.all([
                figma.loadFontAsync({ family: "Inter", style: "Regular" }),
                figma.loadFontAsync({ family: "Inter", style: "Medium" })
              ]);
              node.characters = params.content;
              if (params.font_size)
                node.fontSize = params.font_size;
            } else if (node.type === "SECTION") {
              node.name = params.content;
            }
          }
          if (params.x !== void 0)
            node.x = params.x;
          if (params.y !== void 0)
            node.y = params.y;
          if (params.width !== void 0 && params.height !== void 0) {
            try {
              if ("resize" in node) {
                node.resize(params.width, params.height);
              }
            } catch (e) {
            }
          }
          if (params.color !== void 0) {
            try {
              applyColor(node, params.color);
            } catch (e) {
            }
          }
          if (params.text_color !== void 0) {
            try {
              applyTextColor(node, params.text_color);
            } catch (e) {
            }
          }
          if (node.type === "TEXT" && (params.font_size !== void 0 || params.bold !== void 0)) {
            yield Promise.all([
              figma.loadFontAsync({ family: "Inter", style: "Regular" }),
              figma.loadFontAsync({ family: "Inter", style: "Medium" }),
              figma.loadFontAsync({ family: "Inter", style: "Bold" })
            ]);
            const textNode = node;
            const existingSize = typeof textNode.fontSize === "number" ? textNode.fontSize : 12;
            if (params.bold !== void 0) {
              textNode.fontName = {
                family: "Inter",
                style: params.bold ? "Bold" : "Regular"
              };
              textNode.fontSize = params.font_size !== void 0 ? params.font_size : existingSize;
            } else if (params.font_size !== void 0) {
              textNode.fontSize = params.font_size;
            }
          }
          return { id: node.id };
        });
      }
      function listPages() {
        return {
          pages: figma.root.children.map((p) => ({
            id: p.id,
            name: p.name,
            isCurrent: p.id === figma.currentPage.id
          }))
        };
      }
      function switchPage(params) {
        return __async(this, null, function* () {
          var _a;
          const page = figma.root.children.find(
            (p) => p.name === params.name || p.id === params.id
          );
          if (!page)
            throw new Error(`Page not found: ${(_a = params.name) != null ? _a : params.id}`);
          isClaudeSwitching = true;
          yield figma.setCurrentPageAsync(page);
          isClaudeSwitching = false;
          claudeTargetPageId = page.id;
          figma.ui.postMessage({ type: "page-warning-clear" });
          return { id: page.id, name: page.name };
        });
      }
      function setZOrder(params) {
        const node = figma.currentPage.findOne((n) => n.id === params.node_id);
        if (!node)
          throw new Error(`Node not found: ${params.node_id}`);
        const parent = node.parent;
        if (!parent)
          throw new Error(`Node has no parent: ${params.node_id}`);
        if (params.z_order === "back") {
          parent.insertChild(0, node);
        } else if (params.z_order === "front") {
          parent.appendChild(node);
        } else {
          throw new Error(
            `Invalid z_order: ${params.z_order}. Use "front" or "back".`
          );
        }
        return { id: node.id, z_order: params.z_order };
      }
      function deleteNodes(params) {
        const ids = Array.isArray(params.node_ids) ? params.node_ids : [params.node_ids];
        const deleted = [];
        for (const id of ids) {
          const node = figma.currentPage.findOne((n) => n.id === id);
          if (node) {
            node.remove();
            deleted.push(id);
          }
        }
        return { deleted };
      }
      function escHtml(s) {
        return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
      }
      function describeCommand(type, params, result) {
        const label = escHtml(
          params.content || result.id || ""
        );
        switch (type) {
          case "create_node":
            return {
              activityIcon: "+",
              activityClass: "create",
              activityText: `Created ${escHtml(params.type)} <span class="activity-name">"${label}"</span>`
            };
          case "create_connector":
            return {
              activityIcon: "\u2192",
              activityClass: "connect",
              activityText: `Connected <span class="activity-name">${escHtml(params.from_id)}</span> \u2192 <span class="activity-name">${escHtml(params.to_id)}</span>`
            };
          case "update_node":
            return {
              activityIcon: "\u270E",
              activityClass: "edit",
              activityText: `Updated node <span class="activity-name">${escHtml(params.node_id)}</span>`
            };
          case "delete_nodes": {
            const count = Array.isArray(params.node_ids) ? params.node_ids.length : 1;
            return {
              activityIcon: "\u2212",
              activityClass: "delete",
              activityText: `Deleted ${count} node${count !== 1 ? "s" : ""}`
            };
          }
          case "set_z_order":
            return {
              activityIcon: "\u21D5",
              activityClass: "edit",
              activityText: `Moved node <span class="activity-name">${escHtml(params.node_id)}</span> to ${escHtml(params.z_order)}`
            };
          default:
            return {};
        }
      }
    }
  });
  require_code();
})();
