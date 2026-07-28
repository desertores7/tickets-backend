import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * Agrega `bannerImages` (json) al evento para almacenar una URL por plataforma:
 * { desktop, mobile, thumbnail }. `bannerUrl` se conserva y queda sincronizado
 * con la variante desktop para no romper consumidores existentes.
 */
export class AddEventBannerImages1782259200000 implements MigrationInterface {
  name = 'AddEventBannerImages1782259200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'event',
      new TableColumn({
        name: 'bannerImages',
        type: 'json',
        isNullable: true,
        default: null
      })
    );

    // Backfill: los eventos que ya tenían banner pasan a tenerlo como variante desktop
    await queryRunner.query(
      `UPDATE \`event\`
       SET \`bannerImages\` = JSON_OBJECT('desktop', \`bannerUrl\`)
       WHERE \`bannerUrl\` IS NOT NULL AND \`bannerImages\` IS NULL`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('event', 'bannerImages');
  }
}
