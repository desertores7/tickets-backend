import { ConflictException } from '@nestjs/common';
import { SystemParameterEntity } from '@config/db/entities/system/system_parameter.entity';
import { INTERNAL_API_TOKEN_KEY } from '@root/shared/auth/guards/internal-token.guard';
import { SERVICE_FEE_CAP_PARAM_KEY } from '@modules/orders/services/core/service-fee';
import { ISystemParameterService } from '../services/contracts/isystem-parameter.service';
import { SystemParameterController } from './system-parameter.controller';

function param(key: string, value: string): SystemParameterEntity {
  return {
    uuid: 'u-' + key,
    key,
    value,
    description: null,
    type: 'string',
    createdAt: new Date('2026-09-19T00:00:00Z'),
    updatedAt: new Date('2026-09-19T01:00:00Z'),
    createdBy: null,
    updatedBy: 'admin-1',
    isDeleted: null
  } as unknown as SystemParameterEntity;
}

function setup(rows: SystemParameterEntity[]) {
  const service = {
    getAllParameters: jest.fn(async () => rows),
    getParameter: jest.fn(async (key: string) => rows.find(r => r.key === key) ?? null),
    setParameter: jest.fn(async (key: string, value: string) => param(key, value)),
    deleteParameter: jest.fn(async () => true),
    generateInternalApiToken: jest.fn()
  } as unknown as ISystemParameterService;
  return { service, controller: new SystemParameterController(service) };
}

describe('SystemParameterController', () => {
  const token = param(INTERNAL_API_TOKEN_KEY, 'super-secreto');
  const other = param('ALGO', 'visible');

  it('el token interno nunca sale en el listado ni por clave', async () => {
    const { controller } = setup([token, other]);

    const list = await controller.getAllParameters();
    expect(list.find(p => p.key === INTERNAL_API_TOKEN_KEY)).toMatchObject({ value: null, isSecret: true });
    expect(list.find(p => p.key === 'ALGO')).toMatchObject({ value: 'visible', isSecret: false });
    expect(JSON.stringify(list)).not.toContain('super-secreto');

    const single = await controller.getParameterByKey(INTERNAL_API_TOKEN_KEY);
    expect(single.value).toBeNull();
  });

  it('el estado del token dice si existe y cuándo, sin el valor', async () => {
    await expect(setup([token]).controller.getInternalTokenStatus()).resolves.toEqual({
      exists: true,
      updatedAt: token.updatedAt,
      updatedBy: 'admin-1'
    });
    await expect(setup([]).controller.getInternalTokenStatus()).resolves.toEqual({
      exists: false,
      updatedAt: null,
      updatedBy: null
    });
  });

  it('el CRUD genérico no toca el costo de servicio ni el token', async () => {
    const { controller, service } = setup([token, param(SERVICE_FEE_CAP_PARAM_KEY, '50000')]);

    await expect(
      controller.createParameter({ key: SERVICE_FEE_CAP_PARAM_KEY, value: 'abc' }, 'admin-1')
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      controller.updateParameter(INTERNAL_API_TOKEN_KEY, { value: 'otro' }, 'admin-1')
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(controller.deleteParameter(SERVICE_FEE_CAP_PARAM_KEY, 'admin-1')).rejects.toBeInstanceOf(
      ConflictException
    );
    expect(service.setParameter).not.toHaveBeenCalled();
    expect(service.deleteParameter).not.toHaveBeenCalled();
  });

  it('los demás parámetros se siguen editando', async () => {
    const { controller, service } = setup([other]);
    await expect(controller.updateParameter('ALGO', { value: 'nuevo' }, 'admin-1')).resolves.toMatchObject({
      key: 'ALGO',
      value: 'nuevo'
    });
    expect(service.setParameter).toHaveBeenCalled();
  });
});
