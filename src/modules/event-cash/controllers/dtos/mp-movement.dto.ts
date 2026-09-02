import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  IsUUID,
  ValidateNested
} from 'class-validator';
import {
  MP_MOVEMENT_TYPES,
  MpMovementType
} from '@config/db/entities/tickets/mp_movement.entity';
import { IMpMovement, IMpMovementItem } from '../../services/contracts/ievent-cash.service';
import { IncomeProductRequest } from './income.dto';

/** Sin constructor: `plainToInstance` instancia los request sin argumentos. */
export class UpdateMpMovementRequest {
  @IsOptional()
  @IsIn([...MP_MOVEMENT_TYPES])
  @ApiPropertyOptional({
    enum: MP_MOVEMENT_TYPES,
    description: 'Reclasificar el movimiento cuando MP no trae suficiente información.'
  })
  type?: MpMovementType;

  @IsOptional()
  @IsUUID()
  @ApiPropertyOptional({
    description:
      'Reasignar el movimiento a otro evento de la misma productora. Útil cuando dos eventos ' +
      'se solapan y el cobro cayó en el equivocado.'
  })
  targetEventUuid?: string;
}

export class CompleteMovementProductsRequest {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => IncomeProductRequest)
  @ApiProperty({
    type: [IncomeProductRequest],
    description: 'Detalle de lo vendido. No puede sumar más que el monto del movimiento.'
  })
  products: IncomeProductRequest[];
}

export class MpMovementItemResponse {
  @ApiProperty() name: string;
  @ApiProperty() quantity: number;
  @ApiProperty() unitPrice: number;

  constructor(data: IMpMovementItem) {
    this.name = data.name;
    this.quantity = data.quantity;
    this.unitPrice = data.unitPrice;
  }
}

export class MpMovementResponse {
  @ApiProperty() uuid: string;
  @ApiProperty() orgMpAccountUuid: string;
  @ApiProperty({ description: 'Alias de la cuenta MP' }) accountAlias: string;
  @ApiProperty({ description: 'Id del pago en Mercado Pago' }) mpPaymentId: string;
  @ApiProperty({ description: 'Bruto que entró por el pago' }) amount: number;

  @ApiProperty({
    description:
      'Parte devuelta o contracargada del mismo pago: resta del total (BR-CASH-007). Si es ' +
      'igual a `amount`, el pago volvió entero.'
  })
  refundedAmount: number;

  @ApiProperty({
    enum: MP_MOVEMENT_TYPES,
    description:
      'De dónde vino la plata. No cambia cuando el pago se devuelve; para eso está ' +
      '`refundedAmount`. `egreso_mp` solo aparece si el productor lo reclasificó a mano.'
  })
  type: MpMovementType;

  @ApiProperty({ description: 'ISO-8601' }) occurredAt: string;

  @ApiProperty({
    type: [MpMovementItemResponse],
    description: 'Productos del posnet. Vacío en transferencias y otros.'
  })
  items: MpMovementItemResponse[];

  @ApiProperty({
    nullable: true,
    description: 'Ingreso generado al completar el detalle. Null mientras esté pendiente.'
  })
  eventIncomeUuid: string | null;

  constructor(data: IMpMovement) {
    this.uuid = data.uuid;
    this.orgMpAccountUuid = data.orgMpAccountUuid;
    this.accountAlias = data.accountAlias;
    this.mpPaymentId = data.mpPaymentId;
    this.amount = data.amount;
    this.refundedAmount = data.refundedAmount;
    this.type = data.type;
    this.occurredAt = new Date(data.occurredAt).toISOString();
    this.items = data.items.map(i => new MpMovementItemResponse(i));
    this.eventIncomeUuid = data.eventIncomeUuid;
  }
}

export class MpMovementsResponse {
  @ApiProperty({ type: [MpMovementResponse] }) items: MpMovementResponse[];

  @ApiProperty({ description: 'Ingresos menos egresos de los movimientos listados' })
  total: number;

  @ApiProperty({ description: 'Cuántos todavía no tienen detalle de productos' })
  pending: number;

  constructor(items: MpMovementResponse[]) {
    this.items = items;
    this.total =
      Math.round(
        items.reduce(
          (s, m) => s + (m.type === 'egreso_mp' ? -m.amount : m.amount - m.refundedAmount),
          0
        ) * 100
      ) / 100;
    this.pending = items.filter(m => m.type !== 'egreso_mp' && !m.eventIncomeUuid).length;
  }
}
