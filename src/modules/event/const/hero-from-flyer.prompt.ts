/**
 * Prompt ShowPass: hero full-width 16:9 a partir del flyer.
 * La imagen es el fondo del hero web; el texto/UI lo pone el frontend con HTML.
 * `quality` se configura en la API (EVENT_AI_IMAGE_QUALITY), no en este texto.
 */
export const HERO_FROM_FLYER_PROMPT = `Transform the attached event flyer into a premium cinematic ShowPass hero image.

FORMAT
- horizontal 16:9 website hero
- dark, clean negative space on the left for HTML text
- main event visual composition on the right
- smooth atmospheric transition across the entire image
- premium, cinematic, editorial and immersive
- preserve the original event color identity
- Keep all faces, heads, artist logos and essential visual identity safely inside the central composition area, with generous breathing room from the top, bottom and right edges, so the image can be cropped responsively into shorter landscape banners without cutting important subjects.

SOURCE OF TRUTH
The attached flyer is authoritative.

Preserve with maximum fidelity:
- every original person
- exact number of people
- faces and identity
- clothing, hairstyle and distinctive accessories
- original relative left-to-right order
- visual hierarchy between artists
- association between each artist and their logo

Never add, remove, replace, mirror, swap or reorder people.

LOGOS
If the flyer contains an artist, band or event logo/wordmark, ALWAYS preserve it.
Do not redesign, rewrite, simplify or omit it.
Maintain the correct association between each logo and its artist.

REMOVE
Remove all non-essential flyer information:
- dates
- times
- prices
- phone numbers
- addresses
- ticketing logos
- sponsors
- production companies
- social handles
- promotional copy
- secondary informational text

Only artist/band/event logos may remain as text-based graphics.

BACKGROUND
Rebuild the background freely into a cleaner cinematic atmosphere.
Do not reproduce unnecessary background details from the flyer.
Use mainly its colors, lighting mood and event atmosphere.
Prefer abstract depth, haze, soft lighting, shadows and subtle environmental texture over detailed reconstruction.

PRIORITIES
1. person identity
2. number and order of people
3. artist/logo association
4. preservation of event logos
5. ShowPass composition
6. cinematic background

Generate only the hero background.
No ShowPass logo, UI, navigation, buttons or website text.`;
