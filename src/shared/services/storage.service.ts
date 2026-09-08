import { access, mkdir, unlink, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EnvService } from '@config/env/env.service';

export interface SaveFileParams {
  buffer: Buffer;
  relativePath: string;
  filename: string;
}

export interface SaveFileResult {
  /** Path público relativo persistido en DB (`/static/...`), sin host. */
  url: string;
  absolutePath: string;
}

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private storagePath: string;

  constructor(private readonly envService: EnvService) {}

  async onModuleInit(): Promise<void> {
    // resolve (no join): si STORAGE_PATH es absoluta la respeta tal cual.
    // Con join, '/var/data/storage' terminaba en '/app/var/data/storage' —
    // fuera del volumen montado, y los archivos se perdían al recrear el contenedor.
    this.storagePath = resolve(process.cwd(), this.envService.get('STORAGE_PATH'));

    const dirs = [
      join(this.storagePath, 'tickets', 'qr'),
      join(this.storagePath, 'tickets', 'pdf'),
      join(this.storagePath, 'events', 'banners'),
      join(this.storagePath, 'events', 'gallery'),
      join(this.storagePath, 'private')
    ];

    await Promise.all(dirs.map(dir => mkdir(dir, { recursive: true })));

    this.logger.log(`Storage initialized at ${this.storagePath}`);
  }

  getRootPath(): string {
    return this.storagePath;
  }

  async saveFile(params: SaveFileParams): Promise<SaveFileResult> {
    const { buffer, relativePath, filename } = params;

    const absoluteDir = join(this.storagePath, relativePath);
    const absolutePath = join(absoluteDir, filename);

    await mkdir(absoluteDir, { recursive: true });
    await writeFile(absolutePath, buffer);

    // Relativo: el host lo pone toPublicUrl() con el APP_URL del entorno actual
    // (localhost / ngrok / prod). Si se persistía APP_URL de prod, en local 404.
    const url = `/static/${relativePath.replace(/^\/+|\/+$/g, '')}/${filename}`;

    this.logger.log(`File saved: ${relativePath}/${filename}`);

    return { url, absolutePath };
  }

  /**
   * Reescribe una URL de storage (absoluta de otro env o relativa `/static/...`)
   * al origen de APP_URL actual. Así local/ngrok/prod sirven el mismo archivo.
   */
  toPublicUrl(stored: string | null | undefined): string | null {
    if (!stored?.trim()) return null;
    const pathname = this.staticPathname(stored);
    if (!pathname) return stored.trim();

    const appUrl = (this.envService.get('APP_URL') ?? '').replace(/\/$/, '');
    return appUrl ? `${appUrl}${pathname}` : pathname;
  }

  /** Pathname `/static/...` si el valor apunta a un asset público nuestro. */
  staticPathname(stored: string | null | undefined): string | null {
    if (!stored?.trim()) return null;
    const value = stored.trim();

    try {
      if (/^https?:\/\//i.test(value)) {
        const parsed = new URL(value);
        return parsed.pathname.startsWith('/static/') ? parsed.pathname : null;
      }
    } catch {
      /* relative below */
    }

    if (value.startsWith('/static/')) return value.split('?')[0] ?? value;
    if (value.startsWith('static/')) return `/${value.split('?')[0]}`;
    return null;
  }

  /** Compara dos URLs de storage ignorando el host (prod vs local vs ngrok). */
  sameStaticAsset(a: string | null | undefined, b: string | null | undefined): boolean {
    const left = this.staticPathname(a);
    const right = this.staticPathname(b);
    return Boolean(left && right && left === right);
  }

  /** Guarda bajo STORAGE_PATH sin URL pública (docs fiscales, etc.). */
  async savePrivateFile(params: SaveFileParams): Promise<{ absolutePath: string }> {
    const { buffer, relativePath, filename } = params;

    if (relativePath.includes('..') || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      throw new Error('Invalid private storage path');
    }
    if (!relativePath.startsWith('private/')) {
      throw new Error('Private files must live under private/');
    }

    const absoluteDir = join(this.storagePath, relativePath);
    const absolutePath = join(absoluteDir, filename);

    await mkdir(absoluteDir, { recursive: true });
    await writeFile(absolutePath, buffer);

    this.logger.log(`Private file saved: ${relativePath}/${filename}`);

    return { absolutePath };
  }

  async deleteFile(absolutePath: string): Promise<void> {
    try {
      await unlink(absolutePath);
      this.logger.log(`File deleted: ${absolutePath}`);
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        this.logger.warn(`File not found, skipping delete: ${absolutePath}`);
        return;
      }
      this.logger.error(`Failed to delete file: ${absolutePath}`, err);
      throw err;
    }
  }

  resolveAbsolutePath(relativePath: string, filename: string): string {
    return join(this.storagePath, relativePath, filename);
  }

  async fileExists(absolutePath: string): Promise<boolean> {
    try {
      await access(absolutePath);
      return true;
    } catch {
      return false;
    }
  }
}
