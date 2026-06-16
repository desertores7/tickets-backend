import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import chalk from 'chalk';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private logger = new Logger('HTTP');

  use(_request: Request & { start: number }, response: Response, next: NextFunction): void {
    response.on('close', () => {
      const { statusCode, req } = response;

      if (statusCode < 400) {
        const time = new Date().getTime() - _request.start;
        const color = time > 1000 ? chalk.red : time > 500 ? chalk.yellow : chalk.green;

        this.logger.log(`${req.method} ${req.url} ${statusCode} ${color(`(${time}ms)`)}`);
      } else {
        this.logger.error(`${req.method} ${req.url} ${statusCode}`);
      }
    });

    next();
  }
}
