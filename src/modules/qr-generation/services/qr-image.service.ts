import { Injectable } from '@nestjs/common';
import * as qrcode from 'qrcode';
import sharp from 'sharp';

const QR_SIZE = 400;
const LOGO_SIZE = 80; // 80x80 = 6400px² / 160000px² total ≈ 4% — well within H-level 30% tolerance

@Injectable()
export class QrImageService {
  async generateQrImage(token: string): Promise<Buffer> {
    return qrcode.toBuffer(token, {
      errorCorrectionLevel: 'H',
      width: QR_SIZE,
      margin: 2,
      color: { dark: '#000000', light: '#FFFFFF' },
      type: 'png'
    });
  }

  async generateQrImageWithLogo(token: string, logoBuffer?: Buffer): Promise<Buffer> {
    const qrBuffer = await this.generateQrImage(token);

    if (!logoBuffer) return qrBuffer;

    const resizedLogo = await sharp(logoBuffer)
      .resize(LOGO_SIZE, LOGO_SIZE, { fit: 'inside' })
      .png()
      .toBuffer();

    const left = Math.floor((QR_SIZE - LOGO_SIZE) / 2);
    const top = Math.floor((QR_SIZE - LOGO_SIZE) / 2);

    return sharp(qrBuffer)
      .composite([{ input: resizedLogo, left, top }])
      .png()
      .toBuffer();
  }
}
