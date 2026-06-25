/**
 * UI управления визуальными DOCX-шаблонами договора БМ.
 *
 * Использует backend API:
 *   GET  /api/docx-templates/bm/:mode/status
 *   GET  /api/docx-templates/bm/:mode/download
 *   POST /api/docx-templates/bm/:mode/upload
 *   POST /api/docx-templates/bm/:mode/test?output=json|pdf
 *   POST /api/docx-templates/bm/:mode/activate
 *
 * НЕ трогает generateBmContractDocx(), /api/bm-docx/*, PDFMe, SQLite.
 */
import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  FileText, Upload, Download, PlayCircle, CheckCircle2, AlertCircle,
  Archive, Loader2, RefreshCw, FileCheck, FileWarning,
} from 'lucide-react';
import {
  bmDocxTemplateApi,
  type BmTemplateStatus,
  type BmTemplateTestResult,
} from '../../services/localApi';
import { useToast } from '../../context/ToastContext';

// ── helpers ──────────────────────────────────────────────────────────────────

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type TemplateMode = 'print' | 'signed';

interface CardState {
  status: BmTemplateStatus | null;
  loading: boolean;
  statusError: string | null;
  uploading: boolean;
  testing: boolean;
  testResult: BmTemplateTestResult | null;
  downloadingTestPdf: boolean;
  downloadingTemplate: boolean;
  activating: boolean;
}

// ── Labels ────────────────────────────────────────────────────────────────────

const MODE_TITLE: Record<TemplateMode, string> = {
  print:  'Договор для печати',
  signed: 'Договор с печатью и подписью',
};

const MODE_DESC: Record<TemplateMode, string> = {
  print:  'Чистый договор — клиент подписывает от руки.',
  signed: 'Договор с вашей печатью и подписью директора.',
};

// ── Root component ────────────────────────────────────────────────────────────

interface BmDocxTemplatesTabProps {
  isDarkMode: boolean;
}

export default function BmDocxTemplatesTab({ isDarkMode }: BmDocxTemplatesTabProps) {
  return (
    <section className="space-y-5">
      <div>
        <h3 className="text-xl font-bold">DOCX-шаблоны договора БМ</h3>
        <p className={cn('text-xs mt-1', isDarkMode ? 'text-slate-400' : 'text-slate-500')}>
          Загружайте и активируйте собственные Word-шаблоны договора «Большая Медведица».
          Кнопки договора используют активный шаблон, а при ошибке откатываются на встроенную генерацию.
        </p>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <BmTemplateCard mode="print"  isDarkMode={isDarkMode} />
        <BmTemplateCard mode="signed" isDarkMode={isDarkMode} />
      </div>
    </section>
  );
}

// ── Card component ────────────────────────────────────────────────────────────

function BmTemplateCard({ mode, isDarkMode }: { mode: TemplateMode; isDarkMode: boolean }) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [st, setSt] = useState<CardState>({
    status: null, loading: false, statusError: null,
    uploading: false,
    testing: false, testResult: null,
    downloadingTestPdf: false,
    downloadingTemplate: false,
    activating: false,
  });

  const patch = (p: Partial<CardState>) => setSt(prev => ({ ...prev, ...p }));

  // ── Load status ─────────────────────────────────────────────────────────────

  async function loadStatus() {
    patch({ loading: true, statusError: null });
    try {
      const status = await bmDocxTemplateApi.getStatus(mode);
      patch({ status, loading: false });
    } catch (e) {
      patch({ loading: false, statusError: e instanceof Error ? e.message : String(e) });
    }
  }

  useEffect(() => { void loadStatus(); }, []);

  // ── Upload ──────────────────────────────────────────────────────────────────

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.docx')) {
      toast('Выберите файл в формате .docx', 'error');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    patch({ uploading: true, testResult: null });
    try {
      const buf = await file.arrayBuffer();
      const result = await bmDocxTemplateApi.uploadDraft(mode, buf);

      if (!result.ok) {
        const errs = result.validation?.errors?.slice(0, 3).join('\n') || result.error || 'Неизвестная ошибка';
        toast(`Шаблон не прошёл проверку:\n${errs}`, 'error');
      } else {
        toast(`Файл загружен (${fmtSize(result.sizeBytes)}). Проверьте и активируйте.`);
      }
      await loadStatus();
    } catch (e: any) {
      // сервер мог вернуть структурированные ошибки валидации
      const errData = e?.data;
      if (errData?.validation?.errors?.length) {
        toast(
          `Шаблон не прошёл проверку:\n${errData.validation.errors.slice(0, 3).join('\n')}`,
          'error',
        );
      } else {
        toast(e instanceof Error ? e.message : String(e), 'error');
      }
    } finally {
      patch({ uploading: false });
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  // ── Test (JSON) ─────────────────────────────────────────────────────────────

  async function handleTest() {
    patch({ testing: true, testResult: null });
    try {
      const result = await bmDocxTemplateApi.testJson(mode);
      patch({ testResult: result });
      if (result.ok) {
        toast(`Проверка успешна: ${result.pages} стр., договор ${result.contractNumber}`);
      } else {
        toast(`Ошибка при проверке: ${result.error}`, 'error');
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      patch({ testing: false });
    }
  }

  // ── Test PDF download ───────────────────────────────────────────────────────

  async function handleDownloadTestPdf() {
    patch({ downloadingTestPdf: true });
    try {
      const blob = await bmDocxTemplateApi.testPdf(mode);
      downloadBlob(blob, `bm_шаблон_тест_${mode}.pdf`);
      toast('Тестовый PDF скачан');
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      patch({ downloadingTestPdf: false });
    }
  }

  // ── Download active ─────────────────────────────────────────────────────────

  async function handleDownloadTemplate() {
    patch({ downloadingTemplate: true });
    try {
      const blob = await bmDocxTemplateApi.downloadActive(mode);
      downloadBlob(blob, `bm_договор_шаблон_${mode}.docx`);
      toast(hasActive ? 'Активный шаблон скачан' : 'Базовый шаблон скачан');
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      patch({ downloadingTemplate: false });
    }
  }
  // ── Activate ────────────────────────────────────────────────────────────────

  async function handleActivate() {
    const hasActive = Boolean(st.status?.active);
    const confirmed = window.confirm(
      `Активировать загруженный шаблон «${MODE_TITLE[mode]}»?\n\n` +
      (hasActive
        ? 'Текущий активный шаблон будет перемещён в архив.'
        : 'Шаблон станет активным.'),
    );
    if (!confirmed) return;

    patch({ activating: true });
    try {
      await bmDocxTemplateApi.activate(mode);
      toast(`Шаблон «${MODE_TITLE[mode]}» активирован`);
      patch({ testResult: null });
      await loadStatus();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      patch({ activating: false });
    }
  }

  // ── Derived ─────────────────────────────────────────────────────────────────

  const { status, loading, statusError, uploading, testing, testResult, downloadingTestPdf, downloadingTemplate, activating } = st;

  const hasActive = Boolean(status?.active);
  const hasDraft  = Boolean(status?.draft);
  const archiveCount = status?.archive.length ?? 0;

  const canTest     = hasActive || hasDraft;
  const canActivate = hasDraft;
  const busy        = uploading || testing || downloadingTestPdf || downloadingTemplate || activating;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className={cn(
      'rounded-3xl border p-6 flex flex-col gap-5',
      isDarkMode ? 'bg-[#111111] border-white/5' : 'bg-white border-gray-200 shadow-sm',
    )}>
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={cn(
            'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
            mode === 'signed'
              ? 'bg-violet-500/10 text-violet-400'
              : 'bg-sky-500/10 text-sky-400',
          )}>
            <FileText size={20} />
          </div>
          <div>
            <div className="font-bold text-sm leading-tight">{MODE_TITLE[mode]}</div>
            <div className={cn('text-[11px] mt-0.5', isDarkMode ? 'text-slate-400' : 'text-slate-500')}>
              {MODE_DESC[mode]}
            </div>
          </div>
        </div>
        <button
          onClick={loadStatus}
          disabled={loading || busy}
          title="Обновить статус"
          className={cn(
            'shrink-0 p-1.5 rounded-lg transition-colors',
            isDarkMode ? 'hover:bg-white/10 text-slate-400' : 'hover:bg-gray-100 text-slate-500',
          )}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* ── Status error ── */}
      {statusError && (
        <div className={cn(
          'flex items-center gap-2 px-3 py-2 rounded-xl text-xs',
          isDarkMode ? 'bg-red-500/10 text-red-400' : 'bg-red-50 text-red-600',
        )}>
          <AlertCircle size={14} className="shrink-0" />
          {statusError}
        </div>
      )}

      {/* ── Status rows ── */}
      {status && (
        <div className={cn(
          'rounded-2xl p-4 space-y-3 text-xs',
          isDarkMode ? 'bg-white/4' : 'bg-gray-50',
        )}>
          {/* Active */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {hasActive
                ? <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                : <AlertCircle  size={14} className="text-amber-400 shrink-0" />}
              <span className={cn('font-semibold', isDarkMode ? 'text-slate-200' : 'text-slate-700')}>
                Активный шаблон
              </span>
            </div>
            {hasActive ? (
              <div className={cn('text-right', isDarkMode ? 'text-slate-400' : 'text-slate-500')}>
                <span>{fmtSize(status.active!.sizeBytes)}</span>
                <span className="mx-1 opacity-40">·</span>
                <span>{fmtDate(status.active!.mtime)}</span>
              </div>
            ) : (
              <span className={cn(isDarkMode ? 'text-amber-400/80' : 'text-amber-500')}>не загружен</span>
            )}
          </div>

          {/* Draft */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {hasDraft
                ? <FileCheck    size={14} className="text-sky-400 shrink-0" />
                : <FileWarning  size={14} className={cn('shrink-0', isDarkMode ? 'text-slate-500' : 'text-slate-400')} />}
              <span className={cn('font-semibold', isDarkMode ? 'text-slate-200' : 'text-slate-700')}>
                Загруженный шаблон
              </span>
            </div>
            {hasDraft ? (
              <div className={cn('text-right', isDarkMode ? 'text-slate-400' : 'text-slate-500')}>
                <span>{fmtSize(status.draft!.sizeBytes)}</span>
                <span className="mx-1 opacity-40">·</span>
                <span>{fmtDate(status.draft!.mtime)}</span>
              </div>
            ) : (
              <span className={isDarkMode ? 'text-slate-500' : 'text-slate-400'}>нет</span>
            )}
          </div>

          {/* Archive */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Archive size={14} className={cn('shrink-0', isDarkMode ? 'text-slate-500' : 'text-slate-400')} />
              <span className={cn('font-semibold', isDarkMode ? 'text-slate-200' : 'text-slate-700')}>
                Архивные версии
              </span>
            </div>
            <span className={isDarkMode ? 'text-slate-400' : 'text-slate-500'}>
              {archiveCount === 0 ? 'нет' : archiveCount}
            </span>
          </div>
        </div>
      )}

      {/* ── Loading skeleton ── */}
      {!status && !statusError && loading && (
        <div className={cn(
          'rounded-2xl p-4 flex items-center justify-center gap-2 text-xs',
          isDarkMode ? 'bg-white/4 text-slate-500' : 'bg-gray-50 text-slate-400',
        )}>
          <Loader2 size={14} className="animate-spin" />
          Загружаем статус…
        </div>
      )}

      {/* ── Test result ── */}
      {testResult && (
        <div className={cn(
          'rounded-2xl px-4 py-3 text-xs space-y-1',
          testResult.ok
            ? (isDarkMode ? 'bg-emerald-500/10 text-emerald-300' : 'bg-emerald-50 text-emerald-700')
            : (isDarkMode ? 'bg-red-500/10 text-red-400' : 'bg-red-50 text-red-700'),
        )}>
          {testResult.ok ? (
            <>
              <div className="flex items-center gap-1.5 font-semibold">
                <CheckCircle2 size={13} />
                Проверка успешна
              </div>
              <div className="opacity-80">
                Договор №{testResult.contractNumber} · {testResult.pages} стр. ·{' '}
                {fmtSize(testResult.pdfBytes)} ·{' '}
                использован {testResult.which === 'draft' ? 'загруженный шаблон' : 'активный шаблон'}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-1.5 font-semibold">
                <AlertCircle size={13} />
                Ошибка проверки
              </div>
              <div className="opacity-80">{testResult.error}</div>
            </>
          )}
        </div>
      )}

      {/* ── Actions ── */}
      <div className="flex flex-col gap-2 mt-auto">
        {/* Upload row */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={handleFileChange}
        />
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => !busy && fileInputRef.current?.click()}
          disabled={busy}
          className={cn(
            'flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all disabled:opacity-50',
            isDarkMode
              ? 'bg-sky-500/15 hover:bg-sky-500/25 text-sky-300'
              : 'bg-sky-50 hover:bg-sky-100 text-sky-700',
          )}
        >
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          {uploading ? 'Загружаем…' : 'Загрузить шаблон (.docx)'}
        </motion.button>

        {/* Row: test + download test PDF */}
        {canTest && (
          <div className="grid grid-cols-2 gap-2">
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleTest}
              disabled={busy}
              className={cn(
                'flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold transition-all disabled:opacity-50',
                isDarkMode
                  ? 'bg-white/5 hover:bg-white/10 text-slate-300'
                  : 'bg-gray-100 hover:bg-gray-200 text-gray-700',
              )}
            >
              {testing ? <Loader2 size={13} className="animate-spin" /> : <PlayCircle size={13} />}
              {testing ? 'Проверяем…' : 'Проверить'}
            </motion.button>

            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleDownloadTestPdf}
              disabled={busy}
              className={cn(
                'flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-[11px] font-bold transition-all disabled:opacity-50',
                isDarkMode
                  ? 'bg-white/5 hover:bg-white/10 text-slate-300'
                  : 'bg-gray-100 hover:bg-gray-200 text-gray-700',
              )}
            >
              {downloadingTestPdf ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
              {downloadingTestPdf ? 'Генерируем…' : 'Тестовый PDF'}
            </motion.button>
          </div>
        )}

        {/* Activate */}
        {canActivate && (
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleActivate}
            disabled={busy}
            className={cn(
              'flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all disabled:opacity-50',
              isDarkMode
                ? 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300'
                : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700',
            )}
          >
            {activating ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            {activating ? 'Активируем…' : 'Активировать загруженный шаблон'}
          </motion.button>
        )}

        {/* Download active/default */}
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleDownloadTemplate}
          disabled={busy}
          className={cn(
            'flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-[11px] font-bold transition-all disabled:opacity-50',
            isDarkMode
              ? 'bg-white/4 hover:bg-white/8 text-slate-400'
              : 'bg-gray-50 hover:bg-gray-100 text-gray-500',
          )}
        >
          {downloadingTemplate ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
          {downloadingTemplate
            ? 'Скачиваем...'
            : hasActive
              ? 'Скачать активный шаблон'
              : 'Скачать базовый шаблон'}
        </motion.button>
      </div>
    </div>
  );
}
