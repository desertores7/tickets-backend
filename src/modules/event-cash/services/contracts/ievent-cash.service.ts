import {
  IncomeMethod,
  IncomeSource
} from '@config/db/entities/tickets/event_income.entity';
import { IncomeProductType } from '@config/db/entities/tickets/event_income_product.entity';
import { MpMovementType } from '@config/db/entities/tickets/mp_movement.entity';

export interface IIncomeProduct {
  uuid: string;
  type: IncomeProductType;
  referenceUuid: string | null;
  /** Nombre al momento del cobro, no el actual del catálogo (`BR-CASH-002`). */
  name: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface IIncome {
  uuid: string;
  eventUuid: string;
  source: IncomeSource;
  method: IncomeMethod;
  occurredAt: Date;
  notes: string | null;
  total: number;
  /** Quién lo cobró (`BR-CASH-013`). */
  createdBy: string | null;
  createdByName: string | null;
  products: IIncomeProduct[];
  createdAt: Date;
}

export interface IIncomeProductPayload {
  type: IncomeProductType;
  referenceUuid?: string | null;
  /** Solo se usa para `otros`; el resto toma el nombre del catálogo. */
  name?: string;
  quantity: number;
  unitPrice: number;
}

export interface ICreateIncomePayload {
  method: IncomeMethod;
  /** ISO-8601. Por defecto, ahora. */
  occurredAt?: string;
  notes?: string | null;
  products: IIncomeProductPayload[];
}


/**
 * Ingresos operativos de un conjunto de eventos (`BR-CASH-007`).
 *
 * Es la pieza que comparten el resumen de caja (`29` §5a) y los dashboards
 * (`29` §6 y §17): la cuenta vive en un solo lugar para que los tres números
 * no puedan discrepar.
 */
export interface ICashOperationalIncome {
  /** Σ productos tipo `entrada`, de cualquier origen. Es el KPI que se muestra. */
  doorTickets: number;
  /**
   * Las mismas entradas, pero solo las cargadas a mano. Es el que entra al
   * total: lo detallado sobre un movimiento MP ya viene contado en `mpIncome`.
   */
  doorTicketsManual: number;
  mpIncome: number;
  transfersAndOthers: number;
  manualIncome: number;
  mpRefunds: number;
  /** doorTicketsManual + manualIncome + mpIncome + transfersAndOthers − mpRefunds */
  total: number;
}

/** KPIs de la caja del evento (`29` §5a / `BR-CASH-007`). */
export interface ICashSummary {
  /** Entradas vendidas por web, SIN costo de servicio (`BR-REPORT-001`) */
  webTickets: number;
  /** Σ productos tipo `entrada` cargados en caja (`BR-CASH-006`) */
  doorTickets: number;
  /** Movimientos de las cuentas MP del evento */
  mpIncome: number;
  /** MP sin producto mapeado: transferencias y otros */
  transfersAndOthers: number;
  /** Ingresos cargados a mano */
  manualIncome: number;
  /** Devoluciones y contracargos: restan */
  mpRefunds: number;
  /** web + operativos − egresos MP */
  totalIncome: number;
  expenses: number;
  /** totalIncome − expenses */
  result: number;
  currency: string;
  /** Quién cobró cuánto (`BR-CASH-013`) */
  byUser: { userUuid: string; name: string; total: number }[];
  /** Lo más vendido en la caja */
  topProducts: { name: string; quantity: number; total: number }[];
  /** El job de sincronización de movimientos MP está activo (`BR-CASH-003`) */
  mpSyncAvailable: boolean;
}

/** Cuenta MP de la organización, con su estado respecto de este evento. */
export interface IEventMpAccount {
  orgMpAccountUuid: string;
  alias: string;
  mpUserId: string;
  /** connected · disconnected · error */
  status: string;
  assigned: boolean;
}

/** Ítem tal como vino en `additional_info.items` del pago (FP11 §5b). */
export interface IMpMovementItem {
  name: string;
  quantity: number;
  unitPrice: number;
}

/** Movimiento MP copiado a la base durante la ventana del evento (`BR-CASH-003`). */
export interface IMpMovement {
  uuid: string;
  eventUuid: string;
  orgMpAccountUuid: string;
  accountAlias: string;
  mpPaymentId: string;
  /** Bruto que entró por el pago. */
  amount: number;
  /** Parte devuelta o contracargada del mismo pago. */
  refundedAmount: number;
  type: MpMovementType;
  occurredAt: Date;
  /** Productos del posnet. Vacío en transferencias y otros. */
  items: IMpMovementItem[];
  /** Ingreso generado al completar el detalle, si ya se completó. */
  eventIncomeUuid: string | null;
  createdAt: Date;
}

export interface IUpdateMpMovementPayload {
  type?: MpMovementType;
  /** Reasignar el movimiento a otro evento de la misma productora. */
  targetEventUuid?: string;
}

export interface IEventCashService {
  listIncomes(eventUuid: string, loggedUser: string): Promise<IIncome[]>;

  /**
   * Cuentas MP de la organización, marcando cuáles están asignadas a este
   * evento (`BR-CASH-010`). Cero asignadas es válido: significa que el evento
   * solo registra ingresos manuales.
   */
  listMpAccounts(eventUuid: string, loggedUser: string): Promise<IEventMpAccount[]>;

  /** Reemplaza el conjunto de cuentas asignadas al evento. */
  setMpAccounts(
    eventUuid: string,
    orgMpAccountUuids: string[],
    loggedUser: string
  ): Promise<IEventMpAccount[]>;

  /**
   * Ingresos operativos de los eventos indicados (`null` = todos).
   *
   * **No valida permisos**: la usa el reporting, que ya resolvió el alcance.
   */
  getOperationalIncome(
    eventUuids: string[] | null,
    filters?: { dateFrom?: string; dateTo?: string }
  ): Promise<ICashOperationalIncome>;

  /** Resumen de caja. Solo el Productor (`29` §5a). */
  getSummary(eventUuid: string, loggedUser: string): Promise<ICashSummary>;

  /** Productor y Caja pueden crear (`BR-CASH-014`). */
  createIncome(
    eventUuid: string,
    payload: ICreateIncomePayload,
    loggedUser: string
  ): Promise<IIncome>;

  /** Solo el Productor edita (`BR-CASH-014`). */
  updateIncome(
    eventUuid: string,
    incomeUuid: string,
    payload: Partial<ICreateIncomePayload>,
    loggedUser: string
  ): Promise<IIncome>;


  // ── Movimientos MP (FP11 §5b) ─────────────────────────────────────────────

  /** Movimientos sincronizados de este evento. Solo el Productor. */
  listMpMovements(eventUuid: string, loggedUser: string): Promise<IMpMovement[]>;

  /**
   * Reclasifica un movimiento o lo reasigna a otro evento de la misma
   * productora. Solo el Productor.
   */
  updateMpMovement(
    eventUuid: string,
    movementUuid: string,
    payload: IUpdateMpMovementPayload,
    loggedUser: string
  ): Promise<IMpMovement>;

  /**
   * Completa el detalle de productos de un movimiento: genera un ingreso con
   * origen `mp_auto` ligado a él. Solo el Productor.
   */
  completeMovementProducts(
    eventUuid: string,
    movementUuid: string,
    products: IIncomeProductPayload[],
    loggedUser: string
  ): Promise<IIncome>;

  /** Solo el Productor borra, y es borrado físico (`BR-CASH-014`). */
  deleteIncome(eventUuid: string, incomeUuid: string, loggedUser: string): Promise<void>;
}
