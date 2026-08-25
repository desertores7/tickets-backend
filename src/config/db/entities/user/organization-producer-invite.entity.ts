import { DB_NAME } from '@config/db/meta/db.const';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn
} from 'typeorm';
import { OrganizationEntity } from './organization.entity';
import { UserEntity } from './user.entity';

const tableName = 'organization_producer_invite' as const;

@Entity(tableName, { database: DB_NAME.user, synchronize: false })
export class OrganizationProducerInviteEntity {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  uuid: string;

  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ type: 'varchar', length: 36 })
  organizationUuid: string;

  @Column({ type: 'varchar', length: 36, unique: true })
  token: string;

  @Column({ type: 'varchar', length: 36 })
  invitedByUuid: string;

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @Column({ type: 'timestamp', nullable: true, default: null })
  acceptedAt: Date | null;

  @Column({ type: 'boolean', default: false })
  isUsed: boolean;

  @CreateDateColumn({ type: 'timestamp', nullable: true, default: () => 'CURRENT_TIMESTAMP(3)' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp', nullable: true, default: () => 'CURRENT_TIMESTAMP(3)' })
  updatedAt: Date;

  @ManyToOne(() => OrganizationEntity)
  @JoinColumn({ name: 'organizationUuid', referencedColumnName: 'uuid' })
  organization: OrganizationEntity;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'invitedByUuid', referencedColumnName: 'uuid' })
  invitedBy: UserEntity;
}

export const OrganizationProducerInviteEntityData = {
  name: tableName,
  entity: OrganizationProducerInviteEntity
} as const;
