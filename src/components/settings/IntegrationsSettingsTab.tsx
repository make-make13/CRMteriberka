/**
 * Вкладка «Интеграции» в настройках CRM.
 * Supabase, LibreOffice, ИИ-консьерж.
 *
 * Секреты (service key, api key) никогда не возвращаются с сервера полным текстом.
 * Маска: «••••••••abcd». Чтобы заменить ключ — ввести новое значение.
 * Пустое поле при сохранении = оставить прежнее значение.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, Check, ChevronDown, Clock, Database, Download, Loader2, RefreshCw, Search, X, Zap } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { getErrorMessage } from '../../utils/errors';
import {
  backupApi,
  integrationSettingsApi,
  type AiBackendTestResult,
  type AutoSyncStatus,
  type BackupStatus,
  type IntegrationSettingsMasked,
  type IntegrationSettingsInput,
  type LibreOfficeTestResult,
  type SupabaseTestResult,
  type RcloneCommandResult,
} from '../../services/localApi';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ── Вспомогательные компоненты ─────────────────────────────────────────────

function SectionCard({ isDarkMode, children }: { isDarkMode: boolean; children: React.ReactNode }) {
  return (
    <section className={cn(
      'rounded-2xl border p-5 space-y-4',
      isDarkMode ? 'bg-[#111111] border-white/5' : 'bg-white border-gray-200 shadow-sm',
    )}>
      {children}
    </section>
  );
}

function SectionHeader({ icon, title, subtitle, isDarkMode }: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  isDarkMode: boolean;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-white/5 pb-3">
      <div className={cn(
        'w-9 h-9 rounded-xl flex items-center justify-center shrink-0',
        isDarkMode ? 'bg-white/5' : 'bg-gray-100',
      )}>
        {icon}
      </div>
      <div>
        <h3 className="font-bold text-base leading-tight">{title}</h3>
        {subtitle && (
          <p className={cn('text-xs mt-0.5', isDarkMode ? 'text-[#8F9894]' : 'text-gray-500')}>
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <label className="text-xs font-bold uppercase tracking-wide text-[#8F9894]">{label}</label>
      {children}
    </div>
  );
}

function StatusBadge({ ok, label, isDarkMode }: { ok: boolean | null; label: string; isDarkMode: boolean }) {
  if (ok === null) return null;
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold',
      ok
        ? (isDarkMode ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-50 text-emerald-600')
        : (isDarkMode ? 'bg-red-500/15 text-red-400' : 'bg-red-50 text-red-600'),
    )}>
      {ok ? <Check size={10} /> : <X size={10} />}
      {label}
    </span>
  );
}

function sourceLabel(source: 'crm' | 'env' | 'none' | 'default' | undefined) {
  if (source === 'crm') return 'настройки CRM';
  if (source === 'env') return '.env.local';
  if (source === 'default') return 'значение по умолчанию';
  return 'не задано';
}

// ── Главный компонент ──────────────────────────────────────────────────────

interface IntegrationsSettingsTabProps {
  isDarkMode: boolean;
}

type SavingState = 'idle' | 'saving' | 'saved' | 'error';

export default function IntegrationsSettingsTab({ isDarkMode }: IntegrationsSettingsTabProps) {
  const [settings, setSettings] = useState<IntegrationSettingsMasked | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Поля формы (публичные)
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseTable, setSupabaseTable] = useState('leads');
  const [supabaseSyncLimit, setSupabaseSyncLimit] = useState('50');
  const [supabaseAutoSyncEnabled, setSupabaseAutoSyncEnabled] = useState(false);
  const [supabaseAutoSyncInterval, setSupabaseAutoSyncInterval] = useState('5');
  const [libreOfficePath, setLibreOfficePath] = useState('');
  const [aiBackendUrl, setAiBackendUrl] = useState('');
  const [aiConsoleUrl, setAiConsoleUrl] = useState('');

  // Auto-sync status (опрашивается с сервера)
  const [autoSyncStatus, setAutoSyncStatus] = useState<AutoSyncStatus | null>(null);
  const autoSyncPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Новые секреты (пустая строка = не менять)
  const [supabaseKeyInput, setSupabaseKeyInput] = useState('');
  const [aiKeyInput, setAiKeyInput] = useState('');

  // Statuses
  const [savingState, setSavingState] = useState<SavingState>('idle');
  const [saveError, setSaveError] = useState('');

  const [supabaseTest, setSupabaseTest] = useState<SupabaseTestResult | null>(null);
  const [supabaseTesting, setSupabaseTesting] = useState(false);

  const [libreOfficeTest, setLibreOfficeTest] = useState<LibreOfficeTestResult | null>(null);
  const [libreOfficeTesting, setLibreOfficeTesting] = useState(false);
  const [libreOfficeDetecting, setLibreOfficeDetecting] = useState(false);

  const [aiTest, setAiTest] = useState<AiBackendTestResult | null>(null);
  const [aiTesting, setAiTesting] = useState(false);
  const [rcloneStatus, setRcloneStatus] = useState<BackupStatus['rclone'] | null>(null);
  const [rcloneChecking, setRcloneChecking] = useState(false);
  const [rcloneInstalling, setRcloneInstalling] = useState(false);
  const [rcloneInstallResult, setRcloneInstallResult] = useState<RcloneCommandResult | null>(null);

  // Collapsible sections
  const [openSection, setOpenSection] = useState<'supabase' | 'libreoffice' | 'ai' | 'rclone' | null>('supabase');

  // Опрос статуса автосинхронизации (когда секция открыта)
  const pollAutoSyncStatus = useCallback(async () => {
    try {
      const status = await integrationSettingsApi.getAutoSyncStatus();
      setAutoSyncStatus(status);
    } catch { /* ignore — сервер может быть недоступен */ }
  }, []);

  useEffect(() => {
    void load();
  }, []);

  // Запускаем поллинг когда открыта секция Supabase
  useEffect(() => {
    if (openSection === 'supabase') {
      void pollAutoSyncStatus();
      autoSyncPollRef.current = setInterval(() => { void pollAutoSyncStatus(); }, 10_000);
    } else {
      if (autoSyncPollRef.current) { clearInterval(autoSyncPollRef.current); autoSyncPollRef.current = null; }
    }
    return () => {
      if (autoSyncPollRef.current) { clearInterval(autoSyncPollRef.current); autoSyncPollRef.current = null; }
    };
  }, [openSection, pollAutoSyncStatus]);

  async function load() {
    setIsLoading(true);
    try {
      const data = await integrationSettingsApi.get();
      setSettings(data);
      setSupabaseUrl(data.supabaseUrl);
      setSupabaseTable(data.supabaseTable);
      setSupabaseSyncLimit(String(data.supabaseSyncLimit));
      setSupabaseAutoSyncEnabled(data.supabaseAutoSyncEnabled);
      setSupabaseAutoSyncInterval(String(data.supabaseAutoSyncIntervalMinutes));
      setLibreOfficePath(data.libreOfficePath);
      setAiBackendUrl(data.aiBackendUrl);
      setAiConsoleUrl(data.aiConsoleUrl || '');
    } catch (err) {
      console.error('Failed to load integration settings', err);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSave() {
    setSavingState('saving');
    setSaveError('');
    try {
      const input: IntegrationSettingsInput = {
        supabaseUrl: supabaseUrl.trim(),
        supabaseTable: supabaseTable.trim() || 'leads',
        supabaseSyncLimit: Number(supabaseSyncLimit) || 50,
        supabaseAutoSyncEnabled: supabaseAutoSyncEnabled,
        supabaseAutoSyncIntervalMinutes: Number(supabaseAutoSyncInterval) || 5,
        libreOfficePath: libreOfficePath.trim(),
        aiBackendUrl: aiBackendUrl.trim(),
        aiConsoleUrl: aiConsoleUrl.trim(),
      };
      if (supabaseKeyInput.trim()) input.supabaseServiceKey = supabaseKeyInput.trim();
      if (aiKeyInput.trim()) input.aiBackendKey = aiKeyInput.trim();

      const saved = await integrationSettingsApi.save(input);
      setSettings(saved);
      setSupabaseAutoSyncEnabled(saved.supabaseAutoSyncEnabled);
      setSupabaseAutoSyncInterval(String(saved.supabaseAutoSyncIntervalMinutes));
      setSupabaseKeyInput('');
      setAiKeyInput('');
      setSavingState('saved');
      // Обновляем статус планировщика после сохранения
      void pollAutoSyncStatus();
      setTimeout(() => setSavingState('idle'), 2500);
    } catch (err) {
      setSaveError(getErrorMessage(err));
      setSavingState('error');
      setTimeout(() => setSavingState('idle'), 4000);
    }
  }

  async function handleTestSupabase() {
    setSupabaseTesting(true);
    setSupabaseTest(null);
    try {
      setSupabaseTest(await integrationSettingsApi.testSupabase());
    } catch (err) {
      setSupabaseTest({ ok: false, error: getErrorMessage(err) });
    } finally {
      setSupabaseTesting(false);
    }
  }

  function fmtTime(iso: string | null | undefined): string {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch { return iso; }
  }

  async function handleDetectLibreOffice() {
    setLibreOfficeDetecting(true);
    try {
      const { detected } = await integrationSettingsApi.detectLibreOffice();
      if (detected) setLibreOfficePath(detected);
    } catch { /* ignore */ }
    finally { setLibreOfficeDetecting(false); }
  }

  async function handleTestLibreOffice() {
    setLibreOfficeTesting(true);
    setLibreOfficeTest(null);
    try {
      setLibreOfficeTest(await integrationSettingsApi.testLibreOffice());
    } catch (err) {
      setLibreOfficeTest({ ok: false, error: getErrorMessage(err) });
    } finally {
      setLibreOfficeTesting(false);
    }
  }

  async function handleTestAi() {
    setAiTesting(true);
    setAiTest(null);
    try {
      setAiTest(await integrationSettingsApi.testAiBackend());
    } catch (err) {
      setAiTest({ ok: false, status: 'offline', error: getErrorMessage(err) });
    } finally {
      setAiTesting(false);
    }
  }

  async function handleCheckRclone() {
    setRcloneChecking(true);
    try {
      setRcloneStatus(await backupApi.checkRclone());
    } catch (err) {
      setRcloneStatus({ available: false, error: getErrorMessage(err) });
    } finally {
      setRcloneChecking(false);
    }
  }

  async function handleInstallRclone() {
    setRcloneInstalling(true);
    setRcloneInstallResult(null);
    try {
      const result = await backupApi.installRclone();
      setRcloneInstallResult(result);
      await handleCheckRclone();
    } catch (err) {
      setRcloneInstallResult({ ok: false, stdout: '', stderr: '', error: getErrorMessage(err) });
    } finally {
      setRcloneInstalling(false);
    }
  }

  const inputClass = cn(
    'w-full rounded-xl border px-3 py-2 text-sm outline-none transition-colors font-mono',
    isDarkMode
      ? 'border-[#3D423E] bg-[#1A1C1B] text-[#F4F1EA] placeholder:text-[#B4CDD2]/40 focus:border-[#D98E2B]/60'
      : 'border-gray-200 bg-white text-gray-900 placeholder:text-gray-400 focus:border-orange-400',
  );

  const btnSecondary = cn(
    'inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-colors border',
    isDarkMode
      ? 'border-[#3D423E] bg-[#1A1C1B] text-[#B4CDD2] hover:bg-[#232323] hover:text-[#F4F1EA]'
      : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
  );

  const toggleSection = (id: typeof openSection) => setOpenSection(prev => prev === id ? null : id);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="animate-spin text-[#8F9894]" size={24} />
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* ── Supabase ── */}
      <SectionCard isDarkMode={isDarkMode}>
        <button
          type="button"
          onClick={() => toggleSection('supabase')}
          className="flex w-full items-center justify-between"
        >
          <SectionHeader
            isDarkMode={isDarkMode}
            icon={<Database size={17} className="text-emerald-400" />}
            title="Supabase"
            subtitle="Синхронизация заявок с сайта"
          />
          <ChevronDown
            size={16}
            className={cn(
              'shrink-0 transition-transform text-[#8F9894]',
              openSection === 'supabase' && 'rotate-180',
            )}
          />
        </button>

        {openSection === 'supabase' && (
          <div className="space-y-3 pt-1">
            <p className={cn('text-xs leading-relaxed', isDarkMode ? 'text-[#8F9894]' : 'text-gray-500')}>
              После установки ключи задаются здесь, в настройках CRM; переменные окружения нужны только для разработки и аварийного запуска.
              Приоритет: настройки CRM → переменные окружения.
              Service Role Key хранится на сервере и никогда не передаётся во frontend.
            </p>
            <div className={cn('grid gap-1 rounded-xl border px-3 py-2 text-xs', isDarkMode ? 'border-[#3D423E] bg-[#0E1210] text-[#8F9894]' : 'border-gray-200 bg-gray-50 text-gray-600')}>
              <span>URL: {sourceLabel(settings?.supabaseUrlSource)}</span>
              <span>Service Role Key: {sourceLabel(settings?.supabaseServiceKeySource)}{settings?.supabaseServiceKeyMask ? ` (${settings.supabaseServiceKeyMask})` : ''}</span>
              <span>Таблица: {sourceLabel(settings?.supabaseTableSource)}</span>
            </div>

            <FieldRow label="Supabase URL">
              <input
                className={inputClass}
                placeholder="https://xxxx.supabase.co"
                value={supabaseUrl}
                onChange={e => setSupabaseUrl(e.target.value)}
              />
            </FieldRow>

            <FieldRow label={
              settings?.supabaseServiceKeyHas
                ? `Service Role Key (текущий: ${settings.supabaseServiceKeyMask})`
                : 'Service Role Key'
            }>
              <input
                className={inputClass}
                type="password"
                placeholder={settings?.supabaseServiceKeyHas ? 'Оставьте пустым, чтобы не менять' : 'sb_secret_...'}
                value={supabaseKeyInput}
                onChange={e => setSupabaseKeyInput(e.target.value)}
                autoComplete="new-password"
              />
            </FieldRow>

            <div className="grid grid-cols-2 gap-3">
              <FieldRow label="Таблица">
                <input
                  className={inputClass}
                  placeholder="leads"
                  value={supabaseTable}
                  onChange={e => setSupabaseTable(e.target.value)}
                />
              </FieldRow>
              <FieldRow label="Лимит синхронизации">
                <input
                  className={inputClass}
                  type="number"
                  min={1}
                  max={500}
                  placeholder="50"
                  value={supabaseSyncLimit}
                  onChange={e => setSupabaseSyncLimit(e.target.value)}
                />
              </FieldRow>
            </div>

            <div className="flex items-center gap-2 flex-wrap pt-1">
              <button type="button" onClick={handleTestSupabase} disabled={supabaseTesting} className={btnSecondary}>
                {supabaseTesting ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
                Проверить подключение
              </button>
              {supabaseTest && (
                <StatusBadge
                  isDarkMode={isDarkMode}
                  ok={supabaseTest.ok}
                  label={supabaseTest.ok
                    ? `Подключено (${supabaseTest.rowCount ?? 0} строк в выборке)`
                    : (supabaseTest.error || 'Ошибка')}
                />
              )}
            </div>

            {/* ── Автосинхронизация ── */}
            <div className={cn(
              'rounded-xl border p-3 space-y-3 mt-1',
              isDarkMode ? 'border-[#3D423E] bg-[#0E1210]' : 'border-gray-100 bg-gray-50',
            )}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <RefreshCw size={14} className={isDarkMode ? 'text-emerald-400' : 'text-emerald-600'} />
                  <span className="text-sm font-bold">Автоматическая проверка заявок</span>
                </div>
                {/* Чекбокс */}
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={supabaseAutoSyncEnabled}
                    onChange={e => setSupabaseAutoSyncEnabled(e.target.checked)}
                    className="w-4 h-4 rounded accent-emerald-500 cursor-pointer"
                  />
                  <span className={cn('text-xs font-bold', isDarkMode ? 'text-[#B4CDD2]' : 'text-gray-600')}>
                    {supabaseAutoSyncEnabled ? 'Включено' : 'Выключено'}
                  </span>
                </label>
              </div>

              {supabaseAutoSyncEnabled && (
                <div className="flex items-center gap-3">
                  <span className={cn('text-xs', isDarkMode ? 'text-[#8F9894]' : 'text-gray-500')}>
                    Проверять каждые
                  </span>
                  <select
                    value={supabaseAutoSyncInterval}
                    onChange={e => setSupabaseAutoSyncInterval(e.target.value)}
                    className={cn(
                      'rounded-lg border px-2 py-1 text-xs font-mono outline-none transition-colors',
                      isDarkMode
                        ? 'border-[#3D423E] bg-[#1A1C1B] text-[#F4F1EA] focus:border-[#D98E2B]/60'
                        : 'border-gray-200 bg-white text-gray-900 focus:border-orange-400',
                    )}
                  >
                    {[1, 3, 5, 10, 15, 30].map(n => (
                      <option key={n} value={String(n)}>{n} мин</option>
                    ))}
                  </select>
                  <span className={cn('text-xs', isDarkMode ? 'text-[#8F9894]' : 'text-gray-500')}>
                    (применится после сохранения)
                  </span>
                </div>
              )}

              {/* Статус планировщика */}
              {autoSyncStatus && (
                <div className={cn(
                  'rounded-lg p-2 text-xs space-y-1',
                  isDarkMode ? 'bg-[#1A1C1B]' : 'bg-white border border-gray-100',
                )}>
                  <div className="flex items-center gap-1.5">
                    <Clock size={11} className={isDarkMode ? 'text-[#8F9894]' : 'text-gray-400'} />
                    <span className={isDarkMode ? 'text-[#8F9894]' : 'text-gray-400'}>
                      Статус планировщика:
                    </span>
                    {autoSyncStatus.running ? (
                      <span className="text-amber-400 font-bold inline-flex items-center gap-1">
                        <Loader2 size={10} className="animate-spin" /> Выполняется...
                      </span>
                    ) : autoSyncStatus.enabled ? (
                      <span className={isDarkMode ? 'text-emerald-400 font-bold' : 'text-emerald-600 font-bold'}>Активен</span>
                    ) : (
                      <span className={isDarkMode ? 'text-[#8F9894]' : 'text-gray-400'}>Отключён</span>
                    )}
                  </div>
                  <div className={cn('grid gap-0.5', isDarkMode ? 'text-[#8F9894]' : 'text-gray-400')}>
                    <span>Последний запуск: {fmtTime(autoSyncStatus.lastRunAt)}</span>
                    <span>Последний успех: {fmtTime(autoSyncStatus.lastSuccessAt)}</span>
                    {autoSyncStatus.lastPulledCount !== null && (
                      <span>Получено заявок: {autoSyncStatus.lastPulledCount}</span>
                    )}
                    {autoSyncStatus.lastErrorAt && (
                      <span className={isDarkMode ? 'text-red-400' : 'text-red-500'}>
                        Ошибка ({fmtTime(autoSyncStatus.lastErrorAt)}): {autoSyncStatus.lastError}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </SectionCard>

      {/* ── LibreOffice ── */}
      <SectionCard isDarkMode={isDarkMode}>
        <button
          type="button"
          onClick={() => toggleSection('libreoffice')}
          className="flex w-full items-center justify-between"
        >
          <SectionHeader
            isDarkMode={isDarkMode}
            icon={<span className={cn('text-xs font-black', isDarkMode ? 'text-blue-400' : 'text-blue-600')}>LO</span>}
            title="LibreOffice"
            subtitle="Конвертация договоров DOCX → PDF"
          />
          <ChevronDown
            size={16}
            className={cn(
              'shrink-0 transition-transform text-[#8F9894]',
              openSection === 'libreoffice' && 'rotate-180',
            )}
          />
        </button>

        {openSection === 'libreoffice' && (
          <div className="space-y-3 pt-1">
            <p className={cn('text-xs leading-relaxed', isDarkMode ? 'text-[#8F9894]' : 'text-gray-500')}>
              После установки путь можно указать здесь; переменные окружения нужны только для разработки.
              Приоритет: настройки CRM → <code className="font-mono">LIBREOFFICE_PATH</code> → автопоиск стандартных путей.
              Оставьте пустым для автопоиска.
            </p>
            <p className={cn('text-xs font-mono', isDarkMode ? 'text-[#8F9894]/70' : 'text-gray-400')}>
              Стандартные пути: C:\Program Files\LibreOffice\program\soffice.exe
            </p>

            <FieldRow label="Путь к soffice.exe">
              <input
                className={inputClass}
                placeholder="C:\Program Files\LibreOffice\program\soffice.exe"
                value={libreOfficePath}
                onChange={e => setLibreOfficePath(e.target.value)}
              />
            </FieldRow>

            <div className="flex items-center gap-2 flex-wrap pt-1">
              <button type="button" onClick={handleDetectLibreOffice} disabled={libreOfficeDetecting} className={btnSecondary}>
                {libreOfficeDetecting ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
                Найти автоматически
              </button>
              <button type="button" onClick={handleTestLibreOffice} disabled={libreOfficeTesting} className={btnSecondary}>
                {libreOfficeTesting ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
                Проверить LibreOffice
              </button>
              {libreOfficeTest && (
                <StatusBadge
                  isDarkMode={isDarkMode}
                  ok={libreOfficeTest.ok}
                  label={libreOfficeTest.ok
                    ? (libreOfficeTest.version || libreOfficeTest.path || 'Работает')
                    : (libreOfficeTest.error || 'Не найден')}
                />
              )}
            </div>
          </div>
        )}
      </SectionCard>

      {/* ── ИИ-консьерж ── */}
      <SectionCard isDarkMode={isDarkMode}>
        <button
          type="button"
          onClick={() => toggleSection('ai')}
          className="flex w-full items-center justify-between"
        >
          <SectionHeader
            isDarkMode={isDarkMode}
            icon={<Bot size={17} className="text-violet-400" />}
            title="ИИ-консьерж"
            subtitle="Внешний backend — CRM получает заявки через Supabase"
          />
          <ChevronDown
            size={16}
            className={cn(
              'shrink-0 transition-transform text-[#8F9894]',
              openSection === 'ai' && 'rotate-180',
            )}
          />
        </button>

        {openSection === 'ai' && (
          <div className="space-y-3 pt-1">
            <p className={cn('text-xs leading-relaxed', isDarkMode ? 'text-[#8F9894]' : 'text-gray-500')}>
              CRM не содержит AI-логики. Здесь только URL для проверки доступности внешнего backend.
              Telegram/VK/OpenAI ключи хранятся на домашнем сервере ИИ-консьержа, а не в CRM.
            </p>

            <FieldRow label="URL сервера ИИ-консьержа">
              <input
                className={inputClass}
                placeholder="http://192.168.1.100:8080"
                value={aiBackendUrl}
                onChange={e => setAiBackendUrl(e.target.value)}
              />
            </FieldRow>

            <FieldRow label="URL веб-панели ИИ-консьержа">
              <input
                className={inputClass}
                placeholder="https://ai.4-am.ru/console"
                value={aiConsoleUrl}
                onChange={e => setAiConsoleUrl(e.target.value)}
              />
              <p className={cn('text-[11px] leading-relaxed mt-1', isDarkMode ? 'text-[#8F9894]' : 'text-gray-500')}>
                Не секрет. Используется для кнопки «Открыть диалог» в карточке заявки от ИИ.
              </p>
            </FieldRow>

            <FieldRow label={
              settings?.aiBackendKeyHas
                ? `API Key (текущий: ${settings.aiBackendKeyMask})`
                : 'API Key (опционально)'
            }>
              <input
                className={inputClass}
                type="password"
                placeholder={settings?.aiBackendKeyHas ? 'Оставить без изменений' : 'Если backend требует авторизацию'}
                value={aiKeyInput}
                onChange={e => setAiKeyInput(e.target.value)}
                autoComplete="new-password"
              />
            </FieldRow>

            <div className="flex items-center gap-2 flex-wrap pt-1">
              <button type="button" onClick={handleTestAi} disabled={aiTesting} className={btnSecondary}>
                {aiTesting ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
                Проверить подключение
              </button>
              {aiTest && (
                <StatusBadge
                  isDarkMode={isDarkMode}
                  ok={aiTest.ok}
                  label={
                    aiTest.status === 'online' ? 'Online'
                    : aiTest.status === 'not_configured' ? 'URL не задан'
                    : (aiTest.error || 'Offline')
                  }
                />
              )}
            </div>
          </div>
        )}
      </SectionCard>

      <SectionCard isDarkMode={isDarkMode}>
        <button
          type="button"
          onClick={() => toggleSection('rclone')}
          className="flex w-full items-center justify-between"
        >
          <SectionHeader
            isDarkMode={isDarkMode}
            icon={<Download size={17} className="text-cyan-400" />}
            title="rclone"
            subtitle="Интеграция для облачных резервных копий"
          />
          <ChevronDown
            size={16}
            className={cn(
              'shrink-0 transition-transform text-[#8F9894]',
              openSection === 'rclone' && 'rotate-180',
            )}
          />
        </button>

        {openSection === 'rclone' && (
          <div className="space-y-3 pt-1">
            <p className={cn('text-xs leading-relaxed', isDarkMode ? 'text-[#8F9894]' : 'text-gray-500')}>
              Используется вкладкой «Резервные копии» для отправки архивов в облака. Установка запускается только по кнопке.
            </p>
            <p className={cn('rounded-xl border px-3 py-2 font-mono text-xs', isDarkMode ? 'border-[#3D423E] bg-[#0E1210] text-[#B4CDD2]' : 'border-gray-200 bg-gray-50 text-gray-600')}>
              winget install Rclone.Rclone
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <button type="button" onClick={handleCheckRclone} disabled={rcloneChecking || rcloneInstalling} className={btnSecondary}>
                {rcloneChecking ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
                Проверить rclone
              </button>
              <button type="button" onClick={handleInstallRclone} disabled={rcloneChecking || rcloneInstalling} className={btnSecondary}>
                {rcloneInstalling ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                Установить rclone
              </button>
              {rcloneStatus && (
                <StatusBadge
                  isDarkMode={isDarkMode}
                  ok={rcloneStatus.available}
                  label={rcloneStatus.available ? (rcloneStatus.version || 'rclone доступен') : (rcloneStatus.error || 'rclone не найден')}
                />
              )}
            </div>
            {rcloneInstallResult && (
              <div className={cn('rounded-xl border p-3 text-xs leading-relaxed', rcloneInstallResult.ok ? 'border-emerald-500/20 bg-emerald-500/10' : 'border-red-500/20 bg-red-500/10')}>
                <div className="font-bold">{rcloneInstallResult.ok ? 'Команда установки завершена' : 'Команда установки не выполнена'}</div>
                {rcloneInstallResult.error && <div className="mt-1">{rcloneInstallResult.error}</div>}
                {rcloneInstallResult.stdout && <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap">{rcloneInstallResult.stdout}</pre>}
                {rcloneInstallResult.stderr && <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap">{rcloneInstallResult.stderr}</pre>}
              </div>
            )}
          </div>
        )}
      </SectionCard>

      {/* ── Кнопка сохранения ── */}
      <div className="flex items-center justify-end gap-3 pt-2">
        {savingState === 'error' && saveError && (
          <p className="text-sm text-red-500">{saveError}</p>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={savingState === 'saving'}
          className={cn(
            'inline-flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-bold transition-colors',
            isDarkMode
              ? 'bg-[#D98E2B] text-[#1A1C1B] hover:bg-[#F2B35B] disabled:opacity-60'
              : 'bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-60',
          )}
        >
          {savingState === 'saving' && <Loader2 size={15} className="animate-spin" />}
          {savingState === 'saved' && <Check size={15} />}
          {savingState === 'saved' ? 'Сохранено' : 'Сохранить'}
        </button>
      </div>
    </div>
  );
}
