import { MigrationInterface, QueryRunner } from 'typeorm';

/** Invitaciones de Validador o Caja hechas desde un evento: al aceptar quedan asignados ahí. */
export class StaffInviteEvent1790600000000 implements MigrationInterface {
  name = 'StaffInviteEvent1790600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `organization_producer_invite` ADD `eventUuid` varchar(36) NULL DEFAULT NULL'
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE `organization_producer_invite` DROP COLUMN `eventUuid`');
  }
}
