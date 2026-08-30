import { ApiProperty } from '@nestjs/swagger';
import { EXPENSE_CATEGORIES, ExpenseCategory } from '../const/expense-category.const';

export class EventExpenseResponse {
  @ApiProperty() uuid: string;
  @ApiProperty() eventUuid: string;
  @ApiProperty({ enum: EXPENSE_CATEGORIES }) category: ExpenseCategory;
  @ApiProperty() concept: string;
  @ApiProperty() supplier: string;
  @ApiProperty() quantity: number;
  @ApiProperty() unitCost: number;
  @ApiProperty({ description: 'cantidad × costo unitario' }) totalAmount: number;
  @ApiProperty({ example: '2026-09-28', description: 'Fecha sin hora' }) expenseDate: string;
  @ApiProperty({ nullable: true }) notes: string | null;
  @ApiProperty() createdAt: Date;

  constructor(data: {
    uuid: string;
    eventUuid: string;
    category: ExpenseCategory;
    concept: string;
    supplier: string;
    quantity: number | string;
    unitCost: number | string;
    totalAmount: number | string;
    expenseDate: Date | string;
    notes: string | null;
    createdAt: Date;
  }) {
    this.uuid = data.uuid;
    this.eventUuid = data.eventUuid;
    this.category = data.category;
    this.concept = data.concept;
    this.supplier = data.supplier;
    // MySQL devuelve los decimal como string; se normalizan para que el
    // frontend no tenga que hacer Number() en cada campo.
    this.quantity = Number(data.quantity);
    this.unitCost = Number(data.unitCost);
    this.totalAmount = Number(data.totalAmount);
    // Fecha sin hora: se recorta a YYYY-MM-DD sin construir un Date, que le
    // agregaría una zona horaria y correría el día.
    this.expenseDate = String(data.expenseDate).slice(0, 10);
    this.notes = data.notes;
    this.createdAt = data.createdAt;
  }
}

export class ExpenseCategoryTotalResponse {
  @ApiProperty({ enum: EXPENSE_CATEGORIES }) category: ExpenseCategory;
  @ApiProperty() total: number;

  constructor(category: ExpenseCategory, total: number) {
    this.category = category;
    this.total = total;
  }
}

export class EventExpensesResponse {
  @ApiProperty({ type: [EventExpenseResponse] }) items: EventExpenseResponse[];

  @ApiProperty({ description: 'Suma de todas las líneas vigentes' })
  total: number;

  @ApiProperty({
    type: [ExpenseCategoryTotalResponse],
    description: 'Agregado por categoría — lo que consume el dashboard, sin exponer líneas ni proveedores'
  })
  byCategory: ExpenseCategoryTotalResponse[];

  constructor(items: EventExpenseResponse[], byCategory: ExpenseCategoryTotalResponse[]) {
    this.items = items;
    this.total = Math.round(items.reduce((sum, i) => sum + i.totalAmount, 0) * 100) / 100;
    this.byCategory = byCategory;
  }
}
