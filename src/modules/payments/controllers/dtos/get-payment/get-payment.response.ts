import { ApiProperty } from '@nestjs/swagger';
import { PaymentProvider, PaymentStatus } from '@config/db/entities/tickets/payment.entity';
import { Payment } from '../../../services/core/payment';

export class GetPaymentResponse {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  uuid: string;

  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  orderUuid: string;

  @ApiProperty({ enum: PaymentProvider, example: PaymentProvider.MERCADOPAGO })
  provider: PaymentProvider;

  @ApiProperty({ example: '123456789' })
  providerPaymentId: string;

  @ApiProperty({ example: 'approved', description: 'Estado raw devuelto por el proveedor de pago.' })
  providerStatus: string;

  @ApiProperty({ enum: PaymentStatus, example: PaymentStatus.APPROVED })
  status: PaymentStatus;

  @ApiProperty({ example: 1500.0, description: 'Monto cobrado.' })
  amount: number;

  @ApiProperty({ example: 'ARS' })
  currency: string;

  @ApiProperty({ nullable: true, example: 'credit_card' })
  paymentMethod: string | null;

  @ApiProperty({ nullable: true, example: 'credit_card' })
  paymentType: string | null;

  @ApiProperty({ nullable: true, example: 3 })
  installments: number | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  constructor(data: Payment) {
    this.uuid = data.uuid;
    this.orderUuid = data.orderUuid;
    this.provider = data.provider;
    this.providerPaymentId = data.providerPaymentId;
    this.providerStatus = data.providerStatus;
    this.status = data.status;
    this.amount = Number(data.amount);
    this.currency = data.currency;
    this.paymentMethod = data.paymentMethod;
    this.paymentType = data.paymentType;
    this.installments = data.installments;
    this.createdAt = data.createdAt;
    this.updatedAt = data.updatedAt;
  }
}
