import { DBRepository } from '@config/db/db.repository';
import { SystemParameterEntity } from '@config/db/entities/system/system_parameter.entity';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { IsNull, Repository } from 'typeorm';
import { DataSource } from 'typeorm';
import { ISystemParameterService } from '../contracts/isystem-parameter.service';
import { INTERNAL_API_TOKEN_KEY } from '@root/shared/auth/guards/internal-token.guard';
import * as crypto from 'crypto';

@Injectable()
export class SystemParameterService implements ISystemParameterService {
  private readonly logger = new Logger(SystemParameterService.name);
  private parameterRepository: Repository<SystemParameterEntity>;

  constructor(
    @Inject(DBRepository) private dbRepository: DBRepository,
    readonly dataSource: DataSource
  ) {
    this.parameterRepository = this.dataSource.getRepository(SystemParameterEntity);
  }

  async getParameter(key: string): Promise<SystemParameterEntity | null> {
    return await this.parameterRepository.findOne({
      where: {
        key,
        isDeleted: IsNull()
      }
    });
  }

  async getParameterValue(key: string, defaultValue?: string): Promise<string> {
    const parameter = await this.getParameter(key);
    if (!parameter) {
      if (defaultValue !== undefined) {
        return defaultValue;
      }
      throw new Error(`Parameter '${key}' not found and no default value provided`);
    }
    return parameter.value;
  }

  async getParameterAsNumber(key: string, defaultValue?: number): Promise<number> {
    const value = await this.getParameterValue(key, defaultValue?.toString());
    const numValue = parseFloat(value);
    if (isNaN(numValue)) {
      if (defaultValue !== undefined) {
        return defaultValue;
      }
      throw new Error(`Parameter '${key}' is not a valid number and no default value provided`);
    }
    return numValue;
  }

  async getParameterAsBoolean(key: string, defaultValue?: boolean): Promise<boolean> {
    const value = await this.getParameterValue(key, defaultValue?.toString());
    const lowerValue = value.toLowerCase().trim();
    return lowerValue === 'true' || lowerValue === '1' || lowerValue === 'yes';
  }

  async setParameter(
    key: string,
    value: string,
    description?: string,
    type: string = 'string',
    userId?: string
  ): Promise<SystemParameterEntity> {
    const existing = await this.getParameter(key);

    if (existing) {
      // Actualizar parámetro existente
      existing.value = value;
      if (description !== undefined) {
        existing.description = description;
      }
      if (type) {
        existing.type = type;
      }
      existing.updatedAt = new Date();
      existing.updatedBy = userId || null;

      return await this.parameterRepository.save(existing);
    } else {
      // Crear nuevo parámetro
      const parameter = new SystemParameterEntity();
      parameter.key = key;
      parameter.value = value;
      parameter.description = description || null;
      parameter.type = type;
      parameter.createdAt = new Date();
      parameter.updatedAt = new Date();
      parameter.createdBy = userId || null;
      parameter.updatedBy = userId || null;

      return (await this.dbRepository.create({
        entity: 'system_parameter',
        data: parameter
      })) as SystemParameterEntity;
    }
  }

  async getAllParameters(): Promise<SystemParameterEntity[]> {
    return await this.parameterRepository.find({
      where: {
        isDeleted: IsNull()
      },
      order: {
        key: 'ASC'
      }
    });
  }

  async deleteParameter(key: string, userId?: string): Promise<boolean> {
    const parameter = await this.getParameter(key);
    if (!parameter) {
      throw new Error(`Parameter with key '${key}' not found`);
    }

    // Soft delete: establecer isDeleted a la fecha actual
    parameter.isDeleted = new Date();
    parameter.updatedAt = new Date();
    parameter.updatedBy = userId || null;

    await this.parameterRepository.save(parameter);
    return true;
  }

  async generateInternalApiToken(userId: string): Promise<{ token: string }> {
    const token = crypto.randomBytes(32).toString('hex');
    await this.setParameter(
      INTERNAL_API_TOKEN_KEY,
      token,
      'Token de larga duración para APIs internas. No expira; rotar manualmente si se compromete.',
      'string',
      userId
    );
    this.logger.log('Internal API token generated/rotated successfully');
    return { token };
  }
}
