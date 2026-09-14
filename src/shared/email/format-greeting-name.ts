/**
 * Primera letra en mayúscula para el saludo del mail (p. ej. "demo" → "Demo").
 * Si el nombre viene vacío, usa un fallback neutro para no dejar "Hola, ".
 */
export function formatGreetingName(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return 'ahí';
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}
