import { ApiProperty } from '@nestjs/swagger';
import { EventFeeSummary } from '@modules/orders/services/core/fee-summary';

export class GetFeeSummaryResponse {
  @ApiProperty({ example: 42, description: 'Cantidad de órdenes pagadas del evento.' })
  totalOrdersPaid: number;

  @ApiProperty({ example: 128, description: 'Cantidad total de entradas vendidas.' })
  totalTicketsSold: number;

  @ApiProperty({ example: 256000.0, description: 'Monto bruto total cobrado (entradas + service fee).' })
  grossAmount: number;

  @ApiProperty({ example: 230000.0, description: 'Suma de subtotales (solo precio de entradas, sin fee).' })
  ticketAmount: number;

  @ApiProperty({ example: 26000.0, description: 'Suma de todos los service fees cobrados.' })
  serviceFeeAmount: number;

  @ApiProperty({ example: 'ARS' })
  currency: string;

  @ApiProperty({ nullable: true, description: 'Fecha del último pago confirmado. Null si el evento no tiene ventas pagadas.' })
  lastOrderPaidAt: Date | null;

  constructor(data: EventFeeSummary | null, currency = 'ARS') {
    this.totalOrdersPaid = data ? data.totalOrdersPaid : 0;
    this.totalTicketsSold = data ? data.totalTicketsSold : 0;
    this.grossAmount = data ? data.grossAmount : 0;
    this.ticketAmount = data ? data.ticketAmount : 0;
    this.serviceFeeAmount = data ? data.serviceFeeAmount : 0;
    this.currency = data ? data.currency : currency;
    this.lastOrderPaidAt = data ? data.lastOrderPaidAt : null;
  }
}
