import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { EnvService } from '@config/env/env.service';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/**
 * Cifrado simétrico para los tokens de Mercado Pago de las productoras
 * (`BR-CASH-001`: "tokens cifrados").
 *
 * Se usa AES-256-GCM y no AES-CBC porque GCM es autenticado: si alguien altera
 * el ciphertext en la base, el descifrado falla en vez de devolver basura que
 * después mandaríamos a la API de MP.
 *
 * Formato guardado: `iv:authTag:ciphertext`, todo en base64. El IV es aleatorio
 * por operación, así que dos cifrados del mismo token dan resultados distintos.
 */
@Injectable()
export class TokenCipher {
  private readonly logger = new Logger(TokenCipher.name);
  private readonly key: Buffer | null;

  constructor(private readonly envService: EnvService) {
    const secret = this.envService.get('MP_TOKEN_ENCRYPTION_KEY');

    if (!secret) {
      this.logger.warn(
        'MP_TOKEN_ENCRYPTION_KEY no está configurada — no se van a poder conectar cuentas de Mercado Pago'
      );
      this.key = null;
      return;
    }

    // La clave debe medir 32 bytes. Se deriva con SHA-256 para aceptar un
    // secreto de cualquier largo sin que el operador tenga que calcularlo.
    this.key = createHash('sha256').update(secret).digest();
  }

  get isConfigured(): boolean {
    return this.key !== null;
  }

  encrypt(plainText: string): string {
    if (!this.key) {
      throw new BadRequestException(
        'El cifrado de tokens no está configurado en el servidor. Falta MP_TOKEN_ENCRYPTION_KEY.'
      );
    }

    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);

    return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join(':');
  }

  decrypt(payload: string): string {
    if (!this.key) {
      throw new BadRequestException('El cifrado de tokens no está configurado en el servidor.');
    }

    const [ivPart, tagPart, dataPart] = payload.split(':');
    if (!ivPart || !tagPart || !dataPart) {
      throw new BadRequestException('El token guardado tiene un formato inválido.');
    }

    const authTag = Buffer.from(tagPart, 'base64');
    if (authTag.length !== AUTH_TAG_LENGTH) {
      throw new BadRequestException('El token guardado tiene un formato inválido.');
    }

    const decipher = createDecipheriv(ALGORITHM, this.key, Buffer.from(ivPart, 'base64'));
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(Buffer.from(dataPart, 'base64')), decipher.final()]).toString('utf8');
  }
}
