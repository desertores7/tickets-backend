import { SetMetadata } from '@nestjs/common';

/**
 * Clave de metadata para el decorator
 */
export const SANITIZE_TEXT_METADATA = 'sanitize_text';

/**
 * Opciones para sanitizar texto
 */
export interface SanitizeTextOptions {
  /**
   * Propiedades del objeto a sanitizar (si el parámetro es un objeto)
   * Si no se especifica, se sanitizan todas las propiedades string del objeto
   */
  properties?: string[];

  /**
   * Longitud máxima permitida (por defecto 255)
   */
  maxLength?: number;

  /**
   * Valor por defecto si el resultado está vacío (por defecto 'Unknown')
   */
  defaultValue?: string;
}

/**
 * Decorator para sanitizar automáticamente textos en parámetros de métodos.
 * Requiere usar el interceptor SanitizeTextInterceptor.
 *
 * @example
 * ```typescript
 * // Sanitizar propiedades específicas del body
 * @UseInterceptors(SanitizeTextInterceptor)
 * @SanitizeText({ properties: ['nameClient', 'description'], maxLength: 255 })
 * @Post('conversation')
 * async createConversation(@Body() data: CreateConversationDto) {
 *   // nameClient y description serán sanitizados automáticamente
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Sanitizar todas las propiedades string del body
 * @UseInterceptors(SanitizeTextInterceptor)
 * @SanitizeText({ maxLength: 100 })
 * @Post('user')
 * async updateUser(@Body() data: UpdateUserDto) {
 *   // Todas las propiedades string serán sanitizadas con maxLength 100
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Uso directo del servicio (sin decorator/interceptor)
 * constructor(private readonly textSanitizer: TextSanitizerService) {}
 *
 * async create(data: CreateDto) {
 *   const sanitizedName = this.textSanitizer.sanitize(data.name, 255, 'Default');
 *   // ... usar sanitizedName
 * }
 * ```
 */
export const SanitizeText = (options?: SanitizeTextOptions) => SetMetadata(SANITIZE_TEXT_METADATA, options || {});
