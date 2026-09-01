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
import { UserEntity } from '../user/user.entity';

const tableName = 'event_income' as const;

export const INCOME_SOURCES = ['manual', 'mp_auto'] as const;
export type IncomeSource = (typeof INCOME_SOURCES)[number];

export const INCOME_METHODS = ['cash', 'mercadopago', 'other'] as const;
export type IncomeMethod = (typeof INCOME_METHODS)[number];

/**
 * Cobro registrado en la caja de un evento (`BR-CASH-009`, FP11 §5c).
 *
 * No existe entidad de "caja" ni "barra" (`BR-CASH-013`): las ventas físicas
 * generan ingresos directos, y quién cobró queda en `createdBy`.
 *
 * `source` distingue lo cargado a mano de lo que llegó por sincronización de
 * movimientos MP, que es lo que evita el doble conteo (FP11 §7).
 */
@Entity(tableName, { database: DB_NAME.tickets, synchronize: false })
export class EventIncomeEntity {
  @PrimaryGeneratedColumn('uuid')
  uuid: string;

  @Column({ type: 'varchar', length: 36 })
  eventUuid: string;

  @Column({ type: 'enum', enum: INCOME_SOURCES, default: 'manual' })
  source: IncomeSource;

  @Column({ type: 'enum', enum: INCOME_METHODS })
  method: IncomeMethod;

  @Column({ type: 'timestamp', precision: 3 })
  occurredAt: Date;

  @Column({ type: 'text', nullable: true, default: null })
  notes: string | null;

  /** Suma de los productos. Se persiste para no recalcularla en cada consulta. */
  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  total: number;

  /** Movimiento MP que lo originó, si vino del sync. */
  @Column({ type: 'varchar', length: 36, nullable: true, default: null })
  mpMovementUuid: string | null;

  /** Quién lo cobró: Productor o Caja (`BR-CASH-013`). */
  @Column({ type: 'varchar', length: 36, nullable: true, default: null })
  createdBy: string | null;

  @Column({ type: 'boolean', nullable: true, default: null })
  isDeleted: boolean | null;

  @CreateDateColumn({ type: 'timestamp', precision: 3 })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp', precision: 3 })
  updatedAt: Date;

  @ManyToOne(() => EventEntity)
  @JoinColumn({ name: 'eventUuid', referencedColumnName: 'uuid' })
  event: EventEntity;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'createdBy', referencedColumnName: 'uuid' })
  creator: UserEntity;
}

export const EventIncomeEntityData = {
  name: tableName,
  entity: EventIncomeEntity
} as const;
