/**
 * Parsea JSON de modelos LLM que a menudo truncán el output (max_tokens).
 * Intenta JSON.parse directo; si falla, repara truncamiento típico.
 */
export function parseJsonObjectLoose(raw: string): Record<string, unknown> {
  const cleaned = stripMarkdownFences(raw).trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    throw new SyntaxError('Root JSON value is not an object');
  } catch (firstErr) {
    const repaired = repairTruncatedJsonObject(cleaned);
    try {
      const parsed = JSON.parse(repaired);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // fall through
    }
    throw firstErr;
  }
}

function stripMarkdownFences(text: string): string {
  const trimmed = text.trim();
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fence?.[1]?.trim() ?? trimmed;
}

/**
 * Cierra arrays/objetos abiertos y descarta el último valor incompleto.
 * Ej.: `..., { "id": "mesa-m4` → remueve hasta la coma previa y cierra brackets.
 */
function repairTruncatedJsonObject(text: string): string {
  let s = text.trim();
  if (!s.startsWith('{')) {
    const start = s.indexOf('{');
    if (start >= 0) s = s.slice(start);
  }

  // Quitar coma colgante / valor a medias tras el último elemento completo
  s = trimIncompleteTail(s);

  const stack: Array<'{' | '['> = [];
  let inString = false;
  let escape = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') stack.push('{');
    else if (ch === '[') stack.push('[');
    else if (ch === '}' || ch === ']') stack.pop();
  }

  // String sin cerrar → cortar desde la última comilla de apertura no cerrada
  if (inString) {
    const lastQuote = s.lastIndexOf('"');
    if (lastQuote > 0) {
      s = trimIncompleteTail(s.slice(0, lastQuote));
      // recalcular stack
      return repairTruncatedJsonObject(s);
    }
  }

  // Cerrar lo abierto
  while (stack.length) {
    const open = stack.pop();
    s += open === '{' ? '}' : ']';
  }

  return s;
}

function trimIncompleteTail(text: string): string {
  let s = text.trimEnd();

  // Si termina en medio de un número/identificador tras una coma o `:` → subir hasta coma/clave completa
  // Estrategia: buscar el último `}` o `]` que cierre un elemento completo dentro del root
  const lastComplete = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'));
  if (lastComplete <= 0) return s;

  // Si después del último cierre hay basura (propiedad a medias), cortar
  const after = s.slice(lastComplete + 1).trim();
  if (!after || after === ',' || /^,?\s*("[^"]*"?\s*:?)?/.test(after)) {
    // Mantener hasta lastComplete; si hay coma antes de basura, ok
    let cut = lastComplete + 1;
    // Si el siguiente char útil es `,` seguido de incompleto, ya cortamos en lastComplete
    s = s.slice(0, cut);
    // Quitar coma final sobrante
    s = s.replace(/,\s*$/, '');
  }

  return s;
}
