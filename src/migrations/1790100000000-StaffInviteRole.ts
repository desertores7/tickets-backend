import { MigrationInterface, QueryRunner } from 'typeorm';

/** Las invitaciones de staff ahora pueden ser de Productor, Validador o Caja. */
export class StaffInviteRole1790100000000 implements MigrationInterface {
  name = 'StaffInviteRole1790100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE `organization_producer_invite` ADD `staffRole` varchar(20) NOT NULL DEFAULT 'producer'"
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `organization_producer_invite` DROP COLUMN `staffRole`');
  }
}
