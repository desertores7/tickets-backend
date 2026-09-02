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
import { EventEntity } from './event.entity';
import { OrgMpAccountEntity } from './org_mp_account.entity';

const tableName = 'mp_movement' as const;

export const MP_MOVEMENT_TYPES = [
  'posnet_catalogo',
  'transferencia',
  'egreso_mp',
  'otro'
] as const;
export type MpMovementType = (typeof MP_MOVEMENT_TYPES)[number];

/**
 * Movimiento copiado de una cuenta MP durante la ventana del evento
 * (`BR-CASH-003`, `BR-CASH-004`).
 *
 * `mpPaymentId` es único: el job corre cada 5 minutos sobre ventanas que se
 * solapan, así que la idempotencia la garantiza el índice, no el código.
 *
 * `egreso_mp` marca el pago que volvió entero. Las devoluciones parciales
 * quedan en `refundedAmount` sin cambiar el tipo de origen.
 */
@Entity(tableName, { database: DB_NAME.tickets, synchronize: false })
export class MpMovementEntity {
  @PrimaryGeneratedColumn('uuid')
  uuid: string;

  @Column({ type: 'varchar', length: 36 })
  eventUuid: string;

  @Column({ type: 'varchar', length: 36 })
  orgMpAccountUuid: string;

  /** Id del pago en Mercado Pago. Clave de idempotencia. */
  @Column({ type: 'varchar', length: 64 })
  mpPaymentId: string;

  /** Lo que entró por este pago, siempre bruto. */
  @Column({ type: 'decimal', precision: 14, scale: 2 })
  amount: number;

  /**
   * Parte devuelta o contracargada de ese mismo pago (`BR-CASH-007`).
   *
   * Va aparte porque MP no emite un pago nuevo por la devolución: la anota
   * sobre el original, y esta tabla tiene una sola fila por pago.
   */
  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  refundedAmount: number;

  @Column({ type: 'enum', enum: MP_MOVEMENT_TYPES, default: 'otro' })
  type: MpMovementType;

  @Column({ type: 'timestamp', precision: 3 })
  occurredAt: Date;

  /**
   * `additional_info.items` tal como vino de MP. Se guarda crudo para poder
   * reconstruir el detalle si después cambia cómo lo interpretamos.
   */
  @Column({ type: 'json', nullable: true, default: null })
  rawItems: unknown;

  /** Ingreso generado a partir de este movimiento, si ya se completó. */
  @Column({ type: 'varchar', length: 36, nullable: true, default: null })
  eventIncomeUuid: string | null;

  @Column({ type: 'boolean', nullable: true, default: null })
  isDeleted: boolean | null;

  @CreateDateColumn({ type: 'timestamp', precision: 3 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp', precision: 3 })
  updatedAt: Date;

  @ManyToOne(() => EventEntity)
  @JoinColumn({ name: 'eventUuid', referencedColumnName: 'uuid' })
  event: EventEntity;

  @ManyToOne(() => OrgMpAccountEntity)
  @JoinColumn({ name: 'orgMpAccountUuid', referencedColumnName: 'uuid' })
  mpAccount: OrgMpAccountEntity;
}

export const MpMovementEntityData = {
  name: tableName,
  entity: MpMovementEntity
} as const;
