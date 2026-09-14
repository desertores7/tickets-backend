import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { ISalesRow } from '../contracts/ireporting.service';
import {
  IIncomeSummaryExportInput,
  IIncomeSummaryExportRow,
  ISalesExportService
} from '../contracts/isales-export.service';

/** Misma paleta que el resto de los documentos de la plataforma */
const COLOR = {
  navy: '#0f172a',
  sky: '#0284c7',
  grey: '#64748b',
  line: '#e2e8f0'
};

const PAYMENT_TYPE_LABEL: Record<string, string> = {
  credit_card: 'Tarjeta de crédito',
  debit_card: 'Tarjeta de débito',
  prepaid_card: 'Tarjeta prepaga',
  account_money: 'Dinero en cuenta',
  ticket: 'Pago en efectivo',
  bank_transfer: 'Transferencia',
  atm: 'Cajero',
  digital_currency: 'Moneda digital',
  card: 'Tarjeta',
  cash: 'Efectivo',
  mercadopago: 'Mercado Pago',
  other: 'Otro'
};

const PAYMENT_BRAND_LABEL: Record<string, string> = {
  visa: 'Visa',
  master: 'Mastercard',
  amex: 'American Express',
  naranja: 'Naranja',
  cabal: 'Cabal',
  debvisa: 'Visa Débito',
  debmaster: 'Mastercard Débito',
  account_money: 'Dinero en cuenta'
};

const PROVIDER_LABEL: Record<string, string> = {
  mercadopago: 'Mercado Pago',
  mercado_pago: 'Mercado Pago'
};

/**
 * Columnas del export de ventas. Se declaran una sola vez y las usan Excel y
 * PDF, para que ambos archivos digan exactamente lo mismo.
 *
 * No hay columna de costo de servicio y no debe agregarse: estos archivos los
 * descarga la productora (`BR-REPORT-001`).
 */
const SALES_COLUMNS: { header: string; width: number }[] = [
  { header: 'Origen', width: 14 },
  { header: 'Orden', width: 22 },
  { header: 'Comprador', width: 24 },
  { header: 'Tipo de entrada', width: 20 },
  { header: 'Cant.', width: 8 },
  { header: 'Medio de pago', width: 20 },
  { header: 'Monto', width: 12 },
  { header: 'Fecha', width: 18 },
  { header: 'Estado', width: 18 }
];

const INCOME_COLUMNS: { header: string; width: number }[] = [
  { header: 'Origen', width: 16 },
  { header: 'Referencia', width: 20 },
  { header: 'Persona', width: 22 },
  { header: 'Detalle', width: 28 },
  { header: 'Cant.', width: 8 },
  { header: 'Medio de pago', width: 18 },
  { header: 'Monto', width: 12 },
  { header: 'Fecha', width: 18 },
  { header: 'Estado', width: 16 }
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

function formatMoney(amount: number): string {
  return `$ ${amount.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function truncate(text: string, maxChars: number): string {
  const value = text?.trim() || '—';
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(1, maxChars - 1))}…`;
}

export function formatPaymentMethodLabel(
  method: string | null | undefined,
  provider?: string | null
): string {
  const code = method?.trim();
  if (code) {
    return PAYMENT_TYPE_LABEL[code] ?? PAYMENT_BRAND_LABEL[code] ?? code;
  }
  const providerCode = provider?.trim().toLowerCase();
  if (providerCode) {
    return PROVIDER_LABEL[providerCode] ?? provider!.trim();
  }
  return '—';
}

export function formatSaleStatus(row: Pick<ISalesRow, 'status' | 'quantity' | 'refundedQuantity'>): string {
  const refunded = row.refundedQuantity ?? 0;
  if (refunded > 0 && refunded >= row.quantity) return 'Reembolsada';
  if (refunded > 0) return `Reembolso parcial (${refunded}/${row.quantity})`;

  switch (row.status) {
    case 'paid':
      return 'Pagada';
    case 'refunded':
      return 'Reembolsada';
    case 'pending_payment':
      return 'Pago pendiente';
    case 'cancelled':
      return 'Cancelada';
    case 'expired':
      return 'Vencida';
    default:
      return row.status || '—';
  }
}

function salesDisplayRows(rows: ISalesRow[]) {
  return rows.map(row => ({
    origin: 'Venta online',
    orderNumber: row.orderNumber,
    buyerName: row.buyerName || '—',
    ticketTypeName: row.ticketTypeName || '—',
    quantity: row.quantity,
    paymentMethod: formatPaymentMethodLabel(row.paymentMethod, row.paymentProvider),
    amount: row.amount,
    purchasedAt: formatDateTime(row.purchasedAt),
    status: formatSaleStatus(row)
  }));
}

@Injectable()
export class SalesExportService implements ISalesExportService {
  async toExcel(rows: ISalesRow[]): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Ventas');
    const display = salesDisplayRows(rows);

    sheet.columns = SALES_COLUMNS.map((c, i) => ({
      header: c.header,
      key: String(i),
      width: c.width
    }));

    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0F172A' }
    };

    for (const row of display) {
      sheet.addRow([
        row.origin,
        row.orderNumber,
        row.buyerName,
        row.ticketTypeName,
        row.quantity,
        row.paymentMethod,
        row.amount,
        row.purchasedAt,
        row.status
      ]);
    }

    sheet.getColumn(7).numFmt = '"$"#,##0.00';
    sheet.autoFilter = { from: 'A1', to: { row: 1, column: SALES_COLUMNS.length } };

    if (rows.length > 0) {
      const totalRow = sheet.addRow([
        '',
        '',
        '',
        'TOTAL',
        rows.reduce((sum, r) => sum + r.quantity, 0),
        '',
        Math.round(rows.reduce((sum, r) => sum + r.amount, 0) * 100) / 100,
        '',
        ''
      ]);
      totalRow.font = { bold: true };
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async toPdf(rows: ISalesRow[]): Promise<Buffer> {
    const eventName =
      rows.length > 0 && rows.every(r => r.eventUuid === rows[0].eventUuid)
        ? rows[0].eventName
        : null;

    return this.renderTablePdf({
      title: eventName ? `Ventas — ${eventName}` : 'Ventas',
      subtitle: `Generado el ${formatDateTime(new Date())} · ${rows.length} registros`,
      headers: SALES_COLUMNS.map(c => c.header),
      // Apaisado: origen + medio + estado no entran cómodos en vertical
      widths: [78, 88, 108, 95, 36, 95, 68, 88, 90],
      rows: salesDisplayRows(rows).map(r => [
        r.origin,
        r.orderNumber,
        r.buyerName,
        r.ticketTypeName,
        String(r.quantity),
        r.paymentMethod,
        formatMoney(r.amount),
        r.purchasedAt,
        r.status
      ]),
      footer:
        rows.length > 0
          ? `Total: ${rows.reduce((s, r) => s + r.quantity, 0)} entradas · ${formatMoney(
              rows.reduce((s, r) => s + r.amount, 0)
            )}`
          : 'Sin ventas para los filtros aplicados.'
    });
  }

  async toIncomeSummaryExcel(input: IIncomeSummaryExportInput): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Ingresos');

    sheet.addRow([`Resumen de ingresos — ${input.eventName}`]);
    sheet.addRow([`Generado el ${formatDateTime(new Date())}`]);
    sheet.addRow([]);
    sheet.addRow([
      'Cant. ventas online',
      input.kpis.webSalesCount,
      'Ventas online $',
      input.kpis.webSalesAmount,
      'Cant. reembolsos',
      input.kpis.refundsCount,
      'Reembolsos $',
      -Math.abs(input.kpis.refundsAmount),
      'Caja $',
      input.kpis.cashIncomeAmount,
      'Total neto',
      input.kpis.netTotal
    ]);
    sheet.addRow([]);

    const headerRow = sheet.addRow(INCOME_COLUMNS.map(c => c.header));
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0F172A' }
    };

    INCOME_COLUMNS.forEach((c, i) => {
      sheet.getColumn(i + 1).width = c.width;
    });

    for (const row of input.rows) {
      sheet.addRow([
        row.origin,
        row.reference,
        row.party,
        row.detail,
        row.quantity,
        row.paymentMethod,
        row.amount,
        formatDateTime(row.occurredAt),
        row.status
      ]);
    }

    sheet.getColumn(7).numFmt = '"$"#,##0.00';

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async toIncomeSummaryPdf(input: IIncomeSummaryExportInput): Promise<Buffer> {
    const { kpis, rows, eventName } = input;
    const kpiLine = [
      `Ventas online: ${kpis.webSalesCount} · ${formatMoney(kpis.webSalesAmount)}`,
      `Reembolsos: ${kpis.refundsCount} · −${formatMoney(Math.abs(kpis.refundsAmount))}`,
      `Caja: ${formatMoney(kpis.cashIncomeAmount)}`,
      `Total neto: ${formatMoney(kpis.netTotal)}`
    ].join('  |  ');

    return this.renderTablePdf({
      title: `Resumen de ingresos — ${eventName}`,
      subtitle: `Generado el ${formatDateTime(new Date())} · ${rows.length} movimientos`,
      extraLine: kpiLine,
      headers: INCOME_COLUMNS.map(c => c.header),
      widths: [78, 88, 100, 120, 36, 90, 68, 88, 78],
      rows: rows.map((r: IIncomeSummaryExportRow) => [
        r.origin,
        r.reference,
        r.party,
        r.detail,
        String(r.quantity),
        r.paymentMethod,
        formatMoney(r.amount),
        formatDateTime(r.occurredAt),
        r.status
      ]),
      footer:
        rows.length > 0
          ? `Neto del resumen: ${formatMoney(kpis.netTotal)}`
          : 'Sin movimientos para exportar.'
    });
  }

  private renderTablePdf(opts: {
    title: string;
    subtitle: string;
    extraLine?: string;
    headers: string[];
    widths: number[];
    rows: string[][];
    footer: string;
  }): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const startX = doc.page.margins.left;
      const tableWidth = opts.widths.reduce((a, b) => a + b, 0);
      const rowHeight = 16;
      const maxChars = opts.widths.map(w => Math.max(4, Math.floor(w / 5.2)));

      const drawHeader = () => {
        const y = doc.y;
        doc.fillColor(COLOR.sky).font('Helvetica-Bold').fontSize(8);
        let x = startX;
        opts.headers.forEach((header, i) => {
          doc.text(header, x, y, {
            width: opts.widths[i],
            height: rowHeight,
            ellipsis: true,
            lineBreak: false
          });
          x += opts.widths[i];
        });
        doc
          .moveTo(startX, y + 12)
          .lineTo(startX + tableWidth, y + 12)
          .strokeColor(COLOR.sky)
          .lineWidth(1)
          .stroke();
        doc.y = y + 16;
      };

      doc.fillColor(COLOR.navy).font('Helvetica-Bold').fontSize(16).text(opts.title, startX);
      doc
        .fillColor(COLOR.grey)
        .font('Helvetica')
        .fontSize(9)
        .text(opts.subtitle, startX);
      if (opts.extraLine) {
        doc.moveDown(0.3);
        doc.fillColor(COLOR.navy).fontSize(8).text(opts.extraLine, startX, undefined, {
          width: tableWidth
        });
      }
      doc.moveDown(0.8);
      drawHeader();

      doc.fillColor(COLOR.navy).font('Helvetica').fontSize(8);

      for (const values of opts.rows) {
        if (doc.y > doc.page.height - 56) {
          doc.addPage({ size: 'A4', layout: 'landscape', margin: 36 });
          drawHeader();
          doc.fillColor(COLOR.navy).font('Helvetica').fontSize(8);
        }

        const y = doc.y;
        let x = startX;
        values.forEach((value, i) => {
          doc.text(truncate(value, maxChars[i]), x, y, {
            width: opts.widths[i],
            height: rowHeight - 2,
            ellipsis: true,
            lineBreak: false
          });
          x += opts.widths[i];
        });
        doc
          .moveTo(startX, y + rowHeight - 2)
          .lineTo(startX + tableWidth, y + rowHeight - 2)
          .strokeColor(COLOR.line)
          .lineWidth(0.4)
          .stroke();
        doc.y = y + rowHeight;
      }

      doc.moveDown(0.8);
      doc
        .fillColor(COLOR.navy)
        .font('Helvetica-Bold')
        .fontSize(10)
        .text(opts.footer, startX);

      doc.end();
    });
  }
}
