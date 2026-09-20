import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException
} from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import { DBRepository } from '@config/db/db.repository';
import { EventAiMapRunEntity } from '@config/db/entities/tickets/event_ai_map_run.entity';
import { EnvService } from '@config/env/env.service';
import { RedisService } from '@config/redis/redis.service';
import OpenAI, { APIError, toFile } from 'openai';
import type { ChatCompletionContentPart } from 'openai/resources/chat/completions';
import sharp from 'sharp';
import { HERO_FROM_FLYER_PROMPT } from '../../const/hero-from-flyer.prompt';
import { HERO_MOBILE_FROM_FLYER_PROMPT } from '../../const/hero-mobile-from-flyer.prompt';
import {
  MAP_LAYOUT_SYSTEM_PROMPT,
  MAP_LAYOUT_USER_TEXT
} from '../../const/map-layout.prompt';
import {
  MAP_REPAIR_SYSTEM_PROMPT,
  buildMapRepairUserText
} from '../../const/map-repair.prompt';
import {
  EVENT_SOCIAL_NETWORKS,
  type EventSocialNetwork
} from '../../const/event-social-network.const';
import {
  AnalyzeFlyersResult,
  AnalyzeMapResult,
  FlyerEventExtraction,
  FlyerSocialLinkExtraction,
  MapLayoutWarning,
  HeroImageMimeType,
  HeroImageUsage,
  IEventAiService,
  SuggestMapSectorItem,
  SuggestMapSectorsResult
} from '../contracts/ievent-ai.service';
import {
  MAP_GRID_SIZE,
  MapSectorLayout,
  boxToCell,
  cellToBox,
  defaultStageLayout,
  layoutBounds,
  layoutKeys,
  packLayouts
} from '../core/map-grid';
import { rasterizeMapAnalysis } from './map-grid-rasterizer';
import { toGridAnalysis } from '../core/map-grid-analysis';
import {
  normalizeMapLayout,
  summarizeMapLayout
} from './map-layout-normalizer';
import {
  VISION_REPAIR_CODES,
  collectDeclaredCounts,
  fixStructuralIssues,
  mergeRepairedGroups,
  needsVisionRepair,
  verifyMapLayout
} from './map-layout-verifier';
import { parseJsonObjectLoose } from './parse-json-loose';

const MAX_FLYERS = 1;
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB c/u — menos tokens de entrada
const ALLOWED_MIME = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

/** Extracción: timeout corto. Hero: mucho más largo (imagen tarda). */
const EXTRACT_TIMEOUT_MS = 90_000;
/**
 * Una sola vision call de layout abstracto (sin geometría por elemento).
 * El tiempo casi entero es OpenAI (razonamiento + visión); el normalizer es ms.
 */
const MAP_LAYOUT_TIMEOUT_MS = 180_000;
/** Cap de salida+reasoning: con high/32k el modelo se demora de más. */
const MAP_LAYOUT_MAX_TOKENS = 16_000;
const MAP_EMPTY_CONTENT_RETRIES = 2;
/**
 * Una sola pasada de reparación por análisis.
 *
 * Si la primera corrección no alcanzó, insistir sale caro y casi nunca mejora:
 * el mapa se entrega con lo que hay y el productor lo termina en el editor.
 */
const MAP_REPAIR_MAX_TOKENS = 12_000;
/**
 * Lado máximo del flyer enviado a visión. 1536 baja patches/latencia vs 2048
 * sin perder legibilidad de labels en planos típicos de sala.
 */
const MAP_VISION_MAX_EDGE_PX = 1536;
const MAP_VISION_JPEG_QUALITY = 82;
const HERO_TIMEOUT_MS = 5 * 60_000;
const EXTRACT_MAX_OUTPUT_TOKENS = 2200;
const HOUR_TTL_SEC = 60 * 60;
/** Reintentos ante 429/5xx de OpenAI (no bucles infinitos). */
const TRANSIENT_MAX_ATTEMPTS = 3;
const TRANSIENT_BASE_DELAY_MS = 2_500;
/**
 * Size enviado a OpenAI para el mobile (portrait GPT Image).
 * Luego sharp lo lleva al canvas de salida (~7:10) a resolución retina
 * para full-bleed en móvil (~360–430 CSS × 2–3 DPR) sin pixelar.
 *
 * Desktop es independiente: usa EVENT_AI_IMAGE_SIZE (default 2048×1152) y
 * se guarda tal cual, sin este downscale. No tocar el pipeline desktop acá.
 */
const MOBILE_HERO_AI_SIZE = '1024x1536';
/** Ancho suficiente para object-cover a 3× en phones típicos. */
const MOBILE_HERO_OUTPUT_WIDTH = 1080;
/** 7:10 respecto de 1080 (misma composición que el antiguo 350×500). */
const MOBILE_HERO_OUTPUT_HEIGHT = 1543;

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
- Your job is to TRANSCRIBE the text printed on the flyer (names, dates, venue, prices). Never identify or describe people from their faces: artist names come only from the printed text.
- Do exactly ONE extraction. Do not ask follow-up questions.
- Do not invent missing data. Prefer empty string / [] / null.
- Stay on task: only the JSON schema below. No markdown, no commentary, no tool calls.

Return ONLY a JSON object with this exact shape:
{
  "title": string,
  "description": string,
  "content": string,
  "startDate": string,
  "endDate": string,
  "venueName": string,
  "venueAddress": string,
  "venueCity": string,
  "venueCountry": string,
  "googleMapsQuery": string,
  "ticketTypes": [{ "name": string, "price": number, "quantity": number | null }],
  "artistsLineup": string | null,
  "socialLinks": [{ "network": string, "url": string, "label": string | null }]
}
Rules:
- title: event name as shown on the flyer (never invent a URL slug).
- description: SHORT card summary, Spanish (Argentina), 1–2 sentences, HARD LIMIT 180 characters. What it is + who plays + the strongest hook printed on the flyer. No emojis, no hashtags, no "no te lo pierdas", no prices, no addresses, no line breaks.
- content: long body for the public event page ("Sobre el evento"), Spanish (Argentina), professional and neutral — informative, not a sales pitch.
  * HTML only, and ONLY these tags: <p>, <strong>, <em>, <ul>, <li>, <br>. No headings, no links, no classes, no styles, no emojis, no markdown.
  * 2–3 short <p> paragraphs (the night/show, the artists and what the audience will find) plus, when the flyer prints practical data, ONE final <ul> with one <li> per item using a bold lead: <li><strong>Apertura:</strong> 22:00</li>, promos ("mujeres gratis hasta las 00:00"), cumpleañeros, edad mínima, dress code, accesos, estacionamiento, reservas.
  * Only facts printed on the flyer. Do NOT invent history, capacity, sponsors, ticket links, refund policies or anything not visible. If the flyer has almost no text, write one honest <p> and nothing else.
  * Never repeat the title as the first line and never restate the full date/venue block (they already have their own fields).
- Today is ${todayIso}. The current calendar year is ${year}.
- startDate / endDate: prefer ISO 8601 (YYYY-MM-DDTHH:mm:ss). If only a date is shown, assume start 20:00 and end 23:00. If end missing, start + 3 hours (or next day if overnight, e.g. OPEN 22HRS → end ~01:00).
- YEAR RULE (critical): Argentine flyers often show day+month only (e.g. "10 SAB OCT") with NO year. When the year is missing or ambiguous, you MUST use ${year}. Never default to 2023, 2024, or any year before ${year} unless that exact year is printed on the flyer.
- venueCity: the real city / locality ("Buenos Aires", "Córdoba", "Rosario"). A neighbourhood or zone printed on the flyer ("Microcentro", "Palermo", "Zona Norte") is NOT a city: it goes into venueAddress and venueCity holds the city it belongs to.
- venueAddress: street + number as printed, plus the neighbourhood when the flyer shows one.
- venueCountry default "Argentina".
- googleMapsQuery: best single Maps search string.
- ticketTypes only if prices/sectors appear; price in ARS number; quantity null if unknown.
- artistsLineup: comma-separated names or null.
- socialLinks: ONLY what the flyer prints, [] if nothing. network is one of "instagram" | "facebook" | "youtube" | "spotify" | "tiktok" | "x" | "whatsapp" | "website" | "other".
  * A phone number for reservas/entradas is network "whatsapp" and url is the number exactly as printed (the backend turns it into a wa.me link). label can say what it is ("Reservas").
  * Handles go as the full URL: @lugar on Instagram → "https://instagram.com/lugar".
  * Never invent accounts and never repeat the same account twice.`;
}

/** Tags que sobreviven en el “Contenido del evento” que escribe la IA. */
const AI_CONTENT_ALLOWED_TAGS = ['p', 'strong', 'em', 'b', 'i', 'ul', 'ol', 'li', 'br'];
/** Tags de bloque que se degradan a <p> en vez de descartarse. */
const AI_CONTENT_BLOCK_TO_P = ['div', 'section', 'article', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
const AI_CONTENT_MAX_CHARS = 8000;

/**
 * Whitelist de HTML para el contenido generado por la IA.
 *
 * El editor del productor es Tiptap y el render público sanitiza aparte, pero lo
 * que guardamos en la base tiene que entrar limpio: sin scripts, sin estilos y
 * sin tags que el editor no sepa representar (si no, el productor abre la tab y
 * ve su texto deformado).
 */
function sanitizeAiContentHtml(raw: unknown): string {
  const value = typeof raw === 'string' ? raw : '';
  if (!value.trim()) return '';

  let html = value
    .replace(/```+\s*html?/gi, ' ')
    .replace(/```+/g, ' ')
    .replace(/<\s*(script|style)[\s\S]*?<\s*\/\s*\1\s*>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');

  html = html.replace(/<\s*(\/?)\s*([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (_match, closing, tag) => {
    const name = String(tag).toLowerCase();
    const slash = closing === '/' ? '/' : '';
    if (AI_CONTENT_ALLOWED_TAGS.includes(name)) return `<${slash}${name}>`;
    if (AI_CONTENT_BLOCK_TO_P.includes(name)) return `<${slash}p>`;
    return ' ';
  });

  html = html
    .replace(/<p>\s*<\/p>/gi, '')
    .replace(/<li>\s*<\/li>/gi, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '')
    .trim();

  const text = html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ').trim();
  if (!text) return '';
  // Texto plano (el modelo ignoró el HTML): un párrafo por línea.
  if (!/<[a-z]/i.test(html)) {
    return text
      .split(/\n+/)
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => `<p>${line}</p>`)
      .join('')
      .slice(0, AI_CONTENT_MAX_CHARS);
  }
  return html.slice(0, AI_CONTENT_MAX_CHARS);
}

/**
 * Teléfono impreso en el flyer → link wa.me.
 *
 * Los flyers escriben “11 2345-6789”, “(011) 15 2345 6789” o “+54 9 11…”. wa.me
 * necesita E.164 sin signos y, para móviles argentinos, con el 9 después del 54.
 */
function whatsAppUrlFromPrinted(raw: string): string | null {
  let digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('54')) {
    let rest = digits.slice(2).replace(/^0+/, '');
    if (!rest.startsWith('9')) rest = `9${rest}`;
    digits = `54${rest}`;
  } else {
    const local = digits.replace(/^0+/, '');
    if (local.length < 8) return null;
    digits = `549${local}`;
  }
  if (digits.length < 12 || digits.length > 15) return null;
  return `https://wa.me/${digits}`;
}

const AI_SOCIAL_HANDLE_BASE: Partial<Record<EventSocialNetwork, string>> = {
  instagram: 'https://instagram.com/',
  facebook: 'https://facebook.com/',
  tiktok: 'https://www.tiktok.com/@',
  x: 'https://x.com/',
  youtube: 'https://youtube.com/'
};

/** Redes del flyer → filas guardables (URL absoluta, sin duplicados). */
function normalizeAiSocialLinks(raw: unknown): FlyerSocialLinkExtraction[] {
  if (!Array.isArray(raw)) return [];
  const out: FlyerSocialLinkExtraction[] = [];
  const seen = new Set<string>();

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const candidate = String((item as { network?: unknown }).network ?? '')
      .trim()
      .toLowerCase();
    const network: EventSocialNetwork = (
      EVENT_SOCIAL_NETWORKS as readonly string[]
    ).includes(candidate)
      ? (candidate as EventSocialNetwork)
      : 'other';
    const printed = String((item as { url?: unknown }).url ?? '').trim();
    if (!printed) continue;

    let url: string | null = null;
    if (network === 'whatsapp') {
      url = /^https?:\/\//i.test(printed) ? printed : whatsAppUrlFromPrinted(printed);
    } else if (/^https?:\/\//i.test(printed)) {
      url = printed;
    } else {
      const base = AI_SOCIAL_HANDLE_BASE[network];
      url = base ? `${base}${printed.replace(/^@/, '')}` : `https://${printed.replace(/^\/+/, '')}`;
    }
    if (!url) continue;

    const key = `${network}|${url.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const label = String((item as { label?: unknown }).label ?? '')
      .trim()
      .slice(0, 60);
    out.push({ network, url: url.slice(0, 500), label: label || null });
    if (out.length >= 8) break;
  }

  return out;
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
    private readonly redisService: RedisService,
    private readonly dbRepository: DBRepository
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

    const format = this.envService.get('EVENT_AI_IMAGE_FORMAT');
    let heroImageBase64: string | null = null;
    let heroMimeType: HeroImageMimeType = this.formatToMime(format);
    let heroMobileImageBase64: string | null = null;
    let heroMobileMimeType: HeroImageMimeType = this.formatToMime(format);
    let heroWarning: string | null = null;
    let imageModelUsed: string | null = null;
    let generationQuality: HeroImageQuality | null = null;
    let generationSize: string | null = null;
    let generationFormat: HeroImageFormat | null = null;
    let fallbackUsed = false;
    let heroUsage: HeroImageUsage | null = null;

    const [desktopOutcome, mobileOutcome] = await Promise.allSettled([
      this.generateHero(heroClient, flyers),
      this.generateHeroMobile(heroClient, flyers)
    ]);

    if (desktopOutcome.status === 'fulfilled') {
      const hero = desktopOutcome.value;
      heroImageBase64 = hero.b64;
      heroMimeType = hero.mimeType;
      imageModelUsed = hero.imageModelUsed;
      generationQuality = hero.generationQuality;
      generationSize = hero.generationSize;
      generationFormat = hero.generationFormat;
      fallbackUsed = hero.fallbackUsed;
      heroUsage = hero.usage;
    } else {
      const err = desktopOutcome.reason;
      const msg =
        err instanceof Error ? err.message : 'No se pudo generar el hero desktop con OpenAI.';
      this.logger.warn(`Hero desktop soft-fail: ${msg}`);
      heroWarning =
        msg.includes('aborted') || msg.includes('Abort') || msg.includes('timeout')
          ? 'La generación del banner desktop tardó demasiado. Los datos se completaron; subí el banner a mano o reintentá Analizar.'
          : `Banner desktop no generado: ${msg}. Los datos del flyer sí se aplicaron.`;
    }

    if (mobileOutcome.status === 'fulfilled') {
      const mobile = mobileOutcome.value;
      heroMobileImageBase64 = mobile.b64;
      heroMobileMimeType = mobile.mimeType;
    } else {
      const err = mobileOutcome.reason;
      const msg =
        err instanceof Error ? err.message : 'No se pudo generar el hero móvil con OpenAI.';
      this.logger.warn(`Hero mobile soft-fail: ${msg}`);
      const mobileWarn =
        msg.includes('aborted') || msg.includes('Abort') || msg.includes('timeout')
          ? 'La generación del banner móvil tardó demasiado.'
          : `Banner móvil no generado: ${msg}.`;
      heroWarning = heroWarning ? `${heroWarning} ${mobileWarn}` : mobileWarn;
    }

    await this.consumeQuota(userId);

    return {
      extraction,
      heroImageBase64,
      heroMimeType,
      heroMobileImageBase64,
      heroMobileMimeType,
      heroWarning,
      imageModelUsed,
      generationQuality,
      generationSize,
      generationFormat,
      fallbackUsed,
      heroUsage
    };
  }

  /**
   * Análisis completo: visión → verificación → reparación si hace falta.
   *
   * Lo corre el worker de la cola, no el request HTTP. Puede tardar minutos y
   * ese es justamente el motivo de que esté fuera del ciclo de la petición.
   */
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

    const client = this.createClient(apiKey.trim(), MAP_LAYOUT_TIMEOUT_MS);
    const result = await this.analyzeSalesMap(client, mapFile, userId);

    await this.consumeQuota(userId);
    return result;
  }

  /** Validación y cuota: corre en el request, antes de encolar. */
  validateMapRequest(file: Express.Multer.File): Express.Multer.File {
    const [mapFile] = this.validateMapFile(file);
    const apiKey = this.envService.get('OPENIA_API_KEY');
    if (!apiKey?.trim()) {
      throw new ServiceUnavailableException(
        'OPENIA_API_KEY no está configurada en el servidor. Agregala al .env del backend.'
      );
    }
    return mapFile;
  }

  async assertMapQuota(userId: string): Promise<void> {
    await this.assertWithinQuota(userId);
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
   * Siempre usa EVENT_AI_MAP_MODEL (nunca EVENT_AI_EXTRACT_MODEL).
   * El resultado sale rasterizado a la grilla 24×24 (`rasterizeMapAnalysis`).
   */
  private async analyzeSalesMap(
    client: OpenAI,
    mapFile: Express.Multer.File,
    userId: string
  ): Promise<AnalyzeMapResult> {
    const model = this.envService.get('EVENT_AI_MAP_MODEL');
    const reasoningEffort = this.envService.get('EVENT_AI_MAP_REASONING_EFFORT');
    const t0 = Date.now();
    const imageHash = createHash('sha256').update(mapFile.buffer).digest('hex');

    let repaired = false;

    try {
      const prepared = await this.prepareMapImageForVision(mapFile);
      this.logger.log(
        `[MAP] Analyzing with model=${model} reasoning_effort=${reasoningEffort} ` +
          `image=${prepared.bytes}B ${prepared.width}x${prepared.height} (src=${mapFile.size}B)`
      );

      const tOpenAi = Date.now();
      const { parsed, usage } = await this.mapVisionJson({
        label: 'map-layout',
        client,
        model,
        maxTokens: MAP_LAYOUT_MAX_TOKENS,
        reasoningEffort,
        system: MAP_LAYOUT_SYSTEM_PROMPT,
        userText: MAP_LAYOUT_USER_TEXT,
        images: this.flyerDataUrlParts([prepared.file], 'high')
      });
      const openaiMs = Date.now() - tOpenAi;

      const tNorm = Date.now();
      const result = normalizeMapLayout(parsed);
      const normalizeMs = Date.now() - tNorm;
      const summary = summarizeMapLayout(result);

      if (!result.layout.groups.length) {
        throw new BadRequestException(
          'No se detectó estructura de mapa. Probá con una imagen más nítida del plano.'
        );
      }

      // El `count` que declaró el modelo se pierde al normalizar (se impone
      // labels.length), así que se lee del crudo y se cruza acá: es la señal
      // más confiable de que el modelo se olvidó elementos.
      const tVerify = Date.now();
      const declaredCounts = collectDeclaredCounts(parsed, result);
      result.warnings = verifyMapLayout(result, declaredCounts);
      const verifyMs = Date.now() - tVerify;

      if (result.warnings.length) {
        this.logger.warn(
          `[MAP] ${result.warnings.length} advertencia(s): ` +
            result.warnings.map(w => `${w.code}${w.groupId ? `(${w.groupId})` : ''}`).join(', ')
        );
      }

      // Reparación con visión SOLO si falta algo que hay que volver a leer del
      // plano (labels, sectores, pisos). Solapes, forma de grilla y celdas se
      // arreglan abajo en código: no justifican otra llamada de minutos.
      let repairMs = 0;
      if (needsVisionRepair(result.warnings)) {
        const tRepair = Date.now();
        repaired = await this.repairMapLayout(
          client,
          prepared.file,
          result,
          this.envService.get('EVENT_AI_MAP_REPAIR_MODEL')?.trim() || model,
          this.envService.get('EVENT_AI_MAP_REPAIR_REASONING_EFFORT')
        );
        repairMs = Date.now() - tRepair;
      }

      // Última etapa, determinística: grillas coherentes, unidades uniformes
      // generadas acá y pack tipo Tetris sin solapes. Lo que se persiste y
      // devuelve son celdas.
      const tRaster = Date.now();
      const fixedGrids = fixStructuralIssues(result);
      const unplaced = rasterizeMapAnalysis(result);
      const rasterMs = Date.now() - tRaster;
      if (unplaced.length) {
        this.logger.warn(`[MAP] Grupos sin lugar en la grilla: ${unplaced.join(', ')}`);
      }
      // Estado final para la traza: lo estructural ya quedó resuelto.
      const unresolved = result.warnings.filter(w => w.code === 'GRID_OVERLAP_UNRESOLVED');
      result.warnings = [...verifyMapLayout(result, declaredCounts), ...unresolved];

      await this.recordMapRun({
        userId,
        mapFile,
        imageHash,
        model,
        reasoningEffort,
        status: 'ok',
        latencyMs: Date.now() - t0,
        openaiMs,
        usage,
        groupCount: summary.groups,
        labelCount: summary.labels,
        warnings: result.warnings,
        rawResponse: parsed,
        normalizedResult: result,
        errorMessage: null
      });

      this.logger.log(
        `[MAP] Timing: total_ms=${Date.now() - t0} analyze_ms=${openaiMs} ` +
          `normalize_ms=${normalizeMs} verify_ms=${verifyMs} repair_ms=${repairMs} ` +
          `raster_ms=${rasterMs} fixed_grids=${fixedGrids} — ` +
          `model=${model} effort=${reasoningEffort} ` +
          `repaired=${repaired} groups=${summary.groups} labels=${summary.labels} ` +
          `tables=${summary.tables} boxes=${summary.boxes} palcos=${summary.palcos} ` +
          `zones=${summary.zones} freeform=${summary.freeform} ` +
          `geometryFallback=${summary.requiresGeometryFallback} ` +
          `usage(in=${usage?.prompt_tokens ?? 'n/a'} out=${usage?.completion_tokens ?? 'n/a'} ` +
          `total=${usage?.total_tokens ?? 'n/a'})`
      );
      return result;
    } catch (err) {
      this.logger.warn(`[MAP] Total (failed): ${Date.now() - t0} ms`);
      await this.recordMapRun({
        userId,
        mapFile,
        imageHash,
        model,
        reasoningEffort,
        status: 'failed',
        latencyMs: Date.now() - t0,
        openaiMs: null,
        usage: null,
        groupCount: null,
        labelCount: null,
        warnings: [],
        rawResponse: null,
        normalizedResult: null,
        errorMessage: err instanceof Error ? err.message : String(err)
      });
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

  /**
   * Segunda pasada dirigida sobre los grupos que el verificador marcó.
   *
   * Muta `result` en el lugar y devuelve si hubo cambios. Es best-effort a
   * propósito: si la reparación falla o empeora, se conserva el layout
   * original. Un mapa incompleto sirve más que ninguno, y el productor lo
   * termina en el editor.
   */
  private async repairMapLayout(
    client: OpenAI,
    preparedFile: Express.Multer.File,
    result: AnalyzeMapResult,
    model: string,
    reasoningEffort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  ): Promise<boolean> {
    // Solo lo que requiere visión; lo estructural se arregla en código.
    const visionWarnings = result.warnings.filter(w => VISION_REPAIR_CODES.has(w.code));
    const problems = visionWarnings.map(w => w.message);
    const countVision = (ws: typeof result.warnings) =>
      ws.filter(w => VISION_REPAIR_CODES.has(w.code)).length;
    const t0 = Date.now();

    try {
      const { parsed } = await this.mapVisionJson({
        label: 'map-repair',
        client,
        model,
        maxTokens: MAP_REPAIR_MAX_TOKENS,
        reasoningEffort,
        system: MAP_REPAIR_SYSTEM_PROMPT,
        userText: buildMapRepairUserText({
          problems,
          // Sin labels el modelo no puede saber qué falta, pero el layout entero
          // con cincuenta mesas infla la entrada sin aportar: van los grupos
          // afectados completos y el resto en una línea.
          layoutJson: JSON.stringify(this.layoutForRepair(result))
        }),
        images: this.flyerDataUrlParts([preparedFile], 'high')
      });

      const merged = mergeRepairedGroups(result, parsed);
      if (!merged.changed) {
        this.logger.warn(`[MAP] La reparación no devolvió cambios (${Date.now() - t0} ms)`);
        return false;
      }

      // La reparación vale solo si deja el mapa mejor que antes.
      const after = verifyMapLayout(merged.result, new Map());
      if (countVision(after) >= visionWarnings.length) {
        this.logger.warn(
          `[MAP] Reparación descartada: ${visionWarnings.length} → ${countVision(after)} problemas`
        );
        return false;
      }

      this.logger.log(
        `[MAP] Reparado en ${Date.now() - t0} ms: ` +
          `${result.warnings.length} → ${after.length} advertencias`
      );
      result.layout.groups = merged.result.layout.groups;
      result.categories = merged.result.categories;
      result.warnings = after;
      return true;
    } catch (err) {
      this.logger.warn(
        `[MAP] Reparación fallida, se conserva el layout original: ` +
          `${err instanceof Error ? err.message : String(err)}`
      );
      return false;
    }
  }

  /**
   * Layout recortado para el prompt de reparación: los grupos señalados van
   * completos y el resto queda como referencia mínima, para que el modelo sepa
   * qué existe sin que la entrada crezca de más.
   */
  private layoutForRepair(result: AnalyzeMapResult): Record<string, unknown> {
    const affected = new Set(
      result.warnings
        .filter(w => VISION_REPAIR_CODES.has(w.code))
        .map(w => w.groupId)
        .filter((id): id is string => !!id)
    );

    // Entrada mínima: los grupos señalados completos (sin unitCells, que no
    // las define el modelo) y del resto solo id + cell, lo justo para no
    // pisarlos. Los labels de todos los grupos solo van cuando hay pisos
    // duplicados, que es el único problema que los necesita.
    const needsAllLabels = result.warnings.some(w => w.code === 'DUPLICATE_LABEL');
    const grid = toGridAnalysis(result, { stageLayout: result.stage.layout ?? null });
    return {
      stageLayout: result.stage.layout ?? null,
      categories: grid?.categories ?? [],
      groups: (grid?.layout.groups ?? []).map(g => {
        if (affected.has(g.id)) {
          const full = { ...g };
          delete full.unitCells;
          return full;
        }
        return needsAllLabels
          ? { id: g.id, cell: g.cell, level: g.level ?? null, labels: g.labels }
          : { id: g.id, cell: g.cell };
      })
    };
  }

  /**
   * Deja registro de la corrida: sirve para depurar un mapa que salió mal sin
   * pedirle al productor que lo reproduzca, para correr un prompt nuevo contra
   * casos viejos, y como fuente de fixtures del normalizador.
   *
   * Best-effort a propósito: si la escritura falla, el análisis igual se
   * devuelve. Perder la traza nunca justifica perder el mapa.
   */
  private async recordMapRun(params: {
    userId: string;
    mapFile: Express.Multer.File;
    imageHash: string;
    model: string;
    reasoningEffort?: string | null;
    status: 'ok' | 'failed';
    latencyMs: number;
    openaiMs: number | null;
    usage: { prompt_tokens: number | null; completion_tokens: number | null } | null;
    groupCount: number | null;
    labelCount: number | null;
    warnings: MapLayoutWarning[];
    rawResponse: unknown;
    normalizedResult: unknown;
    errorMessage: string | null;
  }): Promise<void> {
    try {
      const run = new EventAiMapRunEntity();
      run.uuid = randomUUID();
      run.userUuid = params.userId || null;
      run.imageHash = params.imageHash;
      run.imageName = params.mapFile.originalname?.slice(0, 255) ?? null;
      run.imageBytes = params.mapFile.size ?? null;
      run.model = params.model;
      run.reasoningEffort = params.reasoningEffort ?? null;
      run.status = params.status;
      run.latencyMs = params.latencyMs;
      run.openaiMs = params.openaiMs;
      run.promptTokens = params.usage?.prompt_tokens ?? null;
      run.completionTokens = params.usage?.completion_tokens ?? null;
      run.groupCount = params.groupCount;
      run.labelCount = params.labelCount;
      run.warningCount = params.warnings.length;
      run.warnings = params.warnings.length ? params.warnings : null;
      run.rawResponse = this.stringifyRun(params.rawResponse);
      run.normalizedResult = this.stringifyRun(params.normalizedResult);
      run.errorMessage = params.errorMessage?.slice(0, 1000) ?? null;

      await this.dbRepository.create({ entity: 'event_ai_map_run', data: run });
    } catch (err) {
      this.logger.warn(
        `[MAP] No se pudo registrar la corrida: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  private stringifyRun(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    try {
      return JSON.stringify(value);
    } catch {
      return null;
    }
  }

  /**
   * Downscale + JPEG para bajar patches de visión sin perder legibilidad de labels.
   * No cambia el schema de response.
   */
  private async prepareMapImageForVision(
    file: Express.Multer.File
  ): Promise<{
    file: Express.Multer.File;
    bytes: number;
    width: number;
    height: number;
  }> {
    try {
      const image = sharp(file.buffer, { failOn: 'none' }).rotate();
      const meta = await image.metadata();
      const width = meta.width ?? 0;
      const height = meta.height ?? 0;
      const longest = Math.max(width, height);

      let pipeline = image;
      if (longest > MAP_VISION_MAX_EDGE_PX) {
        pipeline = pipeline.resize({
          width: width >= height ? MAP_VISION_MAX_EDGE_PX : undefined,
          height: height > width ? MAP_VISION_MAX_EDGE_PX : undefined,
          fit: 'inside',
          withoutEnlargement: true
        });
      }

      const buffer = await pipeline
        .jpeg({ quality: MAP_VISION_JPEG_QUALITY, mozjpeg: true })
        .toBuffer();
      const outMeta = await sharp(buffer).metadata();

      return {
        file: {
          ...file,
          buffer,
          size: buffer.length,
          mimetype: 'image/jpeg',
          originalname: file.originalname.replace(/\.[^.]+$/, '') + '.jpg'
        },
        bytes: buffer.length,
        width: outMeta.width ?? width,
        height: outMeta.height ?? height
      };
    } catch (err) {
      this.logger.warn(
        `[MAP] Image prep soft-fail, using original: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
      return { file, bytes: file.size, width: 0, height: 0 };
    }
  }

  /** GPT-5 / o-series: usan max_completion_tokens (+ reasoning_effort). */
  private usesGpt5StyleTokenBudget(model: string): boolean {
    return /^(gpt-5|o[1-9]|chatgpt-4o)/i.test(model.trim());
  }

  private async mapVisionJson(params: {
    label: string;
    client: OpenAI;
    model: string;
    maxTokens: number;
    reasoningEffort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
    system: string;
    userText: string;
    images: ChatCompletionContentPart[];
    /** Para los mensajes de error: "del mapa" (default), "del flyer". */
    subject?: string;
    /** Reintentos ante respuesta vacía. Default `MAP_EMPTY_CONTENT_RETRIES`. */
    emptyRetries?: number;
  }): Promise<{
    parsed: Record<string, unknown>;
    usage: { prompt_tokens: number | null; completion_tokens: number | null; total_tokens: number | null } | null;
  }> {
    let lastEmptyDetail = '';
    const gpt5Style = this.usesGpt5StyleTokenBudget(params.model);

    const emptyRetries = params.emptyRetries ?? MAP_EMPTY_CONTENT_RETRIES;

    for (let emptyAttempt = 1; emptyAttempt <= emptyRetries; emptyAttempt++) {
      const response = await this.withTransientRetry(params.label, () =>
        params.client.chat.completions.create({
          model: params.model,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: params.system },
            {
              role: 'user',
              content: [{ type: 'text', text: params.userText }, ...params.images]
            }
          ],
          ...(gpt5Style
            ? {
                max_completion_tokens: params.maxTokens,
                ...(params.reasoningEffort
                  ? { reasoning_effort: params.reasoningEffort }
                  : {})
              }
            : { max_tokens: params.maxTokens })
        })
      );

      const usage = response.usage
        ? {
            prompt_tokens:
              typeof response.usage.prompt_tokens === 'number'
                ? response.usage.prompt_tokens
                : null,
            completion_tokens:
              typeof response.usage.completion_tokens === 'number'
                ? response.usage.completion_tokens
                : null,
            total_tokens:
              typeof response.usage.total_tokens === 'number'
                ? response.usage.total_tokens
                : null
          }
        : null;

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
          `${params.label}: empty content (${lastEmptyDetail}), attempt ${emptyAttempt}/${emptyRetries}`
        );
        if (emptyAttempt < emptyRetries) {
          await this.sleep(TRANSIENT_BASE_DELAY_MS * emptyAttempt);
          continue;
        }
        throw new ServiceUnavailableException(
          `OpenAI no devolvió datos ${params.subject ?? 'del mapa'} (${lastEmptyDetail}). Reintentá en un momento.`
        );
      }

      if (finishReason === 'length') {
        this.logger.warn(
          `${params.label}: hit max_tokens (finish_reason=length); attempting truncated JSON repair`
        );
      }

      try {
        return { parsed: parseJsonObjectLoose(raw), usage };
      } catch (parseErr) {
        this.logger.error(
          `${params.label} JSON parse failed (finish_reason=${finishReason ?? 'unknown'}, chars=${raw.length})`,
          parseErr instanceof Error ? parseErr.message : parseErr
        );
        throw new ServiceUnavailableException(
          `OpenAI devolvió un JSON incompleto ${params.subject ?? 'del mapa'}. Reintentá el análisis.`
        );
      }
    }

    throw new ServiceUnavailableException(
      `OpenAI no devolvió datos ${params.subject ?? 'del mapa'} (${params.label}${
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
    const fallbackModel = this.envService.get('EVENT_AI_EXTRACT_FALLBACK_MODEL')?.trim() ?? '';
    const userText =
      'Transcribe the event data printed on this flyer. Return JSON only. Do not identify people from their faces.';
    // Segundo intento: el modelo se negó. Se le pide lo mínimo posible —copiar
    // texto— y se le dice explícitamente que ignore a las personas de la foto.
    const ocrText =
      'Act as an OCR tool. Copy the TEXT PRINTED on this poster into the JSON schema: event name, dates, times, venue, ticket tiers and prices. ' +
      'Ignore every photograph: do not describe, recognize or name any person in the image. ' +
      'If a field is not printed on the poster, leave it empty. Return JSON only.';

    /**
     * Intentos en orden. El rechazo no se arregla reintentando igual: primero
     * se baja el pedido a OCR puro y, si el modelo sigue negándose, se pasa al
     * modelo de respaldo (`EVENT_AI_EXTRACT_FALLBACK_MODEL`).
     */
    const attempts: Array<{ model: string; userText: string; retries: number }> = [
      { model, userText, retries: 2 },
      { model, userText: ocrText, retries: 1 },
      ...(fallbackModel && fallbackModel !== model
        ? [{ model: fallbackModel, userText: ocrText, retries: 1 }]
        : [])
    ];

    try {
      // Mismo camino que el análisis del mapa: reintenta si la respuesta viene
      // vacía, registra el motivo (finish_reason / refusal) y soporta GPT-5 y la
      // serie o. Antes una respuesta vacía de gpt-4o —típicamente un rechazo por
      // las caras del flyer— cortaba todo sin dejar rastro del motivo.
      let lastError: unknown;
      for (const [index, attempt] of attempts.entries()) {
        const gpt5Style = this.usesGpt5StyleTokenBudget(attempt.model);
        try {
          const { parsed } = await this.mapVisionJson({
            label: index === 0 ? 'extract' : `extract-retry${index}(${attempt.model})`,
            subject: 'del flyer',
            client,
            model: attempt.model,
            // El razonamiento consume del mismo tope: con 2200 no quedaba lugar
            // para la respuesta.
            maxTokens: gpt5Style ? EXTRACT_MAX_OUTPUT_TOKENS * 4 : EXTRACT_MAX_OUTPUT_TOKENS,
            reasoningEffort: gpt5Style ? 'low' : undefined,
            system: buildExtractionSystemPrompt(),
            userText: attempt.userText,
            emptyRetries: attempt.retries,
            images: this.flyerDataUrlParts(flyers)
          });
          return this.normalizeExtraction(parsed as Partial<FlyerEventExtraction>);
        } catch (err) {
          lastError = err;
          const refused = err instanceof ServiceUnavailableException;
          if (!refused || index === attempts.length - 1) throw err;
          this.logger.warn(
            `extract: "${attempt.model}" no devolvió datos; probando el intento ${index + 2}/${attempts.length}`
          );
        }
      }
      throw lastError;
    } catch (err) {
      if (err instanceof ServiceUnavailableException && /refusal=/.test(err.message)) {
        // El rechazo no lo arregla reintentar: es la política del modelo con
        // fotos de personas reales.
        throw new ServiceUnavailableException(
          'El modelo de IA se negó a leer este flyer (suele pasar con afiches con fotos de personas). ' +
            'Cargá los datos a mano, probá con otra imagen o configurá EVENT_AI_EXTRACT_FALLBACK_MODEL con otro modelo.'
        );
      }
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
      content: sanitizeAiContentHtml(raw.content),
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
          : String(raw.artistsLineup).trim().slice(0, 500) || null,
      socialLinks: normalizeAiSocialLinks(raw.socialLinks)
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
    const prompt =
      `${HERO_FROM_FLYER_PROMPT}\n\n` +
      'Generate exactly ONE hero image now. Do not ask questions. Do not produce extra variants.\n' +
      'Reminder: TOP empty air is the reference — BOTTOM empty air under names/title MUST match it exactly (shift the whole block UP if names sit near the bottom). ' +
      'RIGHT empty gap should be ~50% smaller: keep the cluster close to the right edge with only a small safe pad (~60–120px). ' +
      'LEFT third stays dark empty space with ZERO logos/seals/venue marks.';

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
          { quality, size, format, compression, prompt },
          'hero'
        );
        const result = buildResult(generated, primaryModel, false);
        this.logHeroGeneration(result, compression, 'desktop');
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
          { quality, size, format, compression, prompt },
          'hero-fallback'
        );
        const result = buildResult(generated, fallbackModel.trim(), true);
        this.logHeroGeneration(result, compression, 'desktop');
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

  /**
   * Banner móvil portrait: OpenAI 1024×1536 y sharp a 1080×1543 (~7:10).
   * Soft-fail independiente del desktop (Promise.allSettled en analyzeFromFlyers).
   */
  private async generateHeroMobile(
    client: OpenAI,
    flyers: Express.Multer.File[]
  ): Promise<HeroGenerationResult> {
    const primaryModel = this.envService.get('EVENT_AI_IMAGE_MODEL');
    const fallbackModel = this.envService.get('EVENT_AI_IMAGE_FALLBACK_MODEL');
    const quality = this.envService.get('EVENT_AI_IMAGE_QUALITY');
    const format = this.envService.get('EVENT_AI_IMAGE_FORMAT');
    const compression = this.envService.get('EVENT_AI_IMAGE_COMPRESSION');
    const primary = flyers[0];
    const prompt =
      `${HERO_MOBILE_FROM_FLYER_PROMPT}\n\n` +
      'Generate exactly ONE portrait mobile hero now. Do not ask questions. Do not produce extra variants.';

    const buildResult = (
      generated: { b64: string; usage: HeroImageUsage | null },
      modelUsed: string,
      usedFallback: boolean
    ): HeroGenerationResult => ({
      b64: generated.b64,
      mimeType: this.formatToMime(format),
      imageModelUsed: modelUsed,
      generationQuality: quality,
      generationSize: `${MOBILE_HERO_OUTPUT_WIDTH}x${MOBILE_HERO_OUTPUT_HEIGHT}`,
      generationFormat: format,
      fallbackUsed: usedFallback,
      usage: generated.usage
    });

    const run = async (model: string, label: string) => {
      const generated = await this.generateHeroWithModel(
        client,
        primary,
        model,
        {
          quality,
          size: MOBILE_HERO_AI_SIZE,
          format,
          compression,
          prompt
        },
        label
      );
      const resizedB64 = await this.resizeHeroMobileToOutput(generated.b64, format);
      return { b64: resizedB64, usage: generated.usage };
    };

    try {
      try {
        const generated = await run(primaryModel, 'hero-mobile');
        const result = buildResult(generated, primaryModel, false);
        this.logHeroGeneration(result, compression, 'mobile');
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
          `Hero mobile primary model "${primaryModel}" saturado; intentando fallback "${fallbackModel}"`
        );
        const generated = await run(fallbackModel.trim(), 'hero-mobile-fallback');
        const result = buildResult(generated, fallbackModel.trim(), true);
        this.logHeroGeneration(result, compression, 'mobile');
        return result;
      }
    } catch (err) {
      if (err instanceof ServiceUnavailableException) throw err;
      if (err instanceof HttpException) throw err;
      this.logger.error(
        'OpenAI hero mobile generation failed',
        err instanceof Error ? err.stack : err
      );
      throw new ServiceUnavailableException(
        this.friendlyOpenAiError(err, 'Error al generar el banner móvil con OpenAI.')
      );
    }
  }

  /** Recorta/escala el hero móvil al canvas fijo 1080×1543 (retina mobile). */
  private async resizeHeroMobileToOutput(
    b64: string,
    format: HeroImageFormat
  ): Promise<string> {
    let pipeline = sharp(Buffer.from(b64, 'base64')).resize(
      MOBILE_HERO_OUTPUT_WIDTH,
      MOBILE_HERO_OUTPUT_HEIGHT,
      { fit: 'cover', position: 'centre', kernel: sharp.kernel.lanczos3 }
    );
    if (format === 'webp') {
      pipeline = pipeline.webp({ quality: 90 });
    } else if (format === 'jpeg') {
      pipeline = pipeline.jpeg({ quality: 90, mozjpeg: true });
    } else {
      pipeline = pipeline.png({ compressionLevel: 6 });
    }
    return (await pipeline.toBuffer()).toString('base64');
  }

  private formatToMime(format: HeroImageFormat): HeroImageMimeType {
    if (format === 'webp') return 'image/webp';
    if (format === 'jpeg') return 'image/jpeg';
    return 'image/png';
  }

  private logHeroGeneration(
    result: HeroGenerationResult,
    compression: number,
    kind: 'desktop' | 'mobile' = 'desktop'
  ): void {
    const u = result.usage;
    this.logger.log(
      `Hero(${kind}) generated model=${result.imageModelUsed} size=${result.generationSize} ` +
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
      prompt: string;
    },
    label: string
  ): Promise<{ b64: string; usage: HeroImageUsage | null }> {
    const mime = this.normalizeMime(flyer.mimetype);
    const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';

    const response = await this.withTransientRetry(label, async () => {
      // Flyer ORIGINAL como input visual del edit (no JSON de gpt-4o)
      const imageFile = await toFile(flyer.buffer, `flyer.${ext}`, { type: mime });
      return client.images.edit({
        model,
        image: imageFile,
        prompt: opts.prompt,
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

      // La IA propone recuadros 0..1; se rasterizan a la grilla y se empacan
      // sin solapes (ni con el escenario default) antes de devolverlos.
      const drafts = parsed.sectors.map((raw, i) => {
        const name = String(
          raw.name ?? input.ticketTypes[i % input.ticketTypes.length]?.name ?? `Sector ${i + 1}`
        );
        const match = input.ticketTypes.find(t => t.name.toLowerCase() === name.toLowerCase());
        const tt = match ?? input.ticketTypes[i % input.ticketTypes.length];
        const cell = boxToCell({
          x: clamp01(Number(raw.x) || 0.05),
          y: clamp01(Number(raw.y) || 0.05),
          w: Math.max(0.08, Math.min(0.9, Number(raw.w) || 0.25)),
          h: Math.max(0.08, Math.min(0.9, Number(raw.h) || 0.2))
        });
        return {
          id: String(i),
          label: name,
          layout: { kind: 'rect', cell } as MapSectorLayout,
          color: SECTOR_COLORS[i % SECTOR_COLORS.length],
          ticketTypeUuids: tt ? [tt.uuid] : []
        };
      });
      const packed = packLayouts(
        drafts.map(d => ({ id: d.id, label: d.label, layout: d.layout, rigid: true })),
        new Set(layoutKeys(defaultStageLayout('top')))
      );
      if (packed.unresolved.length) {
        return {
          sectors: heuristic,
          warning: 'La IA propuso sectores que no entran en la grilla; usamos una grilla automática.'
        };
      }
      const sectors = drafts.map(d =>
        suggestedSector(d.label, packed.layouts.get(d.id) ?? d.layout, d.color, d.ticketTypeUuids)
      );

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
    // Debajo del escenario default (filas 1–2), con una celda de aire entre
    // bloques. Hasta 7 filas de sectores entran en las 21 filas libres.
    const cols = Math.min(3, n);
    const rows = Math.min(7, Math.ceil(n / cols));
    const top = 4;
    const gap = 1;
    const spanCol = Math.max(1, Math.floor((MAP_GRID_SIZE - gap * (cols + 1)) / cols));
    const spanRow = Math.max(1, Math.floor((MAP_GRID_SIZE - top + 1 - gap * rows) / rows));

    return ticketTypes.slice(0, cols * rows).map((tt, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cell = {
        col: 1 + gap + col * (spanCol + gap),
        row: top + row * (spanRow + gap),
        colSpan: spanCol,
        rowSpan: spanRow
      };
      return suggestedSector(
        tt.name,
        { kind: 'rect', cell },
        SECTOR_COLORS[i % SECTOR_COLORS.length],
        [tt.uuid]
      );
    });
  }
}

function suggestedSector(
  name: string,
  layout: MapSectorLayout,
  color: string,
  ticketTypeUuids: string[]
): SuggestMapSectorItem {
  const bounds = layoutBounds(layout);
  return {
    name,
    layout,
    ...cellToBox(bounds),
    color,
    ticketTypeUuids
  };
}

const SECTOR_COLORS = ['#ff2bd6', '#3ddc97', '#ffb020', '#8b5cf6', '#4da3ff', '#ff4d6d'];

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
