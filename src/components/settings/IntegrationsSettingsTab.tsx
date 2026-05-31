/**
 * Вкладка «Интеграции» в настройках CRM.
 * Supabase, LibreOffice, ИИ-консьерж.
 *
 * Секреты (service key, api key) никогда не возвращаются с сервера полным текстом.
 * Маска: «••••••••abcd». Чтобы заменить ключ — ввести новое значение.
 * Пустое поле при сохранении = оставить прежнее значение.
 */
import React, { useEffect, useState } from 'react';
import { Bot, Check, ChevronDown, Database, Loader2, Search, X, Zap } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  integrationSettingsApi,
  type AiBackendTestResult,
  type IntegrationSettingsMasked,
  type IntegrationSettingsInput,
  type LibreOfficeTestResult,
  type SupabaseTestResult,
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
  const [libreOfficePath, setLibreOfficePath] = useState('');
  const [aiBackendUrl, setAiBackendUrl] = useState('');

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

  // Collapsible sections
  const [openSection, setOpenSection] = useState<'supabase' | 'libreoffice' | 'ai' | null>('supabase');

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setIsLoading(true);
    try {
      const data = await integrationSettingsApi.get();
      setSettings(data);
      setSupabaseUrl(data.supabaseUrl);
      setSupabaseTable(data.supabaseTable);
      setSupabaseSyncLimit(String(data.supabaseSyncLimit));
      setLibreOfficePath(data.libreOfficePath);
      setAiBackendUrl(data.aiBackendUrl);
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
        libreOfficePath: libreOfficePath.trim(),
        aiBackendUrl: aiBackendUrl.trim(),
      };
      if (supabaseKeyInput.trim()) input.supabaseServiceKey = supabaseKeyInput.trim();
      if (aiKeyInput.trim()) input.aiBackendKey = aiKeyInput.trim();

      const saved = await integrationSettingsApi.save(input);
      setSettings(saved);
      setSupabaseKeyInput('');
      setAiKeyInput('');
      setSavingState('saved');
      setTimeout(() => setSavingState('idle'), 2500);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
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
      setSupabaseTest({ ok: false, error: err instanceof Error ? err.message : String(err) });
    } finally {
      setSupabaseTesting(false);
    }
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
      setAiTest({ ok: false, status: 'offline', error: err instanceof Error ? err.message : String(err) });
    } finally {
      setAiTesting(false);
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
              Приоритет: настройки CRM → <code className="font-mono">.env.local</code>.
              Service Role Key хранится на сервере и никогда не передаётся во frontend.
            </p>

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
                placeholder={settings?.supabaseServiceKeyHas ? 'Оставить без изменений' : 'sb_secret_...'}
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
