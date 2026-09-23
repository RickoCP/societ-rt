import { RegisterDoorSensorUseCaseImpl } from '../RegisterDoorSensorUseCase';
import { ok } from '@core/utils';
import { UserRole } from '@core/protocols';
import type { AuthContext } from '@core/protocols';
import type { DoorMonitoringRepository } from '../../repositories';
import type { IoTRepository } from '@core/domains/iot/repositories/IoTRepository';

function auth(role: UserRole): AuthContext {
  return { userId: 'u1', tenantId: 't1', role };
}

function buildDeps(opts: { alreadyBound?: boolean } = {}) {
  const repo = {
    findByHousehold: vi
      .fn()
      .mockResolvedValue(
        ok(
          opts.alreadyBound
            ? { iotDeviceId: 'dev-existing' }
            : { iotDeviceId: null },
        ),
      ),
    bindDevice: vi.fn().mockResolvedValue(
      ok({
        id: 'cfg1',
        tenantId: 't1',
        householdId: 'hh1',
        iotDeviceId: 'dev1',
        sirenZone: 'zone-a',
        monitorStart: '22:00',
        monitorEnd: '05:00',
        enabled: false,
        currentState: 'unknown',
        lastStateChange: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    ),
  } as unknown as DoorMonitoringRepository & {
    findByHousehold: ReturnType<typeof vi.fn>;
    bindDevice: ReturnType<typeof vi.fn>;
  };

  const iotRepo = {
    registerDevice: vi.fn().mockResolvedValue(ok({ id: 'dev1' })),
  } as unknown as IoTRepository & { registerDevice: ReturnType<typeof vi.fn> };

  const auditQueue = { enqueueAudit: vi.fn().mockResolvedValue(undefined) };

  const useCase = RegisterDoorSensorUseCaseImpl({
    doorMonitoringRepository: repo,
    iotRepository: iotRepo,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    auditQueueProtocol: auditQueue as any,
  });

  return { useCase, repo, iotRepo };
}

const input = {
  householdId: 'hh1',
  tuyaDeviceId: 'tuya-123',
  deviceName: 'Sensor Pintu Depan',
  sirenZone: 'zone-a',
};

describe('RegisterDoorSensorUseCase', () => {
  it('allows Super_Admin to register and bind a device', async () => {
    const { useCase, iotRepo, repo } = buildDeps();
    const result = await useCase.execute({ authContext: auth(UserRole.Super_Admin), input });
    expect(result.success).toBe(true);
    expect(iotRepo.registerDevice).toHaveBeenCalledTimes(1);
    expect(repo.bindDevice).toHaveBeenCalledTimes(1);
  });

  it.each([UserRole.Ketua_RT, UserRole.Pengurus, UserRole.Warga, UserRole.Security_Guard])(
    'rejects non-admin role %s',
    async role => {
      const { useCase, iotRepo } = buildDeps();
      const result = await useCase.execute({ authContext: auth(role), input });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.type).toBe('authorization');
      expect(iotRepo.registerDevice).not.toHaveBeenCalled();
    },
  );

  it('rejects when a sensor is already registered for the household', async () => {
    const { useCase, iotRepo } = buildDeps({ alreadyBound: true });
    const result = await useCase.execute({ authContext: auth(UserRole.Super_Admin), input });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('DOOR_SENSOR_ALREADY_REGISTERED');
    expect(iotRepo.registerDevice).not.toHaveBeenCalled();
  });
});
