import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Backfill de `createdBy` en ingresos demo que quedaron sin usuario
 * (seed original insertaba NULL). Asigna el primer miembro de la org del evento.
 */
const EVENT_UUID = 'd8c9efdd-3124-4282-baf9-62fe3d7c150b';

export class BackfillDemoIncomeCreatedBy1785890000000 implements MigrationInterface {
  name = 'BackfillDemoIncomeCreatedBy1785890000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      UPDATE \`event_income\` i
      INNER JOIN \`event\` e ON e.\`uuid\` = i.\`eventUuid\`
      INNER JOIN (
        SELECT uo.\`organizationUuid\`, MIN(uo.\`userUuid\`) AS \`userUuid\`
        FROM \`user_organization\` uo
        WHERE uo.\`isDeleted\` IS NULL
        GROUP BY uo.\`organizationUuid\`
      ) owner ON owner.\`organizationUuid\` = e.\`organizationUuid\`
      SET i.\`createdBy\` = owner.\`userUuid\`
      WHERE i.\`eventUuid\` = ?
        AND i.\`createdBy\` IS NULL
        AND i.\`uuid\` LIKE 'f8c9efdd-3124-4282-baf9-62fe3d7c15%'
      `,
      [EVENT_UUID]
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `
      UPDATE \`event_income\`
      SET \`createdBy\` = NULL
      WHERE \`eventUuid\` = ?
        AND \`uuid\` LIKE 'f8c9efdd-3124-4282-baf9-62fe3d7c15%'
      `,
      [EVENT_UUID]
    );
  }
}
