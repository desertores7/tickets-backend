import { Inject, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';
import { DBRepository } from '@config/db/db.repository';
import { RedisService } from '@config/redis/redis.service';

type StockItem = { ticketTypeId: string; quantity: number };

const stockKey = (ticketTypeId: string) => `stock:${ticketTypeId}`;

@Injectable()
export class StockService {
  private readonly logger = new Logger(StockService.name);

  constructor(
    @Inject(DBRepository) private readonly dbRepository: DBRepository,
    private readonly redisService: RedisService,
    private readonly dataSource: DataSource
  ) {}

  async initializeStock(ticketTypeId: string, quantity: number): Promise<void> {
    await this.redisService.setStock(stockKey(ticketTypeId), quantity);
  }

  async reserveStock(items: StockItem[]): Promise<{ success: boolean; failedItem?: string }> {
    const reserved: StockItem[] = [];

    for (const item of items) {
      const result = await this.redisService.reserveStock(stockKey(item.ticketTypeId), item.quantity);
      if (result === -1) {
        if (reserved.length > 0) {
          await this.releaseStock(reserved);
        }
        return { success: false, failedItem: item.ticketTypeId };
      }
      reserved.push(item);
    }

    return { success: true };
  }

  async releaseStock(items: StockItem[]): Promise<void> {
    await Promise.all(
      items.map(item => this.redisService.releaseStock(stockKey(item.ticketTypeId), item.quantity))
    );
  }

  async confirmStock(items: StockItem[], externalQueryRunner?: QueryRunner): Promise<void> {
    if (externalQueryRunner) {
      await this.runConfirmStockQueries(externalQueryRunner, items);
      return;
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await this.runConfirmStockQueries(queryRunner, items);
      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      this.logger.error('confirmStock transaction failed', err);
      throw new InternalServerErrorException('Failed to confirm stock');
    } finally {
      await queryRunner.release();
    }
  }

  private async runConfirmStockQueries(queryRunner: QueryRunner, items: StockItem[]): Promise<void> {
    for (const item of items) {
      await queryRunner.query(
        'UPDATE ticket_type SET availableQuantity = availableQuantity - ? WHERE uuid = ? AND availableQuantity >= ?',
        [item.quantity, item.ticketTypeId, item.quantity]
      );
    }
  }

  async getAvailability(
    ticketTypeId: string
  ): Promise<{ redis: number; postgres: number; inSync: boolean }> {
    const [redisStock, ticketType] = await Promise.all([
      this.redisService.getStock(stockKey(ticketTypeId)),
      this.dbRepository.findOne({
        entity: 'ticket_type',
        where: { uuid: ticketTypeId },
        select: { uuid: true, availableQuantity: true }
      })
    ]);

    const postgres = ticketType?.availableQuantity ?? 0;

    return {
      redis: redisStock,
      postgres,
      inSync: redisStock === postgres
    };
  }
}
