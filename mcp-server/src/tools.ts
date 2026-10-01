// claudejam/mcp-server/src/tools.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Bridge } from "./bridge.js";
import { BOARD_TYPES, getBoardRules, listBoardTypes } from "./board-rules.js";

// Exported for tests
export const createNodeSchema = z.object({
  type: z.enum(["sticky", "shape", "text", "section", "table", "code_block"]),
  content: z.string().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  color: z.string().optional(),
  text_color: z.string().optional(),
  shape: z
    .enum([
      "rounded_rectangle",
      "square",
      "rectangle",
      "ellipse",
      "diamond",
      "triangle",
      "parallelogram",
      "star",
      "cross",
    ])
    .optional(),
  rows: z.number().int().positive().optional(),
  cols: z.number().int().positive().optional(),
  code: z.string().optional(),
  language: z.string().optional(),
});

export const createConnectorSchema = z.object({
  from_id: z.string(),
  to_id: z.string(),
  style: z.enum(["straight", "elbowed", "curved"]).optional(),
  label: z.string().optional(),
  arrow: z.enum(["forward", "back", "both", "none"]).optional(),
});

export const updateNodeSchema = z.object({
  node_id: z.string(),
  content: z.string().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  color: z.string().optional(),
  text_color: z.string().optional(),
});

export const deleteNodesSchema = z.object({
  node_ids: z.union([z.string(), z.array(z.string())]),
});

export function registerTools(server: McpServer, bridge: Bridge) {
  server.tool(
    "figjam_read_board",
    "Returns full board state: all nodes with IDs, types, positions, content, and colors. USE THIS TOOL (not generate_diagram) when the user asks to create a diagram or flowchart in FigJam — these tools write directly to the live open board. generate_diagram creates a separate disposable Mermaid file with a claim link; figjam_create_node/figjam_create_connector write directly to the board the user already has open. Always prefer direct writing when the plugin is connected. ALWAYS call this before making any changes to understand the current state of the board. After a page switch, call this again to confirm you are on the correct page before writing. CHUNKED CONSTRUCTION: when building a board with multiple sections, never generate all node and connector calls in a single response — this exceeds the output token limit. Instead: (1) plan the full layout topology and coordinates silently before writing anything; (2) execute one section at a time — container shape, label, child nodes, then internal connectors; (3) call figjam_read_board after each section to confirm node IDs before proceeding; (4) add all cross-section connectors in a final pass once all sections are placed. Each response should cover at most one section plus its internal connectors.",
    {},
    async () => {
      try {
        const result = await bridge.execute("read_board", {});
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(result, null, 2) },
          ],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          isError: true,
          content: [{ type: "text" as const, text: message }],
        };
      }
    },
  );

  server.tool(
    "figjam_create_node",
    "Creates any FigJam node (sticky, shape, text, section, table, code_block). Returns { id, color, width, height } — the values FigJam actually stored after creation. Always check them against what you passed: a differing color means the fill was overridden, and shapes are clamped to a 16px minimum in both width and height (a 4px divider comes back as 16px). IMPORTANT: For multi-line content, use actual newline characters in the string — do NOT use \\n escape sequences, as they will render literally. BOARD LAYOUT: Before building any structured board (brainstorm, competitive analysis, customer journey, kanban, mood board, retrospective, swimlane/prioritization, timeline/roadmap, user persona), ALWAYS call figjam_get_board_rules first with the board type to get exact layout coordinates, color systems, and build order. Do not guess layout — the rules contain empirically verified positions. SHAPE HEIGHT: FigJam truncates overflowing text silently with no visual warning. Safe minimums at font_size=16: 1 line → 44px, 2 lines → 128px, +24px per additional line. Word-wrap counts as extra line (Inter 16px ≈ 9px/char). When in doubt, size generously. LAYOUT RULES: Use a 4px grid — all x/y positions and width/height values must be multiples of 4. Use shape nodes as group containers instead of sections (sections cannot be resized programmatically). BASE ATOM: default node size is 224×116px (rounded_rectangle) or 200×200px (diamond). Node size is content-driven — scale to content in 4px increments. Container padding is 48px all sides, so a single-node container = node_width+96 × node_height+96. Container width = max_node_width + 96. Container height = (sum of node heights) + (gaps between nodes) + 96. COLOR RULES — always pass color explicitly (FigJam defaults shape nodes to gray if omitted). Color is determined by node role, not by type: section container background shape → color=#f0f2ff (light blue-gray; this is the ONLY node that gets #f0f2ff — do not use it on any other node); content nodes inside the container, branch label nodes, pivot nodes → color=#ffffff (white); section label text nodes (type=text, the bold stage name above each container) → omit color entirely (leave at FigJam dark default so they are readable on the canvas). Summary: one #f0f2ff per section (the container), everything else that takes a color gets #ffffff. Never apply #f0f2ff to content nodes — it makes nodes and container visually indistinguishable. Container pattern: (1) create container shape with shape=rounded_rectangle, color=#f0f2ff — NEVER use shape=square or shape=rectangle for containers, they render with sharp corners inconsistent with node styling; (2) immediately call figjam_set_z_order with z_order='back' on the container — this is mandatory, not optional; (3) then create child nodes — nodes created after the z_order=back call have higher z-order and render on top automatically. Do not call z_order='front' on child nodes; just create them after step 2. Section labels (the stage name above each container) should be type=text, font_size=24, bold=true, same x as container, y = container_y − 44 (leaves room for the 36px bold label plus an 8px gap above the container top). Note: FigJam text nodes snap to preset sizes — 24px = Medium, 16px = Small (snaps and shows as 'Small' in inspector), 12px = Small (shows as '12' in inspector, not 'Small' — prefer 16). Shape text size: pass font_size=16 to get Small text (recommended default for all content nodes), font_size=24 for Medium. Always pass font_size explicitly — if omitted, FigJam picks the size based on canvas state which is unpredictable. For connector branch labels, use type=shape (rounded_rectangle, height=32, color=#ffffff, font_size=16). Label width by character count — always count label text length before placing: ≤8 chars → width=96px; 9–11 chars → width=144px; 12+ chars → width=192px. Do not default to 96px without checking length — do NOT use the connector label param (always renders at midpoint). Z-ORDER: branch label nodes MUST be created AFTER their connectors — nodes created later have higher z-order and render on top of earlier nodes. If labels are created before connectors, the connectors will cover them. BRANCH LABEL PLACEMENT — arrival anchor: place labels just before the target node, anchored to the face the connector enters. Entry direction is determined by which face of the target the connector arrives at (to_magnet value): LEFT entry (to_magnet=LEFT, source is left of target): label_x = target_x - label_width - 8, label_y = target_center_y - label_height/2; TOP entry (to_magnet=TOP, source is above target): label_x = target_center_x - label_width/2 (recalculate using actual label_width from the character-count rule above), label_y = target_y - label_height - 8; RIGHT entry (to_magnet=RIGHT, source is right of target): label_x = target_x + target_width + 8, label_y = target_center_y - label_height/2; BOTTOM entry (to_magnet=BOTTOM, source is below target): label_x = target_center_x - label_width/2, label_y = target_y + target_height + 8. When multiple branch labels arrive at the same face of the same target node, center the stack on the face midpoint with 4px gaps between labels: first_label_offset = -((n × label_height + (n-1) × 4) / 2); each subsequent label offset by label_height + 4. FEEDBACK ARC LABELS (different rule): feedback connectors that loop back to an earlier stage have a long horizontal segment at the bottom of their path. Place the label centered on that segment — not using the arrival-anchor offset. Formula: label_y = arc_bbox_bottom - label_height/2 (centers label vertically on the horizontal run); label_x = midpoint of the horizontal segment - label_width/2. This is distinct from arrival-anchor placement — do not apply the 8px node-face offset to feedback arc labels. LABEL/NODE CONTENT RULE: connector label carries the branch condition only (e.g., 'Video', '2D image', '>250MB'); node content carries the outcome/method only. Do NOT repeat the branch condition in both — strip it from the node first line once a connector label is placed. TOPOLOGY-FIRST PLACEMENT: always map the full connection graph before placing any node. Placement is deterministic once topology is known: (1) identify the anchor row — the row with the most nodes, which defines section width; (2) place anchor row at minimum spacing; (3) every other node centers over its direct connection targets only, not the full row width — if a hub connects to 3 of 5 nodes in a row, center it over those 3, not all 5; (4) hub centered over targets: hub_x = (leftmost_target_center + rightmost_target_center) / 2 − hub_width / 2; (5) targets spread from hub: leftmost_x = hub_center_x − ((n × node_w) + ((n−1) × col_gap)) / 2. SPACING RULES — all values are minimums, not fixed; actual gaps can scale up proportionally, always rounded to nearest 4px: row gap = whitespace between node edges, NOT stride. Formula: next_node_y = current_node_y + current_node_height + gap. Use gap=240px when connector branch label nodes sit between rows (labels need vertical clearance); gap=160px for simple sequential rows with no branch labels. Do not use top-edge-to-top-edge stride — that collapses the gap by the node height. Column gap = whitespace between node edges, NOT stride. Formula: next_node_x = current_node_x + current_node_width + gap. Use gap=160px minimum; stage gap = 400px of whitespace between container edges — this is NOT a stride. Formula: next_container_x = current_container_x + current_container_width + 400 (horizontal pipeline); next_container_y = current_container_y + current_container_height + 400 (vertical pipeline). Do not use left-edge-to-left-edge or top-edge-to-top-edge stride — that collapses the gap to near-zero once container width/height is subtracted. Scale container height/width to fit all rows with their gaps plus 32px padding top and bottom. When a node connects both up and down in a column, place the upstream target ABOVE the hub node to separate TOP/BOTTOM slot usage. width+height must both be passed together to resize — passing only one is silently ignored. Decision nodes (branching logic) use shape=diamond. THREE valid fan-out strategies — choose based on hub/target geometry: (A) SAME-AXIS EXIT: hub and targets share the same row (horizontal pipeline) or same column (vertical pipeline); |dx| > |dy| for every target in a horizontal pipeline, |dy| > |dx| in a vertical pipeline — AUTO routing picks correct entry sides, no explicit magnets needed. (B) PERPENDICULAR EXIT — hub above or below targets: place hub centered over the target row/column on the perpendicular axis; use from_magnet=BOTTOM + to_magnet=TOP (hub above) or from_magnet=TOP + to_magnet=BOTTOM (hub below). (C) PERPENDICULAR EXIT — hub left or right of targets: place hub centered vertically over the target column; use from_magnet=RIGHT + to_magnet=LEFT (hub left of targets) or from_magnet=LEFT + to_magnet=RIGHT (hub right of targets). Both magnets always required for B and C — omitting to_magnet causes AUTO to mis-route far-offset or closely-spaced targets to side entry instead of the intended face. FEEDBACK LOOP ALIGNMENT: when a node has a bidirectional or feedback connection to a node in a distant stage, align them on the shared axis of the pipeline — in a horizontal pipeline, place them at the same y-coordinate (same row) so the connector routes horizontally; in a vertical pipeline, place them at the same x-coordinate (same column) so the connector routes vertically. A feedback node offset on the shared axis produces a diagonal connector — reorder the local stack so the feedback node sits at the matching position. PIVOT NODES: use a pivot node when flow changes direction between sections (e.g. a horizontal pipeline branching into a vertical sub-flow). A pivot is a small stub node (224×116, rounded_rectangle, color=#ffffff, font_size=16) that receives flow from one direction and emits it perpendicular — label it to describe the transition (e.g. 'RETRY.FLOW', 'DELETE.FLOW'). Place it at the intersection of the two axes; connectors entering and leaving use magnets appropriate to their respective directions. REORDER SAFETY: before moving any node in a row or column, call figjam_read_board and list every node in that group with its current position on the shared axis. Plan all moves together — check that no two nodes share the same position after the reorder. Execute all moves before declaring done — partial moves leave nodes at conflicting positions.",
    {
      type: z.enum([
        "sticky",
        "shape",
        "text",
        "section",
        "table",
        "code_block",
      ]),
      content: z
        .string()
        .optional()
        .describe(
          "Text content. Use real newline characters for line breaks, not \\n.",
        ),
      x: z.number().optional().describe("Canvas x position"),
      y: z.number().optional().describe("Canvas y position"),
      width: z.number().optional(),
      height: z.number().optional(),
      color: z
        .string()
        .optional()
        .describe(
          "Hex color. REQUIRED — always pass explicitly. Rule by node role: section container background shape → #f0f2ff; content nodes, branch label nodes, pivot nodes → #ffffff; section label text nodes (type=text) → omit (dark default). #f0f2ff is ONLY for the single container shape per section — every other node that takes a color must be #ffffff.",
        ),
      text_color: z
        .string()
        .optional()
        .describe(
          "Hex color for the node's text. Use when the fill color is dark and the default text color would be unreadable. E.g. color=#1e40af (dark blue) → text_color=#ffffff for white text. If omitted, FigJam uses its default text color (dark), which is unreadable on dark fills.",
        ),
      font_size: z
        .number()
        .optional()
        .describe("Font size in pixels (text nodes only)"),
      bold: z
        .boolean()
        .optional()
        .describe("Bold text (text nodes only). Default false."),
      shape: z
        .enum([
          "rounded_rectangle",
          "square",
          "rectangle",
          "ellipse",
          "diamond",
          "triangle",
          "parallelogram",
          "star",
          "cross",
        ])
        .optional()
        .describe(
          "Shape style when type=shape. Defaults to rounded_rectangle if omitted.",
        ),
      rows: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Required when type=table"),
      cols: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Required when type=table"),
      code: z.string().optional().describe("Code content when type=code_block"),
      language: z
        .string()
        .optional()
        .describe("Language identifier when type=code_block, e.g. typescript"),
    },
    async (params) => {
      try {
        const result = await bridge.execute(
          "create_node",
          params as Record<string, unknown>,
        );
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          isError: true,
          content: [{ type: "text" as const, text: message }],
        };
      }
    },
  );

  server.tool(
    "figjam_create_connector",
    "Draws a connector (arrow/line) between two existing nodes by their IDs. LAYOUT RULES: Always use style=elbowed (default) — elbowed connectors route around nodes better than curved. PERPENDICULAR FAN-OUT: when a hub fans out to targets in the perpendicular direction, ALWAYS set BOTH from_magnet AND to_magnet explicitly on every connector. Hub above targets: from_magnet=BOTTOM, to_magnet=TOP. Hub below targets: from_magnet=TOP, to_magnet=BOTTOM. Hub left of targets: from_magnet=RIGHT, to_magnet=LEFT. Hub right of targets: from_magnet=LEFT, to_magnet=RIGHT. Without the explicit to_magnet, targets with large offset auto-detect side entry instead of the intended face — and even closely-spaced targets can mis-route. Two side-by-side targets with no explicit magnets produce a misleading double-headed arrow appearance between them. Both magnets are always required for a clean tree structure. CONVERGENCE (many nodes → one node): when a spread of nodes converge to a single target, split by approach side — nodes whose center is LEFT of the target center use to_magnet=LEFT, nodes to the RIGHT use to_magnet=RIGHT. In a vertical pipeline, nodes ABOVE the target use to_magnet=TOP, nodes BELOW use to_magnet=BOTTOM. Hitting a single connection point from all sides causes pile-up. When adding a node to an existing column, restack ALL column nodes with even 80px gaps. Cross-layer connectors that would cut through container shapes are a layout problem — fix by repositioning nodes or using annotation instead of drawing the connector. EXTERNAL FAN-IN TO MULTI-NODE SECTIONS: when connectors from an external source fan into a section with a 2D grid layout (multiple rows AND columns), connectors targeting non-nearest nodes route through intermediate nodes — piercing them. Fix depends on the pipeline orientation: (A) horizontal pipeline (source is left or right of section) — use a SINGLE-COLUMN layout so all nodes stack vertically and every connector enters from the side unobstructed; (B) vertical pipeline (source is above or below section) — use a SINGLE-ROW layout so all nodes sit in one row and every connector enters from top/bottom directly. If a 1D layout is impractical, place a pivot node at the section entry point and fan out internally within the section. CONNECTOR SEMANTICS: only use connectors for data flow relationships. Configuration or contextual relationships should be annotated in the node label instead (e.g. '⚙ configures X') — connectors imply flow. CONNECTOR LABELS: always label decision branch connectors with the branch condition (e.g. '2D image', 'video', '>250MB', 'Cancel', 'Confirm'). Do NOT use the connector label param — it always renders at the geometric midpoint of the path with no position control. Instead, create a floating type=shape node (rounded_rectangle, width=96, height=32, color=#ffffff, font_size=16). For BOTTOM EXIT fan-outs: left-going connectors — label_x = target_center_x + 8 (right of elbow); right-going — label_x = target_center_x - 104 (left of elbow); label_y = junction_y - 16. For nearly-vertical connectors: label_x = target_center_x - 48, label_y = (junction_y + target_top) / 2 - 16. Connector label = branch condition only; node content = outcome only — do not duplicate. Label key flow transitions to describe what changed. Labels are not needed on obvious convergence arrows where multiple paths merge to a single result node. CROSS-SECTION CONNECTOR MAGNETS: when a node in a vertical pipeline connects to a node outside its immediate column (different section, or non-adjacent row), always use from_magnet=BOTTOM — never LEFT or RIGHT as the source magnet. Exiting LEFT/RIGHT from a vertical pipeline node pierces the container wall and clips through intermediate nodes. For to_magnet on the target: use LEFT when the source is to the left of the target, RIGHT when source is to the right — this reads as a clean horizontal arrival in the overall left-to-right pipeline direction. Only use to_magnet=TOP/BOTTOM for the target when the connection is purely vertical with no significant horizontal travel. Never use to_magnet=BOTTOM for a target that is above and to the right of the source — this reads as a feedback loop.",
    {
      from_id: z.string().describe("Source node ID"),
      to_id: z.string().describe("Target node ID"),
      style: z
        .enum(["straight", "elbowed", "curved"])
        .optional()
        .describe("Line style, default: elbowed"),
      label: z
        .string()
        .optional()
        .describe(
          "WARNING: do not use for branch condition labels — this always renders at the geometric midpoint with no position control. Use a floating type=shape node instead (see figjam_create_node description). Only use label here for simple annotations on non-branching connectors where midpoint placement is acceptable.",
        ),
      arrow: z
        .enum(["forward", "back", "both", "none"])
        .optional()
        .describe("Arrow direction, default: forward"),
      from_magnet: z
        .enum(["AUTO", "TOP", "BOTTOM", "LEFT", "RIGHT"])
        .optional()
        .describe(
          "Override source connection point. AUTO = auto-detect from geometry. Ignored for style=straight, which always attaches at node centers.",
        ),
      to_magnet: z
        .enum(["AUTO", "TOP", "BOTTOM", "LEFT", "RIGHT"])
        .optional()
        .describe(
          "Override target connection point. AUTO = auto-detect from geometry. Ignored for style=straight, which always attaches at node centers.",
        ),
    },
    async (params) => {
      try {
        const result = await bridge.execute(
          "create_connector",
          params as Record<string, unknown>,
        );
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          isError: true,
          content: [{ type: "text" as const, text: message }],
        };
      }
    },
  );

  server.tool(
    "figjam_update_node",
    "Edit any property of an existing node. Pass only the fields that need to change. LIMITATIONS: (1) shape cannot be changed via update — to change a node's shape, delete it and recreate with the correct shape. (2) width/height changes on container shapes (SHAPE_WITH_TEXT used as section backgrounds) are silently ignored — to resize a container, delete it and recreate at the correct size, then call figjam_set_z_order z_order='back' and recreate child nodes. (3) color changes on existing container nodes are unreliable — all FigJam shapes are SHAPE_WITH_TEXT internally and fill updates do not always apply to already-placed nodes. If a container color must change, delete and recreate it.",
    {
      node_id: z.string().describe("ID of the node to update"),
      content: z.string().optional(),
      x: z.coerce.number().optional(),
      y: z.coerce.number().optional(),
      width: z.coerce.number().optional(),
      height: z.coerce.number().optional(),
      color: z.string().optional().describe("Hex color"),
      text_color: z
        .string()
        .optional()
        .describe(
          "Hex color for the node's text. Use to ensure readable contrast when fill color is dark.",
        ),
      font_size: z.coerce
        .number()
        .optional()
        .describe("Font size in pixels (text nodes only)"),
      bold: z.boolean().optional().describe("Bold text (text nodes only)."),
    },
    async (params) => {
      try {
        const result = await bridge.execute(
          "update_node",
          params as Record<string, unknown>,
        );
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          isError: true,
          content: [{ type: "text" as const, text: message }],
        };
      }
    },
  );

  server.tool(
    "figjam_delete_nodes",
    "Removes one or more nodes by ID. Accepts a single ID string or array of IDs.",
    {
      node_ids: z
        .union([z.string(), z.array(z.string())])
        .describe("Node ID or array of IDs to delete"),
    },
    async (params) => {
      try {
        const result = await bridge.execute(
          "delete_nodes",
          params as Record<string, unknown>,
        );
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          isError: true,
          content: [{ type: "text" as const, text: message }],
        };
      }
    },
  );

  server.tool(
    "figjam_list_pages",
    "Returns all pages in the FigJam file with their IDs, names, and which one is currently active.",
    {},
    async () => {
      try {
        const result = await bridge.execute("list_pages", {});
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(result, null, 2) },
          ],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          isError: true,
          content: [{ type: "text" as const, text: message }],
        };
      }
    },
  );

  server.tool(
    "figjam_switch_page",
    "Switches the active FigJam page by name or ID. After switching, figjam_read_board will return the new page's content.",
    {
      name: z.string().optional().describe("Page name to switch to"),
      id: z.string().optional().describe("Page ID to switch to"),
    },
    async (params) => {
      try {
        const result = await bridge.execute(
          "switch_page",
          params as Record<string, unknown>,
        );
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          isError: true,
          content: [{ type: "text" as const, text: message }],
        };
      }
    },
  );

  server.tool(
    "figjam_set_z_order",
    "Moves a node to the front or back of the z-order stack on its parent. Use z_order='back' to send a container behind its child nodes (fixes the covered-nodes problem when a container is created after its children). Use z_order='front' to bring a node to the top.",
    {
      node_id: z.string().describe("ID of the node to reorder"),
      z_order: z
        .enum(["front", "back"])
        .describe("'front' = bring to top, 'back' = send to bottom"),
    },
    async (params) => {
      try {
        const result = await bridge.execute(
          "set_z_order",
          params as Record<string, unknown>,
        );
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          isError: true,
          content: [{ type: "text" as const, text: message }],
        };
      }
    },
  );

  server.tool(
    "figjam_get_selection",
    "Returns the nodes currently selected on the FigJam canvas.",
    {},
    async () => {
      try {
        const result = await bridge.execute("get_selection", {});
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(result, null, 2) },
          ],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          isError: true,
          content: [{ type: "text" as const, text: message }],
        };
      }
    },
  );

  server.tool(
    "figjam_get_board_rules",
    `Returns layout rules, color systems, node sizing, and exact coordinates for a specific board type. ALWAYS call this before building any structured board — the rules contain empirically verified positions that produce clean, readable layouts. Pass "general" for universal rules only (shape height formula, text color, font sizes, grid rules). Available board types: ${BOARD_TYPES.join(", ")}`,
    {
      board_type: z
        .enum(["general", ...BOARD_TYPES])
        .describe(
          `Board type to get rules for. "general" returns universal rules only. Available: ${BOARD_TYPES.join(", ")}`,
        ),
    },
    async (params) => {
      const rules = getBoardRules(
        params.board_type as (typeof BOARD_TYPES)[number] | "general",
      );
      return {
        content: [{ type: "text" as const, text: rules }],
      };
    },
  );
}
