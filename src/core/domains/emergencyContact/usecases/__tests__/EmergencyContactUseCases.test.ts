import { ListEmergencyContactsUseCaseImpl } from '../ListEmergencyContactsUseCase';
import { CreateEmergencyContactUseCaseImpl } from '../CreateEmergencyContactUseCase';
import { UpdateEmergencyContactUseCaseImpl } from '../UpdateEmergencyContactUseCase';
import { DeleteEmergencyContactUseCaseImpl } from '../DeleteEmergencyContactUseCase';
import { isValidPhone, isValidLabel } from '../emergencyContactValidation';
import { ok } from '@core/utils';
import { UserRole } from '@core/protocols';
import type { AuthContext } from '@core/protocols';
import type { EmergencyContactRepository } from '../../repositories';
import type { EmergencyContact } from '../../entities';

function auth(role: UserRole): AuthContext {
  return { userId: 'u1', tenantId: 't1', role };
}

function makeContact(overrides: Partial<EmergencyContact> = {}): EmergencyContact {
  return {
    id: 'c1',
    tenantId: 't1',
    label: 'Polisi',
    phone: '110',
    category: 'police',
    description: null,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function buildRepo() {
  const contact = makeContact();
  return {
    listByTenant: vi.fn().mockResolvedValue(ok([contact])),
    findById: vi.fn().mockResolvedValue(ok(contact)),
    create: vi.fn().mockResolvedValue(ok(contact)),
    update: vi.fn().mockResolvedValue(ok(contact)),
    remove: vi.fn().mockResolvedValue(ok(undefined)),
  } as unknown as EmergencyContactRepository & Record<string, ReturnType<typeof vi.fn>>;
}

const audit = { enqueueAudit: vi.fn().mockResolvedValue(undefined) };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const auditProto = audit as any;

const ADMIN_ROLES = [UserRole.Ketua_RT, UserRole.Pengurus, UserRole.Super_Admin];
const NON_ADMIN_ROLES = [UserRole.Warga, UserRole.Security_Guard];

describe('validation helpers', () => {
  it('isValidLabel', () => {
    expect(isValidLabel('Polisi')).toBe(true);
    expect(isValidLabel('  ')).toBe(false);
    expect(isValidLabel(undefined)).toBe(false);
  });
  it('isValidPhone', () => {
    expect(isValidPhone('110')).toBe(true);
    expect(isValidPhone('+62 21-1234567')).toBe(true);
    expect(isValidPhone('(021) 123 4567')).toBe(true);
    expect(isValidPhone('ab')).toBe(false);
    expect(isValidPhone('12')).toBe(false);
    expect(isValidPhone(undefined)).toBe(false);
  });
});

describe('ListEmergencyContactsUseCase', () => {
  it.each([...ADMIN_ROLES, ...NON_ADMIN_ROLES])(
    'allows any tenant member (%s) to list',
    async role => {
      const repo = buildRepo();
      const useCase = ListEmergencyContactsUseCaseImpl({
        emergencyContactRepository: repo,
      });
      const result = await useCase.execute({ authContext: auth(role) });
      expect(result.success).toBe(true);
      expect(repo.listByTenant).toHaveBeenCalledWith('t1');
    },
  );
});

describe('CreateEmergencyContactUseCase', () => {
  it.each(ADMIN_ROLES)('allows admin role %s', async role => {
    const repo = buildRepo();
    const useCase = CreateEmergencyContactUseCaseImpl({
      emergencyContactRepository: repo,
      auditQueueProtocol: auditProto,
    });
    const result = await useCase.execute({
      authContext: auth(role),
      input: { label: 'Damkar', phone: '113' },
    });
    expect(result.success).toBe(true);
    expect(repo.create).toHaveBeenCalledTimes(1);
  });

  it.each(NON_ADMIN_ROLES)('rejects non-admin role %s', async role => {
    const repo = buildRepo();
    const useCase = CreateEmergencyContactUseCaseImpl({
      emergencyContactRepository: repo,
      auditQueueProtocol: auditProto,
    });
    const result = await useCase.execute({
      authContext: auth(role),
      input: { label: 'Damkar', phone: '113' },
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe('authorization');
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('rejects invalid phone', async () => {
    const repo = buildRepo();
    const useCase = CreateEmergencyContactUseCaseImpl({
      emergencyContactRepository: repo,
      auditQueueProtocol: auditProto,
    });
    const result = await useCase.execute({
      authContext: auth(UserRole.Ketua_RT),
      input: { label: 'X', phone: 'nope' },
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('EMERGENCY_CONTACT_INVALID_PHONE');
    expect(repo.create).not.toHaveBeenCalled();
  });
});

describe('UpdateEmergencyContactUseCase', () => {
  it('rejects non-admin', async () => {
    const repo = buildRepo();
    const useCase = UpdateEmergencyContactUseCaseImpl({
      emergencyContactRepository: repo,
      auditQueueProtocol: auditProto,
    });
    const result = await useCase.execute({
      authContext: auth(UserRole.Warga),
      id: 'c1',
      input: { label: 'Baru' },
    });
    expect(result.success).toBe(false);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('returns not found when contact missing', async () => {
    const repo = buildRepo();
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(ok(null));
    const useCase = UpdateEmergencyContactUseCaseImpl({
      emergencyContactRepository: repo,
      auditQueueProtocol: auditProto,
    });
    const result = await useCase.execute({
      authContext: auth(UserRole.Ketua_RT),
      id: 'missing',
      input: { label: 'Baru' },
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('EMERGENCY_CONTACT_NOT_FOUND');
  });
});

describe('DeleteEmergencyContactUseCase', () => {
  it('allows admin to delete', async () => {
    const repo = buildRepo();
    const useCase = DeleteEmergencyContactUseCaseImpl({
      emergencyContactRepository: repo,
      auditQueueProtocol: auditProto,
    });
    const result = await useCase.execute({
      authContext: auth(UserRole.Pengurus),
      id: 'c1',
    });
    expect(result.success).toBe(true);
    expect(repo.remove).toHaveBeenCalledWith('t1', 'c1');
  });

  it('rejects non-admin', async () => {
    const repo = buildRepo();
    const useCase = DeleteEmergencyContactUseCaseImpl({
      emergencyContactRepository: repo,
      auditQueueProtocol: auditProto,
    });
    const result = await useCase.execute({
      authContext: auth(UserRole.Security_Guard),
      id: 'c1',
    });
    expect(result.success).toBe(false);
    expect(repo.remove).not.toHaveBeenCalled();
  });
});
