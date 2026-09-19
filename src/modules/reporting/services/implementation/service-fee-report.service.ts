import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { DataSource } from 'typeorm';
import { DBRepository } from '@config/db/db.repository';
import { OrderStatus } from '@config/db/entities/tickets/order.entity';
import { isCappedServiceFee } from '@modules/orders/services/core/service-fee';

type RawTicketFeeRow = {
  orderNumber: string;
  paidAt: Date | string | null;
  buyerFirstName: string | null;
  buyerLastName: string | null;
  ticketNumber: string;
  ticketStatus: string;
  ticketTypeName: string | null;
  unitPrice: string;
  admissionsPerUnit: string | number | null;
  discountAmount: string;
  serviceFee: string;
  serviceFeeRate: string | null;
  serviceFeeCap: string | null;
};

const TICKET_STATUS_LABEL: Record<string, string> = {
  active: 'Vigente',
  used: 'Utilizada',
  refunded: 'Reembolsada',
  cancelled: 'Cancelada',
  transferred: 'Transferida'
};

const MONEY_FORMAT = '"$"#,##0.00';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatMoney(amount: number): string {
  return `$ ${amount.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function formatDateTime(value: Date | string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Argentina/Buenos_Aires'
  }).format(new Date(value));
}

/**
 * Informe del costo de servicio cobrado, entrada por entrada, de un evento.
 *
 * Lo genera el Administrador para dárselo a la productora. Muestra el fee que
 * **se cobró** en cada compra —guardado al comprar— y con qué regla: si el tope
 * cambió en el medio, cada entrada conserva el suyo y el informe lo explica.
 *
 * Las entradas reembolsadas siguen figurando: el costo de servicio no se
 * devuelve (`BR-REFUND-006`).
 */
@Injectable()
export class ServiceFeeReportService {
  constructor(
    @Inject(DBRepository) private readonly dbRepository: DBRepository,
    private readonly dataSource: DataSource
  ) {}

  async buildEventReport(eventUuid: string): Promise<{ filename: string; buffer: Buffer }> {
    const event = await this.dbRepository.findOne({
      entity: 'event',
      where: { uuid: eventUuid },
      relations: { organization: true }
    });
    if (!event) throw new NotFoundException('Evento no encontrado');

    const rows: RawTicketFeeRow[] = await this.dataSource
      .createQueryBuilder()
      .select([
        'o.orderNumber AS orderNumber',
        'o.paidAt AS paidAt',
        'u.firstName AS buyerFirstName',
        'u.lastName AS buyerLastName',
        't.ticketNumber AS ticketNumber',
        't.status AS ticketStatus',
        "CONCAT_WS(' · ', tt.name, t.unitLabel) AS ticketTypeName",
        'oi.unitPrice AS unitPrice',
        'oi.admissionsPerUnit AS admissionsPerUnit',
        't.discountAmount AS discountAmount',
        't.serviceFee AS serviceFee',
        'o.serviceFeeRate AS serviceFeeRate',
        'o.serviceFeeCap AS serviceFeeCap'
      ])
      .from('ticket', 't')
      .innerJoin('order_item', 'oi', 'oi.uuid = t.orderItemUuid')
      .innerJoin('orders', 'o', 'o.uuid = oi.orderUuid')
      .innerJoin('ticket_type', 'tt', 'tt.uuid = t.ticketTypeUuid')
      .innerJoin('user', 'u', 'u.uuid = o.userUuid')
      .where('t.eventUuid = :eventUuid', { eventUuid })
      .andWhere('o.status IN (:...statuses)', { statuses: [OrderStatus.PAID, OrderStatus.REFUNDED] })
      .orderBy('o.paidAt', 'ASC')
      .addOrderBy('t.ticketNumber', 'ASC')
      .getRawMany();

    const detail = rows.map(row => {
      // En unidad completa (BR-SALE-010) la línea es la mesa entera: el precio
      // de cada entrada es la mesa dividida por sus entradas, igual que se
      // calculó el fee al vender.
      const price = round2(Number(row.unitPrice) / Math.max(1, Number(row.admissionsPerUnit ?? 1)));
      const discount = Number(row.discountAmount);
      const finalPrice = round2(price - discount);
      const fee = Number(row.serviceFee);
      return {
        orderNumber: row.orderNumber,
        paidAt: formatDateTime(row.paidAt),
        buyer: `${row.buyerFirstName ?? ''} ${row.buyerLastName ?? ''}`.trim() || '—',
        ticketNumber: row.ticketNumber,
        ticketType: row.ticketTypeName ?? '—',
        price,
        discount,
        finalPrice,
        fee,
        rule: this.describeRule(finalPrice, fee, row.serviceFeeRate, row.serviceFeeCap),
        status: TICKET_STATUS_LABEL[row.ticketStatus] ?? row.ticketStatus
      };
    });

    const workbook = new ExcelJS.Workbook();
    this.addSummarySheet(workbook, event, detail);
    this.addDetailSheet(workbook, detail);

    const stamp = new Date().toISOString().slice(0, 10);
    const slug = (event.slug as string | null) || event.uuid;
    return {
      filename: `costo-de-servicio-${slug}-${stamp}.xlsx`,
      buffer: Buffer.from(await workbook.xlsx.writeBuffer())
    };
  }

  /** Con qué regla se cobró esa entrada, en palabras. */
  private describeRule(
    finalPrice: number,
    fee: number,
    rate: string | null,
    cap: string | null
  ): string {
    if (rate === null) return '—';
    const percent = `${round2(Number(rate) * 100)}%`;
    if (cap === null) return `${percent} (regla anterior, sin tope)`;
    return isCappedServiceFee(finalPrice, fee, Number(rate), Number(cap))
      ? `Tope por entrada (${formatMoney(Number(cap))})`
      : percent;
  }

  private addSummarySheet(
    workbook: ExcelJS.Workbook,
    event: { name: string; organization?: { name?: string } | null },
    detail: { price: number; discount: number; finalPrice: number; fee: number }[]
  ): void {
    const sheet = workbook.addWorksheet('Resumen');
    sheet.columns = [
      { key: 'label', width: 38 },
      { key: 'value', width: 60 }
    ];

    const title = sheet.addRow(['Costo de servicio por entrada']);
    title.font = { bold: true, size: 14 };
    sheet.addRow([]);

    const sum = (pick: (d: (typeof detail)[number]) => number) =>
      round2(detail.reduce((total, d) => total + pick(d), 0));

    const rows: [string, string | number][] = [
      ['Evento', event.name],
      ['Productora', event.organization?.name ?? '—'],
      ['Generado', formatDateTime(new Date())],
      ['Entradas vendidas', detail.length],
      ['Valor de las entradas', sum(d => d.price)],
      ['Descuentos de cupones', sum(d => d.discount)],
      ['Valor de las entradas con descuento', sum(d => d.finalPrice)],
      ['Costo de servicio cobrado', sum(d => d.fee)]
    ];
    rows.forEach(([label, value]) => {
      const row = sheet.addRow([label, value]);
      row.getCell(1).font = { bold: true };
      if (typeof value === 'number' && label !== 'Entradas vendidas') {
        row.getCell(2).numFmt = MONEY_FORMAT;
      }
    });

    sheet.addRow([]);
    const note = sheet.addRow([
      'Cómo se calcula',
      'El costo de servicio lo paga el comprador y es un ingreso de la plataforma: la productora ' +
        'recibe el valor de sus entradas. Es un porcentaje del precio de cada entrada, con un tope ' +
        'por entrada; el porcentaje y el tope de cada compra figuran en "Regla aplicada". Cada ' +
        'compra conserva el costo con el que se pagó: si la regla cambió, las ' +
        'entradas vendidas antes no se recalculan. El costo de servicio no se devuelve en los ' +
        'reembolsos.'
    ]);
    note.getCell(1).font = { bold: true };
    note.getCell(2).alignment = { wrapText: true, vertical: 'top' };
    note.height = 90;
  }

  private addDetailSheet(
    workbook: ExcelJS.Workbook,
    detail: {
      orderNumber: string;
      paidAt: string;
      buyer: string;
      ticketNumber: string;
      ticketType: string;
      price: number;
      discount: number;
      finalPrice: number;
      fee: number;
      rule: string;
      status: string;
    }[]
  ): void {
    const sheet = workbook.addWorksheet('Detalle por entrada');
    sheet.columns = [
      { header: 'Orden', key: 'orderNumber', width: 22 },
      { header: 'Fecha de pago', key: 'paidAt', width: 18 },
      { header: 'Comprador', key: 'buyer', width: 26 },
      { header: 'N° de entrada', key: 'ticketNumber', width: 22 },
      { header: 'Tipo de entrada', key: 'ticketType', width: 22 },
      { header: 'Precio', key: 'price', width: 14 },
      { header: 'Descuento', key: 'discount', width: 13 },
      { header: 'Precio final', key: 'finalPrice', width: 14 },
      { header: 'Costo de servicio', key: 'fee', width: 17 },
      { header: 'Regla aplicada', key: 'rule', width: 30 },
      { header: 'Estado', key: 'status', width: 14 }
    ];

    const header = sheet.getRow(1);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };

    detail.forEach(d => sheet.addRow(d));
    ['price', 'discount', 'finalPrice', 'fee'].forEach(key => {
      sheet.getColumn(key).numFmt = MONEY_FORMAT;
    });
    sheet.autoFilter = { from: 'A1', to: { row: 1, column: sheet.columns.length } };

    if (detail.length > 0) {
      const total = sheet.addRow({
        ticketType: 'TOTAL',
        price: round2(detail.reduce((s, d) => s + d.price, 0)),
        discount: round2(detail.reduce((s, d) => s + d.discount, 0)),
        finalPrice: round2(detail.reduce((s, d) => s + d.finalPrice, 0)),
        fee: round2(detail.reduce((s, d) => s + d.fee, 0))
      });
      total.font = { bold: true };
    }
  }
}
