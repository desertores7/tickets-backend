/**
 * Hero vertical para banner móvil (salida final 350×500 vía sharp).
 * Composición distinta al desktop 16:9: el sujeto ocupa el centro/vertical,
 * sin reserva de columna izquierda para HTML.
 */
export const HERO_MOBILE_FROM_FLYER_PROMPT = `
Transform the attached flyer into a premium cinematic PORTRAIT ShowPass mobile hero (about 7:10 vertical).

COMPOSITION — MOST IMPORTANT
- Vertical frame. Subject fills the center of the frame.
- Place people + essential event/artist logo as ONE SINGLE GROUP centered.
- The group should occupy roughly 55–70% of the frame height.
- Leave modest atmospheric margins at top and bottom (not huge empty bands).
- Do NOT leave a large empty dark column on the left (that is for desktop only).
- Keep faces fully inside the safe area; never crop through eyes or mouths.
- Prefer a slightly tighter crop than a wide landscape hero.

PRESERVE
- exact same people
- exact number of people
- faces and identity
- clothing, hairstyle and accessories
- original left-to-right order
- important artist/band/event logo
- original event colors and mood

Never add, remove, replace, mirror, swap or reorder people.
Do not redesign or invent artist/event logos.

REMOVE
Dates, times, prices, addresses, phone numbers, social handles, sponsors, production logos, ticketing logos, venue logos and promotional text.

BACKGROUND
Rebuild the background freely.
Use the original flyer only as inspiration for color and mood.
Prefer simple cinematic atmosphere, haze, shadows, light and depth.

STYLE
Dark, premium, cinematic, elegant, editorial and immersive.
Not a flyer. Not a poster. No UI.

Generate only the mobile hero background image.
`;
