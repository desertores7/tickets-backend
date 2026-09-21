import { findRemovedSectors, removedSectorsMessage } from './published-map-guard';

const isStage = (name: string) => name.trim().toUpperCase() === 'ESCENARIO';

const current = [
  { uuid: 'a', name: '1', familyLabel: 'Mesa VIP' },
  { uuid: 'b', name: '2', familyLabel: 'Mesa VIP' },
  { uuid: 's', name: 'ESCENARIO' }
];

describe('findRemovedSectors', () => {
  it('mover o agregar no borra nada', () => {
    expect(findRemovedSectors(current, new Set(['a', 'b', 'nuevo']), isStage)).toEqual([]);
  });

  it('detecta el sector que falta', () => {
    expect(findRemovedSectors(current, new Set(['a']), isStage).map(s => s.uuid)).toEqual(['b']);
  });

  it('la fila ESCENARIO vieja no cuenta', () => {
    expect(findRemovedSectors(current, new Set(['a', 'b']), isStage)).toEqual([]);
  });
});

describe('removedSectorsMessage', () => {
  it('nombra los sectores y dice qué sí se puede hacer', () => {
    const msg = removedSectorsMessage([{ uuid: 'b', name: '2', familyLabel: 'Mesa VIP' }]);
    expect(msg).toContain('Mesa VIP · 2');
    expect(msg).toContain('Podés moverlos o agregar sectores nuevos');
  });

  it('corta en 5 y cuenta el resto', () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ uuid: String(i), name: String(i + 1) }));
    expect(removedSectorsMessage(many)).toContain('y 2 más');
  });
});
