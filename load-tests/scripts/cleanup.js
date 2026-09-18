/**
 * Borra los compradores de prueba y todo lo que generaron.
 *
 *   node load-tests/scripts/cleanup.js            # muestra qué borraría
 *   node load-tests/scripts/cleanup.js --confirm  # borra
 *
 * Solo toca usuarios con email `@showpass-loadtest.invalid`: nunca un usuario
 * real. Se niega a correr si quedan órdenes de prueba en `pending_payment`,
 * porque todavía tienen stock reservado en Redis: hay que esperar a que venzan
 * (10 minutos) o cancelarlas, si no ese stock queda perdido.
 *
 * Si hubo prueba de post-pago (`confirm-test-orders`), las órdenes pagadas
 * descontaron cupo y sumaron al resumen de fees del evento. Antes de borrarlas
 * se devuelve el cupo a `ticket_type.availableQuantity` y se resta lo que
 * sumaron en `event_fee_summary`. El stock de Redis no se toca desde acá (no
 * está publicado): el script imprime los `INCRBY` para correr en el servidor.
 */
const { connect, LOAD_TEST_EMAIL_DOMAIN } = require('./db');

const confirm = process.argv.includes('--confirm');

/** De hijo a padre: cada DELETE respeta las FK del anterior. */
const STEPS = [
  ['coupon_redemption', 'orderUuid IN (SELECT uuid FROM orders WHERE userUuid IN (SELECT uuid FROM tmp_loadtest_users))'],
  ['refund_request_ticket', 'ticketUuid IN (SELECT uuid FROM ticket WHERE userUuid IN (SELECT uuid FROM tmp_loadtest_users))'],
  ['refund_request', 'userUuid IN (SELECT uuid FROM tmp_loadtest_users)'],
  ['check_in_log', 'ticketUuid IN (SELECT uuid FROM ticket WHERE userUuid IN (SELECT uuid FROM tmp_loadtest_users))'],
  ['ticket', 'userUuid IN (SELECT uuid FROM tmp_loadtest_users)'],
  ['payment', 'orderUuid IN (SELECT uuid FROM orders WHERE userUuid IN (SELECT uuid FROM tmp_loadtest_users))'],
  ['order_item', 'orderUuid IN (SELECT uuid FROM orders WHERE userUuid IN (SELECT uuid FROM tmp_loadtest_users))'],
  ['orders', 'userUuid IN (SELECT uuid FROM tmp_loadtest_users)'],
  ['user_notification', 'userUuid IN (SELECT uuid FROM tmp_loadtest_users)'],
  ['user_token_session', 'userUuid IN (SELECT uuid FROM tmp_loadtest_users)'],
  ['user_session', 'userUuid IN (SELECT uuid FROM tmp_loadtest_users)'],
  ['user_event_favorite', 'userUuid IN (SELECT uuid FROM tmp_loadtest_users)'],
  ['user_role', 'userUuid IN (SELECT uuid FROM tmp_loadtest_users)'],
  ['`user`', 'uuid IN (SELECT uuid FROM tmp_loadtest_users)']
];

/**
 * Deshace lo que sumaron las órdenes de prueba pagadas: cupo en MySQL y
 * resumen de fees. Devuelve el cupo por tanda, para el aviso de Redis.
 */
async function revertPaidOrders(conn) {
  const [items] = await conn.query(
    `SELECT oi.ticketTypeUuid, SUM(oi.quantity) AS cantidad
       FROM order_item oi
       JOIN orders o ON o.uuid = oi.orderUuid
      WHERE o.status = 'paid' AND o.userUuid IN (SELECT uuid FROM tmp_loadtest_users)
      GROUP BY oi.ticketTypeUuid`
  );
  if (!items.length) return [];

  const [fees] = await conn.query(
    `SELECT o.eventUuid, COUNT(*) AS ordenes, SUM(q.cantidad) AS entradas,
            SUM(o.total) AS bruto, SUM(o.subtotal) AS monto, SUM(o.serviceFee) AS fee
       FROM orders o
       JOIN (SELECT orderUuid, SUM(quantity) AS cantidad FROM order_item GROUP BY orderUuid) q
         ON q.orderUuid = o.uuid
      WHERE o.status = 'paid' AND o.userUuid IN (SELECT uuid FROM tmp_loadtest_users)
      GROUP BY o.eventUuid`
  );

  for (const i of items) console.log(`  cupo a devolver: tanda ${i.ticketTypeUuid} +${i.cantidad}`);
  for (const f of fees) {
    console.log(`  resumen de fees: evento ${f.eventUuid} -${f.ordenes} órdenes, -${f.entradas} entradas`);
  }
  if (!confirm) return items;

  await conn.beginTransaction();
  try {
    for (const i of items) {
      await conn.query(
        'UPDATE ticket_type SET availableQuantity = availableQuantity + ? WHERE uuid = ?',
        [Number(i.cantidad), i.ticketTypeUuid]
      );
    }
    for (const f of fees) {
      await conn.query(
        `UPDATE event_fee_summary
            SET totalOrdersPaid = totalOrdersPaid - ?, totalTicketsSold = totalTicketsSold - ?,
                grossAmount = grossAmount - ?, ticketAmount = ticketAmount - ?,
                serviceFeeAmount = serviceFeeAmount - ?, updatedAt = NOW(3)
          WHERE eventUuid = ?`,
        [f.ordenes, f.entradas, f.bruto, f.monto, f.fee, f.eventUuid]
      );
    }
    // Sin esto, el DELETE de más abajo borraría las órdenes y el cupo ya
    // devuelto se volvería a devolver si el script se corta y se repite.
    await conn.query(
      `UPDATE orders SET status = 'cancelled'
        WHERE status = 'paid' AND userUuid IN (SELECT uuid FROM tmp_loadtest_users)`
    );
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  }
  return items;
}

(async () => {
  const conn = await connect();
  try {
    const [[{ redirigidos }]] = await conn.query(
      "SELECT COUNT(*) AS redirigidos FROM `user` WHERE email LIKE '%+loadtest-%'"
    );
    if (Number(redirigidos) > 0) {
      throw new Error(
        `Hay ${redirigidos} compradores de prueba con el email redirigido. ` +
          'Primero: node load-tests/scripts/redirect-emails.js --restore'
      );
    }

    const [[{ pendientes }]] = await conn.query(
      `SELECT COUNT(*) AS pendientes FROM orders o JOIN \`user\` u ON u.uuid = o.userUuid
        WHERE u.email LIKE ? AND o.status = 'pending_payment'`,
      [`%@${LOAD_TEST_EMAIL_DOMAIN}`]
    );
    if (Number(pendientes) > 0) {
      throw new Error(
        `Hay ${pendientes} órdenes de prueba pendientes de pago con stock reservado. ` +
          'Esperá a que venzan (10 min) y volvé a correr.'
      );
    }

    // Tabla auxiliar con los uuids: evita repetir el LIKE en cada DELETE. Es
    // una tabla común y no TEMPORARY: MySQL no deja referenciar una temporal
    // dos veces en la misma sentencia. Se borra al final.
    await conn.query('DROP TABLE IF EXISTS tmp_loadtest_users');
    await conn.query(
      'CREATE TABLE tmp_loadtest_users (uuid varchar(36) PRIMARY KEY) AS SELECT uuid FROM `user` WHERE email LIKE ?',
      [`%@${LOAD_TEST_EMAIL_DOMAIN}`]
    );

    let restored = [];
    try {
      const [[{ usuarios }]] = await conn.query('SELECT COUNT(*) AS usuarios FROM tmp_loadtest_users');
      console.log(`Compradores de prueba: ${usuarios}`);

      restored = await revertPaidOrders(conn);

      for (const [table, where] of STEPS) {
        if (!confirm) {
          const [[{ n }]] = await conn.query(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`);
          console.log(`  ${table}: ${n} filas`);
          continue;
        }
        await conn.beginTransaction();
        const [result] = await conn.query(`DELETE FROM ${table} WHERE ${where}`);
        await conn.commit();
        console.log(`  ${table}: ${result.affectedRows} borradas`);
      }
    } finally {
      await conn.query('DROP TABLE IF EXISTS tmp_loadtest_users');
    }

    console.log(confirm ? 'Limpieza terminada.' : 'Nada borrado. Repetí con --confirm para borrar.');
    if (confirm && restored.length) {
      console.log('\nFalta devolver el cupo en Redis. En el servidor (REDIS_PASSWORD del .env del backend):');
      for (const i of restored) {
        console.log(
          `  docker exec redis-ta63-redis-1 redis-cli -a "$REDIS_PASSWORD" INCRBY stock:${i.ticketTypeUuid} ${i.cantidad}`
        );
      }
    }
  } finally {
    await conn.end();
  }
})().catch(error => {
  console.error('ERROR:', error.message);
  process.exitCode = 1;
});
