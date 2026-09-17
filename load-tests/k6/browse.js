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
import { API, EVENT_SLUG, EVENT_UUID, baseHeaders, requireEnv } from './lib/config.js';

const PEAK_RPS = Number(__ENV.PEAK_RPS || 200);

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

export default function () {
  const params = name => ({ headers: baseHeaders(), tags: { name } });

  const list = http.get(`${API}/events?page=1&limit=12`, params('GET /events'));
  check(list, { 'listado 200': r => r.status === 200 });

  const detail = http.get(`${API}/events/by-slug/${EVENT_SLUG}`, params('GET /events/by-slug'));
  check(detail, { 'detalle 200': r => r.status === 200 });

  const map = http.get(`${API}/events/${EVENT_UUID}/map/public`, params('GET /events/:uuid/map/public'));
  // Un evento sin mapa responde 404 y está bien.
  check(map, { 'mapa 200/404': r => r.status === 200 || r.status === 404 });

  sleep(Math.random() * 2);
}
