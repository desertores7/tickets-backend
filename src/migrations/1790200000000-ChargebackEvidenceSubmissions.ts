import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Registro de evidencia enviada a Mercado Pago por un contracargo
 * (`BR-SUPPORT-004`, segunda mitad del circuito: responder, no solo enterarse).
 *
 * Guarda un historial (no solo el último envío) porque MP permite reenviar
 * documentación si la primera tanda no alcanza, y conviene ver quién mandó
 * qué y cuándo sin depender de que MP siga sirviendo esos archivos.
 */
export class ChargebackEvidenceSubmissions1790200000000 implements MigrationInterface {
  name = 'ChargebackEvidenceSubmissions1790200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`chargeback\`
      ADD COLUMN \`evidenceSubmissions\` json NULL DEFAULT NULL AFTER \`internalNotes\`
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`chargeback\`
      DROP COLUMN \`evidenceSubmissions\`
    `);
  }
}
