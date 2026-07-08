import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';

// A6 portrait in points (72dpi): 105mm × 148mm
const PAGE_WIDTH = 298;
const PAGE_HEIGHT = 420;
const MARGIN = 20;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const GRAY = '#666666';
const QR_SIZE = 150;

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
      margin: MARGIN,
      info: {
        Title: `Ticket ${data.ticketNumber}`,
        Subject: data.eventName,
        Author: 'Ticketera'
      }
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    const endPromise = new Promise<void>(resolve => doc.on('end', resolve));

    // ── HEADER ────────────────────────────────────────────────────────────────

    doc
      .font('Helvetica-Bold')
      .fontSize(16)
      .text(data.eventName, MARGIN, MARGIN, { width: CONTENT_WIDTH, align: 'center' });

    doc
      .moveTo(MARGIN, doc.y + 6)
      .lineTo(PAGE_WIDTH - MARGIN, doc.y + 6)
      .strokeColor('#CCCCCC')
      .lineWidth(0.5)
      .stroke();

    doc.moveDown(0.8);

    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#333333')
      .text(formatEventDate(data.eventDate), { width: CONTENT_WIDTH, align: 'center' });

    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(GRAY)
      .text(`${data.eventVenue} · ${data.eventCity}`, { width: CONTENT_WIDTH, align: 'center' });

    // ── QR IMAGE ──────────────────────────────────────────────────────────────

    doc.moveDown(0.6);

    const qrX = (PAGE_WIDTH - QR_SIZE) / 2;
    const qrY = doc.y;

    doc.image(data.qrImageBuffer, qrX, qrY, { width: QR_SIZE });

    doc.y = qrY + QR_SIZE + 6;

    // ── TICKET NUMBER & TYPE ──────────────────────────────────────────────────

    doc
      .font('Courier-Bold')
      .fontSize(12)
      .fillColor('#000000')
      .text(data.ticketNumber, MARGIN, doc.y, { width: CONTENT_WIDTH, align: 'center' });

    doc.moveDown(0.3);

    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor('#000000')
      .text(data.ticketTypeName.toUpperCase(), { width: CONTENT_WIDTH, align: 'center' });

    // ── FOOTER ────────────────────────────────────────────────────────────────

    const footerY = PAGE_HEIGHT - MARGIN - 38;

    doc
      .moveTo(MARGIN, footerY)
      .lineTo(PAGE_WIDTH - MARGIN, footerY)
      .strokeColor('#CCCCCC')
      .lineWidth(0.5)
      .stroke();

    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#333333')
      .text(`Titular: ${data.holderName}`, MARGIN, footerY + 5, { width: CONTENT_WIDTH });

    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(GRAY)
      .text(`Orden: ${data.orderId}`, MARGIN, doc.y + 1, { width: CONTENT_WIDTH });

    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(GRAY)
      .text('Entrada válida para una persona. No se permite el reingreso.', MARGIN, doc.y + 3, {
        width: CONTENT_WIDTH,
        align: 'center'
      });

    doc.end();
    await endPromise;

    return Buffer.concat(chunks);
  }
}
