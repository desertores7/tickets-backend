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

(async () => {
  const conn = await connect();
  try {
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

    try {
      const [[{ usuarios }]] = await conn.query('SELECT COUNT(*) AS usuarios FROM tmp_loadtest_users');
      console.log(`Compradores de prueba: ${usuarios}`);

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
  } finally {
    await conn.end();
  }
})().catch(error => {
  console.error('ERROR:', error.message);
  process.exitCode = 1;
});
