import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, ExternalLink, Loader2, X } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { Client, Lead, LeadCreateInput, LeadStatus, LeadUpdateInput } from '../../types';
import LeadStatusBadge, { LEAD_STATUS_LABELS } from './LeadStatusBadge';
import { CHANNEL_LABELS, formatLeadSource, getLeadOriginLabel, isAiSource, normalizeLeadStatus, parseJsonSafe } from './leadDisplay';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const STATUS_OPTIONS: LeadStatus[] = [
  'new',
  'confirmed',
  'client_created',
  'contract_created',
  'rejected',
];

interface LeadFormState {
  guestName: string;
  phone: string;
  email: string;
  desiredStartDate: string;
  desiredEndDate: string;
  desiredTime: string;
  guestsCount: string;
  objectType: string;
  objectId: string;
  message: string;
  source: string;
  status: LeadStatus;
  managerNote: string;
}

interface LeadModalProps {
  isOpen: boolean;
  isDarkMode: boolean;
  lead: Lead | null;
  isSaving?: boolean;
  onClose: () => void;
  onCreate: (input: LeadCreateInput) => Promise<void>;
  onUpdate: (id: string, patch: LeadUpdateInput) => Promise<void>;
  clients?: Client[];
  onCreateClient: (id: string) => Promise<void>;
  onConfirmLead: (id: string) => Promise<void>;
  onCreatePrebookingFromLead: (lead: Lead) => void;
  onOpenClient?: (clientId: string) => void;
  /** Удаление входящей заявки. Если не передан — кнопка удаления не показывается. */
  onDelete?: (id: string) => void;
  /** URL веб-панели BM-concierge (не секрет). Если передан, показывается кнопка «Открыть диалог». */
  aiConsoleUrl?: string;
}

function textInputValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function formatLeadReceivedAt(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return 'Не указано';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatTechnicalValue(value: unknown) {
  if (value == null || value === '') return '';
  if (typeof value === 'string') return value;

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

// ── AI-консьерж ─────────────────────────────────────────────────────────────

interface AiMessage {
  role?: string;
  text?: string;
  content?: string;
  message?: string;
  [key: string]: unknown;
}

function formatChannel(channel: string | undefined): string {
  if (!channel) return '—';
  return CHANNEL_LABELS[channel.toLowerCase()] ?? channel;
}

function parseTranscript(raw: string | undefined): AiMessage[] | null {
  if (!raw) return null;
  const parsed = parseJsonSafe(raw);
  return Array.isArray(parsed) ? parsed as AiMessage[] : null;
}

function AiConciergeBlock({ lead, isDarkMode, cn: cls, aiConsoleUrl }: {
  lead: Lead;
  isDarkMode: boolean;
  cn: (...inputs: ClassValue[]) => string;
  aiConsoleUrl?: string;
}) {
  const [transcriptOpen, setTranscriptOpen] = React.useState(false);

  const hasAiData = isAiSource(lead.source)
    || lead.channel || lead.aiSummary
    || lead.externalConversationId || lead.guestContact
    || lead.transcriptJson;

  if (!hasAiData) return null;

  const messages = parseTranscript(lead.transcriptJson);
  const rawTranscript = lead.transcriptJson;

  const blockClass = cls(
    'rounded-xl border p-3',
    isDarkMode
      ? 'border-violet-500/20 bg-violet-500/[0.06]'
      : 'border-violet-200 bg-violet-50'
  );
  const labelCls = cls(
    'text-[11px] font-bold uppercase tracking-wide',
    isDarkMode ? 'text-violet-300/70' : 'text-violet-600/70'
  );
  const titleCls = cls(
    'text-sm font-bold',
    isDarkMode ? 'text-violet-200' : 'text-violet-700'
  );
  const valueCls = cls(
    'text-sm',
    isDarkMode ? 'text-[#F4F1EA]' : 'text-gray-800'
  );

  return (
    <section className={blockClass}>
      <h3 className={titleCls}>ИИ-консьерж</h3>
      <div className="mt-3 grid gap-2.5">

        {lead.channel && (
          <div className="grid gap-0.5">
            <span className={labelCls}>Канал</span>
            <span className={valueCls}>{formatChannel(lead.channel)}</span>
          </div>
        )}

        {lead.guestContact && (
          <div className="grid gap-0.5">
            <span className={labelCls}>Контакт гостя</span>
            <span className={cls(valueCls, 'font-mono text-xs')}>{lead.guestContact}</span>
          </div>
        )}

        {lead.aiSummary && (
          <div className="grid gap-0.5">
            <span className={labelCls}>Резюме</span>
            <p className={cls(valueCls, 'leading-relaxed whitespace-pre-wrap')}>{lead.aiSummary}</p>
          </div>
        )}

        {lead.externalConversationId && (
          <div className="grid gap-0.5">
            <span className={labelCls}>ID диалога</span>
            <span className={cls(valueCls, 'font-mono text-xs break-all')}>{lead.externalConversationId}</span>
          </div>
        )}

        {/* Кнопка «Открыть диалог» — ведёт в web-console BM-concierge, ключей не содержит */}
        {lead.externalConversationId && aiConsoleUrl && (
          <div className="pt-0.5">
            <a
              href={aiConsoleUrl.replace(/\/$/, '')}
              target="_blank"
              rel="noopener noreferrer"
              title={`Диалог: ${lead.externalConversationId}`}
              className={cls(
                'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors',
                isDarkMode
                  ? 'border-violet-500/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20'
                  : 'border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100'
              )}
            >
              <ExternalLink size={12} />
              Открыть диалог в ИИ-консьерже
            </a>
          </div>
        )}

        {rawTranscript && (
          <div className="grid gap-1">
            <button
              type="button"
              onClick={() => setTranscriptOpen(prev => !prev)}
              className={cls(
                'flex items-center gap-1 text-left text-[11px] font-bold uppercase tracking-wide',
                isDarkMode ? 'text-violet-300/70 hover:text-violet-300' : 'text-violet-600/70 hover:text-violet-700'
              )}
            >
              <ChevronDown size={13} className={cls('transition-transform shrink-0', transcriptOpen && 'rotate-180')} />
              История переписки{messages ? ` (${messages.length} сообщ.)` : ''}
            </button>
            {transcriptOpen && (
              <div className={cls(
                'mt-1 rounded-lg border text-xs overflow-auto max-h-64',
                isDarkMode ? 'border-[#3D423E] bg-[#1A1C1B]' : 'border-gray-200 bg-white'
              )}>
                {messages ? (
                  <div className="divide-y divide-[#3D423E]/40">
                    {messages.map((msg, i) => {
                      const role = String(msg.role || msg.from || '').toLowerCase();
                      const text = String(msg.text ?? msg.content ?? msg.message ?? JSON.stringify(msg));
                      const isUser = role === 'user' || role === 'guest' || role === 'human';
                      return (
                        <div key={i} className={cls(
                          'px-3 py-2',
                          isUser
                            ? (isDarkMode ? 'bg-white/[0.04]' : 'bg-gray-50')
                            : ''
                        )}>
                          <span className={cls(
                            'font-bold mr-2',
                            isDarkMode ? (isUser ? 'text-[#B4CDD2]' : 'text-violet-300') : (isUser ? 'text-gray-600' : 'text-violet-600')
                          )}>
                            {isUser ? 'Гость:' : 'ИИ:'}
                          </span>
                          <span className={isDarkMode ? 'text-[#F4F1EA]' : 'text-gray-800'}>{text}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <pre className={cls('p-3 whitespace-pre-wrap break-words', isDarkMode ? 'text-[#B4CDD2]' : 'text-gray-700')}>
                    {rawTranscript}
                  </pre>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

// ── Форма ────────────────────────────────────────────────────────────────────

function getInitialState(lead: Lead | null): LeadFormState {
  return {
    guestName: textInputValue(lead?.guestName),
    phone: textInputValue(lead?.phone),
    email: textInputValue(lead?.email),
    desiredStartDate: textInputValue(lead?.desiredStartDate),
    desiredEndDate: textInputValue(lead?.desiredEndDate),
    desiredTime: textInputValue(lead?.desiredTime),
    guestsCount: lead?.guestsCount != null ? String(lead.guestsCount) : '',
    objectType: textInputValue(lead?.objectType),
    objectId: textInputValue(lead?.objectId),
    message: textInputValue(lead?.message),
    source: textInputValue(lead?.source) || 'local',
    status: normalizeLeadStatus(lead?.status),
    managerNote: textInputValue(lead?.managerNote),
  };
}

export default function LeadModal({
  isOpen,
  isDarkMode,
  lead,
  isSaving = false,
  onClose,
  onCreate,
  onUpdate,
  clients = [],
  onCreateClient,
  onConfirmLead,
  onCreatePrebookingFromLead,
  onOpenClient,
  onDelete,
  aiConsoleUrl,
}: LeadModalProps) {
  const [form, setForm] = useState<LeadFormState>(() => getInitialState(lead));
  const [isTechOpen, setIsTechOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setForm(getInitialState(lead));
      setIsTechOpen(false);
    }
  }, [isOpen, lead]);

  const technicalRows = useMemo(() => {
    if (!lead) return [];

    return [
      ['supabaseId', lead.supabaseId],
      ['source raw', lead.source],
      ['rawJson', lead.rawJson],
      ['utmJson', lead.utmJson],
      ['objectType', lead.objectType],
      ['objectId', lead.objectId],
      ['syncStatus', lead.syncStatus],
      ['lastError', lead.lastError],
    ]
      .map(([label, value]) => [label, formatTechnicalValue(value)] as const)
      .filter(([, value]) => value);
  }, [lead]);

  if (!isOpen) return null;

  const setField = <K extends keyof LeadFormState>(key: K, value: LeadFormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const buildPayload = (): LeadCreateInput | LeadUpdateInput => ({
    guestName: form.guestName.trim() || undefined,
    phone: form.phone.trim(),
    email: form.email.trim() || undefined,
    desiredStartDate: form.desiredStartDate || undefined,
    desiredEndDate: form.desiredEndDate || undefined,
    desiredTime: form.desiredTime || undefined,
    guestsCount: form.guestsCount ? Number(form.guestsCount) : undefined,
    objectType: form.objectType.trim() || undefined,
    objectId: form.objectId.trim() || undefined,
    message: form.message.trim() || undefined,
    source: form.source.trim() || 'local',
    status: form.status,
    managerNote: form.managerNote.trim() || undefined,
  });

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (lead) {
      await onUpdate(lead.id, buildPayload());
      return;
    }
    await onCreate(buildPayload() as LeadCreateInput);
  };

  const handleQuickStatus = async (status: LeadStatus) => {
    const next = { ...form, status };
    setForm(next);
    if (lead) {
      await onUpdate(lead.id, { status, managerNote: next.managerNote.trim() || undefined });
    }
  };

  const handleConfirmLead = async () => {
    if (!lead) return;
    const next = { ...form, status: 'confirmed' as LeadStatus };
    setForm(next);
    await onConfirmLead(lead.id);
  };

  const isClientCreateBlockedStatus = ['client_created', 'contract_created', 'rejected', 'duplicate'].includes(form.status);
  const canCreateClient = Boolean(lead && !lead.clientId && !isClientCreateBlockedStatus);
  const isPrebookingCreateBlockedStatus = ['contract_created', 'prebooking_created', 'rejected', 'duplicate'].includes(form.status);
  const canCreatePrebooking = Boolean(lead && lead.clientId && !lead.prebookingId && !lead.contractId && !isPrebookingCreateBlockedStatus);

  // Найти привязанного гостя
  const linkedClient = lead?.clientId ? clients.find(c => c.id === lead.clientId) : null;
  const linkedClientName = linkedClient
    ? linkedClient.type === 'physical'
      ? [linkedClient.lastName, linkedClient.firstName, linkedClient.middleName].filter(Boolean).join(' ').trim() || linkedClient.firstName
      : linkedClient.organizationName
    : null;

  const handleCreateClient = async () => {
    if (!lead || !canCreateClient) return;
    if (!window.confirm('Создать нового клиента из этой заявки?')) return;
    await onCreateClient(lead.id);
  };

  const handleOpenClient = () => {
    if (!lead?.clientId || !onOpenClient) return;
    onOpenClient(lead.clientId);
  };

  const handleCreatePrebooking = () => {
    onCreatePrebookingFromLead(lead!);
  };

  const inputClass = cn(
    'w-full rounded-lg border px-3 py-1.5 text-sm outline-none transition-colors',
    isDarkMode ? 'border-[#3D423E] bg-[#1A1C1B] text-[#F4F1EA] placeholder:text-[#B4CDD2]/40 focus:border-[#D98E2B]/60' : 'border-gray-200 bg-white text-gray-900 focus:border-orange-400'
  );

  const sectionClass = cn(
    'rounded-xl border p-3',
    isDarkMode ? 'border-white/10 bg-white/[0.05]' : 'border-gray-200 bg-gray-50'
  );
  const labelClass = cn('text-[11px] font-bold uppercase tracking-wide', isDarkMode ? 'text-[#B4CDD2]/80' : 'text-gray-500');
  const sectionTitleClass = cn('text-sm font-bold', isDarkMode ? 'text-[#F4F1EA]' : 'text-gray-900');
  const receivedAt = formatLeadReceivedAt(lead?.supabaseCreatedAt || lead?.createdAt);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <motion.form
        initial={{ opacity: 0, scale: 0.98, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        onSubmit={handleSubmit}
        className={cn(
          'flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border shadow-2xl',
          isDarkMode ? 'border-white/10 bg-[#111111]' : 'border-gray-200 bg-white'
        )}
      >
        <div className={cn('flex items-start justify-between gap-4 border-b px-5 py-4', isDarkMode ? 'border-[#3D423E]' : 'border-gray-100')}>
          <div className="flex min-w-0 flex-wrap items-start gap-3">
            <div className="min-w-0">
              <h2 className="text-xl font-bold">{lead ? 'Заявка' : 'Новая заявка'}</h2>
              <p className={cn("mt-1 max-w-2xl text-xs leading-5", isDarkMode ? "text-[#B4CDD2]/60" : "text-gray-500")}>
                {getLeadOriginLabel(lead)} · Источник: {formatLeadSource(form.source)} · Получена: {receivedAt}
              </p>
            </div>
            <LeadStatusBadge status={lead?.status || form.status} className="mt-0.5 shrink-0" />
          </div>
          <button type="button" onClick={onClose} className={cn("shrink-0 rounded-xl p-2 transition-colors", isDarkMode ? "text-[#B4CDD2] hover:bg-[#3D423E] hover:text-[#F4F1EA]" : "text-gray-500 hover:bg-gray-100")}>
            <X size={20} />
          </button>
        </div>

        <div className="grid gap-3 overflow-y-auto p-5">
          <section className={sectionClass}>
            <h3 className={sectionTitleClass}>Гость</h3>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <label className="space-y-1.5">
                <span className={labelClass}>Имя гостя</span>
                <input className={inputClass} value={form.guestName} onChange={event => setField('guestName', event.target.value)} />
              </label>
              <label className="space-y-1.5">
                <span className={labelClass}>Телефон</span>
                <input className={inputClass} required value={form.phone} onChange={event => setField('phone', event.target.value)} />
              </label>
              <label className="space-y-1.5">
                <span className={labelClass}>Email</span>
                <input className={inputClass} type="email" value={form.email} onChange={event => setField('email', event.target.value)} />
              </label>
            </div>
          </section>

          <section className={sectionClass}>
            <h3 className={sectionTitleClass}>Проживание</h3>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="space-y-1.5">
                <span className={labelClass}>Желаемая дата заезда</span>
                <input className={inputClass} type="date" value={form.desiredStartDate} onChange={event => setField('desiredStartDate', event.target.value)} />
              </label>
              <label className="space-y-1.5">
                <span className={labelClass}>Желаемая дата выезда</span>
                <input className={inputClass} type="date" value={form.desiredEndDate} onChange={event => setField('desiredEndDate', event.target.value)} />
              </label>
              <label className="space-y-1.5">
                <span className={labelClass}>Время</span>
                <input className={inputClass} type="time" value={form.desiredTime} onChange={event => setField('desiredTime', event.target.value)} />
              </label>
              <label className="space-y-1.5">
                <span className={labelClass}>Количество гостей</span>
                <input className={inputClass} min={1} type="number" value={form.guestsCount} onChange={event => setField('guestsCount', event.target.value)} />
              </label>
              <label className="space-y-1.5 md:col-span-2">
                <span className={labelClass}>Пожелание по номеру</span>
                <input className={inputClass} value={form.objectType} placeholder="Например: семейный номер" onChange={event => setField('objectType', event.target.value)} />
              </label>
            </div>
          </section>

          <section className={sectionClass}>
            <h3 className={sectionTitleClass}>Комментарий гостя</h3>
            <label className="mt-3 block space-y-1.5">
              <span className={labelClass}>Комментарий</span>
              <textarea className={cn(inputClass, 'min-h-[64px] resize-none')} value={form.message} onChange={event => setField('message', event.target.value)} />
            </label>
          </section>

          {lead && (
            <AiConciergeBlock lead={lead} isDarkMode={isDarkMode} cn={cn} aiConsoleUrl={aiConsoleUrl} />
          )}

          <section className={sectionClass}>
            <h3 className={sectionTitleClass}>Работа с заявкой</h3>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="space-y-1.5">
                <span className={labelClass}>Статус</span>
                <select className={inputClass} value={form.status} onChange={event => setField('status', event.target.value as LeadStatus)}>
                  {STATUS_OPTIONS.map(s => (
                    <option key={s} value={s}>{LEAD_STATUS_LABELS[s]}</option>
                  ))}
                </select>
              </label>
              <div className="flex items-end gap-2">
                <button
                  type="button"
                  disabled={isSaving || form.status === 'confirmed'}
                  onClick={handleConfirmLead}
                  className={cn("rounded-lg px-3 py-1.5 text-sm font-bold transition-colors border", isDarkMode ? "bg-emerald-400/10 border-emerald-400/25 text-emerald-300 hover:bg-emerald-400/20 disabled:opacity-50" : "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50")}
                >
                  Подтвердить
                </button>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => handleQuickStatus('rejected')}
                  className={cn("rounded-lg px-3 py-1.5 text-sm font-bold transition-colors border", isDarkMode ? "bg-[#F3B2BF]/15 border-[#F3B2BF]/30 text-[#F3B2BF] hover:bg-[#F3B2BF]/25" : "bg-red-500/10 border-red-500/20 text-red-600 hover:bg-red-500/20")}
                >
                  Отклонить
                </button>
              </div>
              {lead && (
                <div className="flex flex-wrap items-center gap-2 md:col-span-2">
                  {lead.clientId ? (
                    <>
                      <span className={cn('rounded-lg border px-3 py-1.5 text-sm font-bold', isDarkMode ? 'bg-teal-400/10 border-teal-400/20 text-teal-300' : 'bg-emerald-50 text-emerald-700')}>
                        Гость создан
                      </span>
                      {onOpenClient && (
                        <button
                          type="button"
                          onClick={handleOpenClient}
                          className={cn('rounded-lg border px-3 py-1.5 text-sm font-bold transition-colors', isDarkMode ? 'border-white/10 bg-white/5 text-gray-300 hover:bg-white/10' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50')}
                        >
                          Открыть гостя
                        </button>
                      )}
                      {linkedClientName && (
                        <span className={cn('text-xs font-medium', isDarkMode ? 'text-gray-500' : 'text-gray-400')}>
                          {linkedClientName}
                        </span>
                      )}
                    </>
                  ) : canCreateClient ? (
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={handleCreateClient}
                      className="inline-flex items-center gap-2 rounded-lg bg-[#D98E2B] px-4 py-1.5 text-sm font-bold text-[#1A1C1B] transition-colors hover:bg-[#F2B35B] disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {isSaving && <Loader2 size={15} className="animate-spin" />}
                      Создать гостя
                    </button>
                  ) : null}
                  {lead.prebookingId || lead.contractId ? (
                    <span className={cn('rounded-lg border px-3 py-1.5 text-sm font-bold', isDarkMode ? 'bg-blue-400/10 border-blue-400/20 text-blue-300' : 'bg-blue-50 text-blue-700')}>
                      Предбронь создана
                    </span>
                  ) : canCreatePrebooking ? (
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={handleCreatePrebooking}
                      className={cn('rounded-lg border px-3 py-1.5 text-sm font-bold transition-colors', isDarkMode ? 'border-[#FFE08A]/30 bg-[#FFE08A]/15 text-[#FFE08A] hover:bg-[#FFE08A]/25' : 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100')}
                    >
                      Создать предбронь
                    </button>
                  ) : lead.clientId ? null : (
                    <span className={cn('text-xs font-medium', isDarkMode ? 'text-gray-500' : 'text-gray-400')}>
                      Сначала создайте гостя
                    </span>
                  )}
                </div>
              )}
              <label className="space-y-1.5 md:col-span-2">
                <span className={labelClass}>Заметка менеджера</span>
                <textarea className={cn(inputClass, 'min-h-[64px] resize-none')} value={form.managerNote} onChange={event => setField('managerNote', event.target.value)} />
              </label>
            </div>
          </section>

          <section className={cn(sectionClass, 'py-2.5')}>
            <button
              type="button"
              onClick={() => setIsTechOpen(prev => !prev)}
              className="flex w-full items-center justify-between text-left text-sm font-bold"
            >
              <span>Технические данные</span>
              <ChevronDown size={17} className={cn('transition-transform', isTechOpen && 'rotate-180')} />
            </button>
            {isTechOpen && (
              <div className={cn('mt-3 rounded-xl border p-3 text-xs', isDarkMode ? 'border-[#3D423E] bg-[#1A1C1B] text-[#B4CDD2]' : 'border-gray-200 bg-white text-gray-700')}>
                {technicalRows.length === 0 ? (
                  <div className={isDarkMode ? "text-[#B4CDD2]/50" : "text-gray-500"}>Нет технических данных</div>
                ) : (
                  <dl className="grid gap-3">
                    {technicalRows.map(([label, value]) => (
                      <div key={label} className="grid gap-1 md:grid-cols-[140px_1fr]">
                        <dt className={cn("font-bold", isDarkMode ? "text-[#B4CDD2]/60" : "text-gray-500")}>{label}</dt>
                        <dd className="min-w-0 whitespace-pre-wrap break-words">{value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            )}
          </section>
        </div>

        <div className={cn("flex items-center justify-between border-t px-5 py-3", isDarkMode ? "border-[#3D423E]" : "border-gray-100")}>
          {lead && onDelete ? (
            <button type="button" disabled={isSaving} onClick={() => onDelete(lead.id)} className={cn('rounded-xl px-4 py-2 text-sm font-bold transition-colors', isDarkMode ? 'text-[#F3B2BF] hover:bg-[#F3B2BF]/10' : 'text-red-600 hover:bg-red-50')}>
              Удалить заявку
            </button>
          ) : <span />}
          <div className="flex items-center gap-2">
            <button type="button" disabled={isSaving} onClick={onClose} className={cn('rounded-xl px-4 py-2 text-sm font-bold transition-colors', isDarkMode ? 'bg-white/[0.05] border border-white/10 hover:border-[#B4CDD2]/50 text-[#B4CDD2] hover:text-[#F4F1EA]' : 'bg-gray-100 text-gray-700 hover:bg-gray-200')}>
              Отмена
            </button>
            <button type="submit" disabled={isSaving} className="inline-flex items-center gap-2 rounded-xl bg-[#D98E2B] px-5 py-2 text-sm font-bold text-[#1A1C1B] transition-colors hover:bg-[#F2B35B] disabled:cursor-not-allowed disabled:opacity-70">
              {isSaving && <Loader2 size={16} className="animate-spin" />}
              Сохранить
            </button>
          </div>
        </div>
      </motion.form>
    </div>
  );
}
