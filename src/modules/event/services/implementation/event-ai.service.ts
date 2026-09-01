import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException
} from '@nestjs/common';
import { EnvService } from '@config/env/env.service';
import { RedisService } from '@config/redis/redis.service';
import OpenAI, { APIError, toFile } from 'openai';
import type { ChatCompletionContentPart } from 'openai/resources/chat/completions';
import { HERO_FROM_FLYER_PROMPT } from '../../const/hero-from-flyer.prompt';
import {
  MAP_LAYOUT_SYSTEM_PROMPT,
  MAP_LAYOUT_USER_TEXT
} from '../../const/map-layout.prompt';
import {
  AnalyzeFlyersResult,
  AnalyzeMapResult,
  FlyerEventExtraction,
  HeroImageMimeType,
  HeroImageUsage,
  IEventAiService,
  SuggestMapSectorsResult
} from '../contracts/ievent-ai.service';
import {
  normalizeMapLayout,
  summarizeMapLayout
} from './map-layout-normalizer';
import { parseJsonObjectLoose } from './parse-json-loose';

const MAX_FLYERS = 1;
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB c/u — menos tokens de entrada
const ALLOWED_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

/** Extracción: timeout corto. Hero: mucho más largo (imagen tarda). */
const EXTRACT_TIMEOUT_MS = 90_000;
/** Una sola vision call de layout abstracto (sin geometría por elemento). */
const MAP_LAYOUT_TIMEOUT_MS = 120_000;
const MAP_LAYOUT_MAX_TOKENS = 8_000;
const MAP_EMPTY_CONTENT_RETRIES = 2;
const HERO_TIMEOUT_MS = 5 * 60_000;
const EXTRACT_MAX_OUTPUT_TOKENS = 1200;
const HOUR_TTL_SEC = 60 * 60;
/** Reintentos ante 429/5xx de OpenAI (no bucles infinitos). */
const TRANSIENT_MAX_ATTEMPTS = 3;
const TRANSIENT_BASE_DELAY_MS = 2_500;
/** Landscape 16:9 — hero full-width (espacio texto a la izquierda) */

type HeroImageQuality = 'low' | 'medium' | 'high';
type HeroImageFormat = 'png' | 'webp' | 'jpeg';

type HeroGenerationResult = {
  b64: string;
  mimeType: HeroImageMimeType;
  imageModelUsed: string;
  generationQuality: HeroImageQuality;
  generationSize: string;
  generationFormat: HeroImageFormat;
  fallbackUsed: boolean;
  usage: HeroImageUsage | null;
};

function buildExtractionSystemPrompt(now = new Date()): string {
  const year = now.getFullYear();
  const todayIso = now.toISOString().slice(0, 10);

  return `You extract structured event data from one promotional flyer image for an Argentine ticketing platform.

CRITICAL COST / BEHAVIOR RULES:
- Do exactly ONE extraction. Do not ask follow-up questions.
- Do not invent missing data. Prefer empty string / [] / null.
- Stay on task: only the JSON schema below. No markdown, no commentary, no tool calls.

Return ONLY a JSON object with this exact shape:
{
  "title": string,
  "description": string,
  "startDate": string,
  "endDate": string,
  "venueName": string,
  "venueAddress": string,
  "venueCity": string,
  "venueCountry": string,
  "googleMapsQuery": string,
  "ticketTypes": [{ "name": string, "price": number, "quantity": number | null }],
  "artistsLineup": string | null
}
Rules:
- title: event name as shown on the flyer (never invent a URL slug).
- description: 2–4 short sentences in Spanish; include artists if visible.
- Today is ${todayIso}. The current calendar year is ${year}.
- startDate / endDate: prefer ISO 8601 (YYYY-MM-DDTHH:mm:ss). If only a date is shown, assume start 20:00 and end 23:00. If end missing, start + 3 hours (or next day if overnight, e.g. OPEN 22HRS → end ~01:00).
- YEAR RULE (critical): Argentine flyers often show day+month only (e.g. "10 SAB OCT") with NO year. When the year is missing or ambiguous, you MUST use ${year}. Never default to 2023, 2024, or any year before ${year} unless that exact year is printed on the flyer.
- venueCountry default "Argentina".
- googleMapsQuery: best single Maps search string.
- ticketTypes only if prices/sectors appear; price in ARS number; quantity null if unknown.
- artistsLineup: comma-separated names or null.`;
}

/**
 * Si el modelo inventa un año pasado (p. ej. 2023) porque el flyer no lo trae,
 * fuerza el año corriente. El productor puede editar después.
 */
function coerceExtractionDateYear(value: string, now = new Date()): string {
  const trimmed = value?.trim();
  if (!trimmed) return '';

  const currentYear = now.getFullYear();
  const parsed = parseFlexibleDate(trimmed);
  if (!parsed) return trimmed;

  if (parsed.getFullYear() >= currentYear) {
    return formatIsoLocal(parsed);
  }

  parsed.setFullYear(currentYear);
  return formatIsoLocal(parsed);
}

function parseFlexibleDate(value: string): Date | null {
  const m = value.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/
  );
  if (m) {
    const d = new Date(
      Number(m[3]),
      Number(m[2]) - 1,
      Number(m[1]),
      Number(m[4] ?? 20),
      Number(m[5] ?? 0),
      Number(m[6] ?? 0)
    );
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const iso = value.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/
  );
  if (iso) {
    const d = new Date(
      Number(iso[1]),
      Number(iso[2]) - 1,
      Number(iso[3]),
      Number(iso[4] ?? 20),
      Number(iso[5] ?? 0),
      Number(iso[6] ?? 0)
    );
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatIsoLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

@Injectable()
export class EventAiService implements IEventAiService {
  private readonly logger = new Logger(EventAiService.name);

  constructor(
    private readonly envService: EnvService,
    private readonly redisService: RedisService
  ) {}

  async analyzeFromFlyers(
    files: Express.Multer.File[],
    userId: string
  ): Promise<AnalyzeFlyersResult> {
    const flyers = this.validateFiles(files);
    const apiKey = this.envService.get('OPENIA_API_KEY');
    if (!apiKey?.trim()) {
      throw new ServiceUnavailableException(
        'OPENIA_API_KEY no está configurada en el servidor. Agregala al .env del backend.'
      );
    }

    await this.assertWithinQuota(userId);

    const client = this.createClient(apiKey.trim(), EXTRACT_TIMEOUT_MS);
    const extraction = await this.extractEventData(client, flyers);

    const heroClient = this.createClient(apiKey.trim(), HERO_TIMEOUT_MS);

    let heroImageBase64: string | null = null;
    let heroMimeType: HeroImageMimeType = this.formatToMime(
      this.envService.get('EVENT_AI_IMAGE_FORMAT')
    );
    let heroWarning: string | null = null;
    let imageModelUsed: string | null = null;
    let generationQuality: HeroImageQuality | null = null;
    let generationSize: string | null = null;
    let generationFormat: HeroImageFormat | null = null;
    let fallbackUsed = false;
    let heroUsage: HeroImageUsage | null = null;
    try {
      const hero = await this.generateHero(heroClient, flyers);
      heroImageBase64 = hero.b64;
      heroMimeType = hero.mimeType;
      imageModelUsed = hero.imageModelUsed;
      generationQuality = hero.generationQuality;
      generationSize = hero.generationSize;
      generationFormat = hero.generationFormat;
      fallbackUsed = hero.fallbackUsed;
      heroUsage = hero.usage;
    } catch (err) {
      // No tumbar la extracción: el productor puede seguir editando y subir banner a mano
      const msg =
        err instanceof Error ? err.message : 'No se pudo generar el hero con OpenAI.';
      this.logger.warn(`Hero generation soft-fail: ${msg}`);
      heroWarning =
        msg.includes('aborted') || msg.includes('Abort') || msg.includes('timeout')
          ? 'La generación del hero tardó demasiado. Los datos se completaron; subí el banner a mano o reintentá Analizar.'
          : `Hero no generado: ${msg}. Los datos del flyer sí se aplicaron.`;
    }

    await this.consumeQuota(userId);

    return {
      extraction,
      heroImageBase64,
      heroMimeType,
      heroWarning,
      imageModelUsed,
      generationQuality,
      generationSize,
      generationFormat,
      fallbackUsed,
      heroUsage
    };
  }

  async analyzeFromMapImage(
    file: Express.Multer.File,
    userId: string
  ): Promise<AnalyzeMapResult> {
    const [mapFile] = this.validateMapFile(file);
    const apiKey = this.envService.get('OPENIA_API_KEY');
    if (!apiKey?.trim()) {
      throw new ServiceUnavailableException(
        'OPENIA_API_KEY no está configurada en el servidor. Agregala al .env del backend.'
      );
    }

    await this.assertWithinQuota(userId);

    const client = this.createClient(apiKey.trim(), MAP_LAYOUT_TIMEOUT_MS);
    const result = await this.analyzeSalesMap(client, mapFile);

    await this.consumeQuota(userId);
    return result;
  }

  private validateMapFile(file: Express.Multer.File | undefined): Express.Multer.File[] {
    if (!file) {
      throw new BadRequestException('Subí la imagen del mapa (campo multipart "mapImage").');
    }
    const mime = (file.mimetype || '').toLowerCase();
    if (!ALLOWED_MIME.has(mime)) {
      throw new BadRequestException(
        `Archivo no válido (${file.originalname}): usá JPEG, PNG o WebP.`
      );
    }
    if (file.size > MAX_BYTES) {
      throw new BadRequestException(`"${file.originalname}" supera el límite de 8 MB.`);
    }
    if (!file.buffer?.length) {
      throw new BadRequestException(`No se pudo leer "${file.originalname}".`);
    }
    return [file];
  }

  /**
   * Una sola llamada vision → layout abstracto (stage + categories + groups).
   * Sin coordenadas; el frontend genera la geometría.
   */
  private async analyzeSalesMap(
    client: OpenAI,
    mapFile: Express.Multer.File
  ): Promise<AnalyzeMapResult> {
    const model = this.envService.get('EVENT_AI_EXTRACT_MODEL');
    const t0 = Date.now();

    try {
      const parsed = await this.mapVisionJson({
        label: 'map-layout',
        client,
        model,
        maxTokens: MAP_LAYOUT_MAX_TOKENS,
        system: MAP_LAYOUT_SYSTEM_PROMPT,
        userText: MAP_LAYOUT_USER_TEXT,
        images: this.flyerDataUrlParts([mapFile], 'high')
      });

      const result = normalizeMapLayout(parsed);
      const summary = summarizeMapLayout(result);

      if (!result.layout.groups.length) {
        throw new BadRequestException(
          'No se detectó estructura de mapa. Probá con una imagen más nítida del plano.'
        );
      }

      this.logger.log(
        `[MAP] Layout: ${Date.now() - t0} ms — groups=${summary.groups}, labels=${summary.labels}, ` +
          `tables=${summary.tables}, boxes=${summary.boxes}, palcos=${summary.palcos}, zones=${summary.zones}, ` +
          `freeform=${summary.freeform}, geometryFallback=${summary.requiresGeometryFallback}`
      );
      this.logger.log(`[MAP] Total: ${Date.now() - t0} ms`);
      return result;
    } catch (err) {
      this.logger.warn(`[MAP] Total (failed): ${Date.now() - t0} ms`);
      if (
        err instanceof BadRequestException ||
        err instanceof ServiceUnavailableException ||
        err instanceof HttpException
      ) {
        throw err;
      }
      this.logger.error('OpenAI map analysis failed', err instanceof Error ? err.stack : err);
      throw new ServiceUnavailableException(
        this.friendlyOpenAiError(err, 'Error al analizar el mapa con OpenAI.')
      );
    }
  }

  private async mapVisionJson(params: {
    label: string;
    client: OpenAI;
    model: string;
    maxTokens: number;
    system: string;
    userText: string;
    images: ChatCompletionContentPart[];
  }): Promise<Record<string, unknown>> {
    let lastEmptyDetail = '';

    for (let emptyAttempt = 1; emptyAttempt <= MAP_EMPTY_CONTENT_RETRIES; emptyAttempt++) {
      const response = await this.withTransientRetry(params.label, () =>
        params.client.chat.completions.create({
          model: params.model,
          max_tokens: params.maxTokens,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: params.system },
            {
              role: 'user',
              content: [{ type: 'text', text: params.userText }, ...params.images]
            }
          ]
        })
      );

      const message = response.choices[0]?.message;
      const raw = message?.content?.trim();
      const finishReason = response.choices[0]?.finish_reason;
      const refusal =
        message && typeof message === 'object' && 'refusal' in message
          ? String((message as { refusal?: unknown }).refusal ?? '')
          : '';

      if (!raw) {
        lastEmptyDetail = `finish_reason=${finishReason ?? 'unknown'}${
          refusal ? ` refusal=${refusal.slice(0, 200)}` : ''
        }`;
        this.logger.warn(
          `${params.label}: empty content (${lastEmptyDetail}), attempt ${emptyAttempt}/${MAP_EMPTY_CONTENT_RETRIES}`
        );
        if (emptyAttempt < MAP_EMPTY_CONTENT_RETRIES) {
          await this.sleep(TRANSIENT_BASE_DELAY_MS * emptyAttempt);
          continue;
        }
        throw new ServiceUnavailableException(
          `OpenAI no devolvió datos del mapa (${params.label}).`
        );
      }

      if (finishReason === 'length') {
        this.logger.warn(
          `${params.label}: hit max_tokens (finish_reason=length); attempting truncated JSON repair`
        );
      }

      try {
        return parseJsonObjectLoose(raw);
      } catch (parseErr) {
        this.logger.error(
          `${params.label} JSON parse failed (finish_reason=${finishReason ?? 'unknown'}, chars=${raw.length})`,
          parseErr instanceof Error ? parseErr.message : parseErr
        );
        throw new ServiceUnavailableException(
          'OpenAI devolvió un JSON incompleto del mapa. Reintentá el análisis.'
        );
      }
    }

    throw new ServiceUnavailableException(
      `OpenAI no devolvió datos del mapa (${params.label}${
        lastEmptyDetail ? `: ${lastEmptyDetail}` : ''
      }).`
    );
  }

    private createClient(apiKey: string, timeoutMs: number): OpenAI {
    return new OpenAI({
      apiKey,
      timeout: timeoutMs,
      maxRetries: 0 // reintentos los controlamos nosotros
    });
  }

  private async assertWithinQuota(userId: string): Promise<void> {
    const maxHour = this.envService.get('EVENT_AI_MAX_PER_HOUR');
    // 0 = sin límite horario
    if (!maxHour || maxHour <= 0) return;

    const hourKey = `event-ai:hour:${userId}`;
    const usedHour = await this.redisService.getCounter(hourKey);

    if (usedHour >= maxHour) {
      throw new HttpException(
        `Límite de IA alcanzado: máximo ${maxHour} análisis por hora. Probá más tarde.`,
        HttpStatus.TOO_MANY_REQUESTS
      );
    }
  }

  private async consumeQuota(userId: string): Promise<void> {
    const maxHour = this.envService.get('EVENT_AI_MAX_PER_HOUR');
    if (!maxHour || maxHour <= 0) return;
    await this.redisService.incrWithExpire(`event-ai:hour:${userId}`, HOUR_TTL_SEC);
  }

  private validateFiles(files: Express.Multer.File[] | undefined): Express.Multer.File[] {
    if (!files?.length) {
      throw new BadRequestException('Subí el flyer principal (campo multipart "flyers").');
    }
    if (files.length > MAX_FLYERS) {
      throw new BadRequestException('Solo se acepta 1 flyer (el principal) para análisis y banner.');
    }
    for (const file of files) {
      const mime = (file.mimetype || '').toLowerCase();
      if (!ALLOWED_MIME.has(mime)) {
        throw new BadRequestException(
          `Archivo no válido (${file.originalname}): usá JPEG, PNG o WebP.`
        );
      }
      if (file.size > MAX_BYTES) {
        throw new BadRequestException(`"${file.originalname}" supera el límite de 8 MB.`);
      }
      if (!file.buffer?.length) {
        throw new BadRequestException(`No se pudo leer "${file.originalname}".`);
      }
    }
    return files;
  }

  private normalizeMime(mime: string | undefined): string {
    const m = (mime || 'image/jpeg').toLowerCase();
    return m === 'image/jpg' ? 'image/jpeg' : m;
  }

  private flyerDataUrlParts(
    flyers: Express.Multer.File[],
    detail?: 'low' | 'high'
  ): ChatCompletionContentPart[] {
    return flyers.map(file => {
      const mime = this.normalizeMime(file.mimetype);
      return {
        type: 'image_url' as const,
        image_url: {
          url: `data:${mime};base64,${file.buffer.toString('base64')}`,
          ...(detail ? { detail } : {})
        }
      };
    });
  }

  private isTransientOpenAiError(err: unknown): boolean {
    if (err instanceof APIError) {
      const status = err.status ?? 0;
      return status === 429 || status >= 500;
    }
    const msg = err instanceof Error ? err.message : String(err ?? '');
    return (
      msg.includes('429') ||
      msg.includes('rate_limit') ||
      msg.includes('Rate limit') ||
      msg.includes('503') ||
      msg.includes('502') ||
      msg.includes('overloaded') ||
      msg.includes('timeout') ||
      msg.includes('ETIMEDOUT')
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /** Hasta 3 intentos solo si OpenAI responde 429/5xx. */
  private async withTransientRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= TRANSIENT_MAX_ATTEMPTS; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        if (!this.isTransientOpenAiError(err) || attempt === TRANSIENT_MAX_ATTEMPTS) {
          throw err;
        }
        const delay = TRANSIENT_BASE_DELAY_MS * attempt;
        this.logger.warn(
          `${label}: OpenAI saturado/rate-limit (intento ${attempt}/${TRANSIENT_MAX_ATTEMPTS}), reintento en ${delay}ms`
        );
        await this.sleep(delay);
      }
    }
    throw lastErr;
  }

  private friendlyOpenAiError(err: unknown, fallback: string): string {
    if (this.isTransientOpenAiError(err)) {
      return 'OpenAI está saturado o con límite de tasa en este momento. Esperá un minuto y reintentá Analizar con IA.';
    }
    if (err instanceof APIError && err.message?.trim()) {
      return err.message;
    }
    if (err instanceof Error && err.message.trim()) {
      return err.message;
    }
    return fallback;
  }

  private async extractEventData(
    client: OpenAI,
    flyers: Express.Multer.File[]
  ): Promise<FlyerEventExtraction> {
    const model = this.envService.get('EVENT_AI_EXTRACT_MODEL');
    const userText = 'Extract event data from this flyer. Return JSON only.';

    try {
      const response = await this.withTransientRetry('extract', () =>
        client.chat.completions.create({
          model,
          max_tokens: EXTRACT_MAX_OUTPUT_TOKENS,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: buildExtractionSystemPrompt() },
            {
              role: 'user',
              content: [{ type: 'text', text: userText }, ...this.flyerDataUrlParts(flyers)]
            }
          ]
        })
      );

      const raw = response.choices[0]?.message?.content?.trim();
      if (!raw) {
        throw new ServiceUnavailableException('OpenAI no devolvió extracción de datos.');
      }
      return this.normalizeExtraction(JSON.parse(raw) as Partial<FlyerEventExtraction>);
    } catch (err) {
      if (err instanceof BadRequestException || err instanceof ServiceUnavailableException) {
        throw err;
      }
      if (err instanceof HttpException) throw err;
      this.logger.error('OpenAI extraction failed', err instanceof Error ? err.stack : err);
      throw new ServiceUnavailableException(
        this.friendlyOpenAiError(err, 'Error al extraer datos del flyer con OpenAI.')
      );
    }
  }

  private normalizeExtraction(raw: Partial<FlyerEventExtraction>): FlyerEventExtraction {
    const ticketTypes = Array.isArray(raw.ticketTypes)
      ? raw.ticketTypes
          .filter(t => t && typeof t.name === 'string' && t.name.trim())
          .slice(0, 12) // hard cap: no listas enormes inventadas
          .map(t => ({
            name: String(t.name).trim().slice(0, 80),
            price: Number(t.price) || 0,
            quantity:
              t.quantity === null || t.quantity === undefined
                ? null
                : Number.isFinite(Number(t.quantity))
                  ? Math.min(Math.max(0, Number(t.quantity)), 100_000)
                  : null
          }))
      : [];

    return {
      title: String(raw.title ?? '')
        .trim()
        .slice(0, 200),
      description: String(raw.description ?? '')
        .trim()
        .slice(0, 4000),
      startDate: coerceExtractionDateYear(String(raw.startDate ?? '').trim()),
      endDate: coerceExtractionDateYear(String(raw.endDate ?? '').trim()),
      venueName: String(raw.venueName ?? '')
        .trim()
        .slice(0, 200),
      venueAddress: String(raw.venueAddress ?? '')
        .trim()
        .slice(0, 300),
      venueCity: String(raw.venueCity ?? '')
        .trim()
        .slice(0, 120),
      venueCountry:
        String(raw.venueCountry ?? '')
          .trim()
          .slice(0, 80) || 'Argentina',
      googleMapsQuery: String(raw.googleMapsQuery ?? '')
        .trim()
        .slice(0, 300),
      ticketTypes,
      artistsLineup:
        raw.artistsLineup === null || raw.artistsLineup === undefined
          ? null
          : String(raw.artistsLineup).trim().slice(0, 500) || null
    };
  }

  private async generateHero(
    client: OpenAI,
    flyers: Express.Multer.File[]
  ): Promise<HeroGenerationResult> {
    const primaryModel = this.envService.get('EVENT_AI_IMAGE_MODEL');
    const fallbackModel = this.envService.get('EVENT_AI_IMAGE_FALLBACK_MODEL');
    const quality = this.envService.get('EVENT_AI_IMAGE_QUALITY');
    const size = this.envService.get('EVENT_AI_IMAGE_SIZE');
    const format = this.envService.get('EVENT_AI_IMAGE_FORMAT');
    const compression = this.envService.get('EVENT_AI_IMAGE_COMPRESSION');
    // Solo el flyer principal como referencia visual (NO el JSON de extracción)
    const primary = flyers[0];

    const buildResult = (
      generated: { b64: string; usage: HeroImageUsage | null },
      modelUsed: string,
      usedFallback: boolean
    ): HeroGenerationResult => ({
      b64: generated.b64,
      mimeType: this.formatToMime(format),
      imageModelUsed: modelUsed,
      generationQuality: quality,
      generationSize: size,
      generationFormat: format,
      fallbackUsed: usedFallback,
      usage: generated.usage
    });

    try {
      try {
        const generated = await this.generateHeroWithModel(
          client,
          primary,
          primaryModel,
          { quality, size, format, compression },
          'hero'
        );
        const result = buildResult(generated, primaryModel, false);
        this.logHeroGeneration(result, compression);
        return result;
      } catch (err) {
        if (
          !this.isTransientOpenAiError(err) ||
          !fallbackModel?.trim() ||
          fallbackModel.trim() === primaryModel
        ) {
          throw err;
        }
        this.logger.warn(
          `Hero primary model "${primaryModel}" saturado; intentando fallback "${fallbackModel}"`
        );
        const generated = await this.generateHeroWithModel(
          client,
          primary,
          fallbackModel.trim(),
          { quality, size, format, compression },
          'hero-fallback'
        );
        const result = buildResult(generated, fallbackModel.trim(), true);
        this.logHeroGeneration(result, compression);
        return result;
      }
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      if (err instanceof HttpException) throw err;
      this.logger.error('OpenAI hero generation failed', err instanceof Error ? err.stack : err);
      throw new ServiceUnavailableException(
        this.friendlyOpenAiError(err, 'Error al generar el hero con OpenAI.')
      );
    }
  }

  private formatToMime(format: HeroImageFormat): HeroImageMimeType {
    if (format === 'webp') return 'image/webp';
    if (format === 'jpeg') return 'image/jpeg';
    return 'image/png';
  }

  private logHeroGeneration(result: HeroGenerationResult, compression: number): void {
    const u = result.usage;
    this.logger.log(
      `Hero generated model=${result.imageModelUsed} size=${result.generationSize} ` +
        `quality=${result.generationQuality} format=${result.generationFormat} ` +
        `compression=${compression} fallback_used=${result.fallbackUsed} ` +
        `input_tokens=${u?.input_tokens ?? 'n/a'} ` +
        `image_tokens=${u?.input_tokens_details.image_tokens ?? 'n/a'} ` +
        `text_tokens=${u?.input_tokens_details.text_tokens ?? 'n/a'} ` +
        `output_tokens=${u?.output_tokens ?? 'n/a'} ` +
        `total_tokens=${u?.total_tokens ?? 'n/a'}`
    );
  }

  private normalizeImageUsage(raw: unknown): HeroImageUsage | null {
    if (!raw || typeof raw !== 'object') return null;
    const u = raw as {
      input_tokens?: number;
      output_tokens?: number;
      total_tokens?: number;
      input_tokens_details?: { image_tokens?: number; text_tokens?: number };
    };
    return {
      input_tokens: typeof u.input_tokens === 'number' ? u.input_tokens : null,
      input_tokens_details: {
        image_tokens:
          typeof u.input_tokens_details?.image_tokens === 'number'
            ? u.input_tokens_details.image_tokens
            : null,
        text_tokens:
          typeof u.input_tokens_details?.text_tokens === 'number'
            ? u.input_tokens_details.text_tokens
            : null
      },
      output_tokens: typeof u.output_tokens === 'number' ? u.output_tokens : null,
      total_tokens: typeof u.total_tokens === 'number' ? u.total_tokens : null
    };
  }

  /**
   * gpt-image-2 always processes reference images at high fidelity; sending
   * `input_fidelity` can 400. Legacy gpt-image-1 / 1.5 accept the param.
   */
  private shouldSendInputFidelity(model: string): boolean {
    const m = model.toLowerCase();
    if (m.includes('gpt-image-2')) return false;
    if (m.includes('mini')) return false;
    return m.includes('gpt-image-1');
  }

  private async generateHeroWithModel(
    client: OpenAI,
    flyer: Express.Multer.File,
    model: string,
    opts: {
      quality: HeroImageQuality;
      size: string;
      format: HeroImageFormat;
      compression: number;
    },
    label: string
  ): Promise<{ b64: string; usage: HeroImageUsage | null }> {
    const mime = this.normalizeMime(flyer.mimetype);
    const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
    const prompt =
      `${HERO_FROM_FLYER_PROMPT}\n\n` +
      'Generate exactly ONE hero image now. Do not ask questions. Do not produce extra variants.\n' +
      'Reminder: TOP empty air is the reference — BOTTOM empty air under names/title MUST match it exactly (shift the whole block UP if names sit near the bottom). ' +
      'RIGHT empty gap should be ~50% smaller: keep the cluster close to the right edge with only a small safe pad (~60–120px). ' +
      'LEFT third stays dark empty space with ZERO logos/seals/venue marks.';

    const response = await this.withTransientRetry(label, async () => {
      // Flyer ORIGINAL como input visual del edit (no JSON de gpt-4o)
      const imageFile = await toFile(flyer.buffer, `flyer.${ext}`, { type: mime });
      return client.images.edit({
        model,
        image: imageFile,
        prompt,
        size: opts.size,
        quality: opts.quality,
        output_format: opts.format,
        ...(opts.format === 'png' ? {} : { output_compression: opts.compression }),
        n: 1,
        ...(this.shouldSendInputFidelity(model) ? { input_fidelity: 'high' as const } : {})
      });
    });

    const b64 = response.data?.[0]?.b64_json;
    if (!b64) {
      throw new ServiceUnavailableException('OpenAI no devolvió la imagen hero.');
    }
    return {
      b64,
      usage: this.normalizeImageUsage(response.usage)
    };
  }

  /**
   * Soft-fail: siempre devuelve sectores utilizables.
   * Layout heurístico por tandas; OpenAI opcional (si falla, warning + heurística).
   */
  async suggestMapSectors(input: {
    ticketTypes: Array<{ uuid: string; name: string }>;
    flyerUrl?: string | null;
  }): Promise<SuggestMapSectorsResult> {
    const heuristic = this.heuristicSectors(input.ticketTypes);
    if (!input.ticketTypes.length) {
      return { sectors: [], warning: 'No hay tandas para sugerir sectores.' };
    }

    const apiKey = this.envService.get('OPENIA_API_KEY');
    if (!apiKey?.trim()) {
      return {
        sectors: heuristic,
        warning: 'Sin OPENIA_API_KEY: sectores sugeridos en grilla. Ajustalos a mano sobre el plano.'
      };
    }

    try {
      const client = this.createClient(apiKey.trim(), 45_000);
      const model = this.envService.get('EVENT_AI_EXTRACT_MODEL');
      const names = input.ticketTypes.map(t => t.name).join(', ');
      const response = await this.withTransientRetry('map-sectors', () =>
        client.chat.completions.create({
          model,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'user',
              content:
                `Suggest rectangle sectors for an event floor-plan editor.\n` +
                `Ticket types (link each sector to the matching names): ${names}\n` +
                `Return ONLY JSON: { "sectors": [{ "name": string, "x": 0-1, "y": 0-1, "w": 0-1, "h": 0-1 }] }\n` +
                `Rects must stay within [0,1], not overlap heavily, names should match ticket types when possible.`
            }
          ]
        })
      );

      const text = response.choices[0]?.message?.content?.trim() ?? '';
      const parsed = JSON.parse(text) as { sectors?: Array<Record<string, unknown>> };
      if (!Array.isArray(parsed.sectors) || !parsed.sectors.length) {
        return {
          sectors: heuristic,
          warning: 'La IA no devolvió sectores útiles; usamos una grilla automática.'
        };
      }

      const sectors = parsed.sectors.map((raw, i) => {
        const name = String(
          raw.name ?? input.ticketTypes[i % input.ticketTypes.length]?.name ?? `Sector ${i + 1}`
        );
        const match = input.ticketTypes.find(t => t.name.toLowerCase() === name.toLowerCase());
        const tt = match ?? input.ticketTypes[i % input.ticketTypes.length];
        return {
          name,
          x: clamp01(Number(raw.x) || 0.05),
          y: clamp01(Number(raw.y) || 0.05),
          w: Math.max(0.08, Math.min(0.9, Number(raw.w) || 0.25)),
          h: Math.max(0.08, Math.min(0.9, Number(raw.h) || 0.2)),
          color: SECTOR_COLORS[i % SECTOR_COLORS.length],
          ticketTypeUuids: tt ? [tt.uuid] : []
        };
      });

      return { sectors, warning: null };
    } catch (err) {
      this.logger.warn(
        `suggestMapSectors soft-fail: ${err instanceof Error ? err.message : String(err)}`
      );
      return {
        sectors: heuristic,
        warning:
          'No se pudo sugerir con IA; usamos una grilla automática. Podés mover los sectores a mano.'
      };
    }
  }

  private heuristicSectors(
    ticketTypes: Array<{ uuid: string; name: string }>
  ): SuggestMapSectorsResult['sectors'] {
    const n = ticketTypes.length;
    if (!n) return [];
    const cols = Math.min(3, n);
    const rows = Math.ceil(n / cols);
    const gap = 0.04;
    const cellW = (1 - gap * (cols + 1)) / cols;
    const cellH = (1 - gap * (rows + 1)) / rows;

    return ticketTypes.map((tt, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      return {
        name: tt.name,
        x: gap + col * (cellW + gap),
        y: gap + row * (cellH + gap),
        w: cellW,
        h: cellH,
        color: SECTOR_COLORS[i % SECTOR_COLORS.length],
        ticketTypeUuids: [tt.uuid]
      };
    });
  }
}

const SECTOR_COLORS = ['#ff2bd6', '#3ddc97', '#ffb020', '#8b5cf6', '#4da3ff', '#ff4d6d'];

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
