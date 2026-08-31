/** System prompt: extraer mapa de venue fiel al flyer (todas las unidades vendibles). */
export const MAP_REPLICATE_SYSTEM_PROMPT = `Analyze the uploaded venue flyer and extract a complete structured venue map.

IMPORTANT:
Your goal is not to redesign the flyer.
Your goal is to extract all sellable units and areas as faithfully as possible.

RULES:
1. Detect every main sellable unit shown in the flyer.
2. Do not summarize repeated patterns.
3. Each numbered item must be returned as its own element.
4. Preserve all visible numbering sequences.
5. If a sequence appears to run from 1 to N, verify that all numbers exist.
6. Reinspect the image if any numbers in the sequence are missing.
7. VIP tables are sold as full tables, not individual seats.
8. If the flyer says "10 personas por mesa", set capacity = 10 on the table.
9. Do not generate individual seats for each table.
10. Return positions normalized between 0 and 1.

You must detect:
* stage
* VIP tables
* boxes
* palco sections
* general admission / field areas

For numbered categories:
* output every visible numbered item as a separate element
* do not omit identical repeated items
* do not stop after finding only part of a sequence

Before producing the final JSON, internally validate:
* Are all tables included?
* Are all boxes included?
* Are all palco sections included?
* Are there any missing numbers in a sequence?

Return ONLY valid JSON. No markdown.`;

export const MAP_REPLICATE_USER_TEXT =
  'Extract the complete structured venue map from this flyer. ' +
  'Return every numbered sellable unit as its own element. ' +
  'Do not summarize or omit items in a sequence.';

/** JSON schema description embedded in the user message for structured extraction. */
export function buildMapReplicateSchemaHint(): string {
  return `Return JSON with this structure:

{
  "venue": {
    "width": number,
    "height": number
  },
  "stage": {
    "id": "stage",
    "label": string,
    "x": number,
    "y": number,
    "width": number,
    "height": number,
    "rotation": number | null,
    "confidence": number
  } | null,
  "categories": [{
    "id": string,
    "label": string,
    "detectedPrice": number | null,
    "detectedCapacity": number | null,
    "confidence": number
  }],
  "inventory": [
    {
      "category": string,
      "prefix": string,
      "min": number,
      "max": number,
      "count": number
    }
  ],
  "elements": [
    {
      "id": string,
      "label": string,
      "category": string,
      "type": string,
      "shape": "circle" | "rectangle" | "polygon",
      "x": number,
      "y": number,
      "width": number,
      "height": number,
      "points": [[number, number], ...] | null,
      "capacity": number | null,
      "detectedPrice": number | null,
      "confidence": number
    }
  ]
}

Notes:
- categories[].id must be kebab-case (e.g. "mesa-vip", "palco", "box", "campo-general").
- inventory summarizes each numbered sequence (e.g. prefix "M", min 1, max 50, count 50).
- elements[].capacity maps to table capacity when visible (e.g. 10 for "10 personas por mesa").
- polygon areas (campo general) use points[]; circle/rectangle use x,y,width,height.
- All coordinates normalized 0–1. stage.y should be >= 0.03 when present.`;
}
