import { BadRequestException } from '@nestjs/common';
import { EventService } from './event.service';

describe('EventService.setTicketTypeMapSectors', () => {
  const eventUuid = '11111111-1111-4111-8111-111111111111';
  const mapUuid = '22222222-2222-4222-8222-222222222222';
  const ticketTypeUuid = '33333333-3333-4333-8333-333333333333';
  const sectorA = '44444444-4444-4444-8444-444444444444';
  const sectorB = '55555555-5555-4555-8555-555555555555';

  function build() {
    const queryRunner = {
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn()
    };
    const dbRepository = {
      findOne: jest.fn().mockResolvedValue({
        uuid: eventUuid,
        organizationUuid: 'organization-1',
        isActive: true
      }),
      createQueryRunner: jest.fn().mockReturnValue(queryRunner),
      createMany: jest.fn(),
      query: jest.fn(async (sql: string, params: string[]) => {
        if (sql.includes('FROM event_map WHERE')) return [{ uuid: mapUuid }];
        if (sql.includes('FROM ticket_type WHERE')) return [{ uuid: ticketTypeUuid }];
        if (sql.includes('FROM event_map_sector WHERE')) {
          return params.slice(1).map(uuid => ({ uuid }));
        }
        return [];
      })
    };
    const service = new EventService(
      dbRepository as never,
      {} as never,
      { userPermission: jest.fn().mockResolvedValue(true) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never
    );
    return { service, dbRepository, queryRunner };
  }

  it('reemplaza únicamente los vínculos de la tanda', async () => {
    const { service, dbRepository, queryRunner } = build();

    await expect(
      service.setTicketTypeMapSectors(eventUuid, ticketTypeUuid, [sectorA, sectorB], 'user-1')
    ).resolves.toEqual({
      ticketTypeUuid,
      sectorUuids: [sectorA, sectorB]
    });

    expect(dbRepository.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE link'),
      [mapUuid, ticketTypeUuid],
      queryRunner
    );
    expect(dbRepository.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        entity: 'event_map_sector_ticket_type',
        queryRunner,
        data: expect.arrayContaining([
          expect.objectContaining({ sectorUuid: sectorA, ticketTypeUuid }),
          expect.objectContaining({ sectorUuid: sectorB, ticketTypeUuid })
        ])
      })
    );
    expect(queryRunner.commitTransaction).toHaveBeenCalled();
  });

  it('un array vacío desasigna la tanda sin insertar vínculos', async () => {
    const { service, dbRepository, queryRunner } = build();

    await expect(service.setTicketTypeMapSectors(eventUuid, ticketTypeUuid, [], 'user-1')).resolves.toEqual({
      ticketTypeUuid,
      sectorUuids: []
    });

    expect(dbRepository.createMany).not.toHaveBeenCalled();
    expect(queryRunner.commitTransaction).toHaveBeenCalled();
  });

  it('es idempotente ante sectores repetidos en la capa de servicio', async () => {
    const { service, dbRepository } = build();

    await expect(
      service.setTicketTypeMapSectors(eventUuid, ticketTypeUuid, [sectorA, sectorA], 'user-1')
    ).resolves.toEqual({ ticketTypeUuid, sectorUuids: [sectorA] });

    expect(dbRepository.createMany.mock.calls[0][0].data).toHaveLength(1);
  });

  it('permite repetir la misma asignación sin acumular vínculos', async () => {
    const { service, dbRepository } = build();

    await service.setTicketTypeMapSectors(eventUuid, ticketTypeUuid, [sectorA], 'user-1');
    await service.setTicketTypeMapSectors(eventUuid, ticketTypeUuid, [sectorA], 'user-1');

    expect(dbRepository.query).toHaveBeenCalledTimes(8);
    expect(dbRepository.createMany).toHaveBeenCalledTimes(2);
    for (const call of dbRepository.createMany.mock.calls) {
      expect(call[0].data).toHaveLength(1);
    }
  });

  it('rechaza sectores que no pertenecen al mapa y revierte', async () => {
    const { service, dbRepository, queryRunner } = build();
    dbRepository.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM event_map WHERE')) return [{ uuid: mapUuid }];
      if (sql.includes('FROM ticket_type WHERE')) return [{ uuid: ticketTypeUuid }];
      if (sql.includes('FROM event_map_sector WHERE')) return [];
      return [];
    });

    await expect(
      service.setTicketTypeMapSectors(eventUuid, ticketTypeUuid, [sectorA], 'user-1')
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalled();
    expect(dbRepository.createMany).not.toHaveBeenCalled();
  });

  it('rechaza una tanda ajena o inactiva antes de modificar vínculos', async () => {
    const { service, dbRepository, queryRunner } = build();
    dbRepository.query.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM event_map WHERE')) return [{ uuid: mapUuid }];
      if (sql.includes('FROM ticket_type WHERE')) return [];
      return [];
    });

    await expect(
      service.setTicketTypeMapSectors(eventUuid, ticketTypeUuid, [sectorA], 'user-1')
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
    expect(dbRepository.query).not.toHaveBeenCalledWith(
      expect.stringContaining('DELETE link'),
      expect.anything(),
      expect.anything()
    );
  });
});
