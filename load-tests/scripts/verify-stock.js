/**
 * Chequeo posterior a una corrida: ¿se vendió de más?
 *
 *   node load-tests/scripts/verify-stock.js --event <eventUuid>
 *
 * Por cada tanda del evento compara:
 * - cupo total vs. entradas en órdenes pagadas y pendientes;
 * - `availableQuantity` de MySQL vs. lo que realmente se vendió;
 * - el stock de Redis, si hay acceso (`REDIS_*` del .env).
 *
 * Sale con código 1 si encuentra sobreventa: es lo único que una prueba de
 * carga no puede dejar pasar.
 */
const { connect, LOAD_TEST_EMAIL_DOMAIN } = require('./db');

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function readRedisStock(uuids) {
  // Redis no está publicado a internet (y así tiene que ser): desde una máquina
  // de afuera esto no conecta. El chequeo de Redis se hace en el servidor; acá
  // se omite sin ensuciar la salida.
  if (process.env.SKIP_REDIS === '1') return null;

  try {
    const Redis = require('ioredis');
    // Un solo intento y sin cola offline: si no está, se sabe enseguida y no
    // quedan reintentos escupiendo errores mientras corre el resto.
    const options = {
      lazyConnect: true,
      connectTimeout: 3000,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: () => null
    };
    const redis = process.env.REDIS_URL
      ? new Redis(process.env.REDIS_URL, options)
      : new Redis({
          host: process.env.REDIS_IP || process.env.REDIS_HOST || 'localhost',
          port: Number(process.env.REDIS_PORT || 6379),
          password: process.env.REDIS_PASSWORD || undefined,
          ...options
        });
    redis.on('error', () => undefined);
    await redis.connect();
    const values = await redis.mget(uuids.map(u => `stock:${u}`));
    await redis.quit();
    return new Map(uuids.map((u, i) => [u, values[i] === null ? null : Number(values[i])]));
  } catch (error) {
    console.warn(`(sin acceso a Redis: ${error.message} — se omite esa columna)`);
    return null;
  }
}

(async () => {
  const eventUuid = arg('event');
  if (!eventUuid) throw new Error('Uso: --event <eventUuid>');

  const conn = await connect();
  try {
    const [rows] = await conn.query(
      `SELECT tt.uuid, tt.name, tt.quantity, tt.availableQuantity,
              COALESCE(SUM(CASE WHEN o.status IN ('paid','refunded') THEN oi.quantity END), 0) AS vendidas,
              COALESCE(SUM(CASE WHEN o.status = 'pending_payment' THEN oi.quantity END), 0) AS reservadas,
              COALESCE(SUM(CASE WHEN u.email LIKE ? THEN oi.quantity END), 0) AS deLaPrueba
         FROM ticket_type tt
         LEFT JOIN order_item oi ON oi.ticketTypeUuid = tt.uuid
         LEFT JOIN orders o ON o.uuid = oi.orderUuid
         LEFT JOIN \`user\` u ON u.uuid = o.userUuid
        WHERE tt.eventUuid = ?
        GROUP BY tt.uuid, tt.name, tt.quantity, tt.availableQuantity
        ORDER BY tt.name`,
      [`%@${LOAD_TEST_EMAIL_DOMAIN}`, eventUuid]
    );

    if (!rows.length) throw new Error('El evento no tiene tandas (¿uuid correcto?)');

    const redisStock = await readRedisStock(rows.map(r => r.uuid));
    let oversold = false;

    const table = rows.map(r => {
      const vendidas = Number(r.vendidas);
      const reservadas = Number(r.reservadas);
      const cupo = Number(r.quantity);
      const sobreventa = vendidas + reservadas > cupo;
      // availableQuantity se descuenta al pagar: tiene que ser cupo − pagadas.
      const dbDesfasado = Number(r.availableQuantity) !== cupo - vendidas;
      if (sobreventa) oversold = true;

      return {
        tanda: r.name,
        cupo,
        pagadas: vendidas,
        pendientes: reservadas,
        'de la prueba': Number(r.deLaPrueba),
        'disponible (DB)': Number(r.availableQuantity),
        'stock (Redis)': redisStock ? redisStock.get(r.uuid) : '—',
        sobreventa: sobreventa ? 'SÍ ⚠' : 'no',
        'DB desfasada': dbDesfasado ? 'sí' : 'no'
      };
    });

    console.table(table);
    console.log(
      oversold
        ? 'SOBREVENTA DETECTADA: se reservaron o vendieron más entradas que el cupo.'
        : 'Sin sobreventa.'
    );
    process.exitCode = oversold ? 1 : 0;
  } finally {
    await conn.end();
  }
})().catch(error => {
  console.error('ERROR:', error.message);
  process.exitCode = 1;
});
