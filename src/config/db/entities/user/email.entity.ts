import { DB_NAME } from '@config/db/meta/db.const';
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

const tableName = 'email' as const;

@Entity(tableName, { database: DB_NAME.user, synchronize: false })
export class EmailEntity {
  @PrimaryGeneratedColumn('uuid')
  uuid: string;

  @Column({ type: 'varchar', length: 45 })
  name: string;

  @Column({ type: 'varchar', length: 45 })
  host: string;

  @Column({ type: 'varchar', length: 45 })
  port: string;

  @Column({ type: 'varchar', length: 45 })
  user: string;

  @Column({ type: 'varchar', length: 45 })
  password: string;

  @Column({ type: 'date', nullable: true, default: null })
  isDeleted: Date | null;

  @CreateDateColumn({ type: 'date', nullable: true, default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'date', nullable: true, default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;

  @Column({ type: 'varchar', length: 45, nullable: true, default: null })
  createdBy: string | null;

  @Column({ type: 'varchar', length: 45, nullable: true, default: null })
  updatedBy: string | null;
}

export const EmailEntityData = {
  name: tableName,
  entity: EmailEntity
} as const;
