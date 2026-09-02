import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested
} from 'class-validator';
import { INCOME_METHODS, IncomeMethod } from '@config/db/entities/tickets/event_income.entity';
import {
  INCOME_PRODUCT_TYPES,
  IncomeProductType
} from '@config/db/entities/tickets/event_income_product.entity';
import {
  ICashSummary,
  IEventMpAccount,
  IIncome,
  IIncomeProduct
} from '../../services/contracts/ievent-cash.service';

/** Sin constructor: `plainToInstance` instancia los request sin argumentos. */
export class IncomeProductRequest {
  @IsIn([...INCOME_PRODUCT_TYPES])
  @ApiProperty({
    enum: INCOME_PRODUCT_TYPES,
    description: '`entrada` es venta en puerta: no emite QR ni descuenta stock web (BR-CASH-006).'
  })
  type: IncomeProductType;

  @IsOptional()
  @IsUUID()
  @ApiPropertyOptional({ description: 'Catálogo MP, ítem manual o tanda. No aplica a `otros`.' })
  referenceUuid?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @ApiPropertyOptional({ description: 'Solo para `otros`; el resto toma el nombre del catálogo.' })
  name?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @ApiProperty({ example: 2 })
  quantity: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @ApiProperty({ description: 'Puede ser 0 (cortesía)', example: 4500 })
  unitPrice: number;
}

export class CreateIncomeRequest {
  @IsIn([...INCOME_METHODS])
  @ApiProperty({ enum: INCOME_METHODS })
  method: IncomeMethod;

  @IsOptional()
  @IsISO8601()
  @ApiPropertyOptional({ description: 'Por defecto, ahora' })
  occurredAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @ApiPropertyOptional()
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => IncomeProductRequest)
  @ApiProperty({ type: [IncomeProductRequest], description: 'Al menos un producto' })
  products: IncomeProductRequest[];
}

export class UpdateIncomeRequest {
  @IsOptional()
  @IsIn([...INCOME_METHODS])
  @ApiPropertyOptional({ enum: INCOME_METHODS })
  method?: IncomeMethod;

  @IsOptional()
  @IsISO8601()
  @ApiPropertyOptional()
  occurredAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @ApiPropertyOptional()
  notes?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => IncomeProductRequest)
  @ApiPropertyOptional({
    type: [IncomeProductRequest],
    description: 'Si se envía, reemplaza TODAS las líneas del ingreso.'
  })
  products?: IncomeProductRequest[];
}

export class IncomeProductResponse {
  @ApiProperty() uuid: string;
  @ApiProperty({ enum: INCOME_PRODUCT_TYPES }) type: IncomeProductType;
  @ApiProperty({ nullable: true }) referenceUuid: string | null;

  @ApiProperty({ description: 'Nombre al momento del cobro, no el actual del catálogo' })
  name: string;

  @ApiProperty() quantity: number;
  @ApiProperty() unitPrice: number;
  @ApiProperty() subtotal: number;

  constructor(data: IIncomeProduct) {
    this.uuid = data.uuid;
    this.type = data.type;
    this.referenceUuid = data.referenceUuid;
    this.name = data.name;
    this.quantity = data.quantity;
    this.unitPrice = data.unitPrice;
    this.subtotal = data.subtotal;
  }
}

export class IncomeResponse {
  @ApiProperty() uuid: string;
  @ApiProperty({ example: 'manual' }) source: string;
  @ApiProperty({ enum: INCOME_METHODS }) method: IncomeMethod;
  @ApiProperty({ description: 'ISO-8601' }) occurredAt: string;
  @ApiProperty({ nullable: true }) notes: string | null;
  @ApiProperty({ description: 'Suma de los productos' }) total: number;
  @ApiProperty({ nullable: true, description: 'Quién lo cobró (BR-CASH-013)' })
  createdByName: string | null;
  @ApiProperty({ type: [IncomeProductResponse] }) products: IncomeProductResponse[];
  @ApiProperty({ description: 'ISO-8601' }) createdAt: string;

  constructor(data: IIncome) {
    this.uuid = data.uuid;
    this.source = data.source;
    this.method = data.method;
    this.occurredAt = new Date(data.occurredAt).toISOString();
    this.notes = data.notes;
    this.total = data.total;
    this.createdByName = data.createdByName;
    this.products = data.products.map(p => new IncomeProductResponse(p));
    this.createdAt = new Date(data.createdAt).toISOString();
  }
}

export class IncomesResponse {
  @ApiProperty({ type: [IncomeResponse] }) items: IncomeResponse[];
  @ApiProperty({ description: 'Suma de los ingresos listados' }) total: number;

  constructor(items: IncomeResponse[]) {
    this.items = items;
    this.total = Math.round(items.reduce((s, i) => s + i.total, 0) * 100) / 100;
  }
}

export class CashSummaryResponse {
  @ApiProperty({ description: 'Entradas web, SIN costo de servicio' }) webTickets: number;
  @ApiProperty({ description: 'Entradas vendidas en puerta' }) doorTickets: number;
  @ApiProperty({ description: 'Cobros por posnet MP' }) mpIncome: number;
  @ApiProperty({ description: 'MP sin producto mapeado' }) transfersAndOthers: number;
  @ApiProperty({ description: 'Ingresos cargados a mano' }) manualIncome: number;
  @ApiProperty({ description: 'Devoluciones y contracargos: restan' }) mpRefunds: number;
  @ApiProperty({ description: 'web + operativos − egresos MP (BR-CASH-007)' }) totalIncome: number;
  @ApiProperty() expenses: number;
  @ApiProperty({ description: 'totalIncome − expenses' }) result: number;
  @ApiProperty({ example: 'ARS' }) currency: string;

  @ApiProperty({ description: 'Quién cobró cuánto (BR-CASH-013)' })
  byUser: { userUuid: string; name: string; total: number }[];

  @ApiProperty({ description: 'Top 10 de la caja' })
  topProducts: { name: string; quantity: number; total: number }[];

  @ApiProperty({
    description:
      'true cuando el job de sincronización de movimientos MP está activo (BR-CASH-003). Los KPIs ' +
      'de MP quedan en 0 mientras el evento no tenga cuentas asignadas o no haya movimientos.'
  })
  mpSyncAvailable: boolean;

  constructor(data: ICashSummary) {
    Object.assign(this, data);
  }
}

export class SetEventMpAccountsRequest {
  @IsArray()
  @IsUUID('4', { each: true })
  @ApiProperty({
    type: [String],
    description:
      'Conjunto final de cuentas asignadas. Array vacío es válido: el evento pasa a registrar ' +
      'solo ingresos manuales (BR-CASH-010).'
  })
  orgMpAccountUuids: string[];
}

export class EventMpAccountResponse {
  @ApiProperty() orgMpAccountUuid: string;
  @ApiProperty() alias: string;
  @ApiProperty() mpUserId: string;
  @ApiProperty({ example: 'connected' }) status: string;
  @ApiProperty({ description: 'Si está asignada a este evento' }) assigned: boolean;

  constructor(data: IEventMpAccount) {
    this.orgMpAccountUuid = data.orgMpAccountUuid;
    this.alias = data.alias;
    this.mpUserId = data.mpUserId;
    this.status = data.status;
    this.assigned = data.assigned;
  }
}

export class EventMpAccountsResponse {
  @ApiProperty({ type: [EventMpAccountResponse] }) items: EventMpAccountResponse[];
  constructor(items: EventMpAccountResponse[]) {
    this.items = items;
  }
}
