import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { CalendarDays, Inbox, Loader2, Plus, RefreshCw, Search, UserRound } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { Client, Lead, LeadCreateInput, LeadStatus, LeadUpdateInput } from '../../types';
import { leadApi } from '../../services/localApi';
import { getErrorMessage } from '../../utils/errors';
import { useToast } from '../../context/ToastContext';
import EmptyState from '../common/EmptyState';
import LeadModal from './LeadModal';
import LeadStatusBadge from './LeadStatusBadge';
import { cleanText, formatDateValue, formatLeadSource } from './leadDisplay';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const STATUS_FILTERS: Array<{ id: LeadStatus | 'all'; label: string }> = [
  { id: 'all', label: 'Все' },
  { id: 'new', label: 'Новые' },
  { id: 'in_progress', label: 'В работе' },
  { id: 'client_created', label: 'Гость создан' },
  { id: 'prebooking_created', label: 'Предбронь' },
  { id: 'contract_created', label: 'Договор' },
  { id: 'rejected', label: 'Отказ' },
  { id: 'duplicate', label: 'Дубль' },
];

interface LeadsProps {
  isDarkMode: boolean;
  onClientCreated?: (client: Client) => void;
  onCreatePrebookingFromLead?: (lead: Lead) => void;
  updatedLeadFromPrebooking?: Lead | null;
}

function formatDateTime(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return 'Не указано';

  try {
    return format(parseISO(value), 'd MMM yyyy, HH:mm', { locale: ru });
  } catch {
    return value;
  }
}

function formatDateRange(lead: Lead) {
  const startDate = formatDateValue(lead.desiredStartDate, '');
  const endDate = formatDateValue(lead.desiredEndDate, '');

  if (!startDate && !endDate) return 'Не указаны';
  if (startDate && endDate) return `${startDate} - ${endDate}`;
  return startDate || endDate || 'Не указаны';
}

export default function Leads({ isDarkMode, onClientCreated, onCreatePrebookingFromLead, updatedLeadFromPrebooking }: LeadsProps) {
  const { toast } = useToast();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<LeadStatus | 'all'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [leadOpenError, setLeadOpenError] = useState('');

  const loadLeads = async () => {
    setIsLoading(true);
    try {
      setLeads(await leadApi.list());
    } catch (error) {
      console.error('Error loading leads:', error);
      toast(getErrorMessage(error, 'Ошибка при загрузке заявок'), 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadLeads();
  }, []);

  useEffect(() => {
    if (!updatedLeadFromPrebooking) return;
    setLeads(prev => prev.map(lead => lead.id === updatedLeadFromPrebooking.id ? updatedLeadFromPrebooking : lead));
    setEditingLead(prev => prev?.id === updatedLeadFromPrebooking.id ? updatedLeadFromPrebooking : prev);
  }, [updatedLeadFromPrebooking]);

  const filteredLeads = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return leads.filter(lead => {
      const matchesStatus = statusFilter === 'all' || lead.status === statusFilter;
      const matchesSearch = !query
        || (lead.guestName || '').toLowerCase().includes(query)
        || (lead.phone || '').toLowerCase().includes(query)
        || (lead.email || '').toLowerCase().includes(query);
      return matchesStatus && matchesSearch;
    });
  }, [leads, searchQuery, statusFilter]);

  const handleCreate = async (input: LeadCreateInput) => {
    setIsSaving(true);
    try {
      const saved = await leadApi.create(input);
      setLeads(prev => [saved, ...prev]);
      setIsModalOpen(false);
      toast('Заявка создана', 'success');
    } catch (error) {
      console.error('Error creating lead:', error);
      toast(getErrorMessage(error, 'Ошибка при создании заявки'), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpdate = async (id: string, patch: LeadUpdateInput) => {
    setIsSaving(true);
    try {
      const saved = await leadApi.update(id, patch);
      setLeads(prev => prev.map(lead => lead.id === saved.id ? saved : lead));
      setEditingLead(saved);
      setIsModalOpen(false);
      toast('Заявка сохранена', 'success');
    } catch (error) {
      console.error('Error updating lead:', error);
      toast(getErrorMessage(error, 'Ошибка при сохранении заявки'), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateClient = async (id: string) => {
    setIsSaving(true);
    try {
      const result = await leadApi.createClient(id);
      setLeads(prev => prev.map(lead => lead.id === result.lead.id ? result.lead : lead));
      setEditingLead(result.lead);
      onClientCreated?.(result.client);
      toast('Гость создан', 'success');
    } catch (error) {
      console.error('Error creating client from lead:', error);
      toast(getErrorMessage(error, 'Ошибка при создании гостя'), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreatePrebookingFromLead = (lead: Lead) => {
    setIsModalOpen(false);
    setEditingLead(null);
    onCreatePrebookingFromLead?.(lead);
  };

  const handleSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const result = await leadApi.sync();
      await loadLeads();
      toast(`Загружено новых заявок: ${result.created}`, 'success');
    } catch (error) {
      const message = getErrorMessage(error, 'Ошибка при синхронизации заявок');
      if (message.includes('Supabase не настроен')) {
        toast(`Supabase не настроен. Добавьте SUPABASE_URL и ${'SUPABASE_' + 'SERVICE_ROLE_KEY'} в .env.local`, 'error');
      } else {
        toast(message, 'error');
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const openNewLead = () => {
    setLeadOpenError('');
    setEditingLead(null);
    setIsModalOpen(true);
  };

  const openLead = (lead: Lead) => {
    try {
      setLeadOpenError('');
      setEditingLead(lead);
      setIsModalOpen(true);
    } catch (error) {
      console.error('Error opening lead:', error);
      setEditingLead(null);
      setIsModalOpen(false);
      setLeadOpenError(getErrorMessage(error, 'Не удалось открыть заявку. Список заявок продолжает работать.'));
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">Заявки</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSync}
            title="Проверить новые заявки с сайта"
            className={cn(
              'inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-colors',
              isDarkMode ? 'bg-white/[0.05] border border-white/10 hover:border-[#B4CDD2]/50 text-[#B4CDD2] hover:text-[#F4F1EA]' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            )}
          >
            {isSyncing ? <Loader2 size={17} className="animate-spin" /> : <RefreshCw size={17} />}
            Проверить заявки
          </button>
          <motion.button
            type="button"
            onClick={openNewLead}
            whileTap={{ scale: 0.96 }}
            className="inline-flex items-center gap-2 rounded-xl bg-[#D98E2B] px-4 py-2 text-sm font-bold text-[#1A1C1B] transition-colors hover:bg-[#F2B35B]"
          >
            <Plus size={18} />
            Новая заявка
          </motion.button>
        </div>
      </div>

      <div className={cn('rounded-2xl border p-4', isDarkMode ? 'border-white/10 bg-[#111111]' : 'border-gray-200 bg-white')}>
        <div className="flex flex-wrap items-center gap-3">
          <div className={cn(
            'flex min-w-[260px] flex-1 items-center gap-2 rounded-xl border px-3 py-2',
            isDarkMode ? 'border-white/10 bg-black/30 focus-within:border-[#D98E2B]/60' : 'border-gray-200 bg-gray-50'
          )}>
            <Search size={18} className="text-gray-500" />
            <input
              value={searchQuery}
              onChange={event => setSearchQuery(event.target.value)}
              placeholder="Поиск по имени, телефону, email"
              className="w-full bg-transparent text-sm outline-none text-[#F4F1EA] placeholder:text-[#B4CDD2]/45"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {STATUS_FILTERS.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => setStatusFilter(item.id)}
                className={cn(
                  'rounded-xl px-3 py-2 text-xs font-bold transition-colors',
                  statusFilter === item.id
                    ? 'bg-[#D98E2B] text-[#1A1C1B]'
                    : (isDarkMode ? 'bg-white/[0.05] text-[#B4CDD2] hover:bg-white/[0.08] hover:text-[#F4F1EA] border border-white/10' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={cn('overflow-hidden rounded-2xl border', isDarkMode ? 'border-white/10 bg-[#111111]' : 'border-gray-200 bg-white')}>
        {leadOpenError && (
          <div className={cn('border-b px-4 py-3 text-sm font-medium', isDarkMode ? 'border-[#3D423E] bg-red-500/10 text-red-200' : 'border-red-100 bg-red-50 text-red-700')}>
            {leadOpenError}
          </div>
        )}
        {isLoading ? (
          <div className="flex min-h-[260px] items-center justify-center">
            <Loader2 className="animate-spin text-[#8CAFBE]" size={28} />
          </div>
        ) : filteredLeads.length === 0 ? (
          <EmptyState
            isDarkMode={isDarkMode}
            icon={<Inbox size={32} />}
            title="Заявок пока нет"
            description="Заявок пока нет. Позже здесь будут отображаться обращения с сайта."
            action={leads.length === 0 ? (
              <button type="button" onClick={openNewLead} className="inline-flex items-center gap-2 rounded-xl bg-[#D98E2B] px-4 py-2 text-sm font-bold text-[#1A1C1B]">
                <Plus size={17} />
                Новая заявка
              </button>
            ) : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-sm">
              <thead>
                <tr className={cn('text-left text-[10px] font-bold uppercase tracking-wider', isDarkMode ? 'bg-white/[0.05] text-[#B4CDD2]/70' : 'bg-gray-50 text-gray-400')}>
                  <th className="border-b border-white/[0.08] px-5 py-3">Дата</th>
                  <th className="border-b border-white/[0.08] px-5 py-3">Гость</th>
                  <th className="border-b border-white/[0.08] px-5 py-3">Контакты</th>
                  <th className="border-b border-white/[0.08] px-5 py-3">Даты</th>
                  <th className="border-b border-white/[0.08] px-5 py-3">Гостей</th>
                  <th className="border-b border-white/[0.08] px-5 py-3">Источник</th>
                  <th className="border-b border-white/[0.08] px-5 py-3">Статус</th>
                  <th className="border-b border-white/[0.08] px-5 py-3 text-right">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {filteredLeads.map(lead => (
                  <tr key={lead.id} className={cn('transition-colors', isDarkMode ? 'hover:bg-white/[0.04] text-[#F4F1EA]' : 'hover:bg-gray-50')}>
                    <td className="px-5 py-4">
                      <div className={cn('text-xs leading-snug', isDarkMode ? 'text-[#B4CDD2]/60' : 'text-gray-500')}>
                        {formatDateTime(lead.createdAt)}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className={cn('font-bold text-[15px] leading-snug', isDarkMode ? 'text-[#F4F1EA]' : 'text-gray-900')}>
                        {cleanText(lead.guestName, 'Без имени')}
                      </div>
                      <div className={cn('mt-0.5 text-xs', isDarkMode ? 'text-[#6E6964]' : 'text-gray-400')}>
                        {cleanText(lead.objectType || lead.objectId, 'Номер не выбран')}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className={cn('font-semibold text-sm', isDarkMode ? 'text-[#F4F1EA]' : 'text-gray-800')}>
                        {cleanText(lead.phone, '—')}
                      </div>
                      <div className={cn('mt-0.5 text-xs', isDarkMode ? 'text-[#6E6964]' : 'text-gray-400')}>
                        {cleanText(lead.email, '—')}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className={cn('text-sm font-medium', isDarkMode ? 'text-[#B4CDD2]' : 'text-gray-700')}>
                        {formatDateRange(lead)}
                      </div>
                      <div className={cn('mt-0.5 text-xs', isDarkMode ? 'text-[#6E6964]' : 'text-gray-400')}>
                        {cleanText(lead.desiredTime, '')}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className={cn('text-sm font-semibold', isDarkMode ? 'text-[#B4CDD2]' : 'text-gray-700')}>
                        {lead.guestsCount ?? '—'}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span className={cn('text-sm', isDarkMode ? 'text-[#B4CDD2]/80' : 'text-gray-600')}>
                        {formatLeadSource(lead.source)}
                      </span>
                    </td>
                    <td className="px-5 py-4"><LeadStatusBadge status={lead.status} /></td>
                    <td className="px-5 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => openLead(lead)}
                        className={cn('rounded-xl px-4 py-2 text-xs font-bold transition-all', isDarkMode ? 'bg-white/[0.07] border border-white/15 hover:bg-white/[0.12] hover:border-white/25 text-[#B4CDD2] hover:text-[#F4F1EA]' : 'bg-gray-100 text-gray-700 hover:bg-gray-200')}
                      >
                        Открыть
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <LeadModal
        isOpen={isModalOpen}
        isDarkMode={isDarkMode}
        lead={editingLead}
        isSaving={isSaving}
        onClose={() => setIsModalOpen(false)}
        onCreate={handleCreate}
        onUpdate={handleUpdate}
        onCreateClient={handleCreateClient}
        onCreatePrebookingFromLead={handleCreatePrebookingFromLead}
      />
    </div>
  );
}
