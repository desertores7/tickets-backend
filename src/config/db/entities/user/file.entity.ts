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
import { OrganizationEntity } from './organization.entity';

const tableName = 'file' as const;

@Entity(tableName, { database: DB_NAME.user, synchronize: false })
export class FileEntity {
  @PrimaryGeneratedColumn('uuid')
  uuid: string;

  /** Perfil: dueño user. Fiscales: null (dueño = organizationUuid). */
  @Column({ type: 'varchar', length: 36, nullable: true, default: null })
  userUuid: string | null;

  /** Adjuntos de productora (fiscales, etc.). */
  @Column({ type: 'varchar', length: 36, nullable: true, default: null })
  organizationUuid: string | null;

  /** URL pública (perfil) o vacío/null para privados. */
  @Column({ type: 'varchar', length: 255, nullable: true, default: null })
  path: string | null;

  /** MIME type. */
  @Column({ type: 'varchar', length: 255 })
  type: string;

  @Column({ type: 'varchar', length: 36 })
  fileTypeUuid: string;

  @Column({ type: 'varchar', length: 255, nullable: true, default: null })
  originalName: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true, default: null })
  storedName: string | null;

  @Column({ type: 'int', nullable: true, default: null })
  sizeBytes: number | null;

  /** Path relativo a STORAGE_PATH (privados), ej. private/organizations/{org}/fiscal */
  @Column({ type: 'varchar', length: 500, nullable: true, default: null })
  relativePath: string | null;

  @Column({ type: 'date', nullable: true, default: null })
  isDeleted: Date | null;

  @CreateDateColumn({ type: 'timestamp', precision: 3, nullable: true, default: () => 'CURRENT_TIMESTAMP(3)' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp', precision: 3, nullable: true, default: () => 'CURRENT_TIMESTAMP(3)' })
  updatedAt: Date;

  @Column({ type: 'varchar', nullable: true, default: null })
  createdBy: string | null;

  @Column({ type: 'varchar', nullable: true, default: null })
  updatedBy: string | null;

  @ManyToOne(() => UserEntity, user => user.files, { nullable: true })
  @JoinColumn({ name: 'userUuid', referencedColumnName: 'uuid' })
  user: UserEntity | null;

  @ManyToOne(() => OrganizationEntity, { nullable: true })
  @JoinColumn({ name: 'organizationUuid', referencedColumnName: 'uuid' })
  organization: OrganizationEntity | null;

  @ManyToOne(() => FileTypeEntity, fileType => fileType.files)
  @JoinColumn({ name: 'fileTypeUuid', referencedColumnName: 'uuid' })
  fileType: FileTypeEntity;
}

export const FileEntityData = {
  name: tableName,
  entity: FileEntity
} as const;
