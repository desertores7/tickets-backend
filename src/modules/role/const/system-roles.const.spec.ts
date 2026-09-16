import { isSystemRoleName } from './system-roles.const';

describe('isSystemRoleName', () => {
  it('reconoce los roles del sistema', () => {
    expect(isSystemRoleName('Administrador')).toBe(true);
    expect(isSystemRoleName('Validador')).toBe(true);
  });

  it('ignora mayúsculas y espacios, igual que el guard', () => {
    expect(isSystemRoleName('  administrador ')).toBe(true);
    expect(isSystemRoleName('CAJA')).toBe(true);
  });

  it('no alcanza a roles creados por el equipo', () => {
    expect(isSystemRoleName('Marketing')).toBe(false);
    expect(isSystemRoleName('')).toBe(false);
    expect(isSystemRoleName(null)).toBe(false);
  });
});
