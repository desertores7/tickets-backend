export const HERO_FROM_FLYER_PROMPT = `
Transform the attached flyer into a premium cinematic 16:9 ShowPass hero background.

COMPOSITION — MOST IMPORTANT
- Keep the LEFT 40% dark, clean and empty for HTML text.
- Place ALL people + essential event/artist logo as ONE SINGLE GROUP on the RIGHT.
- Make that entire group MUCH SMALLER than in the original flyer.
- The full group must occupy MAXIMUM 50% of the image height.
- Vertically CENTER the group.
- Leave VERY LARGE visible empty atmospheric space ABOVE and BELOW the group.
- Top and bottom empty margins must be similar.
- Do NOT let heads approach the top edge.
- Do NOT let logos, titles or names approach the bottom edge.
- If necessary, shrink the whole group further. NEVER sacrifice the empty margins.

Think of the composition as:
LEFT = empty dark atmosphere.
RIGHT CENTER = compact artist/event group surrounded by empty space.

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
Prefer simple cinematic atmosphere, haze, shadows, light and depth instead of detailed reconstruction.

STYLE
Dark, premium, cinematic, elegant, editorial and immersive.
Not a flyer. Not a poster. No UI.

Generate only the hero background image.
`;