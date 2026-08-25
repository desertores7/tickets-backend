export const STAFF_ROLE_NAMES = {
  Productor: 'Productor',
  Validador: 'Validador',
  Caja: 'Caja'
} as const;

export type StaffRoleName = (typeof STAFF_ROLE_NAMES)[keyof typeof STAFF_ROLE_NAMES];

export const PRODUCTOR_ROLE_UUID = '8c41b7d9-2f6e-4a35-b8c1-7d92e4f0a516';
export const VALIDADOR_ROLE_UUID = '3e7a1c52-88f4-4b0d-a9e6-51c2d47b9a03';
export const CAJA_ROLE_UUID = 'b2c3d4e5-f6a7-4890-b123-456789abcdef';

export const STAFF_KINDS = ['producer', 'validator', 'cashier', 'producer_invite_pending'] as const;
export type StaffKind = (typeof STAFF_KINDS)[number];

export const CREATE_STAFF_ROLES = ['validator', 'cashier'] as const;
export type CreateStaffRole = (typeof CREATE_STAFF_ROLES)[number];

export const PRODUCER_INVITE_TTL_DAYS = 7;

export const PASSWORD_POLICY = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/;
