import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Libera el código de los cupones ya borrados.
 *
 * El índice único es `(evento, código)` y el borrado es lógico, así que una
 * fila borrada seguía ocupando su código para siempre: el productor no podía
 * volver a crear un cupón con el mismo nombre. El servicio ahora renombra el
 * código al borrar; esta migración hace lo mismo con los que ya estaban.
 *
 * Las filas se conservan porque las órdenes pagadas las referencian.
 */
export class FreeDeletedCouponCodes1785300000000 implements MigrationInterface {
  name = 'FreeDeletedCouponCodes1785300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // El sufijo sale del propio uuid: es determinista y no puede chocar con
    // otra fila, porque el uuid es único.
    await queryRunner.query(
      "UPDATE coupon " +
        "SET code = CONCAT(LEFT(code, 26), '.del.', LEFT(REPLACE(uuid, '-', ''), 8)) " +
        "WHERE isDeleted = 1 AND code NOT LIKE '%.del.%'"
    );
  }

  public async down(): Promise<void> {
    // Sin vuelta atrás: el código original ya no se conserva en ningún lado, y
    // restaurarlo podría chocar con un cupón activo creado mientras tanto.
  }
}
