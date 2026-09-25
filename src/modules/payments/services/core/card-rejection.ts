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
 * queda en el log (y ahora también en `payment.rawResponse`, ver
 * `mercadopago.service.ts`), que es donde sirve para diagnosticar.
 */
const API_ERRORS: Record<string, CardRejection> = {
  // MP describe esto como "Payer email forbidden". Antes decíamos que era
  // siempre "estás pagando con la misma cuenta que cobra", pero un caso real
  // (2026-09-25) mostró que también salta por control antifraude propio de MP
  // ante actividad repetida/sospechosa del email del comprador — no solo por
  // ser colaborador de la cuenta receptora. El mensaje no asume la causa.
  '4390': {
    message:
      'Mercado Pago no aprobó este intento por un control de seguridad de la cuenta del ' +
      'comprador. Probá con otro medio de pago o esperá unos minutos y volvé a intentar.',
    retryable: false
  },
  // Token de tarjeta vencido o ya usado: se genera uno nuevo al reintentar.
  '2062': {
    message: 'La operación tardó demasiado. Volvé a cargar la tarjeta e intentá otra vez.',
    retryable: true
  },
  '3001': {
    message: 'Faltan datos de la tarjeta. Revisá el formulario e intentá de nuevo.',
    retryable: true
  },
  '3003': { message: 'Los datos de la tarjeta no son válidos.', retryable: true },
  '3034': { message: 'Los datos de la tarjeta no son válidos.', retryable: true },
  '2002': { message: 'No encontramos esa tarjeta. Cargala de nuevo.', retryable: true },
  '4037': { message: 'El importe no es válido.', retryable: false },
  '4050': { message: 'Falta el email del comprador.', retryable: true }
};

const DEFAULT_API_ERROR: CardRejection = {
  message: 'No pudimos procesar el pago. Probá con otra tarjeta o pagá con Mercado Pago.',
  retryable: false
};

/**
 * Traduce un error de la API al **crear** el pago (código numérico de MP,
 * ej. `4390`), distinto de un rechazo del banco (`status_detail` tipo
 * `cc_rejected_*`, ver `describeCardRejection`).
 */
export function describeApiRejection(code: string | null | undefined): CardRejection {
  return (code ? API_ERRORS[code] : undefined) ?? DEFAULT_API_ERROR;
}

/** Extrae el código numérico de 4 dígitos del texto crudo que devuelve MP. */
export function extractApiErrorCode(raw: string): string | null {
  return raw.match(/\b(\d{4})\b/)?.[1] ?? null;
}
