import { DB_NAME } from '@config/db/meta/db.const';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn
} from 'typeorm';
import { UserEntity } from './user.entity';
import { FileTypeEntity } from './file_type.entity';

const tableName = 'file' as const;
@Entity(tableName, { database: DB_NAME.user, synchronize: false })
export class FileEntity {
  @PrimaryGeneratedColumn('uuid')
  uuid: string;

  @Column({ type: 'char' })
  userUuid: string;

  @Column({ type: 'varchar', length: 255 })
  path: string;

  @Column({ type: 'varchar', length: 255 })
  type: string;

  @Column({ type: 'char', length: 36 })
  fileTypeUuid: string;

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

  //Relations
  @ManyToOne(() => UserEntity, user => user.files)
  @JoinColumn({ name: 'userUuid', referencedColumnName: 'uuid' })
  user: UserEntity;

  @ManyToOne(() => FileTypeEntity, fileType => fileType.files)
  @JoinColumn({ name: 'fileTypeUuid', referencedColumnName: 'uuid' })
  fileType: FileTypeEntity;
}

export const FileEntityData = {
  name: tableName,
  entity: FileEntity
} as const;
