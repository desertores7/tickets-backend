import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdirSync } from 'fs';
import { unlink } from 'fs/promises';
import { join } from 'path';
import sharp from 'sharp';

const USER_MEDIA_RELATIVE = 'multimedia/user';
const WEBP_MIME = 'image/webp';

@Injectable()
export class ImageCompressionService {
  private readonly userMediaDir: string;

  constructor(private readonly config: ConfigService) {
    this.userMediaDir = join(process.cwd(), USER_MEDIA_RELATIVE);
    mkdirSync(this.userMediaDir, { recursive: true });
  }

  private buildPublicUrl(filename: string): string {
    const publicPath = `/api/multimedia/user/${filename}`;
    const baseUrl = this.config.get<string>('BASE_URL');
    if (!baseUrl) return publicPath;
    return `${baseUrl.replace(/\/$/, '')}${publicPath}`;
  }

  assertImageMimeType(mimetype: string): void {
    if (!mimetype?.startsWith('image/')) {
      throw new BadRequestException('Only image files are allowed');
    }
  }

  async saveUserProfileImage(userUuid: string, file: Express.Multer.File): Promise<{ path: string; type: string }> {
    this.assertImageMimeType(file.mimetype);

    const filename = `${userUuid}.webp`;
    const filepath = join(this.userMediaDir, filename);

    await sharp(file.buffer).webp({ quality: 80 }).toFile(filepath);

    return {
      path: this.buildPublicUrl(filename),
      type: WEBP_MIME
    };
  }

  async deleteUserProfileImage(userUuid: string): Promise<void> {
    const filepath = join(this.userMediaDir, `${userUuid}.webp`);
    try {
      await unlink(filepath);
    } catch {
      // File may not exist yet
    }
  }
}
