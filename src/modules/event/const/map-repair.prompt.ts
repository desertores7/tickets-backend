/**
 * Prompt de reparación dirigida: corrige los grupos que el verificador marcó.
 *
 * No vuelve a leer el plano entero. Recibe la imagen, el layout que ya se
 * generó y la lista concreta de problemas, y devuelve ÚNICAMENTE los grupos que
 * hay que reemplazar. El backend hace el merge por id, así que lo que estaba
 * bien no se toca: el riesgo de una segunda pasada es que "arregle" lo que no
 * estaba roto, y devolver el layout completo era justamente invitar a eso.
 *
 * Consumido por EventAiService.repairMapLayout.
 */
export const MAP_REPAIR_SYSTEM_PROMPT = `You fix specific defects in an already-generated venue map layout.

Return ONLY valid JSON. No markdown, no explanations.

You will receive:
1. The original venue flyer image.
2. The layout that was generated from it (JSON).
3. A list of concrete problems detected by an automatic check.

Your job is NARROW: look at the image again, only where the problems point, and
return corrected versions of ONLY the affected groups.

===========================
OUTPUT
===========================

{
  "groups": [
    { ...the complete group object, same schema as the input layout... }
  ],
  "categories": [
    { ...only categories that must be ADDED because a listed sector was missing... }
  ]
}

Rules:

R1. Every object in "groups" must be a COMPLETE group, with every field the
input groups have (id, elementType, layoutType, position, lane, stackOrder,
count, rows, columns, ordering, labels, category, categoryAssignments, shape,
shapeNotch, labelOrientation, containedBy, containedAt, widthWeight,
heightWeight, level, requiresGeometryFallback, confidence).

R2. Keep the SAME "id" as the group you are fixing. That id is how the fix is
matched back. Only use a new id when the problem says a whole sector is missing
from the map and you are adding it.

R3. Do NOT return groups that were not mentioned in the problems. Anything you
do not return is kept as it is.

R4. MISSING LABELS (a group declares more elements than it listed): re-read that
region of the image and return the group with the COMPLETE list of labels, in
visual reading order, exactly as printed. Do not invent numbers to reach the
declared count: if the image really shows fewer, return what is visible and set
count to the real number.

R5. GRID SHAPE (rows x columns does not match the labels): either the missing
labels are the problem (fix them as in R4) or the shape was wrong. Return the
group with rows x columns equal to the number of labels.

R6. MISSING SECTOR (a priced category has no group): find that sector in the
image and return a new group for it, plus the category in "categories" if it was
not in the layout. If the sector genuinely is not drawn on the map — it is only
a line in the price table — return nothing for it.

R7. DUPLICATE LABELS: the same number on different floors is normal. Set "level"
on each group with the floor name printed in the image ("1ER PISO", "2DO PISO").
If both really belong to the same floor, re-read: one of them is misread.

R8. Never change prices, categories or structure that the problems did not
mention. You are patching, not regenerating.

Return ONLY valid JSON.`;

/** Bloque de usuario: layout actual + problemas concretos a corregir. */
export function buildMapRepairUserText(params: {
  layoutJson: string;
  problems: string[];
}): string {
  return [
    'Fix the listed problems in this venue map layout. Look at the image again only where the problems point.',
    '',
    'PROBLEMS DETECTED:',
    ...params.problems.map((p, i) => `${i + 1}. ${p}`),
    '',
    'CURRENT LAYOUT:',
    params.layoutJson,
    '',
    'Return ONLY the corrected groups (and any category that has to be added), as JSON.'
  ].join('\n');
}
