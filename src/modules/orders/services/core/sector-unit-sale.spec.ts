import { formatUnitLabel, resolveUnitSaleLine, ticketDisplayName } from './sector-unit-sale';

const mesa = {
  uuid: 's-8',
  name: '8',
  level: null,
  familyLabel: 'Mesa VIP',
  capacity: 10,
  ticketTypeUuids: ['tt-mesa']
};

describe('formatUnitLabel', () => {
  it('arma categoría, piso y número', () => {
    expect(formatUnitLabel(mesa)).toBe('Mesa VIP · 8');
    expect(formatUnitLabel({ ...mesa, level: 'Planta alta' })).toBe('Mesa VIP · Planta alta · 8');
    expect(formatUnitLabel({ name: '12', familyLabel: null })).toBe('12');
  });
});

describe('resolveUnitSaleLine', () => {
  it('general: sin unidad, como siempre', () => {
    const r = resolveUnitSaleLine({ uuid: 'tt', name: 'Campo', saleMode: 'general' }, 4, null, undefined);
    expect(r).toEqual({ line: { sectorUuid: null, unitLabel: null, seats: 0, seatLimit: 0, admissionsPerUnit: 1 } });
  });

  it('sin saleMode (tandas viejas) es general', () => {
    expect(resolveUnitSaleLine({ uuid: 'tt', name: 'Campo' }, 2, null, undefined)).toHaveProperty('line.sectorUuid', null);
  });

  it('unidad completa: una mesa, un lugar, N entradas', () => {
    const tt = { uuid: 'tt-mesa', name: 'Mesa VIP', saleMode: 'whole_unit' as const, admissionsPerUnit: 10 };
    expect(resolveUnitSaleLine(tt, 1, mesa, 's-8')).toEqual({
      line: { sectorUuid: 's-8', unitLabel: 'Mesa VIP · 8', seats: 1, seatLimit: 1, admissionsPerUnit: 10 }
    });
    expect(resolveUnitSaleLine(tt, 2, mesa, 's-8')).toHaveProperty('error');
  });

  it('por persona: lugares hasta la capacidad', () => {
    const tt = { uuid: 'tt-mesa', name: 'Silla VIP', saleMode: 'per_person' as const };
    expect(resolveUnitSaleLine(tt, 3, mesa, 's-8')).toEqual({
      line: { sectorUuid: 's-8', unitLabel: 'Mesa VIP · 8', seats: 3, seatLimit: 10, admissionsPerUnit: 1 }
    });
    expect(resolveUnitSaleLine(tt, 11, mesa, 's-8')).toEqual({ error: 'Mesa VIP · 8 tiene 10 lugares.' });
    expect(resolveUnitSaleLine(tt, 1, { ...mesa, capacity: null }, 's-8')).toHaveProperty('error');
  });

  it('exige elegir unidad y que sea de esa tanda', () => {
    const tt = { uuid: 'tt-mesa', name: 'Mesa VIP', saleMode: 'whole_unit' as const, admissionsPerUnit: 10 };
    expect(resolveUnitSaleLine(tt, 1, null, undefined)).toHaveProperty('error');
    expect(resolveUnitSaleLine(tt, 1, null, 's-99')).toHaveProperty('error');
    expect(resolveUnitSaleLine(tt, 1, { ...mesa, ticketTypeUuids: ['otra'] }, 's-8')).toHaveProperty('error');
  });

  it('unidad completa sin entradas configuradas no se vende', () => {
    const tt = { uuid: 'tt-mesa', name: 'Mesa VIP', saleMode: 'whole_unit' as const, admissionsPerUnit: null };
    expect(resolveUnitSaleLine(tt, 1, mesa, 's-8')).toHaveProperty('error');
  });
});

describe('ticketDisplayName', () => {
  it('no repite la categoría', () => {
    expect(ticketDisplayName('Mesa VIP', 'Mesa VIP · 8')).toBe('Mesa VIP · 8');
    expect(ticketDisplayName('Preventa', 'Mesa VIP · 8')).toBe('Preventa · Mesa VIP · 8');
    expect(ticketDisplayName('Campo', null)).toBe('Campo');
  });
});
