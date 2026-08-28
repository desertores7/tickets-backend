/** System prompt: extraer estructura del plano y precios; el frontend arma el mapa interactivo. */
export const MAP_REPLICATE_SYSTEM_PROMPT = `You analyze a venue SALES MAP image for an Argentine ticketing platform.

CRITICAL RULES:
- Do ONE task: extract the FLOOR PLAN structure + pricing tiers from this image.
- The output will be used to BUILD an interactive map (colored zones on a clean canvas) — NOT to overlay on the JPEG.
- IGNORE decorative headers, logos, phone numbers, and price CARD graphics at the bottom when placing coordinates.
- Use floorPlanRegion (normalized 0–1) for the rectangular area that contains ONLY the venue layout (tables, palcos, boxes) — exclude footer price cards.

FLOOR PLAN:
- Count EVERY numbered sellable unit (tables 1–35, palcos P1, boxes B1, VIP letters A–D, etc.).
- For regular grids: prefer tableGrids — one grid PER color/tier block if rows differ in color.
  Example: 5 cols × 7 rows numbered 1–35 with 4 color bands → either ONE grid (rows=7, cols=5, startNumber=1) OR four grids (10+10+10+5) with distinct ticketTypeName and color per tier.
- For lateral/irregular units (VIP A–D): use sectors[] with individual bboxes inside floorPlanRegion.
- Copy labels exactly as printed ("12", "VIP A", "Mesa 12").

PRICING (from price section in same image):
- ticketTypes: exact name, price ARS number, quantity = count of units in that tier, color hex approximating the tier block, description if benefits shown.

COORDINATES:
- All x,y,w,h and tableGrid origins are relative to floorPlanRegion (0,0 = top-left of floor plan, 1,1 = bottom-right).
- Do NOT use coordinates relative to the full image including price footer.

PROHIBITED:
- Do NOT extract event title, dates, venue, artists.
- Do NOT create sellable zones for stage, bars, restrooms, DJ, entrance unless they have a price.
- Do NOT invent units or prices not visible.

Return ONLY valid JSON. No markdown.`;

export const MAP_REPLICATE_USER_TEXT =
  'Digitize this sales map image. Return JSON only with ticketTypes, sectors, and/or tableGrids.';

/** JSON schema description embedded in the user message for structured extraction. */
export function buildMapReplicateSchemaHint(): string {
  return `Return ONLY a JSON object with this shape:
{
  "floorPlanRegion": { "x": number, "y": number, "w": number, "h": number },
  "ticketTypes": [{
    "name": string,
    "description": string | null,
    "price": number,
    "quantity": number,
    "color": string | null
  }],
  "sectors": [{
    "name": string,
    "shape": "rect" | "ellipse",
    "x": number, "y": number, "w": number, "h": number,
    "color": string | null,
    "ticketTypeName": string,
    "sellable": boolean
  }],
  "tableGrids": [{
    "ticketTypeName": string,
    "rows": number,
    "cols": number,
    "originX": number, "originY": number,
    "cellW": number, "cellH": number,
    "gapX": number | null,
    "gapY": number | null,
    "startNumber": number | null,
    "tableNumbers": number[] | null,
    "shape": "rect" | "ellipse" | null,
    "color": string | null,
    "nameTemplate": string | null
  }]
}
floorPlanRegion: bounding box of ONLY the venue layout area (exclude price cards footer).
All tableGrid and sector coordinates are relative to floorPlanRegion (0–1). x,y = top-left; w,h = size.`;
}
