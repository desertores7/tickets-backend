import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * Suspensión de productoras (`BR-PROD-006`).
 *
 * La bandera es la columna `active`, que ya existía sin usarse. Lo que faltaba
 * era el **contexto**: por qué, cuándo y quién. Sin eso una productora
 * suspendida es indistinguible de una fila con un `active` en 0 por error.
 *
 * **No se suma un estado `suspended` al catálogo de validación.** Ese catálogo
 * responde "¿está aprobada?" y la suspensión es otra pregunta: se suspende una
 * productora que ya fue aprobada, y al reactivarla tiene que seguir aprobada.
 * Metiéndolas en la misma columna, reactivar obligaría a adivinar a qué estado
 * volver.
 */
export class OrganizationSuspension1786500000000 implements MigrationInterface {
  name = 'OrganizationSuspension1786500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('organization', [
      new TableColumn({
        name: 'suspendedAt',
        type: 'timestamp',
        precision: 3,
        isNullable: true,
        default: null
      }),
      new TableColumn({
        name: 'suspensionReason',
        type: 'varchar',
        length: '500',
        isNullable: true,
        default: null
      }),
      new TableColumn({
        // Quién la suspendió. Sin FK: `user` vive en otro esquema lógico y el
        // resto de las columnas de auditoría del proyecto tampoco la declaran.
        name: 'suspendedByUuid',
        type: 'varchar',
        length: '36',
        isNullable: true,
        default: null
      })
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumns('organization', [
      'suspendedAt',
      'suspensionReason',
      'suspendedByUuid'
    ]);
  }
}
