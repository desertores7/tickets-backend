import { DB_NAME } from '@config/db/meta/db.const';
import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { FileEntity } from './file.entity';

const tableName = 'file_type' as const;
@Entity(tableName, { database: DB_NAME.user, synchronize: false })
export class FileTypeEntity {
  @PrimaryGeneratedColumn('uuid')
  uuid: string;

  @Column({ type: 'varchar', length: 50 })
  name: string;

  @Column({ type: 'date', nullable: true, default: null })
  isDeleted: Date | null;

  @CreateDateColumn({ type: 'timestamp', nullable: true, default: () => 'CURRENT_TIMESTAMP(3)' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp', nullable: true, default: () => 'CURRENT_TIMESTAMP(3)' })
  updatedAt: Date;

  @Column({ type: 'varchar', nullable: true, default: null })
  createdBy: string | null;

  @Column({ type: 'varchar', nullable: true, default: null })
  updatedBy: string | null;

  @OneToMany(() => FileEntity, file => file.fileType)
  files: FileEntity[];
}

export const FileTypeEntityData = {
  name: tableName,
  entity: FileTypeEntity
} as const;