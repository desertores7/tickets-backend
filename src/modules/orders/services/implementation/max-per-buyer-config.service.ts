import { Inject, Injectable } from '@nestjs/common';
import { ISystemParameterService } from '@modules/system-parameter/services/contracts/isystem-parameter.service';
import {
  MAX_PER_BUYER_HIGH_PRICE_LIMIT_DEFAULT,
  MAX_PER_BUYER_HIGH_PRICE_LIMIT_PARAM_KEY,
  MAX_PER_BUYER_LOW_PRICE_LIMIT_DEFAULT,
  MAX_PER_BUYER_LOW_PRICE_LIMIT_PARAM_KEY,
  MAX_PER_BUYER_PRICE_THRESHOLD_DEFAULT,
  MAX_PER_BUYER_PRICE_THRESHOLD_PARAM_KEY,
  MaxPerBuyerConfig
} from '../core/max-per-buyer';

/** Cada línea de una orden la necesita: mismo TTL que el costo de servicio. */
const CACHE_TTL_MS = 30_000;

/**
 * Regla vigente del tope de compra por comprador. Vive en `system_parameter`
 * y la edita el Administrador; aplica a toda tanda que no tenga su propio
 * `maxPerBuyer` explícito.
 */
@Injectable()
export class MaxPerBuyerConfigService {
  private cached: { config: MaxPerBuyerConfig; expiresAt: number } | null = null;

  constructor(
    @Inject('ISystemParameterService')
    private readonly systemParameterService: ISystemParameterService
  ) {}

  async getConfig(): Promise<MaxPerBuyerConfig> {
    if (!this.cached || this.cached.expiresAt <= Date.now()) {
      const [priceThreshold, highPriceLimit, lowPriceLimit] = await Promise.all([
        this.systemParameterService.getParameterAsNumber(
          MAX_PER_BUYER_PRICE_THRESHOLD_PARAM_KEY,
          MAX_PER_BUYER_PRICE_THRESHOLD_DEFAULT
        ),
        this.systemParameterService.getParameterAsNumber(
          MAX_PER_BUYER_HIGH_PRICE_LIMIT_PARAM_KEY,
          MAX_PER_BUYER_HIGH_PRICE_LIMIT_DEFAULT
        ),
        this.systemParameterService.getParameterAsNumber(
          MAX_PER_BUYER_LOW_PRICE_LIMIT_PARAM_KEY,
          MAX_PER_BUYER_LOW_PRICE_LIMIT_DEFAULT
        )
      ]);
      this.cached = {
        config: { priceThreshold, highPriceLimit, lowPriceLimit },
        expiresAt: Date.now() + CACHE_TTL_MS
      };
    }
    return this.cached.config;
  }

  async updateConfig(input: MaxPerBuyerConfig, userUuid: string): Promise<MaxPerBuyerConfig> {
    await this.systemParameterService.setParameter(
      MAX_PER_BUYER_PRICE_THRESHOLD_PARAM_KEY,
      String(input.priceThreshold),
      'Precio (ARS) a partir del cual una entrada usa el tope alto de compra por comprador. Lo edita el Administrador.',
      'number',
      userUuid
    );
    await this.systemParameterService.setParameter(
      MAX_PER_BUYER_HIGH_PRICE_LIMIT_PARAM_KEY,
      String(input.highPriceLimit),
      'Tope de compra por comprador para entradas que alcanzan el umbral de precio. Lo edita el Administrador.',
      'number',
      userUuid
    );
    await this.systemParameterService.setParameter(
      MAX_PER_BUYER_LOW_PRICE_LIMIT_PARAM_KEY,
      String(input.lowPriceLimit),
      'Tope de compra por comprador para entradas por debajo del umbral de precio. Lo edita el Administrador.',
      'number',
      userUuid
    );

    this.cached = { config: input, expiresAt: Date.now() + CACHE_TTL_MS };
    return input;
  }
}
