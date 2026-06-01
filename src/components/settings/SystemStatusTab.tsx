/**
 * Вкладка «Система» в настройках CRM.
 *
 * Показывает без DevTools:
 *  — версию CRM и режим запуска (production / development)
 *  — пути к папке данных и файлу БД
 *  — статус интеграций: Supabase / LibreOffice / ИИ-backend
 *  — системные подсказки о состоянии конфигурации
 *
 * Секреты (service key, api key) не отображаются — только маска и флаг наличия.
 */
import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  Check,
  CheckCircle2,
  Database,
  Info,
  Loader2,
  RefreshCw,
  Server,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  appInfoApi,
  integrationSettingsApi,
  type AppInfo,
  type AiBackendTestResult,
  type IntegrationSettingsMasked,
  type LibreOfficeTestResult,
  type SupabaseTestResult,
} from '../../services/localApi';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ── Типы ───────────────────────────────────────────────────────────────────

type HintType = 'ok' | 'warn' | 'error' | 'info';

interface SystemHint {
  type: HintType;
  text: string;
}

// ── Вычисление системных подсказок ─────────────────────────────────────────

function computeHints(
  settings: IntegrationSettingsMasked | null,
  supabaseTest: SupabaseTestResult | null,
  libreOfficeTest: LibreOfficeTestResult | null,
  aiTest: AiBackendTestResult | null,
): SystemHint[] {
  if (!settings) return [];
  const hints: SystemHint[] = [];

  // Supabase
  const supConfigured = Boolean(settings.supabaseUrl && settings.supabaseServiceKeyHas);
  if (supabaseTest?.ok === true) {
    hints.push({ type: 'ok', text: `Supabase подключён — синхронизация заявок активна` });
  } else if (supabaseTest?.ok === false) {
    hints.push({ type: 'error', text: `Supabase: ошибка — ${supabaseTest.error ?? 'проверьте настройки'}` });
  } else if (!supConfigured) {
    hints.push({ type: 'warn', text: 'Supabase не настроен — заявки с сайта недоступны' });
  } else {
    hints.push({ type: 'info', text: 'Supabase настроен — нажмите «Проверить» для подтверждения' });
  }

  // LibreOffice
  if (libreOfficeTest?.ok === true) {
    hints.push({ type: 'ok', text: 'LibreOffice найден — экспорт договоров в PDF работает' });
  } else if (libreOfficeTest?.ok === false) {
    hints.push({ type: 'error', text: 'LibreOffice не найден — экспорт договоров в PDF недоступен' });
  } else {
    hints.push({ type: 'info', text: 'LibreOffice: нажмите «Проверить» для проверки' });
  }

  // AI backend
  if (!settings.aiBackendUrl) {
    hints.push({ type: 'info', text: 'ИИ-консьерж не настроен (опционально)' });
  } else if (aiTest?.ok === true) {
    hints.push({ type: 'ok', text: 'ИИ-консьерж online' });
  } else if (aiTest?.ok === false) {
    hints.push({ type: 'warn', text: 'ИИ-консьерж не отвечает — проверьте URL и доступность сервера' });
  } else {
    hints.push({ type: 'info', text: 'ИИ-консьерж: URL настроен — нажмите «Проверить» для проверки' });
  }

  return hints;
}

// ── Мелкие компоненты ──────────────────────────────────────────────────────

function StatusBadge({
  ok, label, isDarkMode,
}: { ok: boolean; label: string; isDarkMode: boolean }) {
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

const HINT_ICONS = {
  ok:    CheckCircle2,
  warn:  AlertTriangle,
  error: XCircle,
  info:  Info,
} as const;

function hintColorCls(type: HintType, isDarkMode: boolean): string {
  switch (type) {
    case 'ok':    return isDarkMode ? 'text-emerald-400' : 'text-emerald-700';
    case 'warn':  return isDarkMode ? 'text-amber-400'   : 'text-amber-700';
    case 'error': return isDarkMode ? 'text-red-400'     : 'text-red-600';
    case 'info':  return isDarkMode ? 'text-[#8F9894]'   : 'text-gray-500';
  }
}

function PathRow({
  label, value, isDarkMode,
}: { label: string; value: string | null; isDarkMode: boolean }) {
  return (
    <div className="space-y-0.5">
      <p className={cn('text-[10px] font-bold uppercase tracking-wide', isDarkMode ? 'text-[#8F9894]' : 'text-gray-400')}>
        {label}
      </p>
      {value ? (
        <p className={cn('text-xs font-mono break-all leading-snug', isDarkMode ? 'text-[#F4F1EA]/80' : 'text-gray-700')}>
          {value}
        </p>
      ) : (
        <p className={cn('text-xs', isDarkMode ? 'text-[#8F9894]/50' : 'text-gray-300')}>—</p>
      )}
    </div>
  );
}

// ── Главный компонент ──────────────────────────────────────────────────────

interface SystemStatusTabProps {
  isDarkMode: boolean;
}

export default function SystemStatusTab({ isDarkMode }: SystemStatusTabProps) {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [settings, setSettings] = useState<IntegrationSettingsMasked | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [supabaseTest, setSupabaseTest]       = useState<SupabaseTestResult | null>(null);
  const [supabaseTesting, setSupabaseTesting] = useState(false);

  const [libreOfficeTest, setLibreOfficeTest]       = useState<LibreOfficeTestResult | null>(null);
  const [libreOfficeTesting, setLibreOfficeTesting] = useState(false);

  const [aiTest, setAiTest]       = useState<AiBackendTestResult | null>(null);
  const [aiTesting, setAiTesting] = useState(false);

  useEffect(() => { void load(); }, []);

  async function load() {
    setIsLoading(true);
    setLoadError('');
    try {
      const [info, cfg] = await Promise.all([
        appInfoApi.get(),
        integrationSettingsApi.get(),
      ]);
      setAppInfo(info);
      setSettings(cfg);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleTestSupabase() {
    setSupabaseTesting(true);
    setSupabaseTest(null);
    try {
      setSupabaseTest(await integrationSettingsApi.testSupabase());
    } catch (err) {
      setSupabaseTest({ ok: false, error: err instanceof Error ? err.message : String(err) });
    } finally {
      setSupabaseTesting(false);
    }
  }

  async function handleTestLibreOffice() {
    setLibreOfficeTesting(true);
    setLibreOfficeTest(null);
    try {
      setLibreOfficeTest(await integrationSettingsApi.testLibreOffice());
    } catch (err) {
      setLibreOfficeTest({ ok: false, error: err instanceof Error ? err.message : String(err) });
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
      setAiTest({ ok: false, status: 'error', error: err instanceof Error ? err.message : String(err) });
    } finally {
      setAiTesting(false);
    }
  }

  // ── Стили ──
  const cardCls = cn(
    'rounded-2xl border p-4 space-y-3',
    isDarkMode ? 'bg-[#111111] border-white/5' : 'bg-white border-gray-200 shadow-sm',
  );

  const btnSmall = cn(
    'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors border',
    isDarkMode
      ? 'border-[#3D423E] bg-[#1A1C1B] text-[#B4CDD2] hover:bg-[#232323] hover:text-[#F4F1EA] disabled:opacity-50'
      : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50',
  );

  const hints = computeHints(settings, supabaseTest, libreOfficeTest, aiTest);

  // ── Загрузка ──
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="animate-spin text-[#8F9894]" size={24} />
      </div>
    );
  }

  // ── Ошибка ──
  if (loadError) {
    return (
      <div className={cn(
        'rounded-2xl border p-6 text-center',
        isDarkMode ? 'bg-[#111111] border-red-500/20' : 'bg-red-50 border-red-200',
      )}>
        <XCircle size={24} className={cn('mx-auto mb-2', isDarkMode ? 'text-red-400' : 'text-red-500')} />
        <p className={cn('text-sm font-bold', isDarkMode ? 'text-red-400' : 'text-red-600')}>Ошибка загрузки</p>
        <p className={cn('text-xs mt-1', isDarkMode ? 'text-[#8F9894]' : 'text-gray-500')}>{loadError}</p>
        <button
          onClick={() => void load()}
          className={cn('mt-3 text-xs underline', isDarkMode ? 'text-[#8F9894]' : 'text-gray-500')}
        >
          Повторить
        </button>
      </div>
    );
  }

  // ── Вычисляем метки статуса интеграций ──

  const supabaseSourceLabel = (() => {
    if (settings?.supabaseUrl && settings.supabaseServiceKeyHas) return 'Настроен в UI';
    if (settings?.supabaseUrl && !settings.supabaseServiceKeyHas) return 'URL задан, ключ отсутствует';
    return 'Не настроен (fallback: .env.local)';
  })();

  const libreOfficeSourceLabel = (() => {
    if (settings?.libreOfficePath) return settings.libreOfficePath;
    return 'Путь не задан — автопоиск';
  })();

  const aiSourceLabel = settings?.aiBackendUrl || 'Не настроен';

  const modePill = appInfo?.mode === 'production' ? {
    label: 'production',
    cls: isDarkMode ? 'bg-emerald-500/15 text-emerald-400' : 'bg-emerald-50 text-emerald-700',
  } : {
    label: 'development',
    cls: isDarkMode ? 'bg-amber-500/15 text-amber-400' : 'bg-amber-50 text-amber-700',
  };

  return (
    <div className="space-y-5">

      {/* ── Информация о приложении ── */}
      <section className={cn(cardCls, '!space-y-4')}>
        <div className="flex items-center justify-between gap-4">

          <div className="flex items-center gap-3">
            <div className={cn(
              'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
              isDarkMode ? 'bg-[#8CAFBE]/10' : 'bg-blue-50',
            )}>
              <Server size={18} className={isDarkMode ? 'text-[#B4CDD2]' : 'text-blue-500'} />
            </div>
            <div>
              <p className="font-bold text-base leading-tight">CRM «Большая Медведица»</p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className={cn(
                  'text-sm font-mono font-bold',
                  isDarkMode ? 'text-[#D98E2B]' : 'text-orange-600',
                )}>
                  v{appInfo?.version ?? '—'}
                </span>
                <span className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                  modePill.cls,
                )}>
                  {appInfo?.mode === 'production' ? <Check size={9} /> : <Info size={9} />}
                  {modePill.label}
                </span>
              </div>
            </div>
          </div>

          {/* Кнопка обновить */}
          <button
            type="button"
            onClick={() => void load()}
            title="Обновить данные"
            className={cn(
              'p-2 rounded-xl transition-colors shrink-0',
              isDarkMode ? 'text-[#8F9894] hover:text-[#F4F1EA] hover:bg-white/5' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100',
            )}
          >
            <RefreshCw size={15} />
          </button>
        </div>

        {/* Пути к данным */}
        <div className={cn('grid grid-cols-2 gap-4 pt-3 border-t', isDarkMode ? 'border-white/5' : 'border-gray-100')}>
          <PathRow label="Папка данных" value={appInfo?.dataDir ?? null} isDarkMode={isDarkMode} />
          <PathRow label="База данных"  value={appInfo?.dbPath  ?? null} isDarkMode={isDarkMode} />
        </div>
      </section>

      {/* ── Карточки интеграций ── */}
      <div className="grid grid-cols-3 gap-4">

        {/* Supabase */}
        <div className={cardCls}>
          <div className="flex items-start gap-2.5">
            <div className={cn(
              'w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5',
              isDarkMode ? 'bg-white/5' : 'bg-gray-100',
            )}>
              <Database size={14} className="text-emerald-400" />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-sm">Supabase</p>
              <p className={cn(
                'text-[10px] break-all leading-snug mt-0.5',
                isDarkMode ? 'text-[#8F9894]' : 'text-gray-500',
              )}>
                {supabaseSourceLabel}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={handleTestSupabase} disabled={supabaseTesting} className={btnSmall}>
              {supabaseTesting
                ? <Loader2 size={11} className="animate-spin" />
                : <Zap size={11} />}
              Проверить
            </button>
            {supabaseTest && (
              <StatusBadge
                isDarkMode={isDarkMode}
                ok={supabaseTest.ok}
                label={supabaseTest.ok
                  ? `OK (${supabaseTest.rowCount ?? 0} стр.)`
                  : (supabaseTest.error?.slice(0, 32) ?? 'Ошибка')}
              />
            )}
          </div>
        </div>

        {/* LibreOffice */}
        <div className={cardCls}>
          <div className="flex items-start gap-2.5">
            <div className={cn(
              'w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5',
              isDarkMode ? 'bg-white/5' : 'bg-gray-100',
            )}>
              <span className={cn('text-xs font-black leading-none', isDarkMode ? 'text-blue-400' : 'text-blue-600')}>
                LO
              </span>
            </div>
            <div className="min-w-0">
              <p className="font-bold text-sm">LibreOffice</p>
              <p className={cn(
                'text-[10px] break-all leading-snug mt-0.5',
                isDarkMode ? 'text-[#8F9894]' : 'text-gray-500',
              )}>
                {libreOfficeSourceLabel}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={handleTestLibreOffice} disabled={libreOfficeTesting} className={btnSmall}>
              {libreOfficeTesting
                ? <Loader2 size={11} className="animate-spin" />
                : <Zap size={11} />}
              Проверить
            </button>
            {libreOfficeTest && (
              <StatusBadge
                isDarkMode={isDarkMode}
                ok={libreOfficeTest.ok}
                label={libreOfficeTest.ok
                  ? (libreOfficeTest.version ?? libreOfficeTest.path ?? 'Найден')
                  : (libreOfficeTest.error?.slice(0, 32) ?? 'Не найден')}
              />
            )}
          </div>
        </div>

        {/* ИИ-консьерж */}
        <div className={cardCls}>
          <div className="flex items-start gap-2.5">
            <div className={cn(
              'w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5',
              isDarkMode ? 'bg-white/5' : 'bg-gray-100',
            )}>
              <Bot size={14} className="text-violet-400" />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-sm">ИИ-консьерж</p>
              <p className={cn(
                'text-[10px] break-all leading-snug mt-0.5',
                isDarkMode ? 'text-[#8F9894]' : 'text-gray-500',
              )}>
                {aiSourceLabel}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {settings?.aiBackendUrl ? (
              <>
                <button type="button" onClick={handleTestAi} disabled={aiTesting} className={btnSmall}>
                  {aiTesting
                    ? <Loader2 size={11} className="animate-spin" />
                    : <Zap size={11} />}
                  Проверить
                </button>
                {aiTest && (
                  <StatusBadge
                    isDarkMode={isDarkMode}
                    ok={aiTest.ok}
                    label={aiTest.ok ? 'Online' : (aiTest.error?.slice(0, 32) ?? 'Offline')}
                  />
                )}
              </>
            ) : (
              <span className={cn('text-xs', isDarkMode ? 'text-[#8F9894]/60' : 'text-gray-300')}>
                Не настроен (опционально)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Системные подсказки ── */}
      {hints.length > 0 && (
        <section className={cn(
          'rounded-2xl border p-4',
          isDarkMode ? 'bg-[#111111] border-white/5' : 'bg-white border-gray-200 shadow-sm',
        )}>
          <p className={cn(
            'text-[10px] font-bold uppercase tracking-wide mb-3',
            isDarkMode ? 'text-[#8F9894]' : 'text-gray-400',
          )}>
            Состояние системы
          </p>
          <ul className="space-y-2.5">
            {hints.map((hint, i) => {
              const Icon = HINT_ICONS[hint.type];
              const clr  = hintColorCls(hint.type, isDarkMode);
              return (
                <li key={i} className="flex items-start gap-2">
                  <Icon size={14} className={cn(clr, 'shrink-0 mt-0.5')} />
                  <span className={cn('text-sm leading-snug', clr)}>{hint.text}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
