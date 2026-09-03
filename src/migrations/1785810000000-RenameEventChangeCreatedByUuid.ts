import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * La tabla `event_change` se creó (sync / versión previa) con `createdBy`.
 * La entidad y el resto del schema usan `*Uuid` (`createdByUuid`).
 */
export class RenameEventChangeCreatedByUuid1785810000000 implements MigrationInterface {
  name = 'RenameEventChangeCreatedByUuid1785810000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('event_change');
    if (!table) return;

    const hasUuid = table.findColumnByName('createdByUuid');
    const hasLegacy = table.findColumnByName('createdBy');

    if (hasUuid && hasLegacy) {
      await queryRunner.query(`
        UPDATE \`event_change\`
        SET \`createdByUuid\` = COALESCE(\`createdByUuid\`, \`createdBy\`)
        WHERE \`createdByUuid\` IS NULL AND \`createdBy\` IS NOT NULL
      `);
      await queryRunner.query(`ALTER TABLE \`event_change\` DROP COLUMN \`createdBy\``);
      return;
    }

    if (!hasUuid && hasLegacy) {
      await queryRunner.query(`
        ALTER TABLE \`event_change\`
        CHANGE COLUMN \`createdBy\` \`createdByUuid\` varchar(36) NULL DEFAULT NULL
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('event_change');
    if (!table?.findColumnByName('createdByUuid') || table.findColumnByName('createdBy')) return;

    await queryRunner.query(`
      ALTER TABLE \`event_change\`
      CHANGE COLUMN \`createdByUuid\` \`createdBy\` varchar(36) NULL DEFAULT NULL
    `);
  }
}
