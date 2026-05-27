export type LogoutBackupDecision = 'logout-only' | 'run-backup' | 'ask';

interface LogoutBackupDecisionInput {
  canManageBackups: boolean;
  todayCloudBackupDone: boolean;
}

export function getLogoutBackupDecision({
  canManageBackups,
  todayCloudBackupDone,
}: LogoutBackupDecisionInput): LogoutBackupDecision {
  if (!canManageBackups) return 'logout-only';
  return todayCloudBackupDone ? 'ask' : 'run-backup';
}
