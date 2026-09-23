import { RequestDoorSensorInstallationUseCaseImpl } from '../RequestDoorSensorInstallationUseCase';
import { ok } from '@core/utils';
import { UserRole } from '@core/protocols';
import type { AuthContext } from '@core/protocols';
import type { DoorMonitoringRepository } from '../../repositories';

function auth(role: UserRole): AuthContext {
  return { userId: 'u1', tenantId: 't1', role };
}

function buildDeps() {
  const repo = {
    createInstallationRequest: vi.fn().mockResolvedValue(
      ok({
        id: 'req1',
        tenantId: 't1',
        householdId: 'hh1',
        requestedBy: 'u1',
        status: 'pending',
        note: null,
        resolvedBy: null,
        resolvedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    ),
  } as unknown as DoorMonitoringRepository & {
    createInstallationRequest: ReturnType<typeof vi.fn>;
  };
  const auditQueue = { enqueueAudit: vi.fn().mockResolvedValue(undefined) };
  const useCase = RequestDoorSensorInstallationUseCaseImpl({
    doorMonitoringRepository: repo,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    auditQueueProtocol: auditQueue as any,
  });
  return { useCase, repo };
}

describe('RequestDoorSensorInstallationUseCase', () => {
  it.each([UserRole.Ketua_RT, UserRole.Pengurus])(
    'allows RT role %s to request installation',
    async role => {
      const { useCase, repo } = buildDeps();
      const result = await useCase.execute({
        authContext: auth(role),
        input: { householdId: 'hh1', note: 'tolong pasang' },
      });
      expect(result.success).toBe(true);
      expect(repo.createInstallationRequest).toHaveBeenCalledTimes(1);
    },
  );

  it.each([UserRole.Warga, UserRole.Security_Guard, UserRole.Super_Admin])(
    'rejects non-RT role %s',
    async role => {
      const { useCase, repo } = buildDeps();
      const result = await useCase.execute({
        authContext: auth(role),
        input: { householdId: 'hh1' },
      });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.type).toBe('authorization');
      expect(repo.createInstallationRequest).not.toHaveBeenCalled();
    },
  );
});
