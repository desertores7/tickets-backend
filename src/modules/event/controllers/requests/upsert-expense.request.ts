import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min
} from 'class-validator';
import { EXPENSE_CATEGORIES, ExpenseCategory } from '../const/expense-category.const';

export class CreateExpenseRequest {
  @IsIn([...EXPENSE_CATEGORIES])
  @ApiProperty({ enum: EXPENSE_CATEGORIES })
  category: ExpenseCategory;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @ApiProperty({ example: 'Coca-Cola 2L' })
  concept: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @ApiProperty({ description: 'Permite comparar precios entre proveedores', example: 'Distribuidora Norte' })
  supplier: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @ApiProperty({ example: 24 })
  quantity: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @ApiProperty({ description: 'Puede ser 0 (donación, canje)', example: 1800.5 })
  unitCost: number;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha debe tener formato YYYY-MM-DD' })
  @ApiProperty({
    description: 'Fecha del gasto, sin hora. Se guarda tal cual para que no la corra la zona horaria.',
    example: '2026-09-28'
  })
  expenseDate: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @ApiPropertyOptional()
  notes?: string;
}

export class UpdateExpenseRequest {
  @IsOptional()
  @IsIn([...EXPENSE_CATEGORIES])
  @ApiPropertyOptional({ enum: EXPENSE_CATEGORIES })
  category?: ExpenseCategory;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @ApiPropertyOptional()
  concept?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @ApiPropertyOptional()
  supplier?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @ApiPropertyOptional()
  quantity?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @ApiPropertyOptional()
  unitCost?: number;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha debe tener formato YYYY-MM-DD' })
  @ApiPropertyOptional({ example: '2026-09-28' })
  expenseDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  @ApiPropertyOptional({ nullable: true })
  notes?: string | null;
}
