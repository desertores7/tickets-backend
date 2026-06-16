/** Mensajes y códigos de error de MySQL/MariaDB por conexión cerrada por inactividad. */
const DB_INACTIVITY_PATTERNS = [
  'disconnected by the server because of inactivity',
  'Connection lost: The server closed the connection',
  'MySQL server has gone away',
  'wait_timeout',
  'interactive_timeout'
];

const DB_INACTIVITY_CODES = ['ECONNRESET', 'PROTOCOL_CONNECTION_LOST', 'ER_CMD_CONNECTION_KILLED'];

/**
 * Indica si el error corresponde a una desconexión por inactividad (wait_timeout, etc.).
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
