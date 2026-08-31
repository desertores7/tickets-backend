import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';

// A6 portrait en puntos (72dpi): 105mm × 148mm
const PAGE_WIDTH = 298;
const PAGE_HEIGHT = 420;
const MARGIN = 20;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

/** Misma paleta que los emails transaccionales, para que la marca se vea igual en los dos lados */
const COLOR = {
  navy: '#0f172a',
  text: '#334155',
  muted: '#64748b',
  softMuted: '#94a3b8',
  cardBg: '#f8fafc',
  border: '#e2e8f0',
  accent: '#0284c7',
  white: '#ffffff'
} as const;

const HEADER_HEIGHT = 70;
const FOOTER_TOP = 348;
const QR_SIZE = 148;
const QR_CARD_SIZE = 172;

export interface TicketPdfData {
  ticketNumber: string;
  eventName: string;
  eventDate: Date;
  eventVenue: string;
  eventCity: string;
  ticketTypeName: string;
  holderName: string;
  orderId: string;
  qrImageBuffer: Buffer;
}

function formatEventDate(date: Date): string {
  const dayName = new Intl.DateTimeFormat('es-AR', { weekday: 'long' }).format(date);
  const day = date.getDate();
  const month = new Intl.DateTimeFormat('es-AR', { month: 'long' }).format(date);
  const year = date.getFullYear();
  const time = new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }).format(date);

  const capitalDay = dayName.charAt(0).toUpperCase() + dayName.slice(1);
  const capitalMonth = month.charAt(0).toUpperCase() + month.slice(1);

  return `${capitalDay} ${day} de ${capitalMonth} de ${year} — ${time}hs`;
}

@Injectable()
export class PdfTicketService {
  async generateTicketPdf(data: TicketPdfData): Promise<Buffer> {
    const doc = new PDFDocument({
      size: [PAGE_WIDTH, PAGE_HEIGHT],
      margin: 0,
      info: {
        Title: `Ticket ${data.ticketNumber}`,
        Subject: data.eventName,
        Author: 'Ticketera'
      }
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    const endPromise = new Promise<void>(resolve => doc.on('end', resolve));

    // ── HEADER: banda navy, igual al encabezado del email ─────────────────────

    doc.rect(0, 0, PAGE_WIDTH, HEADER_HEIGHT).fill(COLOR.navy);

    doc
      .font('Helvetica-Bold')
      .fontSize(15)
      .fillColor(COLOR.white)
      .text(data.eventName, MARGIN, 20, {
        width: CONTENT_WIDTH,
        align: 'center',
        height: 34,
        ellipsis: true,
        lineGap: 1
      });

    // Línea de acento bajo el título
    doc.rect(PAGE_WIDTH / 2 - 16, HEADER_HEIGHT - 12, 32, 2.5).fill(COLOR.accent);

    // ── Fecha y lugar ─────────────────────────────────────────────────────────

    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(COLOR.text)
      .text(formatEventDate(data.eventDate), MARGIN, HEADER_HEIGHT + 16, {
        width: CONTENT_WIDTH,
        align: 'center'
      });

    doc
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor(COLOR.softMuted)
      .text(`${data.eventVenue} · ${data.eventCity}`, MARGIN, HEADER_HEIGHT + 30, {
        width: CONTENT_WIDTH,
        align: 'center'
      });

    // ── QR dentro de una tarjeta, como las del email ──────────────────────────

    const cardX = (PAGE_WIDTH - QR_CARD_SIZE) / 2;
    const cardY = HEADER_HEIGHT + 48;

    doc
      .roundedRect(cardX, cardY, QR_CARD_SIZE, QR_CARD_SIZE, 12)
      .fillAndStroke(COLOR.cardBg, COLOR.border);

    const qrX = (PAGE_WIDTH - QR_SIZE) / 2;
    doc.image(data.qrImageBuffer, qrX, cardY + (QR_CARD_SIZE - QR_SIZE) / 2, { width: QR_SIZE });

    // ── Número de entrada y tipo ──────────────────────────────────────────────

    doc
      .font('Courier-Bold')
      .fontSize(11)
      .fillColor(COLOR.navy)
      .text(data.ticketNumber, MARGIN, cardY + QR_CARD_SIZE + 14, {
        width: CONTENT_WIDTH,
        align: 'center',
        characterSpacing: 0.3
      });

    doc
      .font('Helvetica-Bold')
      .fontSize(9.5)
      .fillColor(COLOR.accent)
      .text(data.ticketTypeName.toUpperCase(), MARGIN, cardY + QR_CARD_SIZE + 30, {
        width: CONTENT_WIDTH,
        align: 'center',
        characterSpacing: 0.6
      });

    // ── FOOTER: banda clara con borde superior, igual al pie del email ─────────

    doc.rect(0, FOOTER_TOP, PAGE_WIDTH, PAGE_HEIGHT - FOOTER_TOP).fill(COLOR.cardBg);
    doc.rect(0, FOOTER_TOP, PAGE_WIDTH, 1).fill(COLOR.border);

    doc
      .font('Helvetica-Bold')
      .fontSize(8)
      .fillColor(COLOR.text)
      .text(data.holderName, MARGIN, FOOTER_TOP + 14, { width: CONTENT_WIDTH });

    doc
      .font('Helvetica')
      .fontSize(7)
      .fillColor(COLOR.softMuted)
      .text(`Orden ${data.orderId}`, MARGIN, FOOTER_TOP + 26, { width: CONTENT_WIDTH });

    doc
      .font('Helvetica')
      .fontSize(7)
      .fillColor(COLOR.muted)
      .text('Entrada válida para una persona. No se permite el reingreso.', MARGIN, FOOTER_TOP + 44, {
        width: CONTENT_WIDTH,
        align: 'center'
      });

    doc.end();
    await endPromise;

    return Buffer.concat(chunks);
  }
}
