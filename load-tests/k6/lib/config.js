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

/** Mismo formato que `load-tests/scripts/db.js`. */
export function loadTestEmail(index) {
  return `loadtest+${String(index).padStart(5, '0')}@showpass-loadtest.invalid`;
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

/** Login de un comprador de prueba. Devuelve el access token o null. */
export function login(index) {
  const res = http.post(
    `${API}/auth/login`,
    JSON.stringify({ email: loadTestEmail(index), password: LOAD_TEST_PASSWORD }),
    { headers: baseHeaders(), tags: { name: 'POST /auth/login' } }
  );
  const ok = check(res, { 'login 200': r => r.status === 200 });
  if (!ok) return null;
  return res.json('access_token') || null;
}
