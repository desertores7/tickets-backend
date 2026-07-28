import { INestApplication } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

/** Fixes malformed origins like `https:/example.com` → `https://example.com` */
export function normalizeOrigin(origin: string): string {
  return origin
    .trim()
    .replace(/^(https?):\/(?!\/)/, '$1://')
    .replace(/\/$/, '');
}

export function parseAllowedOrigins(raw: string | undefined): string[] {
  if (!raw) return [];
  return [...new Set(raw.split(',').map(normalizeOrigin).filter(Boolean))];
}

export function buildAllowedOrigins(options: {
  corsAllowedOrigins?: string;
  frontendUrl?: string;
  baseUrl?: string;
}): string[] {
  const origins = parseAllowedOrigins(options.corsAllowedOrigins);

  for (const url of [options.frontendUrl, options.baseUrl]) {
    if (!url) continue;
    try {
      const parsed = new URL(normalizeOrigin(url));
      origins.push(`${parsed.protocol}//${parsed.host}`);
    } catch {
      // ignore invalid URLs
    }
  }

  return [...new Set(origins)];
}

export function isLocalDevOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  } catch {
    return false;
  }
}

/** Cache de patrones compilados: evita recompilar el regex en cada request. */
const wildcardCache = new Map<string, RegExp>();

/**
 * Convierte un patrón con `*` en RegExp. El comodín matchea un único segmento DNS
 * (no incluye puntos), que es la semántica estándar de wildcard de subdominio:
 * `https://*.vercel.app` acepta `https://app.vercel.app` pero NO `https://a.b.vercel.app`.
 */
function wildcardToRegExp(pattern: string): RegExp {
  const cached = wildcardCache.get(pattern);
  if (cached) return cached;

  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '[^.]*');
  const regex = new RegExp(`^${escaped}$`);
  wildcardCache.set(pattern, regex);
  return regex;
}

export function isOriginAllowed(origin: string | undefined, allowedOrigins: string[]): boolean {
  if (!origin) return true;

  const normalizedOrigin = normalizeOrigin(origin);

  if (isLocalDevOrigin(normalizedOrigin)) {
    return true;
  }

  // Match exacto primero (caso común, sin costo de regex)
  if (allowedOrigins.includes(normalizedOrigin)) {
    return true;
  }

  // Patrones con comodín, ej. https://mi-proyecto-*.vercel.app (previews de Vercel)
  return allowedOrigins.some(
    allowed => allowed.includes('*') && wildcardToRegExp(allowed).test(normalizedOrigin)
  );
}

const CORS_METHODS = 'GET, POST, PUT, DELETE, OPTIONS, PATCH';
const CORS_HEADERS =
  'Content-Type, Authorization, Accept, X-Requested-With, X-Internal-Token, ngrok-skip-browser-warning, Origin, Access-Control-Request-Method, Access-Control-Request-Headers';

export function applyCorsHeaders(req: Request, res: Response, allowedOrigins: string[]): boolean {
  const origin = req.headers.origin as string | undefined;

  if (origin && isOriginAllowed(origin, allowedOrigins)) {
    res.setHeader('Access-Control-Allow-Origin', normalizeOrigin(origin));
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    return true;
  }

  if (origin) {
    console.warn(`[CORS] Origin not allowed: ${origin}. Allowed: ${allowedOrigins.join(', ') || '(none configured)'}`);
  }

  return false;
}

/** Registers CORS as the first Express middleware (handles preflight without redirect issues from duplicate handlers). */
export function setupCors(app: INestApplication, allowedOrigins: string[]): void {
  const expressApp = app.getHttpAdapter().getInstance();

  expressApp.use((req: Request, res: Response, next: NextFunction) => {
    applyCorsHeaders(req, res, allowedOrigins);
    res.setHeader('Access-Control-Allow-Methods', CORS_METHODS);
    res.setHeader('Access-Control-Allow-Headers', CORS_HEADERS);
    res.setHeader('Access-Control-Max-Age', '86400');
    res.setHeader('Vary', 'Origin');

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    next();
  });

  console.log(`[CORS] Allowed origins: ${allowedOrigins.join(', ') || '(localhost/127.0.0.1 always allowed)'}`);
}
