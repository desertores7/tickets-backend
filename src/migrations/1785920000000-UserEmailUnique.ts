import { Logger } from '@nestjs/common';
import { MigrationInterface, QueryRunner, TableIndex } from 'typeorm';

/**
 * `user.email` es la credencial de login pero su indice (`IDX_user_email`) es
 * comun, no unico: hoy nada impide dos cuentas con el mismo email.
 *
 * REQUISITO: correr antes `scripts/check-duplicate-emails.sql`. Si hay
 * duplicados la migracion aborta en el primer paso, sin tocar el esquema.
 *
 * ORDEN IMPORTANTE: `user_password_reset` tiene una FK contra `user(email)`, y
 * InnoDB exige que la columna referenciada este cubierta por algun indice. Si
 * se borra `IDX_user_email` antes de crear el unico, MySQL responde
 * ER_DROP_INDEX_FK ("Cannot drop index: needed in a foreign key constraint").
 * Por eso: primero se crea `UQ_user_email`, que pasa a cubrir la FK, y recien
 * despues se borra el indice viejo, que ya quedo redundante.
 *
 * La app ya se comporta como si el email fuera unico: `createUser` y el registro
 * rechazan un email existente sin filtrar por `isDeleted`, asi que el email de
 * una cuenta dada de baja sigue ocupado. El UNIQUE formaliza esa regla y, de
 * paso, deja la FK apoyada sobre una clave unica como corresponde.
 */
export class UserEmailUnique1785920000000 implements MigrationInterface {
  name = 'UserEmailUnique1785920000000';

  private readonly logger = new Logger(UserEmailUnique1785920000000.name);

  public async up(queryRunner: QueryRunner): Promise<void> {
    const [{ duplicados }] = (await queryRunner.query(
      `SELECT COUNT(*) AS duplicados FROM (
         SELECT email FROM \`user\` GROUP BY email HAVING COUNT(*) > 1
       ) AS d`
    )) as [{ duplicados: number }];

    if (Number(duplicados) > 0) {
      throw new Error(
        `No se puede crear el UNIQUE en user.email: hay ${duplicados} email(s) duplicado(s). ` +
          `Correr scripts/check-duplicate-emails.sql y resolverlos antes de esta migracion.`
      );
    }

    // 1) El unico primero: desde que existe, es el que cubre la FK de
    //    user_password_reset.email.
    await queryRunner.createIndex(
      'user',
      new TableIndex({ name: 'UQ_user_email', columnNames: ['email'], isUnique: true })
    );

    // 2) Recien ahora el viejo es redundante y se puede borrar. Si alguna
    //    version de MySQL igual se niega, no se aborta la migracion: el unico
    //    (que es lo que aporta la garantia) ya quedo creado, y un indice
    //    duplicado de mas solo cuesta escritura.
    try {
      await queryRunner.dropIndex('user', 'IDX_user_email');
    } catch (error) {
      this.logger.warn(
        `UQ_user_email creado, pero no se pudo borrar IDX_user_email (${(error as Error).message}). ` +
          `Queda un indice redundante sobre user.email; se puede borrar a mano mas adelante.`
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Mismo cuidado al revertir: el indice comun tiene que existir antes de
    // sacar el unico, o la FK se queda sin indice que la cubra.
    const [existe] = (await queryRunner.query(
      `SELECT COUNT(*) AS cuantos FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user'
         AND INDEX_NAME = 'IDX_user_email'`
    )) as [{ cuantos: number }];

    if (Number(existe.cuantos) === 0) {
      await queryRunner.createIndex(
        'user',
        new TableIndex({ name: 'IDX_user_email', columnNames: ['email'] })
      );
    }

    await queryRunner.dropIndex('user', 'UQ_user_email');
  }
}
