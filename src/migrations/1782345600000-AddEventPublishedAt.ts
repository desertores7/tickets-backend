import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * Agrega `publishedAt`: momento en que el evento salió a la venta.
 * Es el dato correcto para destacar "nuevos shows" — `createdAt` refleja
 * cuándo se creó el borrador, que puede ser mucho antes de publicarse.
 *
 * Backfill: los eventos ya publicados heredan su `createdAt` (mejor
 * aproximación disponible para los registros históricos).
 */
export class AddEventPublishedAt1782345600000 implements MigrationInterface {
  name = 'AddEventPublishedAt1782345600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'event',
      new TableColumn({
        name: 'publishedAt',
        type: 'timestamp',
        precision: 3,
        isNullable: true,
        default: null
      })
    );

    await queryRunner.query(
      `UPDATE \`event\`
       SET \`publishedAt\` = \`createdAt\`
       WHERE \`isPublished\` = 1 AND \`publishedAt\` IS NULL`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('event', 'publishedAt');
  }
}
