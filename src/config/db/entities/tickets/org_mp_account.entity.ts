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
import { OrganizationEntity } from '../user/organization.entity';

const tableName = 'org_mp_account' as const;

export const MP_ACCOUNT_STATUSES = ['connected', 'disconnected', 'error'] as const;
export type MpAccountStatus = (typeof MP_ACCOUNT_STATUSES)[number];

/**
 * Cuenta de Mercado Pago propia de una productora (`BR-CASH-001`, FP11 §2).
 *
 * Nada que ver con la cuenta de la ticketera que cobra el checkout web: estas
 * son las cuentas del posnet de la productora, y se usan solo para leer sus
 * movimientos y su catálogo.
 *
 * Desconectar no borra la fila (`status = 'disconnected'`) porque el histórico
 * ya copiado a la base tiene que seguir referenciando la cuenta de origen.
 */
@Entity(tableName, { database: DB_NAME.tickets, synchronize: false })
export class OrgMpAccountEntity {
  @PrimaryGeneratedColumn('uuid')
  uuid: string;

  @Column({ type: 'varchar', length: 36 })
  organizationUuid: string;

  /** Nombre que le pone la productora, ej. "Barra norte" */
  @Column({ type: 'varchar', length: 120 })
  alias: string;

  /** `user_id` que devuelve MP. Identifica la cuenta y es único por organización. */
  @Column({ type: 'varchar', length: 64 })
  mpUserId: string;

  @Column({ type: 'varchar', length: 255, nullable: true, default: null })
  mpEmail: string | null;

  /** Cifrados con AES-256-GCM (`TokenCipher`), nunca en texto plano. */
  @Column({ type: 'text' })
  accessTokenEncrypted: string;

  @Column({ type: 'text', nullable: true, default: null })
  refreshTokenEncrypted: string | null;

  @Column({ type: 'timestamp', precision: 3, nullable: true, default: null })
  tokenExpiresAt: Date | null;

  /**
   * `live_mode` de MP: false significa credenciales de prueba. Se guarda para
   * poder avisar en la UI cuando una cuenta conectada es de sandbox.
   */
  @Column({ type: 'boolean', default: true })
  liveMode: boolean;

  @Column({ type: 'enum', enum: MP_ACCOUNT_STATUSES, default: 'connected' })
  status: MpAccountStatus;

  @Column({ type: 'timestamp', precision: 3, nullable: true, default: null })
  lastCatalogSyncAt: Date | null;

  /** Motivo del último fallo, para mostrar por qué la cuenta quedó en `error`. */
  @Column({ type: 'varchar', length: 500, nullable: true, default: null })
  lastErrorMessage: string | null;

  @Column({ type: 'boolean', nullable: true, default: null })
  isDeleted: boolean | null;

  @CreateDateColumn({ type: 'timestamp', precision: 3 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp', precision: 3 })
  updatedAt: Date;

  @ManyToOne(() => OrganizationEntity)
  @JoinColumn({ name: 'organizationUuid', referencedColumnName: 'uuid' })
  organization: OrganizationEntity;
}

export const OrgMpAccountEntityData = {
  name: tableName,
  entity: OrgMpAccountEntity
} as const;
