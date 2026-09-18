/**
 * Conexión compartida por los scripts de pruebas de carga.
 *
 * Lee `DB_CONNECTION_DATA` del `.env` del backend, igual que la API. Los `$$`
 * del password vienen del escape de docker compose y se deshacen acá.
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mysql = require('mysql2/promise');

/** Todos los compradores de prueba comparten este dominio: así se los encuentra y se los borra. */
const LOAD_TEST_EMAIL_DOMAIN = 'showpass-loadtest.invalid';

/**
 * Condición SQL (sobre el alias `u` de `user`) que identifica a un comprador de
 * prueba. Cubre también a los redirigidos a una casilla real para la prueba de
 * post-pago (`redirect-emails.js`), que quedan como `casilla+loadtest-00001@dominio`.
 */
const LOAD_TEST_USER_SQL =
  "(u.email LIKE '%@showpass-loadtest.invalid' OR u.email LIKE '%+loadtest-%')";

function loadTestEmail(index) {
  return `loadtest+${String(index).padStart(5, '0')}@${LOAD_TEST_EMAIL_DOMAIN}`;
}

async function connect() {
  const raw = process.env.DB_CONNECTION_DATA;
  if (!raw) throw new Error('Falta DB_CONNECTION_DATA en el .env del backend');

  const cfg = JSON.parse(raw);
  return mysql.createConnection({
    host: cfg.host,
    port: cfg.port,
    user: cfg.username,
    password: String(cfg.password).split('$$').join('$'),
    database: cfg.database,
    timezone: 'Z',
    dateStrings: true,
    multipleStatements: false
  });
}

module.exports = { connect, loadTestEmail, LOAD_TEST_EMAIL_DOMAIN, LOAD_TEST_USER_SQL };
