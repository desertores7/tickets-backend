import { Inject, Injectable, Logger } from '@nestjs/common';
import { QueryRunner } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { DBRepository } from '@config/db/db.repository';
import { EventFeeSummary } from '../core/fee-summary';

/**
 * Mantiene el resumen materializado de comisiones por evento (event_fee_summary).
 *
 * La actualización usa un único INSERT ... ON DUPLICATE KEY UPDATE, que en
 * InnoDB es atómico: toma un row lock (o gap lock si la fila no existe) durante
 * toda la sentencia, serializando automáticamente los pagos concurrentes del
 * mismo evento. Evita la condición de carrera del patrón SELECT-then-INSERT/UPDATE.
 *
 * NOTA: las columnas de la tabla están en camelCase (uuid, eventUuid, ...),
 * siguiendo la convención del resto del esquema — el SQL raw las referencia
 * con esos nombres, no en snake_case.
 */
@Injectable()
export class FeeSummaryService {
  private readonly logger = new Logger(FeeSummaryService.name);

  constructor(@Inject(DBRepository) private readonly dbRepository: DBRepository) {}

  async registerPaidOrder(params: {
    eventId: string;
    ticketCount: number;
    ticketAmount: number;
    serviceFeeAmount: number;
    grossAmount: number;
    currency: string;
    queryRunner: QueryRunner;
  }): Promise<void> {
    const { eventId, ticketCount, ticketAmount, serviceFeeAmount, grossAmount, currency, queryRunner } = params;

    // UUID para el caso INSERT; ignorado por ON DUPLICATE KEY UPDATE si la fila existe.
    const newUuid = uuidv4();

    const sql = `
      INSERT INTO event_fee_summary
        (uuid, eventUuid, totalOrdersPaid, totalTicketsSold,
         grossAmount, ticketAmount, serviceFeeAmount, currency,
         lastOrderPaidAt, createdAt, updatedAt)
      VALUES (?, ?, 1, ?, ?, ?, ?, ?, NOW(3), NOW(3), NOW(3))
      ON DUPLICATE KEY UPDATE
        totalOrdersPaid = totalOrdersPaid + 1,
        totalTicketsSold = totalTicketsSold + VALUES(totalTicketsSold),
        grossAmount = grossAmount + VALUES(grossAmount),
        ticketAmount = ticketAmount + VALUES(ticketAmount),
        serviceFeeAmount = serviceFeeAmount + VALUES(serviceFeeAmount),
        lastOrderPaidAt = NOW(3),
        updatedAt = NOW(3)
    `;

    // Se ejecuta con el queryRunner recibido → misma transacción que confirma el pago.
    // Si el resto de la transacción falla, esta actualización también hace rollback.
    await queryRunner.query(sql, [
      newUuid,
      eventId,
      ticketCount,
      grossAmount,
      ticketAmount,
      serviceFeeAmount,
      currency
    ]);
  }

  async getSummaryByEvent(eventId: string): Promise<EventFeeSummary | null> {
    const entity = await this.dbRepository.findOne({
      entity: 'event_fee_summary',
      where: { eventUuid: eventId }
    });

    if (!entity) return null;

    return {
      uuid: entity.uuid,
      eventUuid: entity.eventUuid,
      totalOrdersPaid: Number(entity.totalOrdersPaid),
      totalTicketsSold: Number(entity.totalTicketsSold),
      grossAmount: Number(entity.grossAmount),
      ticketAmount: Number(entity.ticketAmount),
      serviceFeeAmount: Number(entity.serviceFeeAmount),
      currency: entity.currency,
      lastOrderPaidAt: entity.lastOrderPaidAt,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt
    };
  }

  async aggregateByOrganization(organizationUuid: string): Promise<{
    totalTicketsSold: number;
    ticketAmount: number;
    grossAmount: number;
    serviceFeeAmount: number;
    currency: string;
  }> {
    const rows = await this.dbRepository.query(
      `
        SELECT
          COALESCE(SUM(efs.totalTicketsSold), 0) AS totalTicketsSold,
          COALESCE(SUM(efs.ticketAmount), 0) AS ticketAmount,
          COALESCE(SUM(efs.grossAmount), 0) AS grossAmount,
          COALESCE(SUM(efs.serviceFeeAmount), 0) AS serviceFeeAmount,
          COALESCE(MAX(efs.currency), 'ARS') AS currency
        FROM event e
        INNER JOIN event_fee_summary efs ON efs.eventUuid = e.uuid
        WHERE e.organizationUuid = ? AND e.isActive = 1
      `,
      [organizationUuid]
    );

    const row = rows?.[0] ?? {};
    return {
      totalTicketsSold: Number(row.totalTicketsSold ?? 0),
      ticketAmount: Number(row.ticketAmount ?? 0),
      grossAmount: Number(row.grossAmount ?? 0),
      serviceFeeAmount: Number(row.serviceFeeAmount ?? 0),
      currency: row.currency ?? 'ARS'
    };
  }

  async aggregatePlatform(): Promise<{
    totalTicketsSold: number;
    ticketAmount: number;
    grossAmount: number;
    serviceFeeAmount: number;
    currency: string;
  }> {
    const rows = await this.dbRepository.query(
      `
        SELECT
          COALESCE(SUM(efs.totalTicketsSold), 0) AS totalTicketsSold,
          COALESCE(SUM(efs.ticketAmount), 0) AS ticketAmount,
          COALESCE(SUM(efs.grossAmount), 0) AS grossAmount,
          COALESCE(SUM(efs.serviceFeeAmount), 0) AS serviceFeeAmount,
          COALESCE(MAX(efs.currency), 'ARS') AS currency
        FROM event e
        INNER JOIN event_fee_summary efs ON efs.eventUuid = e.uuid
        WHERE e.isActive = 1
      `
    );

    const row = rows?.[0] ?? {};
    return {
      totalTicketsSold: Number(row.totalTicketsSold ?? 0),
      ticketAmount: Number(row.ticketAmount ?? 0),
      grossAmount: Number(row.grossAmount ?? 0),
      serviceFeeAmount: Number(row.serviceFeeAmount ?? 0),
      currency: row.currency ?? 'ARS'
    };
  }

  async topEventsByOrganization(
    organizationUuid: string,
    limit = 5
  ): Promise<
    Array<{
      eventUuid: string;
      name: string;
      totalTicketsSold: number;
      ticketAmount: number;
      lastOrderPaidAt: Date | null;
    }>
  > {
    const rows = await this.dbRepository.query(
      `
        SELECT
          e.uuid AS eventUuid,
          e.name AS name,
          COALESCE(efs.totalTicketsSold, 0) AS totalTicketsSold,
          COALESCE(efs.ticketAmount, 0) AS ticketAmount,
          efs.lastOrderPaidAt AS lastOrderPaidAt
        FROM event e
        LEFT JOIN event_fee_summary efs ON efs.eventUuid = e.uuid
        WHERE e.organizationUuid = ? AND e.isActive = 1
        ORDER BY COALESCE(efs.ticketAmount, 0) DESC, e.startDate DESC
        LIMIT ?
      `,
      [organizationUuid, limit]
    );

    return (rows ?? []).map((row: Record<string, unknown>) => ({
      eventUuid: String(row.eventUuid),
      name: String(row.name),
      totalTicketsSold: Number(row.totalTicketsSold ?? 0),
      ticketAmount: Number(row.ticketAmount ?? 0),
      lastOrderPaidAt: row.lastOrderPaidAt ? new Date(row.lastOrderPaidAt as string) : null
    }));
  }
}
