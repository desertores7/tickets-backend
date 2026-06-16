import { FindOptionsWhere, Repository } from 'typeorm';
import { entitiesData } from './db.data';
import { entityRelations } from './entity-relations';

export type TEntitiesObj = {
  [T in (typeof entitiesData)[number] as T['name']]: T['entity'];
};

export type TEntity<EntityName extends TEntityName> = InstanceType<TEntitiesObj[EntityName]>;

export type TEntitiesRepoObj = {
  [T in keyof TEntitiesObj]: Repository<TEntity<T>>;
};

export type TEntityName = keyof TEntitiesObj;

export type TOmitWhereRelationsSelect<T extends object> = Omit<T, 'where' | 'relations' | 'select'>;

type TRelations<EntityName extends TEntityName> = {
  [K in keyof (typeof entityRelations)[EntityName]]: (typeof entityRelations)[EntityName][K] extends TEntityName
    ? (typeof entityRelations)[EntityName][K]
    : never;
};

export type TWhereOptions<
  EntityName extends TEntityName,
  Entity extends TEntity<EntityName>
> = FindOptionsWhere<Entity>;

export type TRelationOptions<EntityName extends TEntityName> = {
  [R in keyof TRelations<EntityName>]?: TRelationOptions<TRelations<EntityName>[R]> | true;
};

export type TSelectOptions<
  EntityName extends TEntityName,
  RelationOptions extends TRelationOptions<EntityName> | undefined
> = {
  [K in keyof Omit<TEntity<EntityName>, keyof TRelations<EntityName>>]?: true;
} & (RelationOptions extends TRelationOptions<EntityName>
  ? {
      [R in keyof RelationOptions & keyof TRelations<EntityName>]:
        | true
        | TSelectOptions<TRelations<EntityName>[R], RelationOptions[R]>;
    }
  : object);

export type TResponseNoSelectNoRelation<EntityName extends TEntityName> = Omit<
  TEntity<EntityName>,
  keyof TRelations<EntityName>
>;

type TResponseWSelectNoRelation<
  EntityName extends TEntityName,
  SelectOptions extends TSelectOptions<EntityName, undefined>
> = Pick<TEntity<EntityName>, keyof SelectOptions & keyof TEntity<EntityName>>;

type TResponseNoSelectWRelation<
  EntityName extends TEntityName,
  RelationOptions extends TRelationOptions<EntityName>
> = Omit<TEntity<EntityName>, keyof TRelations<EntityName>> & {
  [R in keyof RelationOptions &
    keyof TRelations<EntityName> &
    keyof TEntity<EntityName>]: TEntity<EntityName>[R] extends Array<unknown>
    ? TResponseNoSelectWRelation<TRelations<EntityName>[R], RelationOptions[R]>[]
    : TResponseNoSelectWRelation<TRelations<EntityName>[R], RelationOptions[R]>;
};

type TResponseWSelectWRelation<
  EntityName extends TEntityName,
  RelationOptions extends TRelationOptions<EntityName>,
  SelectOptions extends TSelectOptions<EntityName, RelationOptions>
> = {
  [K in keyof Omit<SelectOptions, keyof TRelations<EntityName>> & keyof TEntity<EntityName>]: TEntity<EntityName>[K];
} & {
  [R in keyof RelationOptions &
    keyof TEntity<EntityName> &
    keyof SelectOptions &
    keyof TRelations<EntityName>]: TEntity<EntityName>[R] extends Array<unknown>
    ? TEntityResponse<TRelations<EntityName>[R], RelationOptions[R], SelectOptions[R]>[]
    : TEntityResponse<TRelations<EntityName>[R], RelationOptions[R], SelectOptions[R]>;
};

export type TEntityResponse<
  EntityName extends TEntityName,
  RelationOptions extends TRelationOptions<EntityName> | undefined | true,
  SelectOptions extends TSelectOptions<EntityName, RelationOptions> | undefined | true
> =
  SelectOptions extends TSelectOptions<EntityName, NonNullable<RelationOptions>>
    ? TResponseWSelectWRelation<EntityName, RelationOptions, SelectOptions>
    : SelectOptions extends TSelectOptions<EntityName, undefined>
      ? TResponseWSelectNoRelation<EntityName, SelectOptions>
      : RelationOptions extends TRelationOptions<EntityName>
        ? TResponseNoSelectWRelation<EntityName, RelationOptions>
        : TResponseNoSelectNoRelation<EntityName>;

type TAtLeastOneProperty<T extends object | undefined> = T extends object
  ? T
  : keyof T extends never
    ? 'It has to have at least one property'
    : T;

export type TDBParam<T extends object | undefined> = TAtLeastOneProperty<T>;
