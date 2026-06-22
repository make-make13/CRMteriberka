import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { CalendarDays, Inbox, Loader2, Plus, RefreshCw, Search, UserRound } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { Client, Lead, LeadCreateInput, LeadStatus, LeadUpdateInput } from '../../types';
import { clientApi, integrationSettingsApi, leadApi } from '../../services/localApi';
import { getErrorMessage } from '../../utils/errors';
import { useToast } from '../../context/ToastContext';
import EmptyState from '../common/EmptyState';
import LeadModal from './LeadModal';
import LeadStatusBadge from './LeadStatusBadge';
import ClientModal from '../clients/ClientModal';
import { cleanText, formatDateValue, formatLeadSource, isAiSource } from './leadDisplay';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Заявка считается архивной, если из неё уже создан гость
// или она вручную переведена в статус "Подтверждена" (contract_created)
function isLeadArchived(lead: Lead): boolean {
  return !!lead.clientId || lead.status === 'contract_created';
}

// Фильтры статуса для активного списка (без архивных статусов)
const ACTIVE_STATUS_FILTERS: Array<{ id: LeadStatus | 'all'; label: string }> = [
  { id: 'all', label: 'Все' },
  { id: 'new', label: 'Новые' },
  { id: 'rejected', label: 'Отклонённые' },
];

interface LeadsProps {
  isDarkMode: boolean;
  clients: Client[];
  onClientSaved?: (client: Client) => void;  // create + update
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

export default function Leads({ isDarkMode, clients, onClientSaved, onCreatePrebookingFromLead, updatedLeadFromPrebooking }: LeadsProps) {
  const { toast } = useToast();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<LeadStatus | 'all'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'active' | 'archive'>('active');
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [leadOpenError, setLeadOpenError] = useState('');
  const [pendingClientEdit, setPendingClientEdit] = useState<Client | null>(null);
  const [aiConsoleUrl, setAiConsoleUrl] = useState('');

  // Загружаем URL web-console BM-concierge для кнопки «Открыть диалог» в карточке заявки.
  // Не секрет, не aiBackendKey — просто публичный URL панели.
  useEffect(() => {
    integrationSettingsApi.get()
      .then(s => setAiConsoleUrl(s.aiConsoleUrl || ''))
      .catch(() => { /* не критично — кнопка просто не покажется */ });
  }, []);

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

  // Тихий polling: обновляем список заявок раз в 60 сек, если раздел открыт.
  // Нужен для отображения заявок, добавленных автосинхронизацией в фоне.
  const silentPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    silentPollRef.current = setInterval(async () => {
      try {
        setLeads(await leadApi.list());
      } catch { /* ignore — тихий poll, ошибки не показываем */ }
    }, 60_000);
    return () => {
      if (silentPollRef.current) { clearInterval(silentPollRef.current); silentPollRef.current = null; }
    };
  }, []);

  useEffect(() => {
    if (!updatedLeadFromPrebooking) return;
    setLeads(prev => prev.map(lead => lead.id === updatedLeadFromPrebooking.id ? updatedLeadFromPrebooking : lead));
    setEditingLead(prev => prev?.id === updatedLeadFromPrebooking.id ? updatedLeadFromPrebooking : prev);
  }, [updatedLeadFromPrebooking]);

  const activeCount = useMemo(() => leads.filter(l => !isLeadArchived(l)).length, [leads]);
  const archiveCount = useMemo(() => leads.filter(l => isLeadArchived(l)).length, [leads]);

  const filteredLeads = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return leads.filter(lead => {
      // Фильтрация по вкладке (активные / архив)
      if (activeTab === 'active' && isLeadArchived(lead)) return false;
      if (activeTab === 'archive' && !isLeadArchived(lead)) return false;
      // Фильтр по статусу (только в активных)
      const matchesStatus = activeTab === 'archive'
        || statusFilter === 'all'
        || lead.status === statusFilter;
      const matchesSearch = !query
        || (lead.guestName || '').toLowerCase().includes(query)
        || (lead.phone || '').toLowerCase().includes(query)
        || (lead.email || '').toLowerCase().includes(query);
      return matchesStatus && matchesSearch;
    });
  }, [leads, searchQuery, statusFilter, activeTab]);

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
      onClientSaved?.(result.client);
      toast('Гость создан', 'success');
      // Закрываем LeadModal, затем открываем карточку гостя (без наложения модалок)
      setIsModalOpen(false);
      setPendingClientEdit(result.client);
    } catch (error) {
      console.error('Error creating client from lead:', error);
      toast(getErrorMessage(error, 'Ошибка при создании гостя'), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteLead = async (id: string) => {
    if (!window.confirm('Удалить эту заявку? Действие необратимо.')) return;
    setIsSaving(true);
    try {
      await leadApi.delete(id);
      setLeads(prev => prev.filter(l => l.id !== id));
      setIsModalOpen(false);
      setEditingLead(null);
      toast('Заявка удалена', 'success');
    } catch (error) {
      console.error('Error deleting lead:', error);
      toast(getErrorMessage(error, 'Ошибка при удалении заявки'), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenClient = async (clientId: string) => {
    // Сначала ищем в prop (быстро), если нет — грузим с сервера (fallback)
    let client = clients.find(c => c.id === clientId) ?? null;
    if (!client) {
      try {
        const all = await clientApi.list();
        client = all.find(c => c.id === clientId) ?? null;
        if (client) onClientSaved?.(client); // синхронизируем parent state
      } catch (error) {
        console.error('Error loading clients:', error);
      }
    }
    if (!client) {
      toast('Гость не найден', 'error');
      return;
    }
    // Закрываем LeadModal, затем открываем карточку гостя (без наложения модалок)
    setIsModalOpen(false);
    setPendingClientEdit(client);
  };

  const handleSaveClientFromLead = async (client: Client) => {
    try {
      const saved = await clientApi.save(client);
      onClientSaved?.(saved);
      setPendingClientEdit(null);
      toast('Гость сохранён', 'success');
    } catch (error) {
      toast(getErrorMessage(error, 'Ошибка при сохранении гостя'), 'error');
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

  const handleTabChange = (tab: 'active' | 'archive') => {
    setActiveTab(tab);
    setStatusFilter('all');
    setSearchQuery('');
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
      {/* Заголовок */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold">Заявки</h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSync}
            title="Проверить новые заявки с сайта"
            className={cn(
              'inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-colors',
              isDarkMode
                ? 'bg-[#161616] border border-[#232323] text-[#8F9894] hover:bg-[#1A1A1A] hover:text-[#F4F1EA]'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            )}
          >
            {isSyncing ? <Loader2 size={17} className="animate-spin" /> : <RefreshCw size={17} />}
            Проверить заявки
          </button>
          <motion.button
            type="button"
            onClick={openNewLead}
            whileTap={{ scale: 0.96 }}
            className={cn(
              'inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-colors',
              isDarkMode
                ? 'bg-[#F59E0B] text-[#050505] hover:bg-[#D97706]'
                : 'bg-orange-500 text-white hover:bg-orange-600'
            )}
          >
            <Plus size={18} />
            Новая заявка
          </motion.button>
        </div>
      </div>

      {/* Вкладки: Активные / Архив */}
      <div className={cn('flex items-center gap-1 rounded-xl p-1 self-start', isDarkMode ? 'bg-[#161616] border border-[#232323]' : 'bg-gray-100')}>
        {([
          { id: 'active', label: 'Активные', count: activeCount },
          { id: 'archive', label: 'Архив', count: archiveCount },
        ] as const).map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => handleTabChange(tab.id)}
            className={cn(
              'inline-flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-bold transition-colors',
              activeTab === tab.id
                ? (isDarkMode ? 'bg-[#232323] text-[#F4F1EA]' : 'bg-white text-gray-900 shadow-sm')
                : (isDarkMode ? 'text-[#8F9894] hover:text-[#F4F1EA]' : 'text-gray-500 hover:text-gray-800')
            )}
          >
            {tab.label}
            <span className={cn(
              'rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none',
              activeTab === tab.id
                ? (isDarkMode ? 'bg-[#F59E0B]/20 text-[#F59E0B]' : 'bg-orange-100 text-orange-600')
                : (isDarkMode ? 'bg-white/5 text-[#8F9894]' : 'bg-gray-200 text-gray-500')
            )}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Поиск + фильтры */}
      <div className="flex flex-col gap-3">
        <div className={cn(
          'flex items-center gap-2 rounded-xl border px-3 py-2',
          isDarkMode ? 'border-[#232323] bg-[#161616] focus-within:border-[#F59E0B]/60' : 'border-gray-200 bg-gray-50'
        )}>
          <Search size={16} className="text-[#8F9894] shrink-0" />
          <input
            value={searchQuery}
            onChange={event => setSearchQuery(event.target.value)}
            placeholder="Поиск по имени, телефону, email"
            className={cn(
              'w-full bg-transparent text-sm outline-none',
              isDarkMode ? 'text-[#F4F1EA] placeholder:text-[#8F9894]/60' : 'text-gray-800 placeholder:text-gray-400'
            )}
          />
        </div>
        {/* Фильтры статуса — только для активной вкладки */}
        {activeTab === 'active' && (
          <div className="flex flex-wrap items-center gap-2">
            {ACTIVE_STATUS_FILTERS.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => setStatusFilter(item.id)}
                className={cn(
                  'rounded-xl px-3 py-1.5 text-xs font-bold transition-colors',
                  statusFilter === item.id
                    ? (isDarkMode
                      ? 'bg-[#F59E0B] text-[#050505] shadow-[0_0_15px_rgba(245,158,11,0.3)]'
                      : 'bg-orange-500 text-white shadow-sm')
                    : (isDarkMode
                      ? 'bg-[#161616] border border-[#232323] text-[#8F9894] hover:bg-[#1A1A1A] hover:text-[#F4F1EA]'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200')
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Таблица */}
      <div className={cn(
        'overflow-hidden rounded-xl border',
        isDarkMode ? 'border-[#232323] bg-[#111111]' : 'border-gray-200 bg-white'
      )}>
        {leadOpenError && (
          <div className={cn(
            'border-b px-4 py-3 text-sm font-medium',
            isDarkMode ? 'border-[#232323] bg-red-500/10 text-red-500' : 'border-red-100 bg-red-50 text-red-700'
          )}>
            {leadOpenError}
          </div>
        )}
        {isLoading ? (
          <div className="flex min-h-[260px] items-center justify-center">
            <Loader2 className={cn('animate-spin', isDarkMode ? 'text-[#8F9894]' : 'text-gray-400')} size={28} />
          </div>
        ) : filteredLeads.length === 0 ? (
          <EmptyState
            isDarkMode={isDarkMode}
            icon={<Inbox size={32} />}
            title={activeTab === 'archive' ? 'Архив пуст' : 'Активных заявок нет'}
            description={
              activeTab === 'archive'
                ? 'Заявки с созданным гостем или подтверждённые появятся здесь.'
                : 'Новые заявки с сайта появятся здесь автоматически.'
            }
            action={activeTab === 'active' && leads.filter(l => !isLeadArchived(l)).length === 0 ? (
              <button
                type="button"
                onClick={openNewLead}
                className={cn(
                  'inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-colors',
                  isDarkMode
                    ? 'bg-[#F59E0B] text-[#050505] hover:bg-[#D97706]'
                    : 'bg-orange-500 text-white hover:bg-orange-600'
                )}
              >
                <Plus size={17} />
                Новая заявка
              </button>
            ) : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-sm">
              <thead>
                <tr className={cn(
                  'text-left text-[10px] font-bold uppercase tracking-wider',
                  isDarkMode ? 'bg-[#161616] text-[#8F9894]' : 'bg-gray-50 text-gray-400'
                )}>
                  <th className="border-b border-[#232323] px-5 py-3">Дата</th>
                  <th className="border-b border-[#232323] px-5 py-3">Гость</th>
                  <th className="border-b border-[#232323] px-5 py-3">Контакты</th>
                  <th className="border-b border-[#232323] px-5 py-3">Даты</th>
                  <th className="border-b border-[#232323] px-5 py-3">Гостей</th>
                  <th className="border-b border-[#232323] px-5 py-3">Источник</th>
                  <th className="border-b border-[#232323] px-5 py-3">Статус</th>
                  <th className="border-b border-[#232323] px-5 py-3 text-right">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#232323]">
                {filteredLeads.map(lead => (
                  <tr
                    key={lead.id}
                    className={cn(
                      'transition-colors cursor-pointer',
                      isDarkMode ? 'hover:bg-[#161616] text-[#F4F1EA]' : 'hover:bg-gray-50'
                    )}
                  >
                    <td className="px-5 py-3.5">
                      <div className={cn('text-xs leading-snug', isDarkMode ? 'text-[#8F9894]' : 'text-gray-500')}>
                        {formatDateTime(lead.createdAt)}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className={cn('font-bold text-sm leading-snug', isDarkMode ? 'text-[#F4F1EA]' : 'text-gray-900')}>
                        {cleanText(lead.guestName, 'Без имени')}
                      </div>
                      <div className={cn('mt-0.5 text-xs', isDarkMode ? 'text-[#8F9894]' : 'text-gray-400')}>
                        {cleanText(lead.objectType || lead.objectId, 'Номер не выбран')}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className={cn('font-semibold text-sm', isDarkMode ? 'text-[#F4F1EA]' : 'text-gray-800')}>
                        {cleanText(lead.phone, '—')}
                      </div>
                      <div className={cn('mt-0.5 text-xs', isDarkMode ? 'text-[#8F9894]' : 'text-gray-400')}>
                        {cleanText(lead.email, '—')}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className={cn('text-sm font-medium', isDarkMode ? 'text-[#F4F1EA]' : 'text-gray-700')}>
                        {formatDateRange(lead)}
                      </div>
                      <div className={cn('mt-0.5 text-xs', isDarkMode ? 'text-[#8F9894]' : 'text-gray-400')}>
                        {cleanText(lead.desiredTime, '')}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className={cn('text-sm font-semibold', isDarkMode ? 'text-[#F4F1EA]' : 'text-gray-700')}>
                        {lead.guestsCount ?? '—'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex flex-col gap-1">
                        <span className={cn('text-sm', isDarkMode ? 'text-[#8F9894]' : 'text-gray-600')}>
                          {formatLeadSource(lead.source)}
                        </span>
                        {isAiSource(lead.source) && (
                          <span className={cn(
                            'inline-flex w-fit items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                            isDarkMode
                              ? 'bg-violet-500/15 text-violet-300'
                              : 'bg-violet-100 text-violet-600'
                          )}>
                            ИИ
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <LeadStatusBadge status={lead.status} />
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        type="button"
                        onClick={() => openLead(lead)}
                        className={cn(
                          'rounded-xl px-4 py-2 text-xs font-bold transition-all',
                          isDarkMode
                            ? 'bg-[#161616] text-[#F4F1EA] hover:bg-[#232323]'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        )}
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
        clients={clients}
        onClose={() => setIsModalOpen(false)}
        onCreate={handleCreate}
        onUpdate={handleUpdate}
        onCreateClient={handleCreateClient}
        onCreatePrebookingFromLead={handleCreatePrebookingFromLead}
        onOpenClient={handleOpenClient}
        onDelete={handleDeleteLead}
        aiConsoleUrl={aiConsoleUrl}
      />

      {pendingClientEdit && (
        <ClientModal
          isDarkMode={isDarkMode}
          initialData={pendingClientEdit}
          mode="edit"
          onClose={() => setPendingClientEdit(null)}
          onSave={handleSaveClientFromLead}
        />
      )}
    </div>
  );
}
