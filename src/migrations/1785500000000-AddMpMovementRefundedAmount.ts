import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * Separa el monto devuelto del monto cobrado en los movimientos MP.
 *
 * `mp_movement` guarda una fila por pago (índice único por `mpPaymentId`), y
 * Mercado Pago no emite un pago aparte por la devolución: la anota sobre el
 * pago original. Con una sola columna de monto, un pago devuelto obligaba a
 * elegir entre registrar el ingreso o el egreso, y al resincronizarlo la fila
 * cambiaba de tipo: el resumen pasaba de sumar $900 a restarlos, cuando lo
 * correcto es que quede en cero.
 *
 * Con `refundedAmount` separado, `amount` es siempre lo que entró y el egreso
 * es un dato propio de la misma fila (`BR-CASH-007`).
 */
export class AddMpMovementRefundedAmount1785500000000 implements MigrationInterface {
  name = 'AddMpMovementRefundedAmount1785500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'mp_movement',
      new TableColumn({
        name: 'refundedAmount',
        type: 'decimal',
        precision: 14,
        scale: 2,
        default: 0,
        isNullable: false
      })
    );

    // Las filas ya sincronizadas como egreso llevaban el monto devuelto en
    // `amount`. Se copia al campo nuevo para que el resumen no lo pierda.
    await queryRunner.query(
      "UPDATE mp_movement SET refundedAmount = amount WHERE type = 'egreso_mp'"
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('mp_movement', 'refundedAmount');
  }
}
