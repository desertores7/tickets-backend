/**
 * Redirige los emails de los compradores de prueba a una casilla real, para la
 * prueba de post-pago, y los devuelve después.
 *
 *   node load-tests/scripts/redirect-emails.js --to info@showpass.com.ar
 *   node load-tests/scripts/redirect-emails.js --restore
 *
 * `loadtest+00001@showpass-loadtest.invalid` pasa a `info+loadtest-00001@showpass.com.ar`.
 * Se usa el alias con `+` porque `user.email` es único: no pueden compartir
 * dirección. La mayoría de los servidores de correo entregan `info+algo@` en
 * `info@`; confirmarlo con una sola orden antes de la corrida grande.
 *
 * Por qué no dejar `.invalid`: el servidor de correo aceptaría el mensaje,
 * fallaría al entregarlo y devolvería cientos de rebotes, y mandar en masa a
 * dominios inexistentes daña la reputación del remitente.
 */
const { connect, LOAD_TEST_EMAIL_DOMAIN } = require('./db');

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

(async () => {
  const restore = process.argv.includes('--restore');
  const to = arg('to');

  if (!restore && !/^[^@\s+]+@[^@\s]+\.[^@\s]+$/.test(to ?? '')) {
    throw new Error('Uso: --to casilla@dominio (sin +)  |  --restore');
  }

  const conn = await connect();
  try {
    if (restore) {
      // `info+loadtest-00001@showpass.com.ar` → `loadtest+00001@showpass-loadtest.invalid`
      const [result] = await conn.query(
        `UPDATE \`user\`
            SET email = CONCAT('loadtest+',
                               SUBSTRING_INDEX(SUBSTRING_INDEX(email, '+loadtest-', -1), '@', 1),
                               '@${LOAD_TEST_EMAIL_DOMAIN}')
          WHERE email LIKE '%+loadtest-%'`
      );
      console.log(`Restaurados: ${result.affectedRows} compradores de prueba.`);
      return;
    }

    const [local, domain] = to.split('@');
    // `loadtest+00001@showpass-loadtest.invalid` → `info+loadtest-00001@showpass.com.ar`
    const [result] = await conn.query(
      `UPDATE \`user\`
          SET email = CONCAT(?, '+loadtest-',
                             SUBSTRING_INDEX(SUBSTRING_INDEX(email, '+', -1), '@', 1),
                             '@', ?)
        WHERE email LIKE ?`,
      [local, domain, `loadtest+%@${LOAD_TEST_EMAIL_DOMAIN}`]
    );
    console.log(`Redirigidos: ${result.affectedRows} compradores de prueba a ${local}+loadtest-NNNNN@${domain}.`);
    console.log('Al terminar la prueba: node load-tests/scripts/redirect-emails.js --restore');
  } finally {
    await conn.end();
  }
})().catch(error => {
  console.error('ERROR:', error.message);
  process.exitCode = 1;
});
