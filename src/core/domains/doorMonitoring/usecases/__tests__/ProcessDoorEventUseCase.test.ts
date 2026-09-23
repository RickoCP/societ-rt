import { ProcessDoorEventUseCaseImpl } from '../ProcessDoorEventUseCase';
import { ok, fail } from '@core/utils';
import { technicalError } from '@core/utils';
import type { DoorSensorConfig } from '../../entities';
import type { DoorMonitoringRepository } from '../../repositories';
import type { ActivateZoneSirenUseCase } from '@core/domains/alarm/usecases';

// ---------------------------------------------------------------------------
// Helpers / mocks
// ---------------------------------------------------------------------------

function makeConfig(overrides: Partial<DoorSensorConfig> = {}): DoorSensorConfig {
  return {
    id: 'cfg-1',
    tenantId: 'tenant-1',
    householdId: 'hh-1',
    iotDeviceId: 'dev-1',
    sirenZone: 'zone-a',
    monitorStart: '22:00',
    monitorEnd: '05:00',
    enabled: true,
    currentState: 'closed',
    lastStateChange: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// NOTE: the util interprets time in APP_TIMEZONE (Asia/Jakarta, UTC+7). We choose
// UTC instants whose Jakarta local time lands inside/outside the 22:00–05:00 window:
//   19:00 UTC -> 02:00 WIB  (INSIDE)
//   05:00 UTC -> 12:00 WIB  (OUTSIDE)
const JKT_IN_WINDOW = new Date(Date.UTC(2026, 0, 15, 19, 0, 0)); // 02:00 WIB
const JKT_OUT_WINDOW = new Date(Date.UTC(2026, 0, 15, 5, 0, 0)); // 12:00 WIB

function buildDeps(config: DoorSensorConfig | null) {
  const activateZoneSiren = {
    execute: vi.fn().mockResolvedValue(ok([{ id: 'evt-1' }])),
  } as unknown as ActivateZoneSirenUseCase & { execute: ReturnType<typeof vi.fn> };

  const repo = {
    findByDeviceId: vi.fn().mockResolvedValue(ok(config)),
    updateDoorState: vi
      .fn()
      .mockResolvedValue(ok(config ?? makeConfig())),
  } as unknown as DoorMonitoringRepository & {
    findByDeviceId: ReturnType<typeof vi.fn>;
    updateDoorState: ReturnType<typeof vi.fn>;
  };

  const realtimeBus = { publish: vi.fn().mockResolvedValue(undefined) };
  const auditQueue = { enqueueAudit: vi.fn().mockResolvedValue(undefined) };

  const useCase = ProcessDoorEventUseCaseImpl({
    doorMonitoringRepository: repo,
    activateZoneSirenUseCase: activateZoneSiren,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    realtimeBusProtocol: realtimeBus as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    auditQueueProtocol: auditQueue as any,
  });

  return { useCase, activateZoneSiren, repo, realtimeBus, auditQueue };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProcessDoorEventUseCase', () => {
  it('triggers the zone siren when the door opens inside an enabled window', async () => {
    const { useCase, activateZoneSiren } = buildDeps(makeConfig());

    const result = await useCase.execute({
      data: { iotDeviceId: 'dev-1', state: 'open', occurredAt: JKT_IN_WINDOW },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sirenTriggered).toBe(true);
      expect(result.data.withinWindow).toBe(true);
    }
    expect(activateZoneSiren.execute).toHaveBeenCalledTimes(1);
    const arg = activateZoneSiren.execute.mock.calls[0]?.[0];
    expect(arg.data.zone).toBe('zone-a');
    expect(arg.data.triggerSource).toBe('automation');
  });

  it('does NOT trigger when the door opens outside the window', async () => {
    const { useCase, activateZoneSiren } = buildDeps(makeConfig());

    const result = await useCase.execute({
      data: { iotDeviceId: 'dev-1', state: 'open', occurredAt: JKT_OUT_WINDOW },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sirenTriggered).toBe(false);
      expect(result.data.withinWindow).toBe(false);
    }
    expect(activateZoneSiren.execute).not.toHaveBeenCalled();
  });

  it('does NOT trigger when monitoring is disabled, even inside the window', async () => {
    const { useCase, activateZoneSiren } = buildDeps(
      makeConfig({ enabled: false }),
    );

    const result = await useCase.execute({
      data: { iotDeviceId: 'dev-1', state: 'open', occurredAt: JKT_IN_WINDOW },
    });

    expect(result.success).toBe(true);
    expect(activateZoneSiren.execute).not.toHaveBeenCalled();
  });

  it('does NOT trigger on a close event', async () => {
    const { useCase, activateZoneSiren } = buildDeps(makeConfig());

    const result = await useCase.execute({
      data: { iotDeviceId: 'dev-1', state: 'closed', occurredAt: JKT_IN_WINDOW },
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.opened).toBe(false);
    expect(activateZoneSiren.execute).not.toHaveBeenCalled();
  });

  it('no-ops (no error) when the device is not bound to a config', async () => {
    const { useCase, activateZoneSiren, repo } = buildDeps(null);

    const result = await useCase.execute({
      data: { iotDeviceId: 'unknown', state: 'open', occurredAt: JKT_IN_WINDOW },
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.sirenTriggered).toBe(false);
    expect(repo.updateDoorState).not.toHaveBeenCalled();
    expect(activateZoneSiren.execute).not.toHaveBeenCalled();
  });

  it('publishes a shared-security realtime event when alerting even if the siren fails', async () => {
    const { useCase, activateZoneSiren, realtimeBus } = buildDeps(makeConfig());
    (activateZoneSiren.execute as ReturnType<typeof vi.fn>).mockResolvedValue(
      fail(technicalError('X', 'boom')),
    );

    const result = await useCase.execute({
      data: { iotDeviceId: 'dev-1', state: 'open', occurredAt: JKT_IN_WINDOW },
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.sirenTriggered).toBe(false);
    expect(realtimeBus.publish).toHaveBeenCalledTimes(1);
    const call = realtimeBus.publish.mock.calls[0] ?? [];
    const event = call[1];
    expect(event.eventType).toBe('door_opened_during_window');
    expect(event.privacy).toBe('shared');
  });
});
