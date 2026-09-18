/**
 * Escenario 1 — Navegación pública.
 *
 * Lo que pasa minutos antes de abrir la venta: miles de personas refrescando la
 * home y la página del evento. No hay login ni compra; mide el catálogo, el
 * detalle y el mapa, y cuánto de eso absorbe Cloudflare.
 *
 * Cómo correrlo: ver load-tests/README.md.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';
import { API, EVENT_SLUG, EVENT_UUID, baseHeaders, requireEnv } from './lib/config.js';

/** Iteraciones por segundo; cada una son 3 pedidos (listado, detalle y mapa). */
const PEAK_RPS = Number(__ENV.PEAK_RPS || 200);

const throttled = new Counter('responses_429');
const serverErrors = new Counter('responses_5xx');
const gatewayErrors = new Counter('responses_502_504');
const cloudflareErrors = new Counter('responses_cloudflare_52x');
const otherErrors = new Counter('responses_4xx');
const timeouts = new Counter('timeouts');

export const options = {
  scenarios: {
    browse: {
      // Tasa de llegadas y no cantidad de usuarios: así un servidor lento no
      // "baja" la carga sola, que es lo que pasa en una salida a la venta real.
      executor: 'ramping-arrival-rate',
      startRate: 5,
      timeUnit: '1s',
      preAllocatedVUs: 100,
      maxVUs: Number(__ENV.MAX_VUS || 2000),
      stages: [
        { target: Math.round(PEAK_RPS / 4), duration: '1m' },
        { target: PEAK_RPS, duration: '2m' },
        { target: PEAK_RPS, duration: '3m' },
        { target: 0, duration: '30s' }
      ]
    }
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{name:GET /events/by-slug}': ['p(95)<800'],
    'http_req_duration{name:GET /events}': ['p(95)<1000']
  }
};

export function setup() {
  requireEnv(['EVENT_UUID', 'EVENT_SLUG']);
}

/**
 * Sin esto, "45% falló" no dice nada: no es lo mismo que la API rechace por
 * límite de peticiones (429), que se caiga (5xx), que corte el proxy de
 * Cloudflare (502/520/524) o que el pedido se quede sin respuesta (timeout).
 * Cada caso se arregla distinto.
 */
function track(res) {
  if (res.status === 0) {
    timeouts.add(1);
    return;
  }
  if (res.status === 429) throttled.add(1);
  else if (res.status === 502 || res.status === 503 || res.status === 504) gatewayErrors.add(1);
  else if (res.status >= 520 && res.status <= 527) cloudflareErrors.add(1);
  else if (res.status >= 500) serverErrors.add(1);
  else if (res.status >= 400 && res.status !== 404) otherErrors.add(1);
}

export default function () {
  const params = name => ({ headers: baseHeaders(), tags: { name } });

  const list = http.get(`${API}/events?page=1&limit=12`, params('GET /events'));
  track(list);
  check(list, { 'listado 200': r => r.status === 200 });

  const detail = http.get(`${API}/events/by-slug/${EVENT_SLUG}`, params('GET /events/by-slug'));
  track(detail);
  check(detail, { 'detalle 200': r => r.status === 200 });

  const map = http.get(`${API}/events/${EVENT_UUID}/map/public`, params('GET /events/:uuid/map/public'));
  track(map);
  // Un evento sin mapa responde 404 y está bien.
  check(map, { 'mapa 200/404': r => r.status === 200 || r.status === 404 });

  sleep(Math.random() * 2);
}
