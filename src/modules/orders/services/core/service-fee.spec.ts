import {
  allocateOrderServiceFees,
  isCappedServiceFee,
  splitEvenly,
  ticketServiceFee
} from './service-fee';

const RATE = 0.1;

describe('ticketServiceFee', () => {
  it('cobra el porcentaje de la entrada', () => {
    expect(ticketServiceFee(100, RATE, 50000)).toBe(10);
    expect(ticketServiceFee(25000, RATE, 50000)).toBe(2500);
  });

  it('toma el porcentaje vigente que se le pasa', () => {
    expect(ticketServiceFee(100, 0.15, 50000)).toBe(15);
    expect(ticketServiceFee(10000, 0.075, 50000)).toBe(750);
  });

  it('redondea precio + fee al peso hacia arriba', () => {
    // $57,50 + 10% = $63,25 → $64
    expect(ticketServiceFee(57.5, RATE, 50000)).toBe(6.5);
  });

  it('cobra el tope cuando el porcentaje lo supera', () => {
    expect(ticketServiceFee(1_000_000, RATE, 50000)).toBe(50000);
    expect(ticketServiceFee(500_000, RATE, 50000)).toBe(50000);
    expect(ticketServiceFee(499_990, RATE, 50000)).toBe(49999);
  });

  it('toma el tope vigente que se le pasa', () => {
    expect(ticketServiceFee(1_000_000, RATE, 30000)).toBe(30000);
  });

  it('una entrada gratis no paga fee', () => {
    expect(ticketServiceFee(0, RATE, 50000)).toBe(0);
  });
});

describe('isCappedServiceFee', () => {
  it('distingue el tope del porcentaje', () => {
    expect(isCappedServiceFee(1_000_000, 50000, RATE, 50000)).toBe(true);
    expect(isCappedServiceFee(500_000, 50000, RATE, 50000)).toBe(false);
    expect(isCappedServiceFee(1_000_000, 150000, 0.15, null)).toBe(false);
  });
});

describe('splitEvenly', () => {
  it('reparte los centavos sobrantes en las primeras partes', () => {
    expect(splitEvenly(10, 3)).toEqual([3.34, 3.33, 3.33]);
    expect(splitEvenly(0, 2)).toEqual([0, 0]);
  });
});

describe('allocateOrderServiceFees', () => {
  const lines = [
    { ticketTypeUuid: 'general', quantity: 2, unitPrice: 10000 },
    { ticketTypeUuid: 'vip', quantity: 1, unitPrice: 1_000_000 }
  ];

  it('suma el fee de cada entrada, con el tope por entrada', () => {
    const result = allocateOrderServiceFees(lines, 0, null, RATE, 50000);
    expect(result.lines).toEqual([
      { discountAmount: 0, serviceFee: 2000 },
      { discountAmount: 0, serviceFee: 50000 }
    ]);
    expect(result.serviceFee).toBe(52000);
  });

  it('calcula el fee sobre el precio ya descontado', () => {
    // 5 × $100 con cupón del 10% → $90 cada una → $9 de fee
    const result = allocateOrderServiceFees(
      [{ ticketTypeUuid: 'general', quantity: 5, unitPrice: 100 }],
      50,
      null,
      RATE,
      50000
    );
    expect(result.lines[0]).toEqual({ discountAmount: 50, serviceFee: 45 });
  });

  it('reparte el descuento solo entre las tandas alcanzadas', () => {
    const result = allocateOrderServiceFees(lines, 5000, ['general'], RATE, 50000);
    expect(result.lines[0].discountAmount).toBe(5000);
    expect(result.lines[1].discountAmount).toBe(0);
    // $7.500 cada una → $750 de fee
    expect(result.lines[0].serviceFee).toBe(1500);
  });

  it('el descuento repartido cierra exacto al centavo', () => {
    const result = allocateOrderServiceFees(
      [
        { ticketTypeUuid: 'a', quantity: 3, unitPrice: 333.33 },
        { ticketTypeUuid: 'b', quantity: 1, unitPrice: 1000 }
      ],
      100.01,
      null,
      RATE,
      50000
    );
    const total = result.lines.reduce((sum, l) => sum + Math.round(l.discountAmount * 100), 0);
    expect(total).toBe(10001);
  });
});

describe('allocateOrderServiceFees — unidad completa (BR-SALE-010)', () => {
  it('una mesa de $100.000 con 10 entradas paga como 10 entradas de $10.000', () => {
    const mesa = allocateOrderServiceFees(
      [{ ticketTypeUuid: 'mesa', quantity: 1, unitPrice: 100000, admissionsPerUnit: 10 }],
      0,
      null,
      0.1,
      50000
    );
    const sueltas = allocateOrderServiceFees(
      [{ ticketTypeUuid: 'silla', quantity: 10, unitPrice: 10000 }],
      0,
      null,
      0.1,
      50000
    );
    expect(mesa.serviceFee).toBe(sueltas.serviceFee);
    expect(mesa.serviceFee).toBe(10000);
  });

  it('el tope aplica por entrada, no a la mesa entera', () => {
    // Mesa de $1.000.000 con 10 entradas: $100.000 c/u → fee $10.000 c/u, sin tope.
    const r = allocateOrderServiceFees(
      [{ ticketTypeUuid: 'mesa', quantity: 1, unitPrice: 1000000, admissionsPerUnit: 10 }],
      0,
      null,
      0.1,
      50000
    );
    expect(r.serviceFee).toBe(100000);
  });
});
