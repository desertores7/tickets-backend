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
import { GoogleGenAI, Modality, ThinkingLevel, type Part } from '@google/genai';
import { HERO_FROM_FLYER_PROMPT } from '../../const/hero-from-flyer.prompt';
import {
  AnalyzeFlyersResult,
  FlyerEventExtraction,
  IEventAiService,
  SuggestMapSectorsResult
} from '../contracts/ievent-ai.service';

const MAX_FLYERS = 2;
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB c/u — menos tokens de entrada
const ALLOWED_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

/** Extracción: timeout corto. Hero: mucho más largo (imagen tarda 2–4 min). */
const EXTRACT_TIMEOUT_MS = 90_000;
const HERO_TIMEOUT_MS = 5 * 60_000;
const EXTRACT_MAX_OUTPUT_TOKENS = 1200;
const HOUR_TTL_SEC = 60 * 60;
const DAY_TTL_SEC = 24 * 60 * 60;
/** Reintentos solo ante 503 high-demand de Google (no bucles infinitos). */
const TRANSIENT_MAX_ATTEMPTS = 3;
const TRANSIENT_BASE_DELAY_MS = 2_500;

const EXTRACTION_SYSTEM = `You extract structured event data from 1–2 promotional flyer images for an Argentine ticketing platform.

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
- startDate / endDate: prefer ISO 8601 (YYYY-MM-DDTHH:mm:ss). If only a date is shown, assume start 20:00 and end 23:00. If year missing, assume next occurrence from today. If end missing, start + 3 hours.
- venueCountry default "Argentina".
- googleMapsQuery: best single Maps search string.
- ticketTypes only if prices/sectors appear; price in ARS number; quantity null if unknown.
- artistsLineup: comma-separated names or null.`;

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
    const apiKey = this.envService.get('GEMINI_API_KEY');
    if (!apiKey?.trim()) {
      throw new ServiceUnavailableException(
        'GEMINI_API_KEY no está configurada en el servidor. Agregala al .env del backend.'
      );
    }

    await this.assertWithinQuota(userId);

    const apiKeyTrimmed = apiKey.trim();

    // Exactamente hasta 2 llamadas HTTP a Gemini. Sin bucles ni reintentos.
    const extractClient = new GoogleGenAI({
      apiKey: apiKeyTrimmed,
      httpOptions: { timeout: EXTRACT_TIMEOUT_MS }
    });
    const extraction = await this.extractEventData(extractClient, flyers);

    const heroClient = new GoogleGenAI({
      apiKey: apiKeyTrimmed,
      httpOptions: { timeout: HERO_TIMEOUT_MS }
    });

    let heroImageBase64: string | null = null;
    let heroWarning: string | null = null;
    try {
      heroImageBase64 = await this.generateHero(heroClient, flyers);
    } catch (err) {
      // No tumbar la extracción: el productor puede seguir editando y subir banner a mano
      const msg =
        err instanceof Error ? err.message : 'No se pudo generar el hero con Gemini.';
      this.logger.warn(`Hero generation soft-fail: ${msg}`);
      heroWarning =
        msg.includes('aborted') || msg.includes('Abort')
          ? 'La generación del hero tardó demasiado. Los datos se completaron; subí el banner a mano o reintentá Analizar.'
          : `Hero no generado: ${msg}. Los datos del flyer sí se aplicaron.`;
    }

    await this.consumeQuota(userId);

    return {
      extraction,
      heroImageBase64,
      heroMimeType: 'image/png',
      heroWarning
    };
  }

  private async assertWithinQuota(userId: string): Promise<void> {
    const maxHour = this.envService.get('EVENT_AI_MAX_PER_HOUR');
    const maxDay = this.envService.get('EVENT_AI_MAX_PER_DAY');
    const hourKey = `event-ai:hour:${userId}`;
    const dayKey = `event-ai:day:${userId}`;

    const [usedHour, usedDay] = await Promise.all([
      this.redisService.getCounter(hourKey),
      this.redisService.getCounter(dayKey)
    ]);

    if (usedHour >= maxHour) {
      throw new HttpException(
        `Límite de IA alcanzado: máximo ${maxHour} análisis por hora. Probá más tarde.`,
        HttpStatus.TOO_MANY_REQUESTS
      );
    }
    if (usedDay >= maxDay) {
      throw new HttpException(
        `Límite de IA alcanzado: máximo ${maxDay} análisis por día.`,
        HttpStatus.TOO_MANY_REQUESTS
      );
    }
  }

  private async consumeQuota(userId: string): Promise<void> {
    await Promise.all([
      this.redisService.incrWithExpire(`event-ai:hour:${userId}`, HOUR_TTL_SEC),
      this.redisService.incrWithExpire(`event-ai:day:${userId}`, DAY_TTL_SEC)
    ]);
  }

  private validateFiles(files: Express.Multer.File[] | undefined): Express.Multer.File[] {
    if (!files?.length) {
      throw new BadRequestException('Subí al menos 1 flyer (campo multipart "flyers").');
    }
    if (files.length > MAX_FLYERS) {
      throw new BadRequestException(`Máximo ${MAX_FLYERS} flyers.`);
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

  /** Gemini rechaza `image/jpg`; normalizamos al MIME estándar. */
  private normalizeMime(mime: string | undefined): string {
    const m = (mime || 'image/jpeg').toLowerCase();
    return m === 'image/jpg' ? 'image/jpeg' : m;
  }

  private flyerParts(flyers: Express.Multer.File[]): Part[] {
    return flyers.map(file => ({
      inlineData: {
        mimeType: this.normalizeMime(file.mimetype),
        data: file.buffer.toString('base64')
      }
    }));
  }

  private isGeminiHighDemand(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err ?? '');
    return (
      msg.includes('"code":503') ||
      msg.includes('"status":"UNAVAILABLE"') ||
      msg.includes('high demand') ||
      msg.includes('UNAVAILABLE')
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /** Hasta 3 intentos solo si Google responde saturado (503). */
  private async withTransientRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= TRANSIENT_MAX_ATTEMPTS; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        if (!this.isGeminiHighDemand(err) || attempt === TRANSIENT_MAX_ATTEMPTS) {
          throw err;
        }
        const delay = TRANSIENT_BASE_DELAY_MS * attempt;
        this.logger.warn(
          `${label}: Gemini saturado (intento ${attempt}/${TRANSIENT_MAX_ATTEMPTS}), reintento en ${delay}ms`
        );
        await this.sleep(delay);
      }
    }
    throw lastErr;
  }

  private friendlyGeminiError(err: unknown, fallback: string): string {
    if (this.isGeminiHighDemand(err)) {
      return 'Gemini está saturado en este momento (alta demanda). Esperá un minuto y reintentá Analizar con IA.';
    }
    if (err instanceof Error && err.message.trim()) {
      // Evitar dump JSON crudo al productor
      if (err.message.includes('"error"') && err.message.includes('message')) {
        try {
          const parsed = JSON.parse(err.message) as { error?: { message?: string } };
          if (parsed.error?.message) return parsed.error.message;
        } catch {
          /* keep raw below */
        }
      }
      return err.message;
    }
    return fallback;
  }

  private async extractEventData(
    client: GoogleGenAI,
    flyers: Express.Multer.File[]
  ): Promise<FlyerEventExtraction> {
    const model = this.envService.get('EVENT_AI_EXTRACT_MODEL');
    const userText =
      flyers.length === 1
        ? 'Extract event data from this flyer. Return JSON only.'
        : 'Extract event data. Image 1 is usually the main flyer; image 2 may have venue map / ticket prices. Merge into one JSON only.';

    try {
      const response = await this.withTransientRetry('extract', () =>
        client.models.generateContent({
          model,
          contents: [
            {
              role: 'user',
              parts: [{ text: `${EXTRACTION_SYSTEM}\n\n${userText}` }, ...this.flyerParts(flyers)]
            }
          ],
          config: {
            responseMimeType: 'application/json',
            maxOutputTokens: EXTRACT_MAX_OUTPUT_TOKENS,
            // Gemini 3.x: thinkingBudget provoca 400; usar thinkingLevel. Temperature baja tampoco recomendada.
            thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL }
          }
        })
      );

      const raw = response.text?.trim();
      if (!raw) {
        throw new ServiceUnavailableException('Gemini no devolvió extracción de datos.');
      }
      return this.normalizeExtraction(JSON.parse(raw) as Partial<FlyerEventExtraction>);
    } catch (err) {
      if (err instanceof BadRequestException || err instanceof ServiceUnavailableException) {
        throw err;
      }
      if (err instanceof HttpException) throw err;
      this.logger.error('Gemini extraction failed', err instanceof Error ? err.stack : err);
      throw new ServiceUnavailableException(
        this.friendlyGeminiError(err, 'Error al extraer datos del flyer con Gemini.')
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
      startDate: String(raw.startDate ?? '').trim(),
      endDate: String(raw.endDate ?? '').trim(),
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
    client: GoogleGenAI,
    flyers: Express.Multer.File[]
  ): Promise<string> {
    const primaryModel = this.envService.get('EVENT_AI_IMAGE_MODEL');
    const fallbackModel = this.envService.get('EVENT_AI_IMAGE_FALLBACK_MODEL');
    // Solo el flyer principal como referencia: menos costo / tokens de imagen
    const primary = flyers[0];

    try {
      try {
        return await this.generateHeroWithModel(client, primary, primaryModel, 'hero');
      } catch (err) {
        if (
          !this.isGeminiHighDemand(err) ||
          !fallbackModel?.trim() ||
          fallbackModel.trim() === primaryModel
        ) {
          throw err;
        }
        this.logger.warn(
          `Hero primary model "${primaryModel}" saturado; intentando fallback "${fallbackModel}"`
        );
        return await this.generateHeroWithModel(
          client,
          primary,
          fallbackModel.trim(),
          'hero-fallback'
        );
      }
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      if (err instanceof HttpException) throw err;
      this.logger.error('Gemini hero generation failed', err instanceof Error ? err.stack : err);
      throw new ServiceUnavailableException(
        this.friendlyGeminiError(err, 'Error al generar el hero con Gemini.')
      );
    }
  }

  private async generateHeroWithModel(
    client: GoogleGenAI,
    flyer: Express.Multer.File,
    model: string,
    label: string
  ): Promise<string> {
    const response = await this.withTransientRetry(label, () =>
      client.models.generateContent({
        model,
        contents: [
          {
            role: 'user',
            parts: [
              {
                text:
                  `${HERO_FROM_FLYER_PROMPT}\n\n` +
                  'Generate exactly ONE hero image now. Do not ask questions. Do not produce extra variants.'
              },
              {
                inlineData: {
                  mimeType: this.normalizeMime(flyer.mimetype),
                  data: flyer.buffer.toString('base64')
                }
              }
            ]
          }
        ],
        config: {
          responseModalities: [Modality.TEXT, Modality.IMAGE],
          imageConfig: {
            // Composición de talento (lado derecho del hero); el FE arma el difuminado izquierdo
            aspectRatio: '3:4',
            imageSize: '1K'
          },
          candidateCount: 1,
          httpOptions: { timeout: HERO_TIMEOUT_MS }
        }
      })
    );

    const b64 = this.extractImageBase64(response);
    if (!b64) {
      throw new ServiceUnavailableException('Gemini no devolvió la imagen hero.');
    }
    return b64;
  }

  private extractImageBase64(response: {
    data?: string;
    candidates?: Array<{ content?: { parts?: Part[] } }>;
  }): string | null {
    // SDK helper: concatenation of inline data parts
    if (typeof response.data === 'string' && response.data.length > 0) {
      return response.data;
    }
    const parts = response.candidates?.[0]?.content?.parts ?? [];
    for (const part of parts) {
      if (part.inlineData?.data) {
        return part.inlineData.data;
      }
    }
    return null;
  }

  /**
   * Soft-fail: siempre devuelve sectores utilizables.
   * Layout heurístico por tandas; Gemini opcional (si falla, warning + heurística).
   */
  async suggestMapSectors(input: {
    ticketTypes: Array<{ uuid: string; name: string }>;
    flyerUrl?: string | null;
  }): Promise<SuggestMapSectorsResult> {
    const heuristic = this.heuristicSectors(input.ticketTypes);
    if (!input.ticketTypes.length) {
      return { sectors: [], warning: 'No hay tandas para sugerir sectores.' };
    }

    const apiKey = this.envService.get('GEMINI_API_KEY');
    if (!apiKey?.trim()) {
      return {
        sectors: heuristic,
        warning: 'Sin GEMINI_API_KEY: sectores sugeridos en grilla. Ajustalos a mano sobre el plano.'
      };
    }

    try {
      const client = new GoogleGenAI({ apiKey });
      const model = this.envService.get('EVENT_AI_EXTRACT_MODEL');
      const names = input.ticketTypes.map(t => t.name).join(', ');
      const response = await this.withTransientRetry('map-sectors', () =>
        client.models.generateContent({
          model,
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text:
                    `Suggest rectangle sectors for an event floor-plan editor.\n` +
                    `Ticket types (link each sector to the matching names): ${names}\n` +
                    `Return ONLY JSON: { "sectors": [{ "name": string, "x": 0-1, "y": 0-1, "w": 0-1, "h": 0-1 }] }\n` +
                    `Rects must stay within [0,1], not overlap heavily, names should match ticket types when possible.`
                }
              ]
            }
          ],
          config: {
            responseMimeType: 'application/json',
            httpOptions: { timeout: 45_000 }
          }
        })
      );

      const text =
        typeof response.text === 'string'
          ? response.text
          : (response.candidates?.[0]?.content?.parts ?? [])
              .map(p => ('text' in p && typeof p.text === 'string' ? p.text : ''))
              .join('');
      const parsed = JSON.parse(text) as { sectors?: Array<Record<string, unknown>> };
      if (!Array.isArray(parsed.sectors) || !parsed.sectors.length) {
        return {
          sectors: heuristic,
          warning: 'La IA no devolvió sectores útiles; usamos una grilla automática.'
        };
      }

      const sectors = parsed.sectors.map((raw, i) => {
        const name = String(raw.name ?? input.ticketTypes[i % input.ticketTypes.length]?.name ?? `Sector ${i + 1}`);
        const match = input.ticketTypes.find(
          t => t.name.toLowerCase() === name.toLowerCase()
        );
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
        warning: 'No se pudo sugerir con IA; usamos una grilla automática. Podés mover los sectores a mano.'
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
