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
import { EventEntity } from './event.entity';
import {
  EXPENSE_CATEGORIES,
  ExpenseCategory
} from '@modules/event/controllers/const/expense-category.const';

const tableName = 'event_expense' as const;

/**
 * Línea de costo de un evento (FP08 / BR-BACKOFFICE-006).
 *
 * Varias líneas pueden compartir categoría a propósito: la idea es poder
 * comparar precios entre proveedores dentro del mismo rubro.
 */
@Entity(tableName, { database: DB_NAME.tickets, synchronize: false })
export class EventExpenseEntity {
  @PrimaryGeneratedColumn('uuid')
  uuid: string;

  @Column({ type: 'char', length: 36 })
  eventUuid: string;

  @Column({ type: 'enum', enum: EXPENSE_CATEGORIES })
  category: ExpenseCategory;

  @Column({ type: 'varchar', length: 255 })
  concept: string;

  @Column({ type: 'varchar', length: 255 })
  supplier: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  quantity: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  unitCost: number;

  /**
   * Persistido y no calculado al vuelo: los reportes y el dashboard suman este
   * campo, y recalcular cantidad × unitario en cada consulta invita a que la
   * suma difiera del detalle por redondeo.
   */
  @Column({ type: 'decimal', precision: 14, scale: 2 })
  totalAmount: number;

  /** Fecha del gasto, sin hora: no lleva zona horaria */
  @Column({ type: 'date' })
  expenseDate: Date;

  @Column({ type: 'text', nullable: true, default: null })
  notes: string | null;

  @Column({ type: 'char', length: 36, nullable: true, default: null })
  createdBy: string | null;

  @Column({ type: 'date', nullable: true, default: null })
  isDeleted: Date | null;

  @CreateDateColumn({ type: 'timestamp', nullable: true, default: () => 'CURRENT_TIMESTAMP(3)' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp', nullable: true, default: () => 'CURRENT_TIMESTAMP(3)' })
  updatedAt: Date;

  // Relations
  @ManyToOne(() => EventEntity)
  @JoinColumn({ name: 'eventUuid', referencedColumnName: 'uuid' })
  event: EventEntity;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'createdBy', referencedColumnName: 'uuid' })
  creator: UserEntity;
}

export const EventExpenseEntityData = {
  name: tableName,
  entity: EventExpenseEntity
} as const;
