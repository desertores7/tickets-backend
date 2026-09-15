import { Inject, Injectable } from '@nestjs/common';
import { ISystemParameterService } from '@modules/system-parameter/services/contracts/isystem-parameter.service';
import {
  SERVICE_FEE_CAP_DEFAULT,
  SERVICE_FEE_CAP_PARAM_KEY,
  SERVICE_FEE_RATE_PERCENT_DEFAULT,
  SERVICE_FEE_RATE_PERCENT_PARAM_KEY
} from '../core/service-fee';

export interface ServiceFeeConfig {
  /** Fracción: 0.1 = 10%. */
  rate: number;
  /** Tope por entrada, en ARS. */
  cap: number;
}

/**
 * Cuánto se lee la regla desde la base antes de volver a consultarla. Cada
 * orden la necesita, y en una salida a la venta son miles de órdenes por minuto.
 */
const CACHE_TTL_MS = 30_000;

/**
 * Regla vigente del costo de servicio. El porcentaje y el tope viven en
 * `system_parameter` y los edita el Administrador; aplican a todos los eventos
 * por igual.
 *
 * Un cambio impacta en las órdenes que se creen después, nunca en las ya
 * creadas: esas guardan su fee y la regla con la que se cobró.
 */
@Injectable()
export class ServiceFeeConfigService {
  private cached: { config: ServiceFeeConfig; expiresAt: number } | null = null;

  constructor(
    @Inject('ISystemParameterService')
    private readonly systemParameterService: ISystemParameterService
  ) {}

  async getConfig(): Promise<ServiceFeeConfig> {
    if (!this.cached || this.cached.expiresAt <= Date.now()) {
      const [ratePercent, cap] = await Promise.all([
        this.systemParameterService.getParameterAsNumber(
          SERVICE_FEE_RATE_PERCENT_PARAM_KEY,
          SERVICE_FEE_RATE_PERCENT_DEFAULT
        ),
        this.systemParameterService.getParameterAsNumber(
          SERVICE_FEE_CAP_PARAM_KEY,
          SERVICE_FEE_CAP_DEFAULT
        )
      ]);
      this.cached = {
        config: { rate: ratePercent / 100, cap },
        expiresAt: Date.now() + CACHE_TTL_MS
      };
    }
    return this.cached.config;
  }

  async updateConfig(
    input: { ratePercent: number; cap: number },
    userUuid: string
  ): Promise<ServiceFeeConfig> {
    await this.systemParameterService.setParameter(
      SERVICE_FEE_RATE_PERCENT_PARAM_KEY,
      String(input.ratePercent),
      'Porcentaje del costo de servicio sobre el valor de cada entrada. Lo edita el Administrador.',
      'number',
      userUuid
    );
    await this.systemParameterService.setParameter(
      SERVICE_FEE_CAP_PARAM_KEY,
      String(input.cap),
      'Tope del costo de servicio por entrada, en ARS. Lo edita el Administrador.',
      'number',
      userUuid
    );

    const config = { rate: input.ratePercent / 100, cap: input.cap };
    this.cached = { config, expiresAt: Date.now() + CACHE_TTL_MS };
    return config;
  }
}
