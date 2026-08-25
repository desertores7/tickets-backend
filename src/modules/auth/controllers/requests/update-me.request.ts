import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf
} from 'class-validator';
import {
  BILLING_ID_TYPES,
  BILLING_VAT_CONDITIONS,
  GENDERS
} from '@modules/auth/const/billing.const';

export class UpdateMeRequest {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @ApiProperty({ name: 'firstName', required: false })
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @ApiProperty({ name: 'lastName', required: false })
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @ApiProperty({ name: 'username', required: false })
  username?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  @ApiProperty({ name: 'phone', required: false })
  phone?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsIn([...GENDERS])
  @ApiProperty({ name: 'gender', required: false, enum: GENDERS, nullable: true })
  gender?: string | null;

  @IsOptional()
  @IsString()
  @ApiProperty({ name: 'birthday', required: false, description: 'Date in ISO format (YYYY-MM-DD)' })
  birthday?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @ApiProperty({ name: 'address', required: false, nullable: true })
  address?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsIn([...BILLING_ID_TYPES])
  @ApiProperty({ name: 'billingIdType', required: false, enum: BILLING_ID_TYPES, nullable: true })
  billingIdType?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  @ApiProperty({ name: 'billingIdNumber', required: false, nullable: true })
  billingIdNumber?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @ApiProperty({ name: 'billingLegalName', required: false, nullable: true })
  billingLegalName?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsIn([...BILLING_VAT_CONDITIONS])
  @ApiProperty({
    name: 'billingVatCondition',
    required: false,
    enum: BILLING_VAT_CONDITIONS,
    nullable: true
  })
  billingVatCondition?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  @ApiProperty({ name: 'billingFiscalAddress', required: false, nullable: true })
  billingFiscalAddress?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== '')
  @IsEmail()
  @MaxLength(100)
  @ApiProperty({ name: 'billingEmail', required: false, nullable: true })
  billingEmail?: string | null;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === true || value === 'true' || value === '1' || value === 1) return true;
    if (value === false || value === 'false' || value === '0' || value === 0) return false;
    return value;
  })
  @IsBoolean()
  @ApiProperty({
    name: 'twoAuthentication',
    required: false,
    description: 'Toggle 2FA flag (login challenge still pending)'
  })
  twoAuthentication?: boolean;

  @IsOptional()
  @ApiProperty({
    name: 'imgProfile',
    type: 'string',
    format: 'binary',
    required: false,
    description: 'Profile image (image/* only, stored as webp)'
  })
  imgProfile?: Express.Multer.File;
}
