import { MigrationInterface, QueryRunner } from 'typeorm';

export class EventGoogleMapsAndMedia1784426400000 implements MigrationInterface {
  name = 'EventGoogleMapsAndMedia1784426400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE \`event\`
      ADD COLUMN \`googleMapsUrl\` varchar(1000) NULL DEFAULT NULL
      AFTER \`venueCountry\`
    `);

    await queryRunner.query(`
      CREATE TABLE \`event_media\` (
        \`uuid\` varchar(36) NOT NULL,
        \`eventUuid\` varchar(36) NOT NULL,
        \`sortOrder\` int NOT NULL DEFAULT 0,
        \`kind\` ENUM('image', 'video') NOT NULL DEFAULT 'image',
        \`url\` varchar(1000) NOT NULL,
        \`mimeType\` varchar(100) NOT NULL,
        \`isDeleted\` date NULL DEFAULT NULL,
        \`createdAt\` timestamp(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` timestamp(3) NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        \`createdBy\` varchar(36) NULL,
        PRIMARY KEY (\`uuid\`),
        KEY \`IDX_event_media_event\` (\`eventUuid\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS \`event_media\``);
    await queryRunner.query(`ALTER TABLE \`event\` DROP COLUMN \`googleMapsUrl\``);
  }
}
