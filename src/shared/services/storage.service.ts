import { access, mkdir, unlink, writeFile } from 'fs/promises';
import { join } from 'path';
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
    this.storagePath = join(process.cwd(), this.envService.get('STORAGE_PATH'));

    const dirs = [
      join(this.storagePath, 'tickets', 'qr'),
      join(this.storagePath, 'tickets', 'pdf'),
      join(this.storagePath, 'events', 'banners')
    ];

    await Promise.all(dirs.map(dir => mkdir(dir, { recursive: true })));

    this.logger.log(`Storage initialized at ${this.storagePath}`);
  }

  async saveFile(params: SaveFileParams): Promise<SaveFileResult> {
    const { buffer, relativePath, filename } = params;

    const absoluteDir = join(this.storagePath, relativePath);
    const absolutePath = join(absoluteDir, filename);

    await mkdir(absoluteDir, { recursive: true });
    await writeFile(absolutePath, buffer);

    const appUrl = (this.envService.get('APP_URL') ?? '').replace(/\/$/, '');
    const url = `${appUrl}/static/${relativePath}/${filename}`;

    this.logger.log(`File saved: ${absolutePath}`);

    return { url, absolutePath };
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
