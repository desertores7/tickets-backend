/** Mensajes y códigos de error por conexión cerrada por inactividad (MySQL/MariaDB y PostgreSQL). */
const DB_INACTIVITY_PATTERNS = [
  'disconnected by the server because of inactivity',
  'Connection lost: The server closed the connection',
  'MySQL server has gone away',
  'wait_timeout',
  'interactive_timeout',
  'connection terminated',
  'connection terminated unexpectedly',
  'server closed the connection unexpectedly',
  'idle-session timeout'
];

const DB_INACTIVITY_CODES = [
  'ECONNRESET',
  'PROTOCOL_CONNECTION_LOST',
  'ER_CMD_CONNECTION_KILLED',
  '57P01',
  '08006',
  '08003',
  '08000'
];

/**
 * Indica si el error corresponde a una desconexión por inactividad.
 * Útil para reintentar la operación o re-lanzar el error para que un interceptor reintente.
 */
export function isDbInactivityError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const msg = (error as any)?.message ?? '';
  const code = (error as any)?.code ?? '';
  const str = String(msg).toLowerCase();
  const codeStr = String(code).toUpperCase();
  if (DB_INACTIVITY_CODES.includes(codeStr)) return true;
  return DB_INACTIVITY_PATTERNS.some(p => str.includes(p.toLowerCase()));
}
