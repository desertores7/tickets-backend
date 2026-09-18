/**
 * Configuración común de los escenarios k6. Todo entra por variables de entorno
 * (`-e NOMBRE=valor`), nunca hardcodeado: el token de bypass y la contraseña de
 * los compradores de prueba no se commitean.
 */
import http from 'k6/http';
import { check, fail } from 'k6';

export const BASE_URL = (__ENV.BASE_URL || 'https://api.showpass.com.ar').replace(/\/$/, '');
export const API = `${BASE_URL}/api/v1`;

/** Uuid y slug del evento de prueba. */
export const EVENT_UUID = __ENV.EVENT_UUID;
export const EVENT_SLUG = __ENV.EVENT_SLUG;

/** Mismo valor que `LOAD_TEST_BYPASS_TOKEN` en el servidor. Vacío = se mide el límite real. */
export const BYPASS_TOKEN = __ENV.BYPASS_TOKEN || '';
export const LOAD_TEST_PASSWORD = __ENV.LOAD_TEST_PASSWORD;

/**
 * Casilla a la que se redirigieron los compradores (`redirect-emails.js --to`),
 * para la prueba de post-pago. Vacío = emails originales.
 */
export const EMAIL_TO = __ENV.EMAIL_TO || '';

/** Mismo formato que `load-tests/scripts/db.js` y `redirect-emails.js`. */
export function loadTestEmail(index) {
  const n = String(index).padStart(5, '0');
  if (EMAIL_TO) {
    const [local, domain] = EMAIL_TO.split('@');
    return `${local}+loadtest-${n}@${domain}`;
  }
  return `loadtest+${n}@showpass-loadtest.invalid`;
}

export function baseHeaders(extra = {}) {
  const headers = { 'Content-Type': 'application/json', ...extra };
  if (BYPASS_TOKEN) headers['x-load-test-token'] = BYPASS_TOKEN;
  return headers;
}

export function authHeaders(token) {
  return baseHeaders({ Authorization: `Bearer ${token}` });
}

export function requireEnv(names) {
  const missing = names.filter(n => !__ENV[n]);
  if (missing.length) fail(`Faltan variables: ${missing.join(', ')}`);
}

/**
 * Login de un comprador de prueba. Devuelve el access token o null.
 *
 * `onResponse` deja que el escenario cuente el código de respuesta: sin eso, un
 * login fallido no dice si fue un 429, un 500 de la API o un corte de Cloudflare.
 */
export function login(index, onResponse) {
  const res = http.post(
    `${API}/auth/login`,
    JSON.stringify({ email: loadTestEmail(index), password: LOAD_TEST_PASSWORD }),
    { headers: baseHeaders(), tags: { name: 'POST /auth/login' } }
  );
  if (onResponse) onResponse(res);
  const ok = check(res, { 'login 200': r => r.status === 200 });
  if (!ok) return null;
  return res.json('access_token') || null;
}
