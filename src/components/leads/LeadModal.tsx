import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Loader2, X } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { Lead, LeadCreateInput, LeadStatus, LeadUpdateInput } from '../../types';
import LeadStatusBadge, { LEAD_STATUS_LABELS } from './LeadStatusBadge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const STATUS_OPTIONS: LeadStatus[] = [
  'new',
  'in_progress',
  'client_created',
  'prebooking_created',
  'contract_created',
  'rejected',
  'duplicate',
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
}

function getInitialState(lead: Lead | null): LeadFormState {
  return {
    guestName: lead?.guestName || '',
    phone: lead?.phone || '',
    email: lead?.email || '',
    desiredStartDate: lead?.desiredStartDate || '',
    desiredEndDate: lead?.desiredEndDate || '',
    desiredTime: lead?.desiredTime || '',
    guestsCount: lead?.guestsCount ? String(lead.guestsCount) : '',
    objectType: lead?.objectType || '',
    objectId: lead?.objectId || '',
    message: lead?.message || '',
    source: lead?.source || 'Локально',
    status: lead?.status || 'new',
    managerNote: lead?.managerNote || '',
  };
}

export default function LeadModal({ isOpen, isDarkMode, lead, isSaving = false, onClose, onCreate, onUpdate }: LeadModalProps) {
  const [form, setForm] = useState<LeadFormState>(() => getInitialState(lead));

  useEffect(() => {
    if (isOpen) setForm(getInitialState(lead));
  }, [isOpen, lead]);

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
    source: form.source.trim() || 'Локально',
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

  const inputClass = cn(
    'w-full rounded-xl border px-3 py-2 text-sm outline-none transition-colors',
    isDarkMode ? 'border-white/10 bg-white/5 text-white placeholder:text-gray-600 focus:border-orange-500/60' : 'border-gray-200 bg-white text-gray-900 focus:border-orange-400'
  );

  const labelClass = 'text-[11px] font-bold uppercase tracking-wide text-gray-500';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <motion.form
        initial={{ opacity: 0, scale: 0.98, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        onSubmit={handleSubmit}
        className={cn(
          'flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border shadow-2xl',
          isDarkMode ? 'border-white/10 bg-[#111]' : 'border-gray-200 bg-white'
        )}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-5">
          <div className="flex items-center gap-3">
            <div>
              <h2 className="text-xl font-bold">{lead ? 'Заявка' : 'Новая заявка'}</h2>
              <p className="mt-1 text-xs text-gray-500">Локальная заявка без синхронизации</p>
            </div>
            <LeadStatusBadge status={form.status} />
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-gray-500 transition-colors hover:bg-white/10 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="grid gap-5 overflow-y-auto p-6 md:grid-cols-2">
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
          <label className="space-y-1.5">
            <span className={labelClass}>Источник</span>
            <input className={inputClass} value={form.source} onChange={event => setField('source', event.target.value)} />
          </label>
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
          <label className="space-y-1.5">
            <span className={labelClass}>Номер / тип номера</span>
            <input className={inputClass} value={form.objectType} placeholder="Например: семейный номер" onChange={event => setField('objectType', event.target.value)} />
          </label>
          <label className="space-y-1.5">
            <span className={labelClass}>Внутренний номер объекта</span>
            <input className={inputClass} value={form.objectId} placeholder="Например: cc-1" onChange={event => setField('objectId', event.target.value)} />
          </label>
          <label className="space-y-1.5 md:col-span-2">
            <span className={labelClass}>Статус</span>
            <select className={inputClass} value={form.status} onChange={event => setField('status', event.target.value as LeadStatus)}>
              {STATUS_OPTIONS.map(status => (
                <option key={status} value={status}>{LEAD_STATUS_LABELS[status]}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5 md:col-span-2">
            <span className={labelClass}>Комментарий гостя</span>
            <textarea className={cn(inputClass, 'min-h-[90px] resize-none')} value={form.message} onChange={event => setField('message', event.target.value)} />
          </label>
          <label className="space-y-1.5 md:col-span-2">
            <span className={labelClass}>Заметка менеджера</span>
            <textarea className={cn(inputClass, 'min-h-[90px] resize-none')} value={form.managerNote} onChange={event => setField('managerNote', event.target.value)} />
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-6 py-4">
          <div className="flex items-center gap-2">
            <button type="button" disabled={isSaving} onClick={() => handleQuickStatus('in_progress')} className={cn('rounded-xl px-4 py-2 text-sm font-bold transition-colors', isDarkMode ? 'bg-white/5 text-gray-200 hover:bg-white/10' : 'bg-gray-100 text-gray-700 hover:bg-gray-200')}>
              В работу
            </button>
            <button type="button" disabled={isSaving} onClick={() => handleQuickStatus('rejected')} className="rounded-xl bg-red-500/10 px-4 py-2 text-sm font-bold text-red-400 transition-colors hover:bg-red-500/20">
              Отклонить
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" disabled={isSaving} onClick={onClose} className={cn('rounded-xl px-4 py-2 text-sm font-bold transition-colors', isDarkMode ? 'bg-white/5 text-gray-300 hover:bg-white/10' : 'bg-gray-100 text-gray-700 hover:bg-gray-200')}>
              Отмена
            </button>
            <button type="submit" disabled={isSaving} className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-5 py-2 text-sm font-bold text-black transition-colors hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-70">
              {isSaving && <Loader2 size={16} className="animate-spin" />}
              Сохранить
            </button>
          </div>
        </div>
      </motion.form>
    </div>
  );
}
