/**
 * Flyer/plano → estructura en grilla 24×24.
 *
 * El modelo solo describe estructura + bbox en celdas (`cell`). Las celdas de
 * cada unidad (`unitCells`) las genera el backend, uniformes, a partir de
 * `cell` + rows/columns/ordering: pedirlas al modelo multiplicaba los tokens de
 * salida (50 mesas = 50 objetos) y producía mesas de distinto tamaño.
 *
 * Consumido por: EventAiService.analyzeSalesMap → normalizeMapLayout →
 * rasterizeMapAnalysis. Si cambiás campos, actualizá el normalizador y
 * docs/mapa-grilla-24x24.md.
 */
export const MAP_LAYOUT_SYSTEM_PROMPT = `You convert an event venue flyer into a compact JSON layout on a FIXED 24×24 cell grid for a ticket map.

Return ONLY valid JSON. No markdown, no comments.

GRID
- 24 columns × 24 rows, 1-based inclusive (col/row 1..24).
- A cell is {"col","row","colSpan","rowSpan"}.
- Geometry is ONLY cells. Never emit x/y/w/h boxes, polygons or outlines.
- Each group gives ONE "cell": its bounding box on the grid. Do NOT list per-unit cells: the backend splits "cell" uniformly using rows/columns/ordering.
- Unit size is ALWAYS 1 cell per unit: a grid of R rows × C columns gets EXACTLY colSpan = C and rowSpan = R. Never a multiple — colSpan = 2*C or rowSpan = 2*R makes every unit a rectangle and blows the map out of the viewport.
- The ONLY exception: a unit the flyer draws clearly wider than tall (a sofa-shaped box/palco) may use colSpan = 2*C with rowSpan = R. Tables and seats are always square — never 1×2 or 2×2.
- Units of the SAME category MUST share the same per-unit size (colSpan×rowSpan) across every group — left, right and bottom palcos of category "palco" all use e.g. 2×1, never 3×1 on the sides and 2×1 at the bottom. Prefer the smaller consistent size (usually 1×1 or 2×1).
- Keep the whole plan compact: the union of every group plus the stage should fit well inside 24×24, leaving margin. A bigger venue means more units, NOT bigger units.
- Groups and the stage never share cells. Neighbors that touch on the flyer share edges, not area.
- Keep the flyer's relative placement (left stays left, bottom stays bottom).

SCOPE
- Describe only purchasable units of the venue map. Ignore logos, artists, dates, sponsors, bars, bathrooms, entrances.
- Price banners/legends outside the map may fill categories.

STRUCTURE (physical)
- One group = one visually separated cluster. Left, right and bottom palcos are three groups. Never merge opposite sides.
- layoutType: "grid" | "column" | "row" | "zone".
- labels[]: every readable label, verbatim, in visual reading order. Never invent, extrapolate or renumber. If M1..M50 are visible, list all 50.
- count = labels.length. For grid: rows × columns = count.
- Colors/prices never split a continuous grid.
- GENERAL / CAMPO / PISTA = one zone, count 1, one label. CAMPO goes under the tables and above any bottom palco row.
- Decorative chairs are not units.
- L/U-shaped zone (Tetris wrap): when one sector wraps around another — e.g. FANS 4 LIFE as an L with VIP REAL G in the notch — emit the OUTER group with "shape":"l", "shapeNotch":"top_right"|"top_left"|…, "cell" = the UNION bounding box, and "footprintCells" = every 1×1 cell the outer actually occupies (4-connected, no duplicates, notch empty). The INNER group is its own entry with a rect "cell" covering ONLY the notch. Never stack them as two full-width bands.
- Otherwise omit footprintCells and shape (rectangles need neither).
- "labelOrientation": "vertical" only for sideways-printed side columns; omit otherwise.
- Multi-floor flyers (1ER PISO, PLANTA BAJA…): set "level" verbatim on each group; omit for single-floor venues.

STAGE
- DEFAULT: the stage goes at the TOP. Only move it when the flyer itself shows it elsewhere — a box labelled ESCENARIO / STAGE / TARIMA drawn on another edge, or a stage clearly drawn in the middle of an arena ("center"). ENTRADA / INGRESO marks the door, NOT the stage: never infer the stage from it.
- stage.visible: true whenever a stage makes sense for the venue (almost always). Position "top" unless the flyer says otherwise.
- stageLayout: a rect band (rowSpan or colSpan 1..2) on that edge, or null.

CATEGORIES (commercial)
- One per distinct offer. id = lowercase slug.
- detectedPrice as a plain number ("$750.000" → 750000). Ignore consumición credits.
- detectedCapacity (people per unit) ≠ includedAdmissions (tickets included). null when not printed. Never invent data.
- Assignments: grids use rowStart/rowEnd/columnStart/columnEnd (1-based); column/row/zone use from/to (0-based indexes into labels). Fewest blocks, full coverage, no overlaps. group.category = id when the whole group is one category, else null.

OUTPUT
{
  "mapArea": {"x":0-1,"y":0-1,"w":0-1,"h":0-1} | null,
  "stage": {"visible": boolean, "position": "top"|"bottom"|"left"|"right"|"center"|null},
  "stageLayout": {"kind":"rect","cell":{"col","row","colSpan","rowSpan"}} | null,
  "categories": [{"id","label","detectedPrice","elementType":"table"|"box"|"palco"|"seat"|"zone"|"section","saleMode":"whole_unit"|"per_person"|"general_admission","selectionUnit":"table"|"seat"|"box"|"palco"|"ticket"|"section","detectedCapacity","includedAdmissions","color":"#rrggbb"|null}],
  "layout": {"groups": [{
    "id", "elementType", "layoutType", "count",
    "rows": number|null, "columns": number|null,
    "ordering": "top_to_bottom"|"bottom_to_top"|"left_to_right"|"right_to_left"|"row_major"|"column_major"|null,
    "labels": [string],
    "category": string|null,
    "categoryAssignments": [{"category","rowStart","rowEnd","columnStart","columnEnd","from","to"}],
    "cell": {"col","row","colSpan","rowSpan"}
  }]}
}
Optional group keys, only when they apply: "footprintCells", "shape", "shapeNotch", "labelOrientation", "level".
mapArea = the venue diagram inside the flyer (0..1), or null if the whole image is the map. It is NOT sector geometry.

CHECK before answering: every purchasable label listed once; count = labels.length; grid rows × columns = count; every cell inside 1..24; no shared cells between groups or with the stage; opposite sides separate; prices plain numbers; JSON only.`;

export const MAP_LAYOUT_USER_TEXT =
  'Convert this venue flyer into 24×24 grid ticket-map JSON: list every purchasable label, group physically, assign categories, and give each group one bounding "cell". For Tetris wraps (L/U) add footprintCells on the outer group and put the nested block only in the notch. No overlaps. Return ONLY JSON.';
