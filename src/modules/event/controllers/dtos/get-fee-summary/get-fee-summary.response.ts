import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EventFeeSummary } from '@modules/orders/services/core/fee-summary';

export class GetFeeSummaryResponse {
  @ApiProperty({ example: 42, description: 'Cantidad de órdenes pagadas del evento.' })
  totalOrdersPaid: number;

  @ApiProperty({ example: 128, description: 'Cantidad total de entradas vendidas.' })
  totalTicketsSold: number;

  @ApiPropertyOptional({
    example: 256000.0,
    description: 'Monto bruto (entradas + costo de servicio). SOLO para Administrador — BR-REPORT-001.'
  })
  grossAmount?: number;

  @ApiProperty({ example: 230000.0, description: 'Recaudación de la productora: solo precio de entradas.' })
  ticketAmount: number;

  @ApiPropertyOptional({
    example: 26000.0,
    description: 'Costo de servicio cobrado. SOLO para Administrador — BR-REPORT-001.'
  })
  serviceFeeAmount?: number;

  @ApiProperty({ example: 'ARS' })
  currency: string;

  @ApiProperty({
    nullable: true,
    description: 'Fecha del último pago confirmado. Null si el evento no tiene ventas pagadas.'
  })
  lastOrderPaidAt: Date | null;

  /**
   * BR-REPORT-001: ninguna vista de la productora muestra el costo de servicio.
   * Se omite del payload en vez de ocultarlo en el frontend — si solo se
   * escondiera en la UI, el dato seguiría viajando y bastaría abrir la
   * pestaña de red para verlo.
   *
   * `grossAmount` también se omite: incluye el fee, así que restarlo contra
   * `ticketAmount` lo revelaría igual.
   */
  constructor(data: EventFeeSummary | null, options: { includeServiceFee: boolean; currency?: string }) {
    const currency = options.currency ?? 'ARS';
    this.totalOrdersPaid = data ? data.totalOrdersPaid : 0;
    this.totalTicketsSold = data ? data.totalTicketsSold : 0;
    this.ticketAmount = data ? data.ticketAmount : 0;
    this.currency = data ? data.currency : currency;
    this.lastOrderPaidAt = data ? data.lastOrderPaidAt : null;

    if (options.includeServiceFee) {
      this.grossAmount = data ? data.grossAmount : 0;
      this.serviceFeeAmount = data ? data.serviceFeeAmount : 0;
    }
  }
}
