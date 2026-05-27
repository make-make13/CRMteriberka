import React, { useEffect, useState } from 'react';
import { CheckCircle2, Cloud, Database, FolderOpen, Loader2, Power, RefreshCcw, Save, XCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { backupApi, BackupRunResult, BackupSettings, BackupStatus } from '../../services/localApi';
import { useToast } from '../../context/ToastContext';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface BackupSettingsTabProps {
  isDarkMode: boolean;
}

const formatDateTime = (value?: string) => {
  if (!value) return 'Нет данных';
  return new Date(value).toLocaleString('ru-RU');
};

const formatBytes = (bytes?: number) => {
  if (!bytes) return '0 Б';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
};

function StatusCard({
  title,
  subtitle,
  ok,
  icon,
  isDarkMode,
}: {
  title: string;
  subtitle: string;
  ok: boolean;
  icon: React.ReactNode;
  isDarkMode: boolean;
}) {
  return (
    <div className={cn(
      "rounded-2xl border p-5 flex items-start gap-4",
      isDarkMode ? "bg-white/[0.03] border-white/10" : "bg-white border-gray-200 shadow-sm"
    )}>
      <div className={cn(
        "w-10 h-10 rounded-xl flex items-center justify-center",
        ok ? "bg-green-500/10 text-green-500" : "bg-orange-500/10 text-orange-500"
      )}>
        {icon}
      </div>
      <div>
        <div className="font-bold text-sm">{title}</div>
        <div className="text-xs text-gray-500 mt-1 leading-relaxed">{subtitle}</div>
      </div>
    </div>
  );
}

export default function BackupSettingsTab({ isDarkMode }: BackupSettingsTabProps) {
  const { toast } = useToast();
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [settings, setSettings] = useState<BackupSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [lastResult, setLastResult] = useState<BackupRunResult | null>(null);

  const refresh = async () => {
    const nextStatus = await backupApi.status();
    setStatus(nextStatus);
    setSettings(nextStatus.settings);
    setLastResult(nextStatus.lastRun);
  };

  useEffect(() => {
    refresh()
      .catch(error => toast(error instanceof Error ? error.message : 'Ошибка загрузки статуса резервных копий', 'error'))
      .finally(() => setIsLoading(false));
  }, []);

  const saveSettings = async () => {
    if (!settings) return;
    setIsBusy(true);
    try {
      const saved = await backupApi.saveSettings(settings);
      setSettings(saved);
      await refresh();
      toast('Настройки резервных копий сохранены');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Ошибка сохранения настроек резервных копий', 'error');
    } finally {
      setIsBusy(false);
    }
  };

  const runBackup = async (mode: BackupRunResult['mode']) => {
    setIsBusy(true);
    try {
      const result = await backupApi.run(mode);
      setLastResult(result);
      await refresh();
      if (result.success) {
        toast(mode === 'shutdown' ? 'Бэкап завершения работы создан и отправлен' : 'Резервная копия создана');
      } else {
        toast(`Бэкап создан с ошибками: ${result.errors.join('; ')}`, 'error');
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Ошибка создания резервной копии', 'error');
    } finally {
      setIsBusy(false);
    }
  };

  const testRemotes = async () => {
    setIsBusy(true);
    try {
      const result = await backupApi.testRemotes();
      const failed = result.remotes.filter(remote => !remote.ok);
      await refresh();
      toast(failed.length ? `Проверка облаков: есть ошибки (${failed.length})` : 'Оба облака доступны', failed.length ? 'error' : 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Ошибка проверки облаков', 'error');
    } finally {
      setIsBusy(false);
    }
  };

  const openFolder = async () => {
    try {
      await backupApi.openFolder();
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Не удалось открыть папку бэкапов', 'error');
    }
  };

  if (isLoading || !status || !settings) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500">
        <Loader2 className="animate-spin mr-2" size={20} />
        Загрузка резервных копий...
      </div>
    );
  }

  const cloudOk = Boolean(status.lastSuccessfulCloudBackupAt && status.todayCloudBackupDone);
  const localOk = Boolean(status.lastSuccessfulLocalBackupAt);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-3 gap-4">
        <StatusCard
          title="Локальная копия"
          subtitle={formatDateTime(status.lastSuccessfulLocalBackupAt)}
          ok={localOk}
          icon={<Database size={20} />}
          isDarkMode={isDarkMode}
        />
        <StatusCard
          title="Облачная копия сегодня"
          subtitle={cloudOk ? formatDateTime(status.lastSuccessfulCloudBackupAt) : 'Сегодня успешной облачной копии ещё нет'}
          ok={cloudOk}
          icon={<Cloud size={20} />}
          isDarkMode={isDarkMode}
        />
        <StatusCard
          title="rclone"
          subtitle={status.rclone.available ? status.rclone.version || 'Доступен' : status.rclone.error || 'Не найден'}
          ok={status.rclone.available}
          icon={status.rclone.available ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
          isDarkMode={isDarkMode}
        />
      </div>

      <section className={cn(
        "p-8 rounded-3xl border space-y-6",
        isDarkMode ? "bg-[#111111] border-white/5" : "bg-white border-gray-200 shadow-sm"
      )}>
        <div>
          <h3 className="font-bold text-lg">Настройки облаков</h3>
          <p className="text-xs text-gray-500 mt-1">
            Настройте в rclone два remote с такими именами. CRM будет отправлять архив в оба хранилища.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <label className="space-y-2">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Облако 1</span>
            <input
              value={settings.remote1}
              onChange={event => setSettings(prev => prev ? { ...prev, remote1: event.target.value } : prev)}
              className={cn(
                "w-full px-4 py-2.5 rounded-xl text-sm outline-none border transition-all",
                isDarkMode ? "bg-white/5 border-white/10 focus:border-orange-500" : "bg-gray-50 border-gray-200 focus:border-orange-500"
              )}
            />
          </label>
          <label className="space-y-2">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Облако 2</span>
            <input
              value={settings.remote2}
              onChange={event => setSettings(prev => prev ? { ...prev, remote2: event.target.value } : prev)}
              className={cn(
                "w-full px-4 py-2.5 rounded-xl text-sm outline-none border transition-all",
                isDarkMode ? "bg-white/5 border-white/10 focus:border-orange-500" : "bg-gray-50 border-gray-200 focus:border-orange-500"
              )}
            />
          </label>
          <label className="space-y-2">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Путь в облаке</span>
            <input
              value={settings.cloudPath}
              onChange={event => setSettings(prev => prev ? { ...prev, cloudPath: event.target.value } : prev)}
              className={cn(
                "w-full px-4 py-2.5 rounded-xl text-sm outline-none border transition-all",
                isDarkMode ? "bg-white/5 border-white/10 focus:border-orange-500" : "bg-gray-50 border-gray-200 focus:border-orange-500"
              )}
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-3">
          <motion.button
            type="button"
            onClick={saveSettings}
            disabled={isBusy}
            whileTap={{ scale: 0.95 }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-black text-sm font-bold transition-all disabled:opacity-50"
          >
            <Save size={18} />
            Сохранить настройки
          </motion.button>
          <motion.button
            type="button"
            onClick={testRemotes}
            disabled={isBusy}
            whileTap={{ scale: 0.95 }}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50",
              isDarkMode ? "bg-white/5 hover:bg-white/10" : "bg-gray-100 hover:bg-gray-200"
            )}
          >
            <RefreshCcw size={18} />
            Проверить облака
          </motion.button>
          <motion.button
            type="button"
            onClick={openFolder}
            whileTap={{ scale: 0.95 }}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all",
              isDarkMode ? "bg-white/5 hover:bg-white/10" : "bg-gray-100 hover:bg-gray-200"
            )}
          >
            <FolderOpen size={18} />
            Открыть папку бэкапов
          </motion.button>
        </div>
      </section>

      <section className={cn(
        "p-8 rounded-3xl border space-y-5",
        isDarkMode ? "bg-[#111111] border-white/5" : "bg-white border-gray-200 shadow-sm"
      )}>
        <div>
          <h3 className="font-bold text-lg">Ручной запуск</h3>
          <p className="text-xs text-gray-500 mt-1">
            Ежедневный бэкап отправляется в два облака. Завершение работы дополнительно создаёт недельную и месячную контрольные копии, когда это нужно.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <motion.button
            type="button"
            onClick={() => runBackup('daily-cloud')}
            disabled={isBusy}
            whileTap={{ scale: 0.95 }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-black text-sm font-bold transition-all disabled:opacity-50"
          >
            {isBusy ? <Loader2 className="animate-spin" size={18} /> : <Cloud size={18} />}
            Создать бэкап сейчас
          </motion.button>
          <motion.button
            type="button"
            onClick={() => runBackup('weekly-local')}
            disabled={isBusy}
            whileTap={{ scale: 0.95 }}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50",
              isDarkMode ? "bg-white/5 hover:bg-white/10" : "bg-gray-100 hover:bg-gray-200"
            )}
          >
            <Database size={18} />
            Еженедельная локальная копия
          </motion.button>
          <motion.button
            type="button"
            onClick={() => runBackup('shutdown')}
            disabled={isBusy}
            whileTap={{ scale: 0.95 }}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50",
              isDarkMode ? "bg-red-500/15 hover:bg-red-500/25 text-red-300" : "bg-red-50 hover:bg-red-100 text-red-700"
            )}
          >
            <Power size={18} />
            Завершить работу
          </motion.button>
        </div>

        {lastResult && (
          <div className={cn(
            "rounded-2xl border p-4 text-sm space-y-2",
            lastResult.success
              ? "border-green-500/20 bg-green-500/10"
              : "border-orange-500/20 bg-orange-500/10"
          )}>
            <div className="font-bold">
              Последний запуск: {formatDateTime(lastResult.createdAt)}
            </div>
            <div className="text-xs text-gray-500">
              Архив: {lastResult.archiveName || 'нет'} · {formatBytes(lastResult.archiveSize)}
              {lastResult.localArchiveDeleted ? ' · локально удалён после загрузки' : ''}
            </div>
            {lastResult.remotes.length > 0 && (
              <div className="text-xs">
                {lastResult.remotes.map(remote => (
                  <div key={remote.key}>
                    {remote.remote}: {remote.ok ? 'успешно' : remote.message}
                  </div>
                ))}
              </div>
            )}
            {lastResult.errors.length > 0 && (
              <div className="text-xs text-orange-500">
                {lastResult.errors.join('; ')}
              </div>
            )}
            {lastResult.mode === 'shutdown' && lastResult.success && (
              <div className="text-xs font-bold text-green-500">
                Бэкап готов. Теперь можно закрыть вкладку и остановить сервер CRM.
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
