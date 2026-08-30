import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { ISalesRow } from '../contracts/ireporting.service';
import { ISalesExportService } from '../contracts/isales-export.service';

/** Misma paleta que el resto de los documentos de la plataforma */
const COLOR = {
  navy: '#0f172a',
  sky: '#0284c7',
  grey: '#64748b'
};

/**
 * Columnas del export. Se declaran una sola vez y las usan Excel y PDF, para
 * que ambos archivos digan exactamente lo mismo.
 *
 * No hay columna de costo de servicio y no debe agregarse: estos archivos los
 * descarga la productora (`BR-REPORT-001`).
 */
const COLUMNS: { header: string; key: keyof ISalesRow; width: number }[] = [
  { header: 'Orden', key: 'orderNumber', width: 22 },
  { header: 'Comprador', key: 'buyerName', width: 26 },
  { header: 'Email', key: 'buyerEmail', width: 30 },
  { header: 'Evento', key: 'eventName', width: 30 },
  { header: 'Tipo de entrada', key: 'ticketTypeName', width: 22 },
  { header: 'Cantidad', key: 'quantity', width: 10 },
  { header: 'Monto', key: 'amount', width: 14 },
  { header: 'Fecha de compra', key: 'purchasedAt', width: 20 },
  { header: 'Estado', key: 'status', width: 14 }
];

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(value);
}

@Injectable()
export class SalesExportService implements ISalesExportService {
  async toExcel(rows: ISalesRow[]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Ventas');

    sheet.columns = COLUMNS.map(c => ({ header: c.header, key: c.key as string, width: c.width }));

    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0F172A' }
    };

    for (const row of rows) {
      sheet.addRow({
        ...row,
        // Fecha como texto ya formateado: Excel reinterpreta las fechas según
        // la configuración regional de quien abre el archivo.
        purchasedAt: formatDateTime(row.purchasedAt)
      });
    }

    // Se formatea como moneda para que el total se pueda calcular en la planilla
    sheet.getColumn('amount').numFmt = '"$"#,##0.00';
    sheet.autoFilter = { from: 'A1', to: { row: 1, column: COLUMNS.length } };

    if (rows.length > 0) {
      const totalRow = sheet.addRow({
        ticketTypeName: 'TOTAL',
        quantity: rows.reduce((sum, r) => sum + r.quantity, 0),
        amount: Math.round(rows.reduce((sum, r) => sum + r.amount, 0) * 100) / 100
      });
      totalRow.font = { bold: true };
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async toPdf(rows: ISalesRow[]): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      // Apaisado: nueve columnas no entran cómodas en vertical
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fillColor(COLOR.navy).fontSize(18).text('Ventas', { continued: false });
      doc
        .fillColor(COLOR.grey)
        .fontSize(9)
        .text(`Generado el ${formatDateTime(new Date())} · ${rows.length} registros`);
      doc.moveDown(1);

      const startX = doc.x;
      const widths = [80, 100, 130, 130, 90, 45, 70, 95, 60];

      const drawHeader = () => {
        const y = doc.y;
        doc.fillColor(COLOR.sky).fontSize(9);
        let x = startX;
        COLUMNS.forEach((col, i) => {
          doc.text(col.header, x, y, { width: widths[i], ellipsis: true });
          x += widths[i];
        });
        doc.moveTo(startX, doc.y + 2).lineTo(startX + widths.reduce((a, b) => a + b, 0), doc.y + 2)
          .strokeColor(COLOR.sky).stroke();
        doc.moveDown(0.6);
      };

      drawHeader();
      doc.fillColor(COLOR.navy).fontSize(8);

      for (const row of rows) {
        // Salto de página manual: PDFKit no repite encabezados por sí solo
        if (doc.y > doc.page.height - 60) {
          doc.addPage({ size: 'A4', layout: 'landscape', margin: 36 });
          drawHeader();
          doc.fillColor(COLOR.navy).fontSize(8);
        }

        const y = doc.y;
        let x = startX;
        const values = [
          row.orderNumber,
          row.buyerName,
          row.buyerEmail,
          row.eventName,
          row.ticketTypeName,
          String(row.quantity),
          `$ ${row.amount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`,
          formatDateTime(row.purchasedAt),
          row.status
        ];
        values.forEach((value, i) => {
          doc.text(value, x, y, { width: widths[i], ellipsis: true, lineBreak: false });
          x += widths[i];
        });
        doc.moveDown(0.5);
      }

      if (rows.length > 0) {
        doc.moveDown(0.5);
        const total = rows.reduce((sum, r) => sum + r.amount, 0);
        const tickets = rows.reduce((sum, r) => sum + r.quantity, 0);
        doc
          .fillColor(COLOR.navy)
          .fontSize(10)
          .text(
            `Total: ${tickets} entradas · $ ${total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`,
            startX
          );
      } else {
        doc.fillColor(COLOR.grey).fontSize(10).text('Sin ventas para los filtros aplicados.', startX);
      }

      doc.end();
    });
  }
}
