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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  contactPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  contactEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  verificationReference?: string;

  @ApiPropertyOptional({ description: 'CBU o alias a nombre del mismo CUIT' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  bankAccount?: string;
}
