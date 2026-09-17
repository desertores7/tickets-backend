import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Contracargos (`BR-SUPPORT-004`).
 *
 * Hasta acá las notificaciones de contracargo de Mercado Pago se descartaban en
 * el webhook: el equipo se enteraba cuando veía el descuento en la cuenta. Esta
 * tabla es la constancia de cada disputa, su plazo y en qué terminó.
 */
export class CreateChargeback1789400000000 implements MigrationInterface {
  name = 'CreateChargeback1789400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`chargeback\` (
        \`uuid\` varchar(36) NOT NULL,
        \`mpChargebackId\` varchar(64) NOT NULL,
        \`mpPaymentId\` varchar(64) NULL DEFAULT NULL,
        \`orderUuid\` varchar(36) NULL DEFAULT NULL,
        \`eventUuid\` varchar(36) NULL DEFAULT NULL,
        \`amount\` decimal(14,2) NOT NULL DEFAULT 0,
        \`currency\` varchar(3) NOT NULL DEFAULT 'ARS',
        \`status\` varchar(40) NOT NULL,
        \`documentationRequired\` tinyint(1) NOT NULL DEFAULT 0,
        \`documentationStatus\` varchar(40) NULL DEFAULT NULL,
        \`documentationDeadline\` timestamp NULL DEFAULT NULL,
        \`coverageApplied\` tinyint(1) NOT NULL DEFAULT 0,
        \`rawResponse\` json NULL DEFAULT NULL,
        \`internalNotes\` text NULL DEFAULT NULL,
        \`receivedAt\` timestamp NULL DEFAULT NULL,
        \`closedAt\` timestamp NULL DEFAULT NULL,
        \`createdAt\` timestamp(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` timestamp(3) NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`uuid\`),
        UNIQUE KEY \`UQ_chargeback_mp_id\` (\`mpChargebackId\`),
        KEY \`IDX_chargeback_status_received\` (\`status\`, \`receivedAt\`),
        KEY \`IDX_chargeback_order\` (\`orderUuid\`),
        KEY \`IDX_chargeback_event\` (\`eventUuid\`),
        CONSTRAINT \`FK_chargeback_order\` FOREIGN KEY (\`orderUuid\`) REFERENCES \`orders\` (\`uuid\`) ON DELETE SET NULL,
        CONSTRAINT \`FK_chargeback_event\` FOREIGN KEY (\`eventUuid\`) REFERENCES \`event\` (\`uuid\`) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE \`chargeback\``);
  }
}
