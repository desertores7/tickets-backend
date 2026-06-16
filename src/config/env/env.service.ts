import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Env } from './env.config';

@Injectable()
export class EnvService {
  constructor(private configService: ConfigService<Env, true>) {
    console.log('EnvService constructor');
  }

  get<T extends keyof Env>(key: T) {
    return this.configService.get(key, { infer: true });
  }
}
