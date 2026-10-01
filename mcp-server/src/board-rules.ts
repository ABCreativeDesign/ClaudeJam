// claudejam/mcp-server/src/board-rules.ts
// Condensed board layout rules returned on-demand by figjam_get_board_rules.

const GENERAL_RULES = `## General Rules (apply to ALL board types)

### Grid
All x/y positions and width/height values must be multiples of 4px.

### Text Color
- Dark fills → text_color=#ffffff (threshold: avg RGB channel below ~160)
- Apply white text consistently within a cluster — don't mix dark/white text
- Omit text_color on canvas-level text nodes (type=text labels) — dark default reads fine

### Font Sizes
- Content nodes (stickies, shapes): font_size=16 (FigJam "Small")
- Section/cluster labels: font_size=24 (FigJam "Medium")
- FigJam snaps to presets — 16px and 24px are reliable. 18/20px snap unexpectedly.

### Shape Height (SHAPE_WITH_TEXT at font_size=16)
FigJam truncates overflowing text silently. Empirically confirmed minimums:
1 line → 44px, 2 lines → 124px, 3 lines → 144px, 4 lines → 160px, 5 lines → 196px
Safe formula: 1 line → 44px, 2 lines → 128px, each additional line → +24px
Word-wrap counts as extra line: Inter 16px ≈ 9px/char. If chars × 9 > node width, it wraps.

### Node Sizing
- Stickies: always 240×240, cannot be resized
- Cluster/section headers: full cluster width × 44px
- Shape nodes: freely resizable (must pass width AND height together)
- Shape minimum is 16px in BOTH width and height. FigJam silently clamps anything
  smaller (a 4px divider becomes 16px). For a divider line, use a 16px dark band.
  create_node returns the stored width/height, so check it.

### Connector Defaults
- Diagrams & flows: style=elbowed
- Brainstorm & ideation boards: style=curved
- Use explicit magnets (not AUTO) where routing matters
- style=straight always attaches at node centers; from_magnet/to_magnet are ignored
  for straight lines (FigJam only allows CENTER on them)

### Sticky Grid
- Brainstorm/ideation: flush (0px gap) — tight grouping reads as intentional
- Structured boards: flush is also fine; gaps only when visual separation needed

### Color
- Always pass color explicitly on shape nodes (FigJam defaults to gray)
- Text nodes (type=text) as labels: omit color entirely

### Z-Order for Lane/Row Backgrounds
When using full-width background shapes behind content:
1. Create background shape
2. IMMEDIATELY call figjam_set_z_order z_order="back"
3. Then create labels and cards (appear in front automatically)`;

const BRAINSTORM_RULES = `## Brainstorming / Ideation Board

### Color System
- Each cluster: 2 shades (darker header, lighter stickies)
- Central topic: distinct dark color, never reused in clusters
- All dark fills → text_color=#ffffff

### Node Sizing
- Central topic: shape (rounded_rectangle), 296×80, prominent dark fill
- Cluster headers: shape (rounded_rectangle), 480×44, darker shade, font_size=16
- Stickies: 240×240, 2×N grid below header, flush (0px gap)

### Layout
- Central topic at top center (x=-148)
- Clusters in horizontal row below, 120px gap from central node
- Cluster width: 480px (2 stickies flush). Gap between clusters: 40px
- 4 clusters → 2040px total, centered at x=0
- Cluster x positions: -1020, -500, 20, 540
- Sticky rows: y = cluster_y + 44, then +240 per row

### Connectors
- Central node → cluster headers only (hub-and-spoke), style=curved
- Split at midpoint: left clusters → from_magnet=LEFT, right → from_magnet=RIGHT
- All connectors: to_magnet=TOP`;

const COMPETITIVE_RULES = `## Competitive Analysis Board

### Color System
- Each competitor gets a hue family — 3 shades (dark → medium → light) for header → Strengths → Weaknesses → Opportunities
- All fills → text_color=#ffffff
- Example palettes: Slate (#1e293b/#334155/#475569/#64748b), Red (#991b1b/#b91c1c/#dc2626/#ef4444), Indigo (#1e3a8a/#1d4ed8/#2563eb/#3b82f6), Teal (#065f46/#047857/#059669/#10b981)

### Node Sizing
- Title: shape (rounded_rectangle), 592×80, color=#0f172a
- Competitor headers: 480×44, darkest shade
- Stickies: 240×240, 2 per row per competitor, flush
- Row labels: type=text, bold=true, font_size=16, no color

### Layout
- 4 competitors, 3 sticky rows each (Strengths/Weaknesses/Opportunities)
- Cluster width: 480px, gap: 40px. Total: 2040px centered at x=0
- Cluster x: -1020, -500, 20, 540
- Title: x=-296, y=0. Headers: y=200
- Sticky rows: y=244, y=484, y=724
- Row labels: x=-1200, centered vertically in each row (y = row_y + 100)

### Connectors
- Title → competitor headers, style=curved, split at midpoint (LEFT/RIGHT → TOP)`;

const CUSTOMER_JOURNEY_RULES = `## Customer Journey Map

### Color System
Each stage: darker header, lighter stickies. All require text_color=#ffffff.
| Stage | Header | Stickies |
| Awareness | #6d28d9 | #7c3aed |
| Consideration | #1e40af | #2563eb |
| Sign Up | #0f766e | #0d9488 |
| Onboarding | #15803d | #16a34a |
| First Value | #b45309 | #d97706 |
| Retention | #9f1239 | #be123c |

### Node Sizing
- Title: 592×80, color=#0f172a
- Stage headers: 480×44, stage header color
- Stickies: 240×240, 2 per row per stage, flush
- Row labels: type=text, bold=true, font_size=16, no color

### Layout
- 6 stages, 5 rows each (Touchpoints/User Actions/Emotions/Pain Points/Opportunities)
- Stage width: 480px, gap: 40px. Total: 3080px centered at x=0
- Stage x: -1540, -1020, -500, 20, 540, 1060
- Title: x=-296, y=0. Headers: y=200
- Sticky rows: y=244, y=484, y=724, y=964, y=1204
- Row labels: x=-1700, y = row_y + 100

### Connectors
- Title → stage headers, style=curved, left 3 from_magnet=LEFT, right 3 from_magnet=RIGHT, all to_magnet=TOP`;

const KANBAN_RULES = `## Kanban / Task Board

### Color System
Each column: dark header, slightly lighter cards. All require text_color=#ffffff.
| Stage | Header | Cards |
| Planned | #475569 | #64748b |
| Writing | #1d4ed8 | #2563eb |
| In Review | #b45309 | #d97706 |
| Scheduled | #6d28d9 | #7c3aed |
| Published | #15803d | #16a34a |

### Node Sizing
- Title: 640×64, color=#0f172a
- Column headers: 256×44, header color
- Task cards: 256×128, card color — 2-line content (title + metadata). Use actual newlines.
- Single-line cards: 44px height

### Layout
- 5 columns, 256px wide, 24px gap. Total: 1376px centered at x=0
- Column x: -688, -408, -128, 152, 432
- Title: x=-(width/2), y=0. Headers: y=100
- Card rows: y=156, y=296, y=436, y=576 (pitch: 140px)
- No column backgrounds needed — headers + aligned cards define columns

### Content
- Vary card counts per column (e.g. 4/4/3/3/3) — looks more realistic than uniform`;

const MOODBOARD_RULES = `## Mood Board (Conceptual — no image support yet)

### Sections
1. Colour Palette — tall narrow swatches
2. Typography — stacked shapes for type scale
3. Keywords — pill-shaped tags in 2-column grid

### Node Sizing
- Title: 680×64, color=#0f172a
- Palette swatches: 100×160, dark fills, text_color=#ffffff
- Typography shapes: 328×128 (2-line content), palette colors
- Keyword tags: 152×36, palette colors
- Section labels: type=text, bold=true, font_size=16, no color

### Layout
- Board width: 680px centered at x=0 (left x=-340, right x=340)
- Title: x=-340, y=0
- "COLOUR PALETTE" label: x=-340, y=84
- 6 swatches at y=108, 100px wide, 16px gap. x: -340, -224, -108, 8, 124, 240
- "TYPOGRAPHY" label: x=-340, y=292
- "KEYWORDS" label: x=12, y=292
- Typography shapes: x=-340, y=316+, 328px wide, 4px gap between
- Keyword tags: columns at x=12 and x=176, rows from y=316, 12px gaps`;

const RETROSPECTIVE_RULES = `## Retrospective Board

### Color System
| Column | Header | Stickies |
| What Went Well | #15803d | #bbf7d0 |
| What Didn't Go Well | #b91c1c | #fecaca |
| Action Items | #1d4ed8 | #bfdbfe |
- Headers: text_color=#ffffff
- Stickies: light fills, default dark text (no text_color needed)

### Node Sizing
- Title: 1520×64, color=#0f172a
- Column headers: 480×44, column header color
- Stickies: 240×240, 2 per row, flush (0px gap)

### Layout
- 3 columns, 480px wide, 40px gap. Total: 1520px centered at x=0
- Column x: -760, -240, 280
- Title: x=-760, y=0. Headers: y=100
- Sticky row 1: y=144 (flush below header). Row 2: y=384
- 4 stickies per column (2×2 grid)

### Content
- Specific, realistic content: "QA got squeezed into the last two days" not "Add item here"
- Action items should address pain points from column 2`;

const SWIMLANE_RULES = `## Feature Prioritization (Swimlane Backlog)

### Color System
| Tier | Label | Cards | Lane Background |
| Now | #15803d | #16a34a | #f0fdf4 |
| Next | #b45309 | #d97706 | #fffbeb |
| Later | #1d4ed8 | #2563eb | #eff6ff |
| Backlog | #475569 | #64748b | #f8fafc |
- Labels and cards: text_color=#ffffff

### Node Sizing
- Title: 640×80, color=#0f172a
- Lane backgrounds: 1040×120 — MUST call figjam_set_z_order z_order="back" after creation
- Tier labels: 148×120 (pill-like shape)
- Feature cards: 200×72 (1-line). 2-line cards: bump to 128px height

### Layout
- Board width: 1040px centered at x=0 (left x=-520)
- Title: x=-(width/2), y=0
- Lane y positions: 120, 252, 384, 516 (120px height + 12px gap)
- Tier labels: x=-520
- Cards start: x=-356 (label 148px + 16px gap)
- Card x (4 per row): -356, -140, 76, 292 (200px + 16px gap)
- Cards centered in lane: y = lane_y + 24

### Build Order (z-order critical)
1. Title
2. All lane backgrounds → figjam_set_z_order z_order="back" on each
3. Tier labels
4. Feature cards`;

const TIMELINE_RULES = `## Timeline / Roadmap (Quarterly Swim Lanes)

### Color System
| Lane | Label/Cards | Background |
| Design & UX | #7c3aed | #ede9fe |
| Core Product | #1d4ed8 | #dbeafe |
| Infrastructure | #0f766e | #d1fae5 |
| Growth | #b45309 | #fef3c7 |
- Labels and cards: text_color=#ffffff
- Lane backgrounds: light tint, content=" " (single space)

### Node Sizing
- Title: 1332×64, color=#0f172a
- Quarter headers: 280×44, color=#0f172a
- Lane backgrounds: 1332×160, light color → send to back
- Row labels: 148×160, lane color
- Feature cards: 248×128 (2-line content), lane color

### Layout
- Total width: 1332px centered at x=0 (left x=-666, right x=666)
- Row label column: 148px. Gap: 16px. Quarter columns: 280px, 16px gaps
- Title: x=-666, y=0. Quarter headers: y=100
- Q1: x=-502, Q2: x=-206, Q3: x=90, Q4: x=386
- Lane rows: y=160, 332, 504, 676 (160px + 12px gap)
- Row labels: x=-666, y=lane_y
- Lane backgrounds: x=-666, y=lane_y, w=1332 → send to back
- Feature cards: x=col_x+16, y=lane_y+16, w=248, h=128
  Q1: x=-486, Q2: x=-190, Q3: x=106, Q4: x=402

### Build Order (z-order critical)
For each lane:
1. Lane background → figjam_set_z_order z_order="back"
2. Row label (on top)
3. Feature cards (on top)`;

const USER_PERSONA_RULES = `## User Persona Map

### Color System
| Persona | Header/Quote | Attribute Cards |
| UX Designer | #7c3aed | #ede9fe |
| Developer | #1d4ed8 | #dbeafe |
| Product Manager | #0f766e | #d1fae5 |
- Headers and quote cards: text_color=#ffffff
- Attribute cards: light fills, no text_color needed
- Row labels and title: color=#0f172a, text_color=#ffffff

### Node Sizing
- Title: 1156×64, color=#0f172a
- Persona headers: 320×160, persona primary color (3-line: name, role, location)
- Row labels: 148×128, color=#0f172a
- Attribute cards: 320×128, persona light color (2-line content)
- Quote cards: 320×128, persona primary color (bookend effect)

### Layout
- Total width: 1156px centered at x=0 (left x=-578, right x=578)
- Row label: 148px. Gap: 16px. Persona columns: 320px, 16px gaps
- Persona x positions: -414, -78, 258
- Title: x=-578, y=0. Persona headers: y=100
- Attribute rows (128px, 12px gap): Goals y=272, Pain Points y=412, Behaviors y=552, Quote y=692
- Row labels: x=-578, at each attribute row y

### Content
- Header: 3 lines — Name / Role / Age · City
- Attributes: 2 lines — primary point + supporting detail
- Quotes: wrap at ~25 chars/line to avoid overflow in 320px card
- 3 personas and 4 attribute rows is the recommended default`;

export const BOARD_TYPES = [
  "brainstorm",
  "competitive",
  "customer_journey",
  "kanban",
  "mood_board",
  "retrospective",
  "swimlane",
  "timeline",
  "user_persona",
] as const;

export type BoardType = (typeof BOARD_TYPES)[number];

const BOARD_RULES_MAP: Record<BoardType, string> = {
  brainstorm: BRAINSTORM_RULES,
  competitive: COMPETITIVE_RULES,
  customer_journey: CUSTOMER_JOURNEY_RULES,
  kanban: KANBAN_RULES,
  mood_board: MOODBOARD_RULES,
  retrospective: RETROSPECTIVE_RULES,
  swimlane: SWIMLANE_RULES,
  timeline: TIMELINE_RULES,
  user_persona: USER_PERSONA_RULES,
};

const BOARD_LABELS: Record<BoardType, string> = {
  brainstorm: "Brainstorming / Ideation",
  competitive: "Competitive Analysis",
  customer_journey: "Customer Journey Map",
  kanban: "Kanban / Task Board",
  mood_board: "Mood Board",
  retrospective: "Retrospective Board",
  swimlane: "Feature Prioritization (Swimlane)",
  timeline: "Timeline / Roadmap",
  user_persona: "User Persona Map",
};

export function getBoardRules(boardType: BoardType | "general"): string {
  if (boardType === "general") {
    return GENERAL_RULES;
  }
  const specific = BOARD_RULES_MAP[boardType];
  if (!specific) {
    return `Unknown board type: ${boardType}. Available types: ${BOARD_TYPES.join(", ")}`;
  }
  return `${GENERAL_RULES}\n\n---\n\n${specific}`;
}

export function listBoardTypes(): string {
  return BOARD_TYPES.map((t) => `- ${t}: ${BOARD_LABELS[t]}`).join("\n");
}
