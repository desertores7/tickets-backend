import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min
} from 'class-validator';
import {
  MANUAL_ITEM_CATEGORIES,
  ManualItemCategory
} from '@config/db/entities/tickets/org_manual_item.entity';
import { IManualItem, IMpCatalogItem } from '../../services/contracts/iorg-catalog.service';

/**
 * Sin constructor a proposito: `ValidationPipe` instancia los DTO de request
 * con `plainToInstance`, que llama `new` SIN argumentos.
 */
export class CreateManualItemRequest {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @ApiProperty({ example: 'Fernet con Coca' })
  name: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @ApiPropertyOptional({
    description: 'Precio sugerido. Se puede pisar al registrar el ingreso y cambiarlo no altera ventas ya hechas.',
    example: 4500
  })
  referencePrice?: number;

  @IsOptional()
  @IsIn([...MANUAL_ITEM_CATEGORIES])
  @ApiPropertyOptional({ enum: MANUAL_ITEM_CATEGORIES })
  category?: ManualItemCategory;

  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional({ default: true })
  active?: boolean;
}

export class UpdateManualItemRequest {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @ApiPropertyOptional()
  name?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @ApiPropertyOptional({ nullable: true })
  referencePrice?: number | null;

  @IsOptional()
  @IsIn([...MANUAL_ITEM_CATEGORIES])
  @ApiPropertyOptional({ enum: MANUAL_ITEM_CATEGORIES, nullable: true })
  category?: ManualItemCategory | null;

  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional()
  active?: boolean;
}

export class ManualItemResponse {
  @ApiProperty() uuid: string;
  @ApiProperty() name: string;
  @ApiProperty({ nullable: true }) referencePrice: number | null;
  @ApiProperty({ enum: MANUAL_ITEM_CATEGORIES, nullable: true })
  category: ManualItemCategory | null;
  @ApiProperty() active: boolean;
  @ApiProperty({ description: 'ISO-8601' }) createdAt: string;

  constructor(data: IManualItem) {
    this.uuid = data.uuid;
    this.name = data.name;
    this.referencePrice = data.referencePrice;
    this.category = data.category;
    this.active = data.active;
    this.createdAt = data.createdAt.toISOString();
  }
}

export class MpCatalogItemResponse {
  @ApiProperty() uuid: string;
  @ApiProperty({ description: 'Id del producto en Mercado Pago' }) externalId: string;
  @ApiProperty() name: string;
  @ApiProperty({ nullable: true }) price: number | null;
  @ApiProperty() mpAccountUuid: string;
  @ApiProperty() mpAccountAlias: string;
  @ApiProperty({ nullable: true, description: 'ISO-8601' }) lastSyncAt: string | null;

  constructor(data: IMpCatalogItem) {
    this.uuid = data.uuid;
    this.externalId = data.externalId;
    this.name = data.name;
    this.price = data.price;
    this.mpAccountUuid = data.mpAccountUuid;
    this.mpAccountAlias = data.mpAccountAlias;
    this.lastSyncAt = data.lastSyncAt ? data.lastSyncAt.toISOString() : null;
  }
}

export class ManualItemsResponse {
  @ApiProperty({ type: [ManualItemResponse] }) items: ManualItemResponse[];
  constructor(items: ManualItemResponse[]) {
    this.items = items;
  }
}

export class MpCatalogResponse {
  @ApiProperty({ type: [MpCatalogItemResponse] }) items: MpCatalogItemResponse[];
  constructor(items: MpCatalogItemResponse[]) {
    this.items = items;
  }
}
