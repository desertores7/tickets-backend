import { ISalesRow } from './ireporting.service';

export interface ISalesExportService {
  toExcel(rows: ISalesRow[]): Promise<Buffer>;
  toPdf(rows: ISalesRow[]): Promise<Buffer>;
}
