/**
 * Escenario 2 — Salida a la venta.
 *
 * N compradores entran casi a la vez y cada uno: inicia sesión, abre el evento,
 * lista las tandas y reserva entre 1 y MAX_QTY entradas. Es el pico que más
 * castiga: login (bcrypt), la reserva atómica en Redis y la transacción de la
 * orden en MySQL, todo concentrado en el primer minuto.
 *
 * No paga: el pago real es Mercado Pago y no se puede simular. La orden queda
 * `pending_payment` y, con CANCEL=1, se cancela al final para devolver el stock
 * (si no, vence sola a los 10 minutos).
 *
 * Con un cupo menor que la demanda (ej. 500 entradas para 2.000 compradores)
 * además prueba que no se venda de más: después correr verify-stock.js.
 *
 * Cómo correrlo: ver load-tests/README.md.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import exec from 'k6/execution';
import {
  API,
  EVENT_SLUG,
  EVENT_UUID,
  authHeaders,
  baseHeaders,
  login,
  requireEnv
} from './lib/config.js';

const BUYERS = Number(__ENV.BUYERS || 500);
/** Segundos en los que entran todos. 30 ≈ la apertura de una venta con demanda. */
const RAMP_SECONDS = Number(__ENV.RAMP_SECONDS || 30);
const MAX_QTY = Number(__ENV.MAX_QTY || 2);
const CANCEL = __ENV.CANCEL !== '0';

/**
 * `PRELOGIN=1`: los compradores inician sesión repartidos en
 * `LOGIN_WINDOW_SECONDS` y recién después, todos juntos, compran.
 *
 * Es el escenario más realista de una salida a la venta anunciada: la gente ya
 * está con la sesión abierta esperando la hora. Y además aísla la medición: el
 * login usa bcrypt, que por diseño quema CPU, y si entra en la misma ventana
 * que la compra se come todo el tiempo y tapa lo que se quiere medir.
 */
const PRELOGIN = __ENV.PRELOGIN === '1';
const LOGIN_WINDOW_SECONDS = Number(__ENV.LOGIN_WINDOW_SECONDS || 120);

const ordersCreated = new Counter('orders_created');
const soldOut = new Counter('orders_sold_out');
const throttled = new Counter('responses_429');
const serverErrors = new Counter('responses_5xx');
const orderOk = new Rate('order_success_rate');
const timeToOrder = new Trend('time_to_order_ms', true);

export const options = {
  scenarios: {
    on_sale: {
      // Cada comprador hace el flujo una sola vez, como en la realidad: nadie
      // compra 50 veces seguidas. El índice del comprador es la iteración.
      executor: 'per-vu-iterations',
      vus: BUYERS,
      iterations: 1,
      maxDuration: `${(PRELOGIN ? LOGIN_WINDOW_SECONDS : 0) + RAMP_SECONDS + 300}s`
    }
  },
  thresholds: {
    responses_5xx: ['count<1'],
    'http_req_duration{name:POST /orders}': ['p(95)<2000'],
    'http_req_duration{name:POST /auth/login}': ['p(95)<2000']
  }
};

export function setup() {
  requireEnv(['EVENT_UUID', 'EVENT_SLUG', 'LOAD_TEST_PASSWORD']);
  // Hora de apertura común a todos los compradores: la comparten porque `setup`
  // corre una sola vez y su resultado llega a cada VU.
  return { opensAt: Date.now() + LOGIN_WINDOW_SECONDS * 1000 };
}

function track(res) {
  if (res.status === 429) throttled.add(1);
  if (res.status >= 500) serverErrors.add(1);
}

export default function (data) {
  const buyerIndex = exec.vu.idInTest;
  let token;

  if (PRELOGIN) {
    // Sesión abierta antes de la apertura, repartida en la ventana de login.
    sleep(Math.random() * LOGIN_WINDOW_SECONDS);
    token = login(buyerIndex);
    if (!token) {
      orderOk.add(false);
      return;
    }
    // Esperar la hora de apertura; después, la rampa de llegadas.
    const waitMs = (data?.opensAt ?? Date.now()) - Date.now();
    if (waitMs > 0) sleep(waitMs / 1000);
    sleep(Math.random() * RAMP_SECONDS);
  } else {
    // Reparte las llegadas a lo largo de la rampa en vez de disparar todo en el
    // mismo milisegundo.
    sleep(Math.random() * RAMP_SECONDS);
  }

  // El cronómetro arranca en la apertura: lo que se mide es cuánto tarda el
  // comprador en tener su reserva, sin contar la espera previa.
  const started = Date.now();

  if (!PRELOGIN) {
    token = login(buyerIndex);
    if (!token) {
      orderOk.add(false);
      return;
    }
  }

  const detail = http.get(`${API}/events/by-slug/${EVENT_SLUG}`, {
    headers: baseHeaders(),
    tags: { name: 'GET /events/by-slug' }
  });
  track(detail);

  const types = http.get(`${API}/events/${EVENT_UUID}/ticket-types`, {
    headers: authHeaders(token),
    tags: { name: 'GET /events/:uuid/ticket-types' }
  });
  track(types);
  if (!check(types, { 'tandas 200': r => r.status === 200 })) {
    orderOk.add(false);
    return;
  }

  const body = types.json();
  const list = Array.isArray(body) ? body : body.items || [];
  const onSale = list.filter(t => t.status === 'available' || t.status === undefined);
  if (!onSale.length) {
    soldOut.add(1);
    orderOk.add(false);
    return;
  }

  const ticketType = onSale[Math.floor(Math.random() * onSale.length)];
  const quantity = 1 + Math.floor(Math.random() * MAX_QTY);

  const order = http.post(
    `${API}/orders`,
    JSON.stringify({
      eventUuid: EVENT_UUID,
      items: [{ ticketTypeId: ticketType.uuid, quantity }]
    }),
    { headers: authHeaders(token), tags: { name: 'POST /orders' } }
  );
  track(order);

  if (order.status === 409) {
    // Agotado: es la respuesta correcta cuando la demanda supera el cupo.
    soldOut.add(1);
    orderOk.add(false);
    return;
  }

  const created = check(order, { 'orden 201': r => r.status === 201 || r.status === 200 });
  orderOk.add(created);
  if (!created) return;

  ordersCreated.add(1);
  timeToOrder.add(Date.now() - started);

  if (CANCEL) {
    // El comprador "piensa" antes de irse, como el que abandona el checkout.
    sleep(2 + Math.random() * 5);
    const cancel = http.del(`${API}/orders/${order.json('uuid')}`, null, {
      headers: authHeaders(token),
      tags: { name: 'DELETE /orders/:id' }
    });
    track(cancel);
    check(cancel, { 'cancelación 2xx': r => r.status >= 200 && r.status < 300 });
  }
}
