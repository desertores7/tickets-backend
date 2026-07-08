import { createHmac, timingSafeEqual } from 'crypto';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EnvService } from '@config/env/env.service';

export interface QrTokenPayload {
  ticketId: string;
  eventId: string;
  ticketNumber: string;
  issuedAt: number;
}

export type QrVerifyResult =
  | { valid: true; payload: QrTokenPayload }
  | { valid: false; reason: 'invalid_format' | 'invalid_signature' };

const MIN_SECRET_LENGTH = 32;

function toBase64Url(input: string | Buffer): string {
  const buf = typeof input === 'string' ? Buffer.from(input) : input;
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(input: string): Buffer {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64');
}

@Injectable()
export class QrSigningService implements OnModuleInit {
  private readonly logger = new Logger(QrSigningService.name);
  private secret: string;

  constructor(private readonly envService: EnvService) {}

  onModuleInit(): void {
    this.secret = this.envService.get('QR_SECRET');

    if (this.secret.length < MIN_SECRET_LENGTH) {
      this.logger.warn(
        `QR_SECRET is shorter than ${MIN_SECRET_LENGTH} characters (current: ${this.secret.length}). ` +
          'Use a long random secret in production to prevent QR forgery.'
      );
    }
  }

  generateQrToken(payload: QrTokenPayload): string {
    const payloadB64 = toBase64Url(JSON.stringify(payload));
    const signature = createHmac('sha256', this.secret).update(payloadB64).digest();
    const signatureB64 = toBase64Url(signature);
    return `${payloadB64}.${signatureB64}`;
  }

  verifyQrToken(token: string): QrVerifyResult {
    const dotIndex = token.indexOf('.');

    // Must have exactly one dot separating two non-empty parts
    if (dotIndex <= 0 || dotIndex === token.length - 1 || token.indexOf('.', dotIndex + 1) !== -1) {
      return { valid: false, reason: 'invalid_format' };
    }

    const payloadB64 = token.slice(0, dotIndex);
    const receivedSigB64 = token.slice(dotIndex + 1);

    const expectedSig = createHmac('sha256', this.secret).update(payloadB64).digest();
    const receivedSig = fromBase64Url(receivedSigB64);

    if (expectedSig.length !== receivedSig.length) {
      return { valid: false, reason: 'invalid_signature' };
    }

    if (!timingSafeEqual(expectedSig, receivedSig)) {
      return { valid: false, reason: 'invalid_signature' };
    }

    try {
      const payload = JSON.parse(Buffer.from(payloadB64, 'base64').toString()) as QrTokenPayload;
      return { valid: true, payload };
    } catch {
      return { valid: false, reason: 'invalid_format' };
    }
  }
}
