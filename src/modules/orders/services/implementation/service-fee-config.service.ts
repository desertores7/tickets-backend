import { Inject, Injectable } from '@nestjs/common';
import { ISystemParameterService } from '@modules/system-parameter/services/contracts/isystem-parameter.service';
import {
  SERVICE_FEE_CAP_DEFAULT,
  SERVICE_FEE_CAP_PARAM_KEY,
  SERVICE_FEE_RATE
} from '../core/service-fee';

export interface ServiceFeeConfig {
  /** Fracción: 0.1 = 10%. */
  rate: number;
  /** Tope por entrada, en ARS. */
  cap: number;
}

/**
 * Cuánto se lee el tope desde la base antes de volver a consultarla. Cada orden
 * lo necesita, y en una salida a la venta son miles de órdenes por minuto.
 */
const CACHE_TTL_MS = 30_000;

/**
 * Regla vigente del costo de servicio. El tope vive en `system_parameter` y lo
 * edita el Administrador; aplica a todos los eventos por igual.
 *
 * Un cambio impacta en las órdenes que se creen después, nunca en las ya
 * creadas: esas guardan su fee y la regla con la que se cobró.
 */
@Injectable()
export class ServiceFeeConfigService {
  private cached: { cap: number; expiresAt: number } | null = null;

  constructor(
    @Inject('ISystemParameterService')
    private readonly systemParameterService: ISystemParameterService
  ) {}

  async getConfig(): Promise<ServiceFeeConfig> {
    if (!this.cached || this.cached.expiresAt <= Date.now()) {
      const cap = await this.systemParameterService.getParameterAsNumber(
        SERVICE_FEE_CAP_PARAM_KEY,
        SERVICE_FEE_CAP_DEFAULT
      );
      this.cached = { cap, expiresAt: Date.now() + CACHE_TTL_MS };
    }
    return { rate: SERVICE_FEE_RATE, cap: this.cached.cap };
  }

  async updateCap(cap: number, userUuid: string): Promise<ServiceFeeConfig> {
    await this.systemParameterService.setParameter(
      SERVICE_FEE_CAP_PARAM_KEY,
      String(cap),
      'Tope del costo de servicio por entrada, en ARS. Lo edita el Administrador.',
      'number',
      userUuid
    );
    this.cached = { cap, expiresAt: Date.now() + CACHE_TTL_MS };
    return { rate: SERVICE_FEE_RATE, cap };
  }
}
