import { Injectable } from '@nestjs/common';

/**
 * Servicio para sanitizar textos removiendo emojis y caracteres especiales
 * que pueden causar problemas de encoding en bases de datos MySQL con utf8
 */
@Injectable()
export class TextSanitizerService {
  /**
   * Sanitiza un texto removiendo emojis y caracteres especiales problemáticos
   * Mantiene caracteres ASCII extendido y latino básico compatibles con MySQL utf8
   *
   * @param text - Texto a sanitizar
   * @param maxLength - Longitud máxima permitida (por defecto 255)
   * @param defaultValue - Valor por defecto si el resultado está vacío (por defecto 'Unknown')
   * @returns Texto sanitizado
   */
  sanitize(text: string | null | undefined, maxLength: number = 255, defaultValue: string = 'Unknown'): string {
    if (!text) return defaultValue;

    // Remover emojis y caracteres especiales problemáticos
    // Esta regex remueve emojis y caracteres no ASCII básicos
    let sanitized = text
      // Remover emojis (rangos Unicode de emojis)
      .replace(/[\u{1F600}-\u{1F64F}]/gu, '') // Emoticons
      .replace(/[\u{1F300}-\u{1F5FF}]/gu, '') // Misc Symbols and Pictographs
      .replace(/[\u{1F680}-\u{1F6FF}]/gu, '') // Transport and Map
      .replace(/[\u{1F1E0}-\u{1F1FF}]/gu, '') // Flags
      .replace(/[\u{2600}-\u{26FF}]/gu, '') // Misc symbols
      .replace(/[\u{2700}-\u{27BF}]/gu, '') // Dingbats
      .replace(/[\u{FE00}-\u{FE0F}]/gu, '') // Variation Selectors
      .replace(/[\u{1F900}-\u{1F9FF}]/gu, '') // Supplemental Symbols and Pictographs
      .replace(/[\u{1FA00}-\u{1FAFF}]/gu, '') // Chess Symbols
      .replace(/[\u{1FAB0}-\u{1FAFF}]/gu, '') // Symbols and Pictographs Extended-A
      .replace(/[\u{200D}]/gu, '') // Zero Width Joiner
      .replace(/[\u{FE0F}]/gu, '') // Variation Selector-16
      // Remover otros caracteres especiales problemáticos
      // Mantener solo ASCII extendido y latino básico
      .replace(/[^\x20-\x7E\u00A0-\u024F\u1E00-\u1EFF]/g, '')
      .trim();

    // Si después de limpiar está vacío, usar valor por defecto
    if (!sanitized || sanitized.length === 0) {
      sanitized = defaultValue;
    }

    // Limitar longitud
    if (sanitized.length > maxLength) {
      sanitized = sanitized.substring(0, maxLength - 3) + '...';
    }

    return sanitized;
  }

  /**
   * Sanitiza múltiples propiedades de un objeto
   *
   * @param obj - Objeto a sanitizar
   * @param properties - Array de nombres de propiedades a sanitizar
   * @param maxLength - Longitud máxima por defecto para cada propiedad
   * @returns Objeto con propiedades sanitizadas
   */
  sanitizeObject<T extends Record<string, any>>(obj: T, properties: (keyof T)[], maxLength: number = 255): T {
    const sanitized = { ...obj };

    for (const prop of properties) {
      if (sanitized[prop] && typeof sanitized[prop] === 'string') {
        sanitized[prop] = this.sanitize(sanitized[prop], maxLength) as any;
      }
    }

    return sanitized;
  }
}
