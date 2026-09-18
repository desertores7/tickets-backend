/**
 * Sigue la generación de entradas después de `confirm-test-orders.js`.
 *
 *   node load-tests/scripts/watch-delivery.js --event <uuid> --since <iso>
 *
 * Cada 5 segundos muestra cuántas entradas de las órdenes de prueba pagadas ya
 * tienen su QR y su PDF. Termina cuando están todas, o a los 20 minutos.
 *
 * Los emails no dejan rastro en la base: se cuentan en los logs del servidor
 * (ver load-tests/README.md).
 */
const { connect, LOAD_TEST_USER_SQL } = require('./db');

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const eventUuid = arg('event');
  const since = arg('since');
  if (!eventUuid || !since) throw new Error('Uso: --event <uuid> --since <iso de confirm-test-orders>');

  const startedAt = new Date(since);
  const conn = await connect();
  try {
    for (let i = 0; i < 240; i++) {
      const [[row]] = await conn.query(
        `SELECT COUNT(DISTINCT o.uuid) AS ordenes,
                COUNT(t.uuid) AS entradas,
                SUM(t.pdfUrl IS NOT NULL) AS conPdf,
                MAX(t.updatedAt) AS ultima
           FROM orders o
           JOIN \`user\` u ON u.uuid = o.userUuid
           JOIN order_item oi ON oi.orderUuid = o.uuid
           LEFT JOIN ticket t ON t.orderItemUuid = oi.uuid
          WHERE o.eventUuid = ?
            AND o.status = 'paid'
            AND o.paidAt >= ?
            AND ${LOAD_TEST_USER_SQL}`,
        [eventUuid, startedAt]
      );

      const total = Number(row.entradas);
      const done = Number(row.conPdf ?? 0);
      const elapsed = Math.round((Date.now() - startedAt.getTime()) / 1000);
      console.log(
        `${elapsed}s  órdenes pagadas: ${row.ordenes}  entradas con PDF: ${done}/${total}`
      );

      if (total > 0 && done >= total) {
        const lastAt = row.ultima ? new Date(`${row.ultima}Z`) : new Date();
        const took = Math.round((lastAt.getTime() - startedAt.getTime()) / 1000);
        console.log(`Todas las entradas generadas. La última, ~${took} s después de confirmar el pago.`);
        return;
      }
      await sleep(5000);
    }
    console.log('Pasaron 20 minutos y quedan entradas sin PDF: revisar los logs de generate-qr.');
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
})().catch(error => {
  console.error('ERROR:', error.message);
  process.exitCode = 1;
});
