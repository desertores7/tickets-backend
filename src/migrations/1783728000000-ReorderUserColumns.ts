import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Reordena columnas de `user` para agrupar por dominio:
 * identidad → perfil → facturación → credenciales/flags → auditoría.
 * Solo afecta el orden físico en MySQL (MODIFY … AFTER); no cambia datos ni tipos.
 */
export class ReorderUserColumns1783728000000 implements MigrationInterface {
  name = 'ReorderUserColumns1783728000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`user\`
        MODIFY COLUMN \`documentType\` ENUM('DNI','Pasaporte','Documento extranjero','Otro') NULL DEFAULT NULL AFTER \`uuid\`,
        MODIFY COLUMN \`dni\` VARCHAR(30) NULL DEFAULT NULL AFTER \`documentType\`,
        MODIFY COLUMN \`firstName\` VARCHAR(255) NOT NULL AFTER \`dni\`,
        MODIFY COLUMN \`lastName\` VARCHAR(255) NOT NULL AFTER \`firstName\`,
        MODIFY COLUMN \`email\` VARCHAR(50) NOT NULL AFTER \`lastName\`,
        MODIFY COLUMN \`phone\` VARCHAR(50) NULL DEFAULT NULL AFTER \`email\`,
        MODIFY COLUMN \`address\` VARCHAR(255) NULL DEFAULT NULL AFTER \`phone\`,
        MODIFY COLUMN \`username\` VARCHAR(100) NULL DEFAULT NULL AFTER \`address\`,
        MODIFY COLUMN \`gender\` VARCHAR(50) NULL DEFAULT NULL AFTER \`username\`,
        MODIFY COLUMN \`birthday\` DATE NULL DEFAULT NULL AFTER \`gender\`,
        MODIFY COLUMN \`billingIdType\` ENUM('DNI','CUIT/CUIL') NULL DEFAULT NULL AFTER \`birthday\`,
        MODIFY COLUMN \`billingIdNumber\` VARCHAR(30) NULL DEFAULT NULL AFTER \`billingIdType\`,
        MODIFY COLUMN \`billingLegalName\` VARCHAR(255) NULL DEFAULT NULL AFTER \`billingIdNumber\`,
        MODIFY COLUMN \`billingVatCondition\` ENUM('Consumidor final','Monotributo','Responsable inscripto','Exento') NULL DEFAULT NULL AFTER \`billingLegalName\`,
        MODIFY COLUMN \`billingFiscalAddress\` VARCHAR(255) NULL DEFAULT NULL AFTER \`billingVatCondition\`,
        MODIFY COLUMN \`billingEmail\` VARCHAR(100) NULL DEFAULT NULL AFTER \`billingFiscalAddress\`,
        MODIFY COLUMN \`password\` VARCHAR(255) NOT NULL AFTER \`billingEmail\`,
        MODIFY COLUMN \`googleId\` VARCHAR(255) NULL DEFAULT NULL AFTER \`password\`,
        MODIFY COLUMN \`active\` INT NOT NULL AFTER \`googleId\`,
        MODIFY COLUMN \`emailVerified\` TINYINT(1) NOT NULL DEFAULT 0 AFTER \`active\`,
        MODIFY COLUMN \`emailVerifiedAt\` TIMESTAMP NULL DEFAULT NULL AFTER \`emailVerified\`,
        MODIFY COLUMN \`termsAcceptedAt\` TIMESTAMP(3) NULL DEFAULT NULL AFTER \`emailVerifiedAt\`,
        MODIFY COLUMN \`twoAuthentication\` TINYINT(1) NOT NULL DEFAULT 0 AFTER \`termsAcceptedAt\`,
        MODIFY COLUMN \`isDeleted\` DATE NULL DEFAULT NULL AFTER \`twoAuthentication\`,
        MODIFY COLUMN \`createdAt\` TIMESTAMP(3) NULL DEFAULT CURRENT_TIMESTAMP(3) AFTER \`isDeleted\`,
        MODIFY COLUMN \`updatedAt\` TIMESTAMP(3) NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) AFTER \`createdAt\`,
        MODIFY COLUMN \`createdBy\` VARCHAR(255) NULL DEFAULT NULL AFTER \`updatedAt\`,
        MODIFY COLUMN \`updatedBy\` VARCHAR(255) NULL DEFAULT NULL AFTER \`createdBy\`
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Orden previo (columnas agregadas por migraciones al final)
    await queryRunner.query(`
      ALTER TABLE \`user\`
        MODIFY COLUMN \`dni\` VARCHAR(30) NULL DEFAULT NULL AFTER \`uuid\`,
        MODIFY COLUMN \`firstName\` VARCHAR(255) NOT NULL AFTER \`dni\`,
        MODIFY COLUMN \`lastName\` VARCHAR(255) NOT NULL AFTER \`firstName\`,
        MODIFY COLUMN \`email\` VARCHAR(50) NOT NULL AFTER \`lastName\`,
        MODIFY COLUMN \`phone\` VARCHAR(50) NULL DEFAULT NULL AFTER \`email\`,
        MODIFY COLUMN \`username\` VARCHAR(100) NULL DEFAULT NULL AFTER \`phone\`,
        MODIFY COLUMN \`gender\` VARCHAR(50) NULL DEFAULT NULL AFTER \`username\`,
        MODIFY COLUMN \`password\` VARCHAR(255) NOT NULL AFTER \`gender\`,
        MODIFY COLUMN \`birthday\` DATE NULL DEFAULT NULL AFTER \`password\`,
        MODIFY COLUMN \`active\` INT NOT NULL AFTER \`birthday\`,
        MODIFY COLUMN \`emailVerified\` TINYINT(1) NOT NULL DEFAULT 0 AFTER \`active\`,
        MODIFY COLUMN \`emailVerifiedAt\` TIMESTAMP NULL DEFAULT NULL AFTER \`emailVerified\`,
        MODIFY COLUMN \`isDeleted\` DATE NULL DEFAULT NULL AFTER \`emailVerifiedAt\`,
        MODIFY COLUMN \`createdAt\` TIMESTAMP(3) NULL DEFAULT CURRENT_TIMESTAMP(3) AFTER \`isDeleted\`,
        MODIFY COLUMN \`updatedAt\` TIMESTAMP(3) NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) AFTER \`createdAt\`,
        MODIFY COLUMN \`createdBy\` VARCHAR(255) NULL DEFAULT NULL AFTER \`updatedAt\`,
        MODIFY COLUMN \`updatedBy\` VARCHAR(255) NULL DEFAULT NULL AFTER \`createdBy\`,
        MODIFY COLUMN \`googleId\` VARCHAR(255) NULL DEFAULT NULL AFTER \`updatedBy\`,
        MODIFY COLUMN \`documentType\` ENUM('DNI','Pasaporte','Documento extranjero','Otro') NULL DEFAULT NULL AFTER \`googleId\`,
        MODIFY COLUMN \`termsAcceptedAt\` TIMESTAMP(3) NULL DEFAULT NULL AFTER \`documentType\`,
        MODIFY COLUMN \`twoAuthentication\` TINYINT(1) NOT NULL DEFAULT 0 AFTER \`termsAcceptedAt\`,
        MODIFY COLUMN \`address\` VARCHAR(255) NULL DEFAULT NULL AFTER \`twoAuthentication\`,
        MODIFY COLUMN \`billingIdType\` ENUM('DNI','CUIT/CUIL') NULL DEFAULT NULL AFTER \`address\`,
        MODIFY COLUMN \`billingIdNumber\` VARCHAR(30) NULL DEFAULT NULL AFTER \`billingIdType\`,
        MODIFY COLUMN \`billingLegalName\` VARCHAR(255) NULL DEFAULT NULL AFTER \`billingIdNumber\`,
        MODIFY COLUMN \`billingVatCondition\` ENUM('Consumidor final','Monotributo','Responsable inscripto','Exento') NULL DEFAULT NULL AFTER \`billingLegalName\`,
        MODIFY COLUMN \`billingFiscalAddress\` VARCHAR(255) NULL DEFAULT NULL AFTER \`billingVatCondition\`,
        MODIFY COLUMN \`billingEmail\` VARCHAR(100) NULL DEFAULT NULL AFTER \`billingFiscalAddress\`
    `);
  }
}
