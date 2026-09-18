/**
 * Prueba de carga del circuito post-pago (ver load-tests/README.md).
 *
 * Toma órdenes de prueba pendientes de un evento y las confirma con el mismo
 * `confirmPayment` que llama el webhook de Mercado Pago. De ahí en adelante
 * corre todo lo real: se crean las entradas, se encolan los QR/PDF y el email
 * con los adjuntos. Sirve para medir cuánto tarda en salir el último email
 * cuando se pagan cientos de órdenes juntas.
 *
 * Corre dentro del contenedor, con el mismo entorno que la API:
 *
 *   docker compose run --rm --no-deps -T showpass-api \
 *     node dist/scripts/load-test/confirm-test-orders.js --event <uuid> --limit 50
 *
 * Solo toca órdenes de los compradores de prueba (`load-tests/scripts/seed-users.js`):
 * nunca confirma una orden de un usuario real.
 */
import { Logger } from '@nestjs/common';
import { DiscoveryService, NestFactory } from '@nestjs/core';
import { WorkerHost } from '@nestjs/bullmq';
import { DataSource } from 'typeorm';
import { AppModule } from '../../app.module';
import { IOrderService } from '@modules/orders/services/contracts/iorder.service';

/** Mismo criterio que `load-tests/scripts/db.js`: emails de prueba, redirigidos o no. */
const LOAD_TEST_USER_SQL =
  "(u.email LIKE '%@showpass-loadtest.invalid' OR u.email LIKE '%+loadtest-%')";

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

async function main(): Promise<void> {
  const logger = new Logger('ConfirmTestOrders');
  const eventUuid = arg('event');
  // Default bajo a propósito: cada orden es un email real. Se sube de a escalones.
  const limit = Number(arg('limit', '50'));
  // Webhooks de MP llegan en paralelo, pero no de a mil: 20 simula bien una
  // ráfaga de pagos aprobados sin convertir esto en otra prueba de CPU.
  const concurrency = Number(arg('concurrency', '20'));

  if (!eventUuid) throw new Error('Uso: --event <uuid> [--limit N] [--concurrency N]');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn']
  });

  try {
    // Este proceso levanta la app entera, workers de BullMQ incluidos. Sin
    // esto toma jobs de QR y email, y al cerrar la base los deja a medias
    // ("Connection is not established"). Los procesan las réplicas de la API.
    const discovery = app.get(DiscoveryService, { strict: false });
    await Promise.all(
      discovery
        .getProviders()
        .map(wrapper => wrapper.instance as unknown)
        .filter((instance): instance is WorkerHost => instance instanceof WorkerHost)
        .map(host => host.worker.close())
    );

    const dataSource = app.get(DataSource);
    const orderService = app.get<IOrderService>('IOrderService');

    const rows: { uuid: string }[] = await dataSource.query(
      `SELECT o.uuid
         FROM orders o
         JOIN \`user\` u ON u.uuid = o.userUuid
        WHERE o.eventUuid = ?
          AND o.status = 'pending_payment'
          AND ${LOAD_TEST_USER_SQL}
        ORDER BY o.createdAt ASC
        LIMIT ?`,
      [eventUuid, limit]
    );

    if (!rows.length) {
      logger.warn('No hay órdenes de prueba pendientes para ese evento.');
      return;
    }

    logger.warn(`Confirmando ${rows.length} órdenes de prueba (de a ${concurrency})…`);
    const started = Date.now();
    let ok = 0;
    let failed = 0;

    const queue = [...rows];
    await Promise.all(
      Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
        for (let row = queue.shift(); row; row = queue.shift()) {
          try {
            await orderService.confirmPayment(row.uuid, {
              paymentProvider: 'loadtest',
              paymentId: `loadtest-${row.uuid}`,
              paymentMethod: 'loadtest',
              paidAt: new Date()
            });
            ok++;
          } catch (error) {
            failed++;
            logger.error(
              `No se pudo confirmar ${row.uuid}: ${error instanceof Error ? error.message : String(error)}`
            );
          }
        }
      })
    );

    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    logger.warn(
      `Listo: ${ok} confirmadas, ${failed} con error, en ${seconds} s. ` +
        `Inicio: ${new Date(started).toISOString()} (usalo en watch-delivery.js --since).`
    );
  } finally {
    await app.close();
  }
}

main().catch(error => {
  // eslint-disable-next-line no-console
  console.error('ERROR:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
