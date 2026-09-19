import { INTERNAL_API_TOKEN_KEY } from '@root/shared/auth/guards/internal-token.guard';
import {
  SERVICE_FEE_CAP_PARAM_KEY,
  SERVICE_FEE_RATE_PERCENT_PARAM_KEY
} from '@modules/orders/services/core/service-fee';

/**
 * Parámetros cuyo valor nunca sale por la API: se informa que existen, no qué
 * dicen. El token interno se muestra una sola vez, al generarlo.
 */
export const SECRET_PARAMETER_KEYS: ReadonlySet<string> = new Set([INTERNAL_API_TOKEN_KEY]);

/**
 * Parámetros que tienen su propio flujo, con validación. El CRUD genérico los
 * guarda como texto libre: por ahí se podía dejar el costo de servicio en "abc"
 * o pisar el token sin rotarlo. Clave → dónde se cambia.
 */
export const MANAGED_PARAMETER_KEYS: ReadonlyMap<string, string> = new Map([
  [SERVICE_FEE_RATE_PERCENT_PARAM_KEY, 'PUT /admin/service-fee/config (Configuración → Costo de servicio)'],
  [SERVICE_FEE_CAP_PARAM_KEY, 'PUT /admin/service-fee/config (Configuración → Costo de servicio)'],
  [INTERNAL_API_TOKEN_KEY, 'POST /system-parameters/internal-token/generate (Configuración → Token interno)']
]);
