import { SystemParameterEntity } from '@config/db/entities/system/system_parameter.entity';

export interface ISystemParameterService {
  /**
   * Obtiene un parámetro por su clave
   * @param key Clave del parámetro
   * @returns El parámetro encontrado o null
   */
  getParameter(key: string): Promise<SystemParameterEntity | null>;

  /**
   * Obtiene el valor de un parámetro como string
   * @param key Clave del parámetro
   * @param defaultValue Valor por defecto si no se encuentra
   * @returns El valor del parámetro o el valor por defecto
   */
  getParameterValue(key: string, defaultValue?: string): Promise<string>;

  /**
   * Obtiene el valor de un parámetro como número
   * @param key Clave del parámetro
   * @param defaultValue Valor por defecto si no se encuentra
   * @returns El valor del parámetro como número o el valor por defecto
   */
  getParameterAsNumber(key: string, defaultValue?: number): Promise<number>;

  /**
   * Obtiene el valor de un parámetro como booleano
   * @param key Clave del parámetro
   * @param defaultValue Valor por defecto si no se encuentra
   * @returns El valor del parámetro como booleano o el valor por defecto
   */
  getParameterAsBoolean(key: string, defaultValue?: boolean): Promise<boolean>;

  /**
   * Crea o actualiza un parámetro
   * @param key Clave del parámetro
   * @param value Valor del parámetro
   * @param description Descripción del parámetro
   * @param type Tipo del parámetro (string, number, boolean, json)
   * @param userId ID del usuario que realiza la operación
   * @returns El parámetro creado o actualizado
   */
  setParameter(
    key: string,
    value: string,
    description?: string,
    type?: string,
    userId?: string
  ): Promise<SystemParameterEntity>;

  /**
   * Obtiene todos los parámetros activos
   * @returns Lista de parámetros activos
   */
  getAllParameters(): Promise<SystemParameterEntity[]>;

  /**
   * Elimina un parámetro (soft delete)
   * @param key Clave del parámetro a eliminar
   * @param userId ID del usuario que realiza la operación
   * @returns true si se eliminó correctamente
   */
  deleteParameter(key: string, userId?: string): Promise<boolean>;

  /**
   * Genera o rota el token de larga duración para APIs internas.
   * Guarda el token en el parámetro internal_api.token y lo devuelve una sola vez.
   * @param userId ID del usuario administrador que genera el token
   * @returns El nuevo token (guardar de forma segura; no se vuelve a mostrar)
   */
  generateInternalApiToken(userId: string): Promise<{ token: string }>;
}
