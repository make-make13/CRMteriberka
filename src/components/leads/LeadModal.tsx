import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, Loader2, X } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { Client, Lead, LeadCreateInput, LeadStatus, LeadUpdateInput } from '../../types';
import LeadStatusBadge, { LEAD_STATUS_LABELS } from './LeadStatusBadge';
import { formatLeadSource, getLeadOriginLabel, normalizeLeadStatus } from './leadDisplay';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const STATUS_OPTIONS: LeadStatus[] = [
  'new',
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
  onCreatePrebookingFromLead: (lead: Lead) => void;
  onOpenClient?: (clientId: string) => void;
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
  onCreatePrebookingFromLead,
  onOpenClient,
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

  const isClientCreateBlockedStatus = ['client_created', 'contract_created', 'rejected', 'duplicate'].includes(form.status);
  const canCreateClient = Boolean(lead && !lead.clientId && !isClientCreateBlockedStatus);

  // Найти привязанного гостя
  const linkedClient = lead?.clientId ? clients.find(c => c.id === lead.clientId) : null;
  const linkedClientName = linkedClient
    ? linkedClient.type === 'physical'
      ? [linkedClient.lastName, linkedClient.firstName, linkedClient.middleName].filter(Boolean).join(' ').trim() || linkedClient.firstName
      : linkedClient.organizationName
    : null;

  const handleCreateClient = async () => {
    if (!lead || !canCreateClient) return;
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

        <div className={cn("flex justify-end border-t px-5 py-3", isDarkMode ? "border-[#3D423E]" : "border-gray-100")}>
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
