import { ApiProperty } from '@nestjs/swagger';

export class PaginationMetaResponse {
  @ApiProperty()
  totalItems: number;

  @ApiProperty()
  pageSize: number;

  @ApiProperty()
  totalPages: number;

  @ApiProperty()
  currentPage: number;

  constructor(data: { limit: number; page: number; total: number }) {
    this.totalItems = data.total;
    this.pageSize = data.limit;
    this.totalPages = Math.ceil(data.total / data.limit);
    this.currentPage = data.page;
  }
}
