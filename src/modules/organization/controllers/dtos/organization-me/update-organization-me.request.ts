import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { ORGANIZATION_TAX_CONDITIONS } from '@modules/organization/const/organization-fiscal.const';

export class UpdateOrganizationMeRequest {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  legalName?: string;

  @ApiPropertyOptional({ description: 'CUIT/CUIL (solo dígitos o con guiones)' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  taxId?: string;

  @ApiPropertyOptional({ enum: ORGANIZATION_TAX_CONDITIONS })
  @IsOptional()
  @IsIn([...ORGANIZATION_TAX_CONDITIONS])
  taxCondition?: (typeof ORGANIZATION_TAX_CONDITIONS)[number];

  @ApiPropertyOptional({ description: 'Teléfono de la productora (sección Redes; opcional)' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  contactPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  contactEmail?: string;

  @ApiPropertyOptional({ description: 'Nombre del banco' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  bankName?: string;

  @ApiPropertyOptional({ description: 'CBU (22 dígitos)' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  cbu?: string;

  @ApiPropertyOptional({ description: 'Alias CBU' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  bankAlias?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  website?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  instagram?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  tiktok?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  facebook?: string;

  @ApiPropertyOptional({ description: 'Perfil o handle en X (Twitter)' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  socialX?: string;
}
