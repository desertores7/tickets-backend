import { DB_NAME } from '@config/db/meta/db.const';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn
} from 'typeorm';
import { EventIncomeEntity } from './event_income.entity';

const tableName = 'event_income_product' as const;

export const INCOME_PRODUCT_TYPES = ['mp_catalog', 'manual', 'entrada', 'otros'] as const;
export type IncomeProductType = (typeof INCOME_PRODUCT_TYPES)[number];

/**
 * Línea de producto de un ingreso (FP11 §5c).
 *
 * `name` y `unitPrice` son una **foto** al momento del cobro: cambiar después el
 * precio en el catálogo no debe alterar ventas ya registradas (`BR-CASH-002`).
 * Por eso no se leen del catálogo al mostrar el ingreso.
 *
 * `entrada` es la entrada vendida en puerta (`BR-CASH-006`): no emite QR ni
 * descuenta stock web, es un registro operativo.
 */
@Entity(tableName, { database: DB_NAME.tickets, synchronize: false })
export class EventIncomeProductEntity {
  @PrimaryGeneratedColumn('uuid')
  uuid: string;

  @Column({ type: 'varchar', length: 36 })
  eventIncomeUuid: string;

  @Column({ type: 'enum', enum: INCOME_PRODUCT_TYPES })
  type: IncomeProductType;

  /** Catálogo MP, ítem manual o tanda, según `type`. Null si es "otros". */
  @Column({ type: 'varchar', length: 36, nullable: true, default: null })
  referenceUuid: string | null;

  /** Nombre al momento del cobro, no el actual del catálogo. */
  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  quantity: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  unitPrice: number;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  subtotal: number;

  @CreateDateColumn({ type: 'timestamp', precision: 3 })
  createdAt: Date;

  @ManyToOne(() => EventIncomeEntity)
  @JoinColumn({ name: 'eventIncomeUuid', referencedColumnName: 'uuid' })
  income: EventIncomeEntity;
}

export const EventIncomeProductEntityData = {
  name: tableName,
  entity: EventIncomeProductEntity
} as const;
