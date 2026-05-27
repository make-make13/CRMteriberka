import crypto from 'node:crypto';
import { localDb } from './localDatabase';
import type { Manager, ManagerInput, ManagerPermission, ManagerRole } from '../src/types';

export const DEFAULT_ADMIN_LOGIN = 'Make';
export const DEFAULT_ADMIN_PASSWORD = '3552';

type ManagerRecord = Manager & {
  passwordSalt: string;
  passwordHash: string;
};

type SessionRecord = {
  managerId: string;
  expiresAt: number;
};

const ADMIN_PERMISSIONS: ManagerPermission[] = [
  'settings:all',
  'settings:general',
  'templates:manage',
  'email:manage',
  'backups:manage',
  'managers:manage',
  'clients:delete',
  'contracts:delete',
];

const MANAGER_PERMISSIONS: ManagerPermission[] = ['settings:general'];
const TOKEN_TTL_MS = 1000 * 60 * 60 * 12;
const sessions = new Map<string, SessionRecord>();

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix: string) {
  return `${prefix}-${crypto.randomBytes(8).toString('hex')}`;
}

function hashPassword(password: string, salt = crypto.randomBytes(16).toString('hex')) {
  const passwordHash = crypto.pbkdf2Sync(password, salt, 120_000, 32, 'sha256').toString('hex');
  return { salt, hash: passwordHash };
}

function verifyPassword(password: string, manager: ManagerRecord) {
  const { hash } = hashPassword(password, manager.passwordSalt);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(manager.passwordHash, 'hex'));
}

function normalizePermissions(role: ManagerRole, permissions?: ManagerPermission[]) {
  return role === 'admin' ? ADMIN_PERMISSIONS : (permissions?.length ? permissions : MANAGER_PERMISSIONS);
}

function safeManager(manager: ManagerRecord | Manager): Manager {
  const {
    id,
    name,
    login,
    role,
    permissions,
    isActive,
    createdAt,
    updatedAt,
  } = manager;
  return { id, name, login, role, permissions, isActive, createdAt, updatedAt };
}

function listManagerRecords() {
  return localDb.listManagers<Manager>() as ManagerRecord[];
}

function getManagerRecordById(id: string) {
  return localDb.getManagerById<Manager>(id) as ManagerRecord | null;
}

function getManagerRecordByLogin(login: string) {
  return localDb.getManagerByLogin<Manager>(login) as ManagerRecord | null;
}

function ensureDefaultAdmin() {
  const existingManagers = listManagerRecords();
  if (existingManagers.length > 0) return;

  const password = hashPassword(DEFAULT_ADMIN_PASSWORD);
  localDb.saveManager<Manager>({
    id: 'manager-sergey-admin',
    name: 'Сергей',
    login: DEFAULT_ADMIN_LOGIN,
    role: 'admin',
    permissions: ADMIN_PERMISSIONS,
    isActive: true,
    createdAt: nowIso(),
  }, password);
}

function createSession(manager: Manager) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { managerId: manager.id, expiresAt: Date.now() + TOKEN_TTL_MS });
  return token;
}

function getManagerByToken(token?: string | null) {
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }
  const manager = getManagerRecordById(session.managerId);
  if (!manager?.isActive) return null;
  session.expiresAt = Date.now() + TOKEN_TTL_MS;
  return safeManager(manager);
}

function assertAdmin(manager: Manager | null) {
  if (!manager) throw new Error('Требуется авторизация');
  if (manager.role !== 'admin' && !manager.permissions.includes('settings:all')) {
    throw new Error('Недостаточно прав');
  }
}

function ensureCanDeleteManager(currentManager: Manager, targetId: string) {
  if (currentManager.id === targetId) {
    throw new Error('Нельзя удалить свою учетную запись');
  }
  const target = getManagerRecordById(targetId);
  if (!target) return;
  if (target.role !== 'admin') return;
  const activeAdmins = listManagerRecords().filter(manager => manager.role === 'admin' && manager.isActive);
  if (activeAdmins.length <= 1) {
    throw new Error('Нельзя удалить последнего администратора');
  }
}

function saveManagerInput(input: ManagerInput, existing?: ManagerRecord | null) {
  const role = input.role || existing?.role || 'manager';
  const manager: Manager = {
    id: existing?.id || input.id || createId('manager'),
    name: String(input.name || '').trim(),
    login: String(input.login || '').trim(),
    role,
    permissions: normalizePermissions(role, input.permissions),
    isActive: input.isActive !== false,
    createdAt: existing?.createdAt || nowIso(),
    updatedAt: nowIso(),
  };

  if (!manager.name) throw new Error('Укажите имя менеджера');
  if (!manager.login) throw new Error('Укажите логин менеджера');
  if (!existing && !input.password) throw new Error('Укажите пароль менеджера');

  const password = input.password
    ? hashPassword(input.password)
    : { salt: existing!.passwordSalt, hash: existing!.passwordHash };

  return safeManager(localDb.saveManager(manager, password) as ManagerRecord);
}

ensureDefaultAdmin();

export const authService = {
  login(login: string, password: string) {
    const manager = getManagerRecordByLogin(String(login || '').trim());
    if (!manager || !manager.isActive || !verifyPassword(String(password || ''), manager)) {
      throw new Error('Неверный логин или пароль');
    }
    const safe = safeManager(manager);
    return { token: createSession(safe), manager: safe };
  },

  logout(token?: string | null) {
    if (token) sessions.delete(token);
    return { success: true as const };
  },

  getByToken: getManagerByToken,
  requireAdmin: assertAdmin,

  listManagers(currentManager: Manager | null) {
    assertAdmin(currentManager);
    return listManagerRecords().map(safeManager);
  },

  createManager(currentManager: Manager | null, input: ManagerInput) {
    assertAdmin(currentManager);
    return saveManagerInput(input);
  },

  updateManager(currentManager: Manager | null, id: string, input: ManagerInput) {
    assertAdmin(currentManager);
    const existing = getManagerRecordById(id);
    if (!existing) throw new Error('Менеджер не найден');
    return saveManagerInput({ ...input, id }, existing);
  },

  deleteManager(currentManager: Manager | null, id: string) {
    assertAdmin(currentManager);
    ensureCanDeleteManager(currentManager!, id);
    localDb.deleteManager(id);
    return { success: true as const };
  },
};
