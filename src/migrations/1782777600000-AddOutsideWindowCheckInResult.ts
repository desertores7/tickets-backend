import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Suma el resultado `outside_window` al log de check-in: intento de escaneo
 * fuera de la ventana habilitada (el día del evento, hasta que termina).
 * Se distingue de `invalid` para poder auditar por qué se rechazó.
 */
export class AddOutsideWindowCheckInResult1782777600000 implements MigrationInterface {
  name = 'AddOutsideWindowCheckInResult1782777600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`check_in_log\`
       MODIFY COLUMN \`result\` ENUM('success', 'already_used', 'invalid', 'wrong_event', 'outside_window') NOT NULL`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Los registros con el valor nuevo pasan a 'invalid' para poder achicar el enum
    await queryRunner.query(
      `UPDATE \`check_in_log\` SET \`result\` = 'invalid' WHERE \`result\` = 'outside_window'`
    );
    await queryRunner.query(
      `ALTER TABLE \`check_in_log\`
       MODIFY COLUMN \`result\` ENUM('success', 'already_used', 'invalid', 'wrong_event') NOT NULL`
    );
  }
}
