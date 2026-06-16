import { Injectable, NotFoundException } from '@nestjs/common';
// import { LoggerService } from '@root/shared/logger/logger.service';
import { DataSource, DeleteResult, FindManyOptions, FindOneOptions, FindOptionsRelations, QueryRunner } from 'typeorm';
import { entitiesData } from './meta/db.data';
import {
  TDBParam,
  TEntitiesRepoObj,
  TEntity,
  TEntityName,
  TEntityResponse,
  TOmitWhereRelationsSelect,
  TRelationOptions,
  TResponseNoSelectNoRelation,
  TSelectOptions,
  TWhereOptions
} from './meta/db.types';

@Injectable()
export class DBRepository {
  private readonly privateRepositories: TEntitiesRepoObj;

  constructor(
    private dataSource: DataSource
    // private loggerService: LoggerService
  ) {
    this.dataSource = dataSource;

    this.privateRepositories = entitiesData.reduce(
      (acc, entityData) => ({ ...acc, [entityData.name]: this.dataSource.getRepository(entityData.entity) }),
      {} as TEntitiesRepoObj
    );

    // this.loggerService.info('DBRepository initialized', 'DBRepository');
  }

  async findOne<
    EntityName extends TEntityName,
    Entity extends TEntity<EntityName>,
    WhereOptions extends TWhereOptions<EntityName, Entity> | undefined,
    RelationOptions extends TRelationOptions<EntityName> | undefined,
    SelectOptions extends TSelectOptions<EntityName, RelationOptions> | undefined,
    OtherOptions extends TOmitWhereRelationsSelect<FindOneOptions<Entity>> | undefined
  >({
    entity,
    where,
    relations,
    select,
    other
  }: {
    entity: EntityName;
    where?: TDBParam<WhereOptions> | TWhereOptions<EntityName, Entity>[];
    relations?: TDBParam<RelationOptions> | undefined;
    select?: TDBParam<SelectOptions> | undefined;
    other?: TDBParam<OtherOptions> | undefined;
  }): Promise<TEntityResponse<EntityName, RelationOptions, SelectOptions> | null> {
    const repo = this.privateRepositories[entity];
    let findOptions: FindOneOptions<TEntity<EntityName>> = {};

    if (where && typeof where === 'object') {
      findOptions = {
        ...findOptions,
        where
      };
    }

    if (relations && typeof relations === 'object') {
      findOptions = {
        ...findOptions,
        relations: relations as FindOptionsRelations<TEntity<EntityName>>
      };
    }

    if (select && typeof select === 'object') {
      findOptions = {
        ...findOptions,
        select: select as any
      };
    }

    if (other && typeof other === 'object') {
      findOptions = {
        ...findOptions,
        ...other
      };
    }

    const response = await repo.findOne(findOptions);

    return response as TEntityResponse<EntityName, RelationOptions, SelectOptions> | null;
  }

  async findMany<
    EntityName extends TEntityName,
    Entity extends TEntity<EntityName>,
    WhereOptions extends TWhereOptions<EntityName, Entity> | undefined,
    RelationOptions extends TRelationOptions<EntityName> | undefined,
    SelectOptions extends TSelectOptions<EntityName, RelationOptions> | undefined,
    OtherOptions extends TOmitWhereRelationsSelect<FindManyOptions<Entity>> | undefined
  >({
    entity,
    where,
    relations,
    select,
    other
  }: {
    entity: EntityName;
    where?: TDBParam<WhereOptions> | TWhereOptions<EntityName, Entity>[];
    relations?: TDBParam<RelationOptions>;
    select?: TDBParam<SelectOptions>;
    other?: TDBParam<OtherOptions>;
  }): Promise<TEntityResponse<EntityName, RelationOptions, SelectOptions>[]> {
    const repo = this.privateRepositories[entity];
    let findOptions: FindOneOptions<TEntity<EntityName>> = {};

    if (where && typeof where === 'object') {
      findOptions = {
        ...findOptions,
        where
      };
    }

    if (relations && typeof relations === 'object') {
      findOptions = {
        ...findOptions,
        relations: relations as FindOptionsRelations<TEntity<EntityName>>
      };
    }

    if (select && typeof select === 'object') {
      findOptions = {
        ...findOptions,
        select: select as any
      };
    }

    if (other && typeof other === 'object') {
      findOptions = {
        ...findOptions,
        ...other
      };
    }

    const response = await repo.find(findOptions);

    return response as TEntityResponse<EntityName, RelationOptions, SelectOptions>[];
  }

  async findManyAndCount<
    EntityName extends TEntityName,
    Entity extends TEntity<EntityName>,
    WhereOptions extends TWhereOptions<EntityName, Entity> | undefined,
    RelationOptions extends TRelationOptions<EntityName> | undefined,
    SelectOptions extends TSelectOptions<EntityName, RelationOptions> | undefined,
    OtherOptions extends TOmitWhereRelationsSelect<FindManyOptions<Entity>> | undefined
  >({
    entity,
    where,
    relations,
    select,
    other
  }: {
    entity: EntityName;
    where?: TDBParam<WhereOptions> | TWhereOptions<EntityName, Entity>[];
    relations?: TDBParam<RelationOptions>;
    select?: TDBParam<SelectOptions>;
    other?: TDBParam<OtherOptions>;
  }): Promise<{ items: TEntityResponse<EntityName, RelationOptions, SelectOptions>[]; count: number }> {
    const repo = this.privateRepositories[entity];
    let findOptions: FindOneOptions<TEntity<EntityName>> = {};

    if (where && typeof where === 'object') {
      findOptions = {
        ...findOptions,
        where
      };
    }

    if (relations && typeof relations === 'object') {
      findOptions = {
        ...findOptions,
        relations: relations as FindOptionsRelations<TEntity<EntityName>>
      };
    }

    if (select && typeof select === 'object') {
      findOptions = {
        ...findOptions,
        select: select as any
      };
    }

    if (other && typeof other === 'object') {
      findOptions = {
        ...findOptions,
        ...other
      };
    }

    const response = await repo.findAndCount(findOptions);

    const items = response[0] as TEntityResponse<EntityName, RelationOptions, SelectOptions>[];

    return { items, count: response[1] };
  }

  async create<EntityName extends TEntityName>({
    entity,
    data,
    queryRunner
  }: {
    entity: EntityName;
    data: TEntity<EntityName>;
    queryRunner?: QueryRunner;
  }): Promise<TEntityResponse<EntityName, undefined, undefined>> {
    const repo = this.privateRepositories[entity];
    if (queryRunner) {
      const response = await queryRunner.manager.save(entity, data);
      return response as TEntityResponse<EntityName, undefined, undefined>;
    } else {
      const response = await repo.save(data);
      return response as TEntityResponse<EntityName, undefined, undefined>;
    }
  }

  async createMany<EntityName extends TEntityName>({
    entity,
    data,
    queryRunner
  }: {
    entity: EntityName;
    data: TResponseNoSelectNoRelation<EntityName>[];
    queryRunner?: QueryRunner;
  }): Promise<TResponseNoSelectNoRelation<EntityName>[]> {
    if (queryRunner) {
      const response = await queryRunner.manager.save(entity, data);
      return response;
    } else {
      const repo = this.privateRepositories[entity];
      const response = await repo.save(data as unknown as TEntity<EntityName>[]);
      return response;
    }
  }

  async update<
    EntityName extends TEntityName,
    Entity extends TEntity<EntityName>,
    WhereOptions extends TWhereOptions<EntityName, Entity> | undefined
  >({
    entity,
    data,
    where,
    queryRunner
  }: {
    entity: EntityName;
    where: WhereOptions;
    data: Partial<TEntity<EntityName>>;
    queryRunner?: QueryRunner;
  }): Promise<TEntityResponse<EntityName, undefined, undefined>> {
    const repo = this.privateRepositories[entity];
    const prevData = await repo.findOne({ where });

    if (!prevData) {
      throw new NotFoundException(`${entity} not found`);
    }

    const newData: TEntity<EntityName> = {
      ...prevData,
      ...data
    };

    if (queryRunner) {
      const response = await queryRunner.manager.save(entity, newData);
      return response as TEntityResponse<EntityName, undefined, undefined>;
    } else {
      const response = await repo.save(newData);
      return response as TEntityResponse<EntityName, undefined, undefined>;
    }
  }

  async delete<
    EntityName extends TEntityName,
    Entity extends TEntity<EntityName>,
    WhereOptions extends TWhereOptions<EntityName, Entity>
  >({
    entity,
    where,
    queryRunner
  }: {
    entity: EntityName;
    where: WhereOptions;
    queryRunner?: QueryRunner;
  }): Promise<DeleteResult> {
    if (!queryRunner) {
      const repo = this.privateRepositories[entity];
      const response = await repo.delete(where);
      return response;
    } else {
      const repo = this.privateRepositories[entity];
      const response = await queryRunner.manager.delete(repo.target, where);
      return response;
    }
  }

  async count<
    EntityName extends TEntityName,
    Entity extends TEntity<EntityName>,
    WhereOptions extends TWhereOptions<EntityName, Entity> | undefined
  >({
    entity,
    where,
    queryRunner
  }: {
    entity: EntityName;
    where?: WhereOptions;
    queryRunner?: QueryRunner;
  }): Promise<number> {
    const repo = this.privateRepositories[entity];
    if (queryRunner) {
      return await queryRunner.manager.count(repo.target, { where });
    } else {
      return await repo.count({ where });
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async query(query: string, params?: any[], queryRunner?: QueryRunner): Promise<any> {
    if (queryRunner) {
      return await queryRunner.query(query, params);
    } else {
      return await this.dataSource.query(query, params);
    }
  }
}
