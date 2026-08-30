import { MigrationInterface, QueryRunner } from 'typeorm';

export class EventMapAndSectors1784500000000 implements MigrationInterface {
  name = 'EventMapAndSectors1784500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`event_map\` (
        \`uuid\` varchar(36) NOT NULL,
        \`eventUuid\` varchar(36) NOT NULL,
        \`name\` varchar(255) NOT NULL,
        \`baseImageUrl\` varchar(1000) NULL DEFAULT NULL,
        \`canvasWidth\` int NOT NULL DEFAULT 1000,
        \`canvasHeight\` int NOT NULL DEFAULT 1000,
        \`createdAt\` timestamp(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` timestamp(3) NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        \`createdBy\` varchar(36) NULL,
        PRIMARY KEY (\`uuid\`),
        UNIQUE KEY \`UQ_event_map_event\` (\`eventUuid\`),
        CONSTRAINT \`FK_event_map_event\` FOREIGN KEY (\`eventUuid\`) REFERENCES \`event\`(\`uuid\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await queryRunner.query(`
      CREATE TABLE \`event_map_sector\` (
        \`uuid\` varchar(36) NOT NULL,
        \`mapUuid\` varchar(36) NOT NULL,
        \`name\` varchar(255) NOT NULL,
        \`geometry\` json NOT NULL,
        \`sortOrder\` int NOT NULL DEFAULT 0,
        \`isNumbered\` tinyint NOT NULL DEFAULT 0,
        \`capacity\` int NULL DEFAULT NULL,
        \`createdAt\` timestamp(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` timestamp(3) NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`uuid\`),
        KEY \`IDX_event_map_sector_map\` (\`mapUuid\`),
        CONSTRAINT \`FK_event_map_sector_map\` FOREIGN KEY (\`mapUuid\`) REFERENCES \`event_map\`(\`uuid\`) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await queryRunner.query(`
      CREATE TABLE \`event_map_sector_ticket_type\` (
        \`uuid\` varchar(36) NOT NULL,
        \`sectorUuid\` varchar(36) NOT NULL,
        \`ticketTypeUuid\` varchar(36) NOT NULL,
        PRIMARY KEY (\`uuid\`),
        UNIQUE KEY \`UQ_sector_ticket_type\` (\`sectorUuid\`, \`ticketTypeUuid\`),
        KEY \`IDX_sector_tt_ticket\` (\`ticketTypeUuid\`),
        CONSTRAINT \`FK_sector_tt_sector\` FOREIGN KEY (\`sectorUuid\`) REFERENCES \`event_map_sector\`(\`uuid\`) ON DELETE CASCADE,
        CONSTRAINT \`FK_sector_tt_ticket\` FOREIGN KEY (\`ticketTypeUuid\`) REFERENCES \`ticket_type\`(\`uuid\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS \`event_map_sector_ticket_type\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`event_map_sector\``);
    await queryRunner.query(`DROP TABLE IF EXISTS \`event_map\``);
  }
}
