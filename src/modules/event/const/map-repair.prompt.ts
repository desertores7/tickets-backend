/**
 * Corrige solo los grupos que el verificador marcó.
 * Merge por id en el backend; no regenerar el layout entero.
 */
export const MAP_REPAIR_SYSTEM_PROMPT = `You fix specific defects in an already-generated venue map layout on a 24×24 cell grid.

Return ONLY valid JSON. No markdown.

You receive: the flyer image, the current layout JSON, and a list of concrete problems.

Return ONLY the groups that must be replaced (and categories only if a missing sector requires a new one).

OUTPUT:
{
  "groups": [ { ...complete group, same schema as analysis layout groups... } ],
  "categories": [ { ...only NEW categories if needed... } ]
}

Rules:
R1. Each group is COMPLETE: id, elementType, layoutType, count, rows, columns, ordering, labels, category, categoryAssignments, cell, unitCells, footprintCells (or null), labelOrientation if vertical, level, shape/shapeNotch if non-rect.
R2. Keep the same id when fixing. New id only when adding a missing sector.
R3. Do not return untouched groups.
R4. Missing labels: re-read that region; return full verbatim labels; count = labels.length; rebuild unitCells.
R5. Grid shape: rows × columns === labels.length; unitCells cover the grid without gaps.
R6. Missing sector: add group + category if drawn on the map; skip if only in the price list.
R7. Duplicate labels across floors: set level from printed floor names.
R8. Do not change prices/structure unrelated to the problems.
R9. cell / unitCells / footprintCells are mandatory geometry. No box x/y/w/h. No overlaps with other groups or stage cells. cell = bounds of unitCells or footprintCells.
R10. For L/U repairs: fix footprintCells so the notch is empty and the nested group owns those cells.

Return ONLY JSON.`;

export function buildMapRepairUserText(params: {
  layoutJson: string;
  problems: string[];
}): string {
  return [
    'Fix the listed problems. Look at the image only where the problems point.',
    '',
    'PROBLEMS DETECTED:',
    ...params.problems.map((p, i) => `${i + 1}. ${p}`),
    '',
    'CURRENT LAYOUT:',
    params.layoutJson,
    '',
    'Return ONLY corrected groups (and new categories if needed), as JSON.'
  ].join('\n');
}


/**
 * "Reajustar mapa con IA": el productor pide reacomodar TODA la disposición
 * del mapa (no un problema puntual que marcó el verificador) porque a simple
 * vista quedó mal ubicada respecto de la imagen. A diferencia de
 * `MAP_REPAIR_SYSTEM_PROMPT` (que corrige solo los grupos marcados), acá se
 * pide la geometría de TODOS los grupos — pero las categorías (nombres,
 * precios) no viajan para editarse: son las que ya existen, el modelo no las
 * puede tocar. Es la misma llamada de layout que el análisis inicial, pero
 * más barata: no hay que releer inventario ni precios, solo dónde va cada
 * bloque en la grilla.
 */
export const MAP_REAJUSTAR_SYSTEM_PROMPT = `You re-derive the GEOMETRY of a venue map layout on a 24×24 cell grid, from the flyer image.

Return ONLY valid JSON. No markdown.

You receive: the flyer image and the current layout JSON (ids, labels, categories — already correct, DO NOT change them).

Return ALL groups with their geometry recomputed from the image, same ids and labels as given:
{
  "groups": [ { ...complete group, same schema as analysis layout groups... } ]
}

Rules:
R1. Each group is COMPLETE: id (same as given), elementType, layoutType, count, rows, columns, ordering, labels (same as given, verbatim), category (same as given), categoryAssignments, cell, unitCells, footprintCells (or null), labelOrientation if vertical, level, shape/shapeNotch if non-rect.
R2. Do NOT rename labels, change categories, or invent new categories/prices. Only geometry changes.
R3. Return every group that exists in the input, even if its position doesn't change.
R4. cell / unitCells / footprintCells are mandatory geometry. No box x/y/w/h. No overlaps with other groups or stage cells. cell = bounds of unitCells or footprintCells.
R5. Look at the image and place each group where it visually is, matching the real arrangement (stacked/overlapping zones in a previous attempt must be separated into their real position).
R6. For L/U shapes: footprintCells so the notch is empty and the nested group owns those cells.

Return ONLY JSON.`;

export function buildMapReajustarUserText(params: { layoutJson: string }): string {
  return [
    'Re-derive the geometry (cell/unitCells/footprintCells) of every group below by looking at the image again.',
    'Keep every id, label and category exactly as given — only the geometry may change.',
    '',
    'CURRENT LAYOUT (ids, labels, categories — do not change these):',
    params.layoutJson,
    '',
    'Return ALL groups with corrected geometry, as JSON.'
  ].join('\n');
}
