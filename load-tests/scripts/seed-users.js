/**
 * Crea los compradores de prueba para k6.
 *
 *   node load-tests/scripts/seed-users.js --count 2000
 *
 * Cada uno sale listo para comprar: email verificado, documento cargado, sin
 * 2FA y con rol Cliente. Todos usan `LOAD_TEST_PASSWORD` y un email con el
 * dominio `showpass-loadtest.invalid` (`.invalid` no existe: nunca sale un
 * correo real hacia ellos).
 *
 * Es idempotente: los que ya existen se saltean.
 */
const { randomUUID } = require('crypto');
const bcrypt = require('bcryptjs');
const { connect, loadTestEmail } = require('./db');

/** Rol Cliente (migración SeedClienteRole). */
const CLIENTE_ROLE_UUID = 'd4f8a1c3-5b27-4e69-9a04-3c71e8b5d2f6';
const BATCH_SIZE = 500;

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

(async () => {
  const count = Number(arg('count', '500'));
  const password = process.env.LOAD_TEST_PASSWORD;
  if (!password || password.length < 12) {
    throw new Error('Definí LOAD_TEST_PASSWORD (12+ caracteres) en el entorno antes de sembrar');
  }
  if (!Number.isInteger(count) || count < 1 || count > 20000) {
    throw new Error('--count tiene que ser un entero entre 1 y 20000');
  }

  // Un solo hash para todos: con bcrypt costo 10, hashear 5.000 por separado
  // tardaría minutos y no cambia nada de lo que se mide.
  const hash = await bcrypt.hash(password, 10);
  const conn = await connect();

  let created = 0;
  try {
    for (let start = 1; start <= count; start += BATCH_SIZE) {
      const end = Math.min(start + BATCH_SIZE - 1, count);
      const emails = [];
      for (let i = start; i <= end; i++) emails.push(loadTestEmail(i));

      const [existing] = await conn.query('SELECT email FROM `user` WHERE email IN (?)', [emails]);
      const known = new Set(existing.map(r => r.email));

      const users = [];
      const roles = [];
      emails.forEach((email, offset) => {
        if (known.has(email)) return;
        const uuid = randomUUID();
        const index = start + offset;
        users.push([
          uuid, 'Carga', `Prueba ${index}`, email, hash, 'DNI', String(90_000_000 + index),
          1, 1, new Date(), new Date(), 0
        ]);
        roles.push([randomUUID(), uuid, CLIENTE_ROLE_UUID, uuid]);
      });

      if (users.length) {
        await conn.beginTransaction();
        await conn.query(
          'INSERT INTO `user` (uuid, firstName, lastName, email, password, documentType, dni, ' +
            'active, emailVerified, emailVerifiedAt, termsAcceptedAt, twoAuthentication) VALUES ?',
          [users]
        );
        await conn.query(
          'INSERT INTO `user_role` (uuid, userUuid, roleUuid, createdBy) VALUES ?',
          [roles]
        );
        await conn.commit();
        created += users.length;
      }

      console.log(`  ${end}/${count} revisados, ${created} creados`);
    }
  } catch (error) {
    await conn.rollback().catch(() => undefined);
    throw error;
  } finally {
    await conn.end();
  }

  console.log(`Listo: ${created} compradores de prueba nuevos (${count - created} ya existían).`);
})().catch(error => {
  console.error('ERROR:', error.message);
  process.exitCode = 1;
});
