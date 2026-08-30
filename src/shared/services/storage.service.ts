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

    const appUrl = (this.envService.get('APP_URL') ?? '').replace(/\/$/, '');
    const url = `${appUrl}/static/${relativePath}/${filename}`;

    this.logger.log(`File saved: ${relativePath}/${filename}`);

    return { url, absolutePath };
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
