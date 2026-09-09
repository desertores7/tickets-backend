import { ApiProperty } from '@nestjs/swagger';
import { PaymentStatus } from '@config/db/entities/tickets/payment.entity';
import { CardPaymentOutcome } from '../../../services/core/payment';

export class CardPaymentResponse {
  @ApiProperty({ description: '`payment_id` de Mercado Pago.' })
  paymentId: string;

  @ApiProperty({
    enum: PaymentStatus,
    description:
      '`approved` confirma la orden y dispara las entradas. `in_process` queda esperando a ' +
      'Mercado Pago. `rejected` no cancela la orden: se puede reintentar mientras dure la reserva.'
  })
  status: PaymentStatus;

  @ApiProperty({ nullable: true, description: 'Motivo fino de Mercado Pago, para soporte.' })
  statusDetail: string | null;

  @ApiProperty({ description: 'Mensaje listo para mostrarle al comprador.' })
  message: string;

  @ApiProperty({ description: 'Si puede corregir y reintentar con la misma tarjeta.' })
  retryable: boolean;

  @ApiProperty({ nullable: true }) installments: number | null;
  @ApiProperty({ nullable: true }) paymentMethod: string | null;

  constructor(data: CardPaymentOutcome) {
    this.paymentId = data.paymentId;
    this.status = data.status;
    this.statusDetail = data.statusDetail;
    this.message = data.message;
    this.retryable = data.retryable;
    this.installments = data.installments;
    this.paymentMethod = data.paymentMethod;
  }
}
