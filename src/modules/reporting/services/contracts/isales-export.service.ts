import { ISalesRow } from './ireporting.service';

/** Fila unificada del resumen de ingresos (ventas web + caja). */
export interface IIncomeSummaryExportRow {
  /** Venta online | Ingreso manual | Mercado Pago */
  origin: string;
  /** Número de orden o referencia corta. */
  reference: string;
  /** Comprador o quién cobró. */
  party: string;
  /** Tipo de entrada o productos. */
  detail: string;
  quantity: number;
  /** Medio legible (Efectivo, Mercado Pago, Tarjeta, …). */
  paymentMethod: string;
  amount: number;
  occurredAt: Date;
  status: string;
}

export interface IIncomeSummaryExportInput {
  eventName: string;
  kpis: {
    webSalesCount: number;
    webSalesAmount: number;
    refundsCount: number;
    refundsAmount: number;
    cashIncomeAmount: number;
    netTotal: number;
  };
  rows: IIncomeSummaryExportRow[];
}

export interface ISalesExportService {
  toExcel(rows: ISalesRow[]): Promise<Buffer>;
  toPdf(rows: ISalesRow[]): Promise<Buffer>;
  toIncomeSummaryPdf(input: IIncomeSummaryExportInput): Promise<Buffer>;
  toIncomeSummaryExcel(input: IIncomeSummaryExportInput): Promise<Buffer>;
}
