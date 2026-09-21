import { ConflictException, Injectable } from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

export type SectorHoldRequest = {
  sectorUuid: string;
  unitLabel: string;
  seats: number;
  seatLimit: number;
};

/**
 * Lugares tomados por unidad del mapa (`BR-SALE-010`). Ver la migración
 * `1790000000000-SectorUnitPurchase`.
 *
 * Todo corre con el `QueryRunner` de la orden: si la orden no se guarda, la
 * reserva tampoco. SQL directo porque la clave es un UPDATE condicional
 * (`used + ? <= límite`) que TypeORM no expresa.
 */
@Injectable()
export class SectorOccupancyService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Toma los lugares de la orden o lanza 409 con la unidad que no alcanzó.
   *
   * Por unidad, en orden de uuid: dos órdenes que piden las mismas mesas en
   * distinto orden no se bloquean mutuamente.
   */
  async reserve(
    queryRunner: QueryRunner,
    eventUuid: string,
    orderUuid: string,
    holds: SectorHoldRequest[]
  ): Promise<void> {
    const bySector = new Map<string, SectorHoldRequest>();
    for (const hold of holds) {
      const prev = bySector.get(hold.sectorUuid);
      bySector.set(hold.sectorUuid, prev ? { ...prev, seats: prev.seats + hold.seats } : { ...hold });
    }

    for (const hold of [...bySector.values()].sort((a, b) => a.sectorUuid.localeCompare(b.sectorUuid))) {
      await queryRunner.query(
        'INSERT IGNORE INTO `sector_occupancy` (`sectorUuid`, `eventUuid`, `used`) VALUES (?, ?, 0)',
        [hold.sectorUuid, eventUuid]
      );
      const result = await queryRunner.query(
        'UPDATE `sector_occupancy` SET `used` = `used` + ? WHERE `sectorUuid` = ? AND `used` + ? <= ?',
        [hold.seats, hold.sectorUuid, hold.seats, hold.seatLimit]
      );
      if (affectedRows(result) === 0) {
        throw new ConflictException(
          hold.seatLimit === 1
            ? `${hold.unitLabel} ya no está disponible`
            : `No quedan ${hold.seats} lugares en ${hold.unitLabel}`
        );
      }
      await queryRunner.query(
        'INSERT INTO `sector_hold` (`uuid`, `sectorUuid`, `orderUuid`, `seats`) VALUES (?, ?, ?, ?)',
        [uuidv4(), hold.sectorUuid, orderUuid, hold.seats]
      );
    }
  }

  /**
   * Devuelve los lugares de una orden que no se pagó (vencida o cancelada).
   *
   * Borra las filas de la orden y descuenta exactamente lo borrado: si el job de
   * vencimiento y el barrido liberan la misma orden, el segundo no encuentra
   * nada que descontar. `FOR UPDATE` hace que el segundo espere al primero.
   */
  async release(queryRunner: QueryRunner, orderUuid: string): Promise<void> {
    const rows: { sectorUuid: string; seats: string | number }[] = await queryRunner.query(
      'SELECT `sectorUuid`, SUM(`seats`) AS `seats` FROM `sector_hold` WHERE `orderUuid` = ? GROUP BY `sectorUuid` FOR UPDATE',
      [orderUuid]
    );
    if (!rows.length) return;

    await queryRunner.query('DELETE FROM `sector_hold` WHERE `orderUuid` = ?', [orderUuid]);
    for (const row of rows) {
      await queryRunner.query(
        'UPDATE `sector_occupancy` SET `used` = GREATEST(`used` - ?, 0) WHERE `sectorUuid` = ?',
        [Number(row.seats), row.sectorUuid]
      );
    }
  }

  /** Lugares tomados por unidad, para pintar el mapa. */
  async getUsed(sectorUuids: string[]): Promise<Map<string, number>> {
    if (!sectorUuids.length) return new Map();
    const rows: { sectorUuid: string; used: number }[] = await this.dataSource
      .createQueryBuilder()
      .select(['o.sectorUuid AS sectorUuid', 'o.used AS used'])
      .from('sector_occupancy', 'o')
      .where('o.sectorUuid IN (:...sectorUuids)', { sectorUuids })
      .getRawMany();
    return new Map(rows.map(r => [r.sectorUuid, Number(r.used)]));
  }
}

/** mysql2 devuelve el resultado del UPDATE como objeto o como `[resultado, campos]`. */
function affectedRows(result: unknown): number {
  const header = Array.isArray(result) ? result[0] : result;
  return Number((header as { affectedRows?: number } | undefined)?.affectedRows ?? 0);
}
