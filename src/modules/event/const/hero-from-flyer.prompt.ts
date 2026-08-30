/**
 * Prompt corto: la IA SOLO genera la composición visual de artistas/identidad
 * para el lado DERECHO del hero. El lado izquierdo (texto HTML + difuminado)
 * lo arma el frontend — no inventar escena wide ni zona de texto en la imagen.
 */
export const HERO_FROM_FLYER_PROMPT = `Create ONE premium cinematic artist composition for the RIGHT side of a ticketing website hero.

WHAT TO GENERATE (ONLY THIS)
- The people/artists from the flyer, brightly lit, fully visible (heads and torsos not cropped).
- Main artist / band / event logos or wordmarks from the flyer (exact spelling, style, colors) when they exist.
- A dark cinematic stage/atmosphere BEHIND the people only (soft lights, haze, depth) using the flyer's color mood.
- Vertical / portrait framing (3:4). Fill the frame with the talent composition. No empty left text panel.

WHAT NOT TO GENERATE
- Do NOT create a full-width website banner or mockup.
- Do NOT invent a left-side crowd, skyline, architecture, or dual-panel collage.
- Do NOT include dates, prices, phones, addresses, sponsors, ticketing logos, venue logos, badges, or promotional copy.
- Do NOT draw UI, buttons, navigation, or website text.
- Do NOT redesign the flyer as another flyer/poster layout.

IDENTITY RULES (STRICT)
- Same number of people as the flyer; no adding/removing/swapping/reordering.
- Keep faces, age, gender, hair, clothing, accessories faithful.
- Keep each logo associated with the correct person/group.
- If a main logo exists on the flyer, it MUST appear and stay recognizable.

STYLE
Premium, dark, editorial, immersive — like a ShowPass hero talent plate.
Bright subjects on a deep background. Subtle stage lighting OK. No neon spam, no amateur cutouts.

OUTPUT
One image only: the right-side composition. Nothing else.`;
