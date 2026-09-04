import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * La ventana de reembolso deja de ser 72 h y pasa a ser el inicio del evento
 * (`BR-REFUND-010`, Actualización 26).
 *
 * Las 72 h dejaban al comprador sin nada si el aviso llegaba tarde, y en una
 * cancelación no había qué "aceptar por silencio": el show no iba a ocurrir
 * igual. El inicio del evento es una fecha que el comprador ya conoce.
 *
 * `refundWindowExtendedTo` guarda **solo la extensión excepcional** que hace un
 * Administrador cuando la reprogramación o la cancelación llegan tan sobre la
 * hora que el inicio no deja plazo útil. La ventana vigente se calcula al vuelo
 * como el mayor entre `startDate` y este campo, así que reprogramar a una fecha
 * posterior corre la ventana solo, sin tener que reescribir nada.
 *
 * La decide el Admin porque es quien retiene el dinero: no puede liquidarle a
 * la productora hasta que la ventana cierre (`BR-PAY-005`).
 */
export class RefundWindowExtension1786000000000 implements MigrationInterface {
  name = 'RefundWindowExtension1786000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('event', [
      new TableColumn({
        name: 'refundWindowExtendedTo',
        type: 'timestamp',
        precision: 3,
        isNullable: true,
        default: null
      }),
      new TableColumn({
        name: 'refundWindowReason',
        type: 'varchar',
        length: '500',
        isNullable: true,
        default: null
      })
    ]);

    // `refund_window` audita la extensión en el historial del evento, con el
    // antes/después y el autor que ya guarda `event_change`.
    await queryRunner.query(
      "ALTER TABLE `event_change` MODIFY `type` ENUM(" +
        "'reschedule', 'venue', 'lineup', 'cancellation', " +
        "'sales_close', 'stock', 'info', 'refund_window'" +
        ') NOT NULL'
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Las filas del tipo nuevo pasan a `info` para que el ENUM viejo las acepte.
    await queryRunner.query("UPDATE `event_change` SET `type` = 'info' WHERE `type` = 'refund_window'");

    await queryRunner.query(
      "ALTER TABLE `event_change` MODIFY `type` ENUM(" +
        "'reschedule', 'venue', 'lineup', 'cancellation', " +
        "'sales_close', 'stock', 'info'" +
        ') NOT NULL'
    );

    await queryRunner.dropColumns('event', ['refundWindowExtendedTo', 'refundWindowReason']);
  }
}
