import { Injectable, Logger } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { EMAIL_BRAND } from '@root/shared/auth/const/email-brand';

/**
 * A5 vertical en puntos (72dpi): 148mm × 210mm.
 *
 * Antes era A6. Entraba el QR y poco más: el flyer no tenía dónde ir y las
 * condiciones de uso —que en cualquier entrada impresa ocupan un bloque— no
 * entraban en absoluto. A5 sigue siendo formato "entrada" (se imprime en media
 * A4 sin recortar nada) y deja lugar para portada, datos y letra chica.
 */
const PAGE_WIDTH = 420;
const PAGE_HEIGHT = 595;
const MARGIN = 28;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

/**
 * La paleta sale de `EMAIL_BRAND.colors`, la misma que pintan los templates.
 * Antes había acá una copia con los colores viejos (navy y celeste) y el PDF
 * terminó pareciendo de otra marca que el email que lo lleva adjunto.
 */
const COLOR = {
  ...EMAIL_BRAND.colors,
  /**
   * El QR va sobre blanco puro, no sobre la superficie oscura: los lectores de
   * la puerta necesitan el contraste máximo y muchos ni siquiera leen un QR
   * invertido. Es la única isla clara del diseño, y es a propósito.
   */
  qrCard: '#ffffff'
} as const;

// ── Grilla vertical ─────────────────────────────────────────────────────────
// Posiciones absolutas: el documento no fluye, cada bloque se dibuja donde va.
// Están todas acá arriba para poder mover un bloque sin cazar números sueltos.

const BRAND_Y = 15;
const HERO_Y = 36;
const HERO_HEIGHT = 134;
/** Alto del velo que funde la portada con el fondo, para que el título respire. */
const HERO_FADE = 56;

const TITLE_Y = 180;
const TITLE_HEIGHT = 38;
const RULE_Y = 220;
const DATE_Y = 228;
const VENUE_Y = 242;

const QR_CARD_Y = 258;
const QR_CARD_SIZE = 152;
const QR_SIZE = 132;

const TICKET_NUMBER_Y = 416;
const TICKET_TYPE_Y = 431;

/** Línea troquelada: separa el "talón" con los datos del comprador. */
const PERFORATION_Y = 449;
const HOLDER_Y = 460;

const FOOTER_TOP = 482;

export interface TicketPdfData {
  ticketNumber: string;
  eventName: string;
  eventDate: Date;
  eventVenue: string;
  eventCity: string;
  eventAddress?: string | null;
  ticketTypeName: string;
  holderName: string;
  orderId: string;
  qrImageBuffer: Buffer;
  /**
   * Portada del evento ya normalizada a JPEG/PNG y recortada al alto del
   * encabezado. Opcional a propósito: un evento sin flyer, o un archivo que no
   * se pudo leer, no puede dejar al comprador sin entrada.
   */
  flyerImageBuffer?: Buffer | null;
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

function formatIssuedAt(date: Date): string {
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(date);
}

/**
 * Condiciones de uso.
 *
 * Es lo que cualquiera espera encontrar en una entrada y lo que evita
 * discusiones en la puerta: un ingreso por entrada, QR de un solo uso, nada de
 * reventa, y a quién escribirle. Están acá y no en el layout para poder
 * ajustar el texto sin tocar el dibujo.
 */
const TERMS: readonly string[] = [
  'Entrada válida para una persona. El código QR habilita un único ingreso: una vez escaneado queda anulado y no permite reingresar.',
  'Presentala impresa o desde el celular con el brillo alto. La organización puede pedir tu DNI para verificar la titularidad.',
  `Prohibida su reventa. ${EMAIL_BRAND.appName} no reconoce entradas compradas fuera de sus canales oficiales, ni códigos duplicados, alterados o capturados de una pantalla ajena.`,
  'El ingreso queda sujeto al reglamento del predio y a la normativa vigente sobre menores, horarios y capacidad. No se aceptan devoluciones salvo cancelación o reprogramación del evento.'
];

@Injectable()
export class PdfTicketService {
  private readonly logger = new Logger(PdfTicketService.name);

  async generateTicketPdf(data: TicketPdfData): Promise<Buffer> {
    const doc = new PDFDocument({
      size: [PAGE_WIDTH, PAGE_HEIGHT],
      margin: 0,
      info: {
        Title: `Entrada ${data.ticketNumber}`,
        Subject: data.eventName,
        Author: EMAIL_BRAND.appName,
        Keywords: `${EMAIL_BRAND.appName}, entrada, ${data.eventName}`
      }
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    const endPromise = new Promise<void>(resolve => doc.on('end', resolve));

    // ── Fondo: la tarjeta oscura del email, de punta a punta ──────────────────

    doc.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT).fill(COLOR.surface);

    // Franja degradada superior, la misma del header de los emails.
    const franja = doc.linearGradient(0, 0, PAGE_WIDTH, 0);
    franja.stop(0, COLOR.accent).stop(0.55, '#8b5cf6').stop(1, '#22d3ee');
    doc.rect(0, 0, PAGE_WIDTH, 3).fill(franja);

    this.drawBrandRow(doc);
    this.drawHero(doc, data);
    this.drawEventHeadline(doc, data);
    this.drawQr(doc, data);
    this.drawPerforation(doc);
    this.drawHolder(doc, data);
    this.drawFooter(doc);

    doc.end();
    await endPromise;

    return Buffer.concat(chunks);
  }

  /** Marca a la izquierda, naturaleza del documento a la derecha. */
  private drawBrandRow(doc: PDFKit.PDFDocument): void {
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor(COLOR.textPrimary)
      .text(EMAIL_BRAND.appName.toUpperCase(), MARGIN, BRAND_Y, {
        width: CONTENT_WIDTH / 2,
        characterSpacing: 1.6
      });

    doc
      .font('Helvetica')
      .fontSize(7)
      .fillColor(COLOR.textMuted)
      .text('ENTRADA DIGITAL', MARGIN + CONTENT_WIDTH / 2, BRAND_Y + 2, {
        width: CONTENT_WIDTH / 2,
        align: 'right',
        characterSpacing: 1.2
      });
  }

  /**
   * Portada del evento a todo el ancho.
   *
   * La imagen se recorta al rectángulo con `clip`, no se deforma: un flyer
   * estirado para entrar en la banda se ve peor que no poner nada. Abajo va un
   * velo degradado hacia el fondo para que el corte no quede como un tajo.
   */
  private drawHero(doc: PDFKit.PDFDocument, data: TicketPdfData): void {
    doc.save();
    doc.rect(0, HERO_Y, PAGE_WIDTH, HERO_HEIGHT).clip();

    let painted = false;
    if (data.flyerImageBuffer?.length) {
      try {
        doc.image(data.flyerImageBuffer, 0, HERO_Y, {
          cover: [PAGE_WIDTH, HERO_HEIGHT],
          align: 'center',
          valign: 'center'
        });
        painted = true;
      } catch (err) {
        // Un flyer que pdfkit no sabe leer no puede tumbar la entrada.
        this.logger.warn(
          `No se pudo insertar la portada en el PDF de ${data.ticketNumber}: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
    }

    if (!painted) {
      // Sin portada: degradado de marca en vez de un rectángulo vacío.
      const fondo = doc.linearGradient(0, HERO_Y, PAGE_WIDTH, HERO_Y + HERO_HEIGHT);
      fondo.stop(0, COLOR.accentDark).stop(0.6, COLOR.surfaceRaised).stop(1, COLOR.surface);
      doc.rect(0, HERO_Y, PAGE_WIDTH, HERO_HEIGHT).fill(fondo);

      doc
        .font('Helvetica-Bold')
        .fontSize(11)
        .fillColor(COLOR.textPrimary)
        .text(EMAIL_BRAND.appTagline.toUpperCase(), MARGIN, HERO_Y + HERO_HEIGHT / 2 - 6, {
          width: CONTENT_WIDTH,
          align: 'center',
          characterSpacing: 1.4
        });
    }

    const velo = doc.linearGradient(0, HERO_Y + HERO_HEIGHT - HERO_FADE, 0, HERO_Y + HERO_HEIGHT);
    velo.stop(0, COLOR.surface, 0).stop(1, COLOR.surface, 1);
    doc.rect(0, HERO_Y + HERO_HEIGHT - HERO_FADE, PAGE_WIDTH, HERO_FADE).fill(velo);

    doc.restore();
  }

  /** Nombre del evento, fecha y lugar. */
  private drawEventHeadline(doc: PDFKit.PDFDocument, data: TicketPdfData): void {
    // Un nombre largo baja de cuerpo en vez de cortarse con puntos suspensivos:
    // el evento es lo primero que se lee y una entrada que dice "Festival
    // Internacional de Música Electróni…" parece rota.
    const titleSize = data.eventName.trim().length > 34 ? 13 : 17;

    doc
      .font('Helvetica-Bold')
      .fontSize(titleSize)
      .fillColor(COLOR.textPrimary)
      .text(data.eventName, MARGIN, TITLE_Y, {
        width: CONTENT_WIDTH,
        align: 'center',
        height: TITLE_HEIGHT,
        ellipsis: true,
        lineGap: 1
      });

    doc.rect(PAGE_WIDTH / 2 - 18, RULE_Y, 36, 2.5).fill(COLOR.accent);

    doc
      .font('Helvetica')
      .fontSize(9.5)
      .fillColor(COLOR.textBody)
      .text(formatEventDate(data.eventDate), MARGIN, DATE_Y, {
        width: CONTENT_WIDTH,
        align: 'center'
      });

    const lugar = [data.eventVenue, data.eventAddress?.trim(), data.eventCity]
      .filter((part): part is string => Boolean(part && part.trim()))
      .join(' · ');

    doc
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor(COLOR.textMuted)
      .text(lugar, MARGIN, VENUE_Y, {
        width: CONTENT_WIDTH,
        align: 'center',
        height: 12,
        ellipsis: true
      });
  }

  /** Tarjeta blanca con el QR, número de entrada y tanda. */
  private drawQr(doc: PDFKit.PDFDocument, data: TicketPdfData): void {
    const cardX = (PAGE_WIDTH - QR_CARD_SIZE) / 2;

    doc.roundedRect(cardX, QR_CARD_Y, QR_CARD_SIZE, QR_CARD_SIZE, 12).fill(COLOR.qrCard);

    const qrX = (PAGE_WIDTH - QR_SIZE) / 2;
    doc.image(data.qrImageBuffer, qrX, QR_CARD_Y + (QR_CARD_SIZE - QR_SIZE) / 2, { width: QR_SIZE });

    doc
      .font('Courier-Bold')
      .fontSize(11)
      .fillColor(COLOR.textPrimary)
      .text(data.ticketNumber, MARGIN, TICKET_NUMBER_Y, {
        width: CONTENT_WIDTH,
        align: 'center',
        characterSpacing: 0.3
      });

    doc
      .font('Helvetica-Bold')
      .fontSize(9.5)
      .fillColor(COLOR.accent)
      .text(data.ticketTypeName.toUpperCase(), MARGIN, TICKET_TYPE_Y, {
        width: CONTENT_WIDTH,
        align: 'center',
        characterSpacing: 0.6,
        height: 12,
        ellipsis: true
      });
  }

  /**
   * Troquelado.
   *
   * La línea de puntos con los dos semicírculos en los bordes es el gesto que
   * hace que una hoja se lea como una entrada. Los círculos van pintados del
   * color del lienzo del email, un tono más oscuro que la tarjeta, así parecen
   * perforaciones y no manchas.
   */
  private drawPerforation(doc: PDFKit.PDFDocument): void {
    doc.save();
    doc
      .dash(3, { space: 3 })
      .moveTo(MARGIN, PERFORATION_Y)
      .lineTo(PAGE_WIDTH - MARGIN, PERFORATION_Y)
      .lineWidth(0.8)
      .strokeColor(COLOR.border)
      .stroke();
    doc.undash();
    doc.restore();

    doc.circle(0, PERFORATION_Y, 7).fill(COLOR.canvas);
    doc.circle(PAGE_WIDTH, PERFORATION_Y, 7).fill(COLOR.canvas);
  }

  /** Titular y orden, en dos columnas debajo del troquelado. */
  private drawHolder(doc: PDFKit.PDFDocument, data: TicketPdfData): void {
    const colWidth = (CONTENT_WIDTH - 16) / 2;
    const rightX = MARGIN + colWidth + 16;

    const label = (text: string, x: number) => {
      doc
        .font('Helvetica')
        .fontSize(6.5)
        .fillColor(COLOR.textFaint)
        .text(text, x, HOLDER_Y, { width: colWidth, characterSpacing: 1 });
    };

    label('TITULAR', MARGIN);
    label('ORDEN', rightX);

    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor(COLOR.textPrimary)
      .text(data.holderName, MARGIN, HOLDER_Y + 10, {
        width: colWidth,
        height: 12,
        ellipsis: true
      });

    doc
      .font('Courier')
      .fontSize(7)
      .fillColor(COLOR.textMuted)
      .text(data.orderId, rightX, HOLDER_Y + 11, {
        width: colWidth,
        height: 12,
        ellipsis: true
      });
  }

  /** Condiciones de uso y datos de contacto. */
  private drawFooter(doc: PDFKit.PDFDocument): void {
    doc.rect(0, FOOTER_TOP, PAGE_WIDTH, PAGE_HEIGHT - FOOTER_TOP).fill(COLOR.surfaceRaised);
    doc.rect(0, FOOTER_TOP, PAGE_WIDTH, 1).fill(COLOR.border);

    doc
      .font('Helvetica-Bold')
      .fontSize(6.5)
      .fillColor(COLOR.textMuted)
      .text('CONDICIONES DE USO', MARGIN, FOOTER_TOP + 10, {
        width: CONTENT_WIDTH,
        characterSpacing: 1.1
      });

    doc.font('Helvetica').fontSize(6.3).fillColor(COLOR.textFaint);

    let y = FOOTER_TOP + 21;
    for (const linea of TERMS) {
      doc.text(linea, MARGIN, y, { width: CONTENT_WIDTH, align: 'justify', lineGap: 0.5 });
      y = doc.y + 2;
    }

    doc
      .font('Helvetica')
      .fontSize(6.5)
      .fillColor(COLOR.textMuted)
      .text(
        `Consultas: ${EMAIL_BRAND.supportEmail} · ${EMAIL_BRAND.siteDomain}`,
        MARGIN,
        PAGE_HEIGHT - 26,
        { width: CONTENT_WIDTH, align: 'center' }
      );

    doc
      .font('Helvetica')
      .fontSize(6)
      .fillColor(COLOR.textFaint)
      .text(
        `Emitida por ${EMAIL_BRAND.appName} el ${formatIssuedAt(new Date())}`,
        MARGIN,
        PAGE_HEIGHT - 15,
        { width: CONTENT_WIDTH, align: 'center' }
      );
  }
}
