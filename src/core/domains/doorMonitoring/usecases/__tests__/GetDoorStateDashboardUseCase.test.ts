import { GetDoorStateDashboardUseCaseImpl } from '../GetDoorStateDashboardUseCase';
import { ok } from '@core/utils';
import { UserRole } from '@core/protocols';
import type { AuthContext } from '@core/protocols';
import type { DoorMonitoringRepository } from '../../repositories';
import type { DoorStateMarker } from '../../entities';

function auth(role: UserRole): AuthContext {
  return { userId: 'u1', tenantId: 't1', role };
}

function marker(overrides: Partial<DoorStateMarker> = {}): DoorStateMarker {
  return {
    householdId: 'hh1',
    householdNumber: '01',
    address: 'Jl. Mawar 1',
    block: 'A',
    latitude: -6.2,
    longitude: 106.8,
    currentState: 'open',
    monitoringEnabled: true,
    withinWindow: false,
    monitorStart: '22:00',
    monitorEnd: '05:00',
    sirenZone: 'zone-a',
    lastStateChange: null,
    alerting: false,
    ...overrides,
  };
}

function buildDeps(markers: DoorStateMarker[]) {
  const repo = {
    listDoorStateMarkers: vi.fn().mockResolvedValue(ok(markers)),
  } as unknown as DoorMonitoringRepository & {
    listDoorStateMarkers: ReturnType<typeof vi.fn>;
  };
  const useCase = GetDoorStateDashboardUseCaseImpl({
    doorMonitoringRepository: repo,
  });
  return { useCase, repo };
}

// 02:00 WIB — inside 22:00–05:00 window.
const IN_WINDOW = new Date(Date.UTC(2026, 0, 15, 19, 0, 0));

describe('GetDoorStateDashboardUseCase', () => {
  it.each([UserRole.Security_Guard, UserRole.Ketua_RT, UserRole.Pengurus])(
    'allows security role %s',
    async role => {
      const { useCase } = buildDeps([marker()]);
      const result = await useCase.execute({ authContext: auth(role), now: IN_WINDOW });
      expect(result.success).toBe(true);
    },
  );

  it('rejects a Warga', async () => {
    const { useCase } = buildDeps([marker()]);
    const result = await useCase.execute({ authContext: auth(UserRole.Warga), now: IN_WINDOW });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe('authorization');
  });

  it('recomputes alerting=true for an open door inside the window', async () => {
    const { useCase } = buildDeps([marker({ currentState: 'open', monitoringEnabled: true })]);
    const result = await useCase.execute({
      authContext: auth(UserRole.Security_Guard),
      now: IN_WINDOW,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data[0]?.withinWindow).toBe(true);
      expect(result.data[0]?.alerting).toBe(true);
    }
  });

  it('does not alert when monitoring is disabled', async () => {
    const { useCase } = buildDeps([marker({ currentState: 'open', monitoringEnabled: false })]);
    const result = await useCase.execute({
      authContext: auth(UserRole.Security_Guard),
      now: IN_WINDOW,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data[0]?.withinWindow).toBe(false);
      expect(result.data[0]?.alerting).toBe(false);
    }
  });
});
