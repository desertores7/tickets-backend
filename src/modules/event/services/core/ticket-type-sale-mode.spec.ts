import { resolveTicketTypeSaleMode, saleModeChanged } from './ticket-type-sale-mode';

describe('resolveTicketTypeSaleMode', () => {
  it('sin nada es general, como se vendía antes', () => {
    expect(resolveTicketTypeSaleMode(null, {})).toEqual({
      value: { saleMode: 'general', admissionsPerUnit: null }
    });
  });

  it('unidad completa exige cuántas entradas da', () => {
    expect(resolveTicketTypeSaleMode(null, { saleMode: 'whole_unit' })).toEqual({
      error: expect.stringContaining('cuántas entradas')
    });
    expect(resolveTicketTypeSaleMode(null, { saleMode: 'whole_unit', admissionsPerUnit: 10 })).toEqual({
      value: { saleMode: 'whole_unit', admissionsPerUnit: 10 }
    });
  });

  it('rechaza entradas por unidad fuera de rango', () => {
    for (const bad of [0, -1, 1.5, 101]) {
      expect(resolveTicketTypeSaleMode(null, { saleMode: 'whole_unit', admissionsPerUnit: bad })).toHaveProperty(
        'error'
      );
    }
  });

  it('fuera de unidad completa descarta admissionsPerUnit', () => {
    expect(resolveTicketTypeSaleMode(null, { saleMode: 'per_person', admissionsPerUnit: 8 })).toEqual({
      value: { saleMode: 'per_person', admissionsPerUnit: null }
    });
  });

  it('en una edición combina lo guardado con lo que cambia', () => {
    const current = { saleMode: 'whole_unit' as const, admissionsPerUnit: 10 };
    expect(resolveTicketTypeSaleMode(current, { admissionsPerUnit: 12 })).toEqual({
      value: { saleMode: 'whole_unit', admissionsPerUnit: 12 }
    });
    expect(resolveTicketTypeSaleMode(current, {})).toEqual({ value: current });
    expect(resolveTicketTypeSaleMode(current, { saleMode: 'general' })).toEqual({
      value: { saleMode: 'general', admissionsPerUnit: null }
    });
  });
});

describe('saleModeChanged', () => {
  it('detecta cambio de modo o de entradas por unidad', () => {
    const a = { saleMode: 'whole_unit' as const, admissionsPerUnit: 10 };
    expect(saleModeChanged(a, { ...a })).toBe(false);
    expect(saleModeChanged(a, { ...a, admissionsPerUnit: 8 })).toBe(true);
    expect(saleModeChanged(a, { saleMode: 'per_person', admissionsPerUnit: null })).toBe(true);
  });
});
