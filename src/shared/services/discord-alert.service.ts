import { Injectable } from '@nestjs/common';
import { EnvService } from '@config/env/env.service';

const EMBED_DESCRIPTION_MAX = 1024;
const EMBED_FIELD_VALUE_MAX = 1024;

export interface DiscordAlertPayload {
  title: string;
  description: string;
  /** Color decimal (ej. 0xff0000 = rojo) */
  color?: number;
  fields?: { name: string; value: string; inline?: boolean }[];
}

/** Solo emitir alertas a Discord en ambiente productivo (no local/dev). */
function isProductionEnv(): boolean {
  const env = process.env.ENV;
  const nodeEnv = process.env.NODE_ENV;
  return env === 'prod' || nodeEnv === 'production';
}

/**
 * Envía un payload a un webhook de Discord (para alertas).
 * No depende de Nest; usa process.env. Útil en main.ts (unhandledRejection / uncaughtException).
 * Solo envía si ENV=prod o NODE_ENV=production.
 */
export async function sendToDiscordFromEnv(payload: DiscordAlertPayload): Promise<void> {
  if (!isProductionEnv()) return;
  const url = process.env.DISCORD_WEBHOOK_ALERTS;
  if (!url || typeof url !== 'string' || !url.startsWith('https://')) return;
  try {
    const body = {
      embeds: [
        {
          title: payload.title,
          description: payload.description.slice(0, EMBED_DESCRIPTION_MAX),
          color: payload.color ?? 0xe74c3c,
          fields: (payload.fields ?? []).map(f => ({
            name: f.name,
            value: String(f.value).slice(0, EMBED_FIELD_VALUE_MAX),
            inline: f.inline ?? false
          })),
          timestamp: new Date().toISOString()
        }
      ]
    };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      console.error('[DiscordAlert] Webhook failed:', res.status, await res.text());
    }
  } catch (e) {
    console.error('[DiscordAlert] Failed to send to Discord:', e);
  }
}

@Injectable()
export class DiscordAlertService {
  constructor(private readonly env: EnvService) {}

  /**
   * Envía una alerta al canal de Discord configurado en DISCORD_WEBHOOK_ALERTS.
   * Solo en ambiente productivo (ENV=prod). Si no está configurado el webhook, no hace nada.
   */
  async sendAlert(payload: DiscordAlertPayload): Promise<void> {
    const env = this.env.get('ENV');
    if (env !== 'prod') return;
    const url = this.env.get('DISCORD_WEBHOOK_ALERTS');
    if (!url || typeof url !== 'string') return;
    try {
      const body = {
        embeds: [
          {
            title: payload.title,
            description: payload.description.slice(0, EMBED_DESCRIPTION_MAX),
            color: payload.color ?? 0xe74c3c,
            fields: (payload.fields ?? []).map(f => ({
              name: f.name,
              value: String(f.value).slice(0, EMBED_FIELD_VALUE_MAX),
              inline: f.inline ?? false
            })),
            timestamp: new Date().toISOString()
          }
        ]
      };
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        console.error('[DiscordAlert] Webhook failed:', res.status, await res.text());
      }
    } catch (e) {
      console.error('[DiscordAlert] Failed to send to Discord:', e);
    }
  }
}
