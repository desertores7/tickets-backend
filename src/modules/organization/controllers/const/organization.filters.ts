import { IFilterData } from '@root/shared/decorators/filter-query.decorator';
import { ORGANIZATION_VALIDATION_STATUSES } from '@modules/organization/const/organization-fiscal.const';

export const organizationFilters = [
  {
    name: 'validationStatus',
    type: String,
    required: false,
    enumValues: [...ORGANIZATION_VALIDATION_STATUSES]
  },
  {
    name: 'bankChangePending',
    type: String,
    required: false,
    enumValues: ['true', 'false']
  },
  {
    name: 'fiscalChangePending',
    type: String,
    required: false,
    enumValues: ['true', 'false']
  }
] as const satisfies IFilterData[];

/** Columnas ordenables del listado (order_by=columna:asc|desc). */
export const ORGANIZATION_ORDER_COLUMNS = ['createdAt', 'name', 'legalName'] as const;
