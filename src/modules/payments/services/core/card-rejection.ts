/**
 * Traducción del `status_detail` de Mercado Pago a algo accionable.
 *
 * Con Checkout Pro esto no hacía falta: el comprador veía el error en la
 * pantalla de MP. Con Checkout API el rechazo vuelve a nuestra pantalla, y
 * "pago rechazado" no le sirve a nadie — lo único que le permite corregir es
 * saber *qué* falló.
 *
 * El criterio del texto: decir qué hacer, no qué pasó. `retryable` distingue
 * lo que se arregla en el mismo formulario (un CVV mal tipeado) de lo que
 * necesita otra tarjeta o una llamada al banco.
 */
export type CardRejection = {
  message: string;
  /** Si el comprador puede corregir y reintentar con la misma tarjeta. */
  retryable: boolean;
};

const REJECTIONS: Record<string, CardRejection> = {
  cc_rejected_bad_filled_card_number: {
    message: 'Revisá el número de la tarjeta.',
    retryable: true
  },
  cc_rejected_bad_filled_date: {
    message: 'Revisá la fecha de vencimiento.',
    retryable: true
  },
  cc_rejected_bad_filled_security_code: {
    message: 'Revisá el código de seguridad.',
    retryable: true
  },
  cc_rejected_bad_filled_other: {
    message: 'Revisá los datos de la tarjeta.',
    retryable: true
  },
  cc_rejected_insufficient_amount: {
    message: 'Tu tarjeta no tiene fondos suficientes. Probá con otra.',
    retryable: false
  },
  cc_rejected_call_for_authorize: {
    message:
      'Tu banco tiene que autorizar este pago. Llamalos, autorizalo y volvé a intentar.',
    retryable: true
  },
  cc_rejected_card_disabled: {
    message: 'Tu tarjeta está inhabilitada. Llamá a tu banco o probá con otra.',
    retryable: false
  },
  cc_rejected_card_error: {
    message: 'No pudimos procesar el pago. Probá de nuevo o usá otra tarjeta.',
    retryable: true
  },
  cc_rejected_duplicated_payment: {
    message:
      'Ya hiciste un pago por ese valor. Si necesitás pagar de nuevo, usá otra tarjeta.',
    retryable: false
  },
  cc_rejected_high_risk: {
    message: 'Mercado Pago rechazó el pago. Probá con otro medio de pago.',
    retryable: false
  },
  cc_rejected_invalid_installments: {
    message: 'Tu tarjeta no acepta esa cantidad de cuotas. Elegí otra opción.',
    retryable: true
  },
  cc_rejected_max_attempts: {
    message: 'Llegaste al límite de intentos. Probá con otra tarjeta.',
    retryable: false
  },
  cc_rejected_blacklist: {
    message: 'No pudimos procesar el pago. Probá con otro medio de pago.',
    retryable: false
  },
  cc_rejected_other_reason: {
    message: 'Tu banco rechazó el pago. Probá con otra tarjeta.',
    retryable: false
  }
};

/** Motivos por los que MP deja el pago "en revisión" en vez de aprobarlo. */
const IN_PROCESS: Record<string, string> = {
  pending_contingency: 'Estamos procesando el pago. Te avisamos por email en cuanto se acredite.',
  pending_review_manual:
    'Mercado Pago está revisando el pago. Te avisamos por email cuando lo resuelvan.'
};

export function describeCardRejection(statusDetail: string | null | undefined): CardRejection {
  if (!statusDetail) {
    return { message: 'No se pudo procesar el pago. Probá de nuevo.', retryable: true };
  }
  return (
    REJECTIONS[statusDetail] ?? {
      message: 'Tu banco rechazó el pago. Probá con otra tarjeta.',
      retryable: false
    }
  );
}

export function describeInProcess(statusDetail: string | null | undefined): string {
  return (
    (statusDetail ? IN_PROCESS[statusDetail] : undefined) ??
    'Estamos procesando el pago. Te avisamos por email en cuanto se acredite.'
  );
}

/**
 * Errores de la API al **crear** el pago, distintos de un rechazo del banco.
 *
 * Casi todos son de integración o de datos, y sus textos vienen en inglés con
 * códigos internos. Al comprador se le dice qué puede hacer; el código crudo
 * queda en el log, que es donde sirve.
 */
const API_ERRORS: Record<string, string> = {
  // El comprador está usando el mismo email que la cuenta que cobra.
  '4390': 'No podés pagar con la misma cuenta de Mercado Pago que recibe el pago.',
  // Token de tarjeta vencido o ya usado: se genera uno nuevo al reintentar.
  '2062': 'La operación tardó demasiado. Volvé a cargar la tarjeta e intentá otra vez.',
  '3001': 'Faltan datos de la tarjeta. Revisá el formulario e intentá de nuevo.',
  '3003': 'Los datos de la tarjeta no son válidos.',
  '3034': 'Los datos de la tarjeta no son válidos.',
  '2002': 'No encontramos esa tarjeta. Cargala de nuevo.',
  '4037': 'El importe no es válido.',
  '4050': 'Falta el email del comprador.'
};

/**
 * Traduce el error de creación. `raw` es el texto que devolvió MP, del que se
 * extrae el código numérico si viene.
 */
export function describeApiError(raw: string): string {
  const code = raw.match(/\b(\d{4})\b/)?.[1];
  return (
    (code ? API_ERRORS[code] : undefined) ??
    'No pudimos procesar el pago. Probá con otra tarjeta o pagá con Mercado Pago.'
  );
}
