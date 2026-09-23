import { SetMonitoringWindowUseCaseImpl } from '../SetMonitoringWindowUseCase';
import { ok } from '@core/utils';
import { UserRole } from '@core/protocols';
import type { AuthContext } from '@core/protocols';
import type { DoorMonitoringRepository } from '../../repositories';
import type { HomeRepository } from '@core/domains/societHome/repositories/HomeRepository';

function auth(role: UserRole): AuthContext {
  return { userId: 'u1', tenantId: 't1', role };
}

function buildDeps(opts: { ownsHousehold?: boolean } = { ownsHousehold: true }) {
  const config = {
    id: 'cfg1',
    tenantId: 't1',
    householdId: 'hh1',
    iotDeviceId: null,
    sirenZone: null,
    monitorStart: '22:00',
    monitorEnd: '05:00',
    enabled: true,
    currentState: 'unknown' as const,
    lastStateChange: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const repo = {
    ensureConfig: vi.fn().mockResolvedValue(ok(config)),
    updateWindow: vi.fn().mockResolvedValue(ok(config)),
  } as unknown as DoorMonitoringRepository & {
    ensureConfig: ReturnType<typeof vi.fn>;
    updateWindow: ReturnType<typeof vi.fn>;
  };

  const homeRepo = {
    findByOwner: vi
      .fn()
      .mockResolvedValue(
        ok(opts.ownsHousehold ? [{ householdId: 'hh1' }] : [{ householdId: 'other' }]),
      ),
  } as unknown as HomeRepository & { findByOwner: ReturnType<typeof vi.fn> };

  const auditQueue = { enqueueAudit: vi.fn().mockResolvedValue(undefined) };

  const useCase = SetMonitoringWindowUseCaseImpl({
    doorMonitoringRepository: repo,
    homeRepository: homeRepo,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    auditQueueProtocol: auditQueue as any,
  });

  return { useCase, repo };
}

const input = {
  householdId: 'hh1',
  monitorStart: '22:00',
  monitorEnd: '05:00',
  enabled: true,
};

describe('SetMonitoringWindowUseCase', () => {
  it('allows a Warga who owns the household to set the window', async () => {
    const { useCase, repo } = buildDeps({ ownsHousehold: true });
    const result = await useCase.execute({ authContext: auth(UserRole.Warga), input });
    expect(result.success).toBe(true);
    expect(repo.updateWindow).toHaveBeenCalledTimes(1);
  });

  it('rejects a Security_Guard (wrong role)', async () => {
    const { useCase, repo } = buildDeps();
    const result = await useCase.execute({ authContext: auth(UserRole.Security_Guard), input });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe('authorization');
    expect(repo.updateWindow).not.toHaveBeenCalled();
  });

  it('rejects a Warga who does not own the household', async () => {
    const { useCase, repo } = buildDeps({ ownsHousehold: false });
    const result = await useCase.execute({ authContext: auth(UserRole.Warga), input });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('DOOR_MONITORING_ACCESS_DENIED');
    expect(repo.updateWindow).not.toHaveBeenCalled();
  });

  it('rejects an invalid window format', async () => {
    const { useCase, repo } = buildDeps();
    const result = await useCase.execute({
      authContext: auth(UserRole.Warga),
      input: { ...input, monitorStart: '9am' },
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('DOOR_INVALID_MONITORING_WINDOW');
    expect(repo.updateWindow).not.toHaveBeenCalled();
  });
});
