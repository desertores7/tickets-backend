import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Suma el resultado `not_assigned`: el validador escaneó un evento que no le
 * corresponde. Se distingue de `invalid` (QR falso) y de `wrong_event` (la
 * entrada es de otro show) porque acá el problema es el permiso de quien
 * escanea, no la entrada.
 */
export class AddNotAssignedCheckInResult1783123200000 implements MigrationInterface {
  name = 'AddNotAssignedCheckInResult1783123200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`check_in_log\`
       MODIFY COLUMN \`result\` ENUM('success', 'already_used', 'invalid', 'wrong_event', 'outside_window', 'not_assigned') NOT NULL`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE \`check_in_log\` SET \`result\` = 'invalid' WHERE \`result\` = 'not_assigned'`
    );
    await queryRunner.query(
      `ALTER TABLE \`check_in_log\`
       MODIFY COLUMN \`result\` ENUM('success', 'already_used', 'invalid', 'wrong_event', 'outside_window') NOT NULL`
    );
  }
}
