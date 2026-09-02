import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ORGANIZATION_TAX_CONDITIONS,
  type OrganizationTaxCondition
} from '@modules/organization/const/organization-fiscal.const';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength
} from 'class-validator';

function parseUuidList(value: unknown): string[] | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      return value
        .split(',')
        .map(part => part.trim())
        .filter(Boolean);
    }
  }
  return undefined;
}

export class RequestFiscalChangeRequest {
  @ApiProperty({ description: 'Nombre comercial' })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name: string;

  @ApiProperty({ description: 'Razón social / responsable' })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  legalName: string;

  @ApiProperty({ description: 'CUIT/CUIL' })
  @IsString()
  @MaxLength(20)
  taxId: string;

  @ApiProperty({ enum: ORGANIZATION_TAX_CONDITIONS })
  @IsEnum(ORGANIZATION_TAX_CONDITIONS)
  taxCondition: OrganizationTaxCondition;

  @ApiProperty({ description: 'Email de contacto fiscal' })
  @IsEmail()
  @MaxLength(255)
  contactEmail: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'UUIDs de documentos a eliminar al enviar la solicitud (multipart: JSON o CSV)'
  })
  @IsOptional()
  @Transform(({ value }) => parseUuidList(value))
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID('4', { each: true })
  deleteDocumentUuids?: string[];
}
