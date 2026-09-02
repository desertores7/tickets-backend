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
import { EventEntity } from './event.entity';

const tableName = 'payout' as const;

export const PAYOUT_STATUSES = ['registered', 'invoice_pending', 'invoice_available'] as const;
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

/**
 * Liquidación a la productora (`BR-PAY-005`, `BR-REPORT-003`).
 *
 * Registro de una transferencia ya hecha: el proceso de pago es manual y esto
 * lo documenta. **Una liquidación corresponde a exactamente un evento**, y un
 * mismo evento puede tener N liquidaciones (pagos en tandas) — por eso el
 * `eventUuid` no es único.
 *
 * El Productor solo lee; el Administrador crea el registro y sube los archivos.
 */
@Entity(tableName, { database: DB_NAME.tickets, synchronize: false })
export class PayoutEntity {
  @PrimaryGeneratedColumn('uuid')
  uuid: string;

  @Column({ type: 'varchar', length: 36 })
  organizationUuid: string;

  @Column({ type: 'varchar', length: 36 })
  eventUuid: string;

  /** Monto transferido, SIN costo de servicio (`BR-REPORT-001`). */
  @Column({ type: 'decimal', precision: 14, scale: 2 })
  amount: number;

  @Column({ type: 'timestamp', precision: 3 })
  transferredAt: Date;

  @Column({ type: 'text', nullable: true, default: null })
  notes: string | null;

  /**
   * Se deriva de si hay archivos cargados, pero se persiste para poder filtrar
   * y ordenar sin recalcularlo en cada consulta.
   */
  @Column({ type: 'enum', enum: PAYOUT_STATUSES, default: 'registered' })
  status: PayoutStatus;

  /** Comprobante de la transferencia bancaria. Apunta a `file`. */
  @Column({ type: 'varchar', length: 36, nullable: true, default: null })
  transferProofFileUuid: string | null;

  /** Factura ARCA que genera el Administrador (`BR-FACT-002`). */
  @Column({ type: 'varchar', length: 36, nullable: true, default: null })
  arcaInvoiceFileUuid: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true, default: null })
  createdBy: string | null;

  @Column({ type: 'boolean', nullable: true, default: null })
  isDeleted: boolean | null;

  @CreateDateColumn({ type: 'timestamp', precision: 3 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp', precision: 3 })
  updatedAt: Date;

  @ManyToOne(() => OrganizationEntity)
  @JoinColumn({ name: 'organizationUuid', referencedColumnName: 'uuid' })
  organization: OrganizationEntity;

  @ManyToOne(() => EventEntity)
  @JoinColumn({ name: 'eventUuid', referencedColumnName: 'uuid' })
  event: EventEntity;
}

export const PayoutEntityData = {
  name: tableName,
  entity: PayoutEntity
} as const;
