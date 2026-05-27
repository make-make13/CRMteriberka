import { getLogoutBackupDecision } from '../src/utils/logoutBackupDecision';

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

assertEqual(
  getLogoutBackupDecision({ canManageBackups: false, todayCloudBackupDone: false }),
  'logout-only',
  'Manager without backup permission logs out directly',
);

assertEqual(
  getLogoutBackupDecision({ canManageBackups: true, todayCloudBackupDone: false }),
  'run-backup',
  'Backup manager without today backup runs shutdown backup',
);

assertEqual(
  getLogoutBackupDecision({ canManageBackups: true, todayCloudBackupDone: true }),
  'ask',
  'Backup manager with today backup chooses what to do',
);

console.log('Logout backup decision tests passed.');
