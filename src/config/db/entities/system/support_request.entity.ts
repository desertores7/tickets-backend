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
import { UserEntity } from '../user/user.entity';

const tableName = 'support_request' as const;

export const SUPPORT_REQUEST_TYPES = [
  'problema_compra',
  'no_recibi_entrada',
  'consulta_evento',
  'otro'
] as const;
export type SupportRequestType = (typeof SUPPORT_REQUEST_TYPES)[number];

/**
 * Estados de una consulta. Tres y no más: la bandeja es manual
 * (`BR-SUPPORT-003`) y cualquier estado extra sería contabilidad sin uso.
 */
export const SUPPORT_REQUEST_STATUSES = [
  /** Entró y nadie la miró. */
  'new',
  /** Alguien la está atendiendo. */
  'in_progress',
  /** Cerrada. */
  'resolved'
] as const;
export type SupportRequestStatus = (typeof SUPPORT_REQUEST_STATUSES)[number];

/**
 * Consulta recibida por el formulario de contacto (`33` §16).
 *
 * El canal de trabajo sigue siendo el email (`BR-SUPPORT-002`); esto es la
 * constancia de que la consulta entró, para que no dependa de que el email no
 * se pierda.
 */
@Entity(tableName, { database: DB_NAME.tickets, synchronize: false })
export class SupportRequestEntity {
  @PrimaryGeneratedColumn('uuid')
  uuid: string;

  @Column({ type: 'enum', enum: SUPPORT_REQUEST_TYPES })
  type: SupportRequestType;

  @Column({ type: 'varchar', length: 2000 })
  message: string;

  /** A dónde hay que responder. No tiene por qué ser el email de la cuenta. */
  @Column({ type: 'varchar', length: 255 })
  email: string;

  /** Null cuando escribió sin sesión: el formulario es público. */
  @Column({ type: 'varchar', length: 36, nullable: true, default: null })
  userUuid: string | null;

  @Column({ type: 'enum', enum: SUPPORT_REQUEST_STATUSES, default: 'new' })
  status: SupportRequestStatus;

  /** Notas del equipo. Nunca se le muestran a quien escribió. */
  @Column({ type: 'varchar', length: 2000, nullable: true, default: null })
  internalNotes: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true, default: null })
  resolvedBy: string | null;

  @Column({ type: 'timestamp', precision: 3, nullable: true, default: null })
  resolvedAt: Date | null;

  @CreateDateColumn({ type: 'timestamp', precision: 3 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp', precision: 3 })
  updatedAt: Date;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'userUuid', referencedColumnName: 'uuid' })
  user: UserEntity | null;
}

export const SupportRequestEntityData = {
  name: tableName,
  entity: SupportRequestEntity
} as const;
