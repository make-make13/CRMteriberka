/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Search, Filter, MoreVertical, Ban, User, Building2, ChevronLeft, ChevronRight, Users, Trash2 } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Client, ClientType } from '../../types';
import ClientModal from './ClientModal';
import { clientApi } from '../../services/localApi';
import { getErrorMessage } from '../../utils/errors';
import { clientMatchesSearch } from '../../utils/listFilters';
import ConfirmDialog from '../common/ConfirmDialog';
import EmptyState from '../common/EmptyState';
import { useToast } from '../../context/ToastContext';
import { clampPage, getPageCount, getPageItems } from '../../utils/pagination';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const CLIENTS_PAGE_SIZE = 100;

interface ClientsProps {
  isDarkMode: boolean;
  clients: Client[];
  setClients: React.Dispatch<React.SetStateAction<Client[]>>;
  canDeleteClients?: boolean;
}

export default function Clients({ isDarkMode, clients, setClients, canDeleteClients = false }: ClientsProps) {
  const { toast } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [modalMode, setModalMode] = useState<'create' | 'edit' | 'view'>('create');
  const [filter, setFilter] = useState<'all' | 'physical' | 'legal' | 'blacklist'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [clientPendingDelete, setClientPendingDelete] = useState<Client | null>(null);
  const [isDeletingClient, setIsDeletingClient] = useState(false);

  const clientFilterItems: Array<{ id: typeof filter; label: string; icon?: typeof Ban }> = [
    { id: 'all', label: 'Все' },
    { id: 'physical', label: 'Физлица' },
    { id: 'legal', label: 'Юрлица' },
    { id: 'blacklist', label: 'Черный список', icon: Ban },
  ];

  const filteredClients = useMemo(() => clients.filter(client => {
    const matchesFilter =
      filter === 'all' ||
      (filter === 'physical' && client.type === 'physical') ||
      (filter === 'legal' && client.type === 'legal') ||
      (filter === 'blacklist' && client.isBlacklisted);

    return matchesFilter && clientMatchesSearch(client, searchQuery);
  }), [clients, filter, searchQuery]);

  const pageCount = getPageCount(filteredClients.length, CLIENTS_PAGE_SIZE);
  const safeCurrentPage = clampPage(currentPage, pageCount);
  const visibleClients = useMemo(
    () => getPageItems(filteredClients, safeCurrentPage, CLIENTS_PAGE_SIZE),
    [filteredClients, safeCurrentPage],
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [filter, searchQuery]);

  useEffect(() => {
    setCurrentPage(page => clampPage(page, pageCount));
  }, [pageCount]);

  const handleAddClient = () => {
    setEditingClient(null);
    setModalMode('create');
    setIsModalOpen(true);
  };

  const handleEditClient = (client: Client) => {
    setEditingClient(client);
    setModalMode('edit');
    setIsModalOpen(true);
  };

  const handleViewClient = (client: Client) => {
    setEditingClient(client);
    setModalMode('view');
    setIsModalOpen(true);
  };

  const handleSaveClient = async (client: Client) => {
    try {
      const saved = await clientApi.save(client);
      setClients(prev => {
        const exists = prev.some(item => item.id === saved.id);
        return exists ? prev.map(item => item.id === saved.id ? saved : item) : [saved, ...prev];
      });
      setIsModalOpen(false);
    } catch (error) {
      console.error('Error saving client:', error);
      toast(getErrorMessage(error, 'Ошибка при сохранении гостя'), 'error');
    }
  };

  const getClientDisplayName = (client: Client) => (
    client.type === 'physical'
      ? `${client.lastName} ${client.firstName}`.trim()
      : client.organizationName
  );

  const handleDeleteClient = async (client: Client) => {
    setIsDeletingClient(true);
    try {
      await clientApi.delete(client.id);
      setClients(prev => prev.filter(item => item.id !== client.id));
      setClientPendingDelete(null);
    } catch (error) {
      console.error('Error deleting client:', error);
      setClientPendingDelete(null);
      toast(getErrorMessage(error, 'Ошибка при удалении гостя'), 'error');
    } finally {
      setIsDeletingClient(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Гости</h2>
        <motion.button 
          onClick={handleAddClient}
          whileTap={{ scale: 0.95 }}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
            isDarkMode ? "bg-[#D98E2B] text-[#1A1C1B] hover:bg-[#F2B35B]" : "bg-orange-500 text-white hover:bg-orange-600"
          )}
        >
          <Plus size={18} />
          Добавить гостя
        </motion.button>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
          <input 
            type="text" 
            placeholder="Поиск по имени, телефону, email, паспорту..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={cn(
              "w-full pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none transition-all border",
              isDarkMode ? "bg-black/30 border-white/10 text-[#F4F1EA] placeholder:text-[#B4CDD2]/45 focus:border-[#D98E2B]/60" : "bg-white border-gray-200 shadow-sm focus:border-orange-400"
            )}
          />
        </div>
        
        <div className={cn("flex items-center gap-2 p-1 rounded-xl", isDarkMode ? "bg-[#111111] border border-white/10" : "bg-black/20")}>
          {clientFilterItems.map((item) => (
            <motion.button
              key={item.id}
              onClick={() => setFilter(item.id)}
              whileTap={{ scale: 0.95 }}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                filter === item.id 
                  ? (isDarkMode ? "bg-[#D98E2B] text-[#1A1C1B]" : "bg-white text-black shadow-sm")
                  : (isDarkMode ? "text-[#B4CDD2] hover:bg-white/[0.08] hover:text-[#F4F1EA]" : "text-gray-500 hover:text-[#3D423E]")
              )}
            >
              {item.icon && <item.icon size={14} className={item.id === 'blacklist' ? 'text-[#F3B2BF]' : ''} />}
              {item.label}
            </motion.button>
          ))}
        </div>
      </div>

      <div className={cn(
        "rounded-2xl border overflow-hidden",
        isDarkMode ? "bg-[#111111] border-white/10" : "bg-white border-gray-200 shadow-sm"
      )}>
        {filteredClients.length > 0 ? (
          <table className="w-full border-collapse">
            <thead>
              <tr className={cn(
                "text-left text-[10px] uppercase tracking-wider font-bold",
                isDarkMode ? "text-[#B4CDD2]/70 bg-white/[0.05]" : "text-gray-400 bg-gray-50"
              )}>
                <th className="px-5 py-3 border-b border-white/[0.08]">Тип</th>
                <th className="px-5 py-3 border-b border-white/[0.08]">Имя / Организация</th>
                <th className="px-5 py-3 border-b border-white/[0.08]">Контакты</th>
                <th className="px-5 py-3 border-b border-white/[0.08]">Адрес</th>
                <th className="px-5 py-3 border-b border-white/[0.08] text-right">Статус</th>
                {canDeleteClients && <th className="px-5 py-3 border-b border-white/[0.08] text-right">Действия</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {visibleClients.map(client => (
                <tr
                  key={client.id}
                  onDoubleClick={() => handleViewClient(client)}
                  className={cn(
                  "group transition-colors cursor-pointer",
                  isDarkMode ? "hover:bg-white/[0.04]" : "hover:bg-gray-50",
                )}>
                  <td className="px-5 py-4">
                    {client.type === 'physical' ? (
                      <div className="w-9 h-9 rounded-xl bg-blue-500/15 flex items-center justify-center text-blue-400">
                        <User size={18} />
                      </div>
                    ) : (
                      <div className="w-9 h-9 rounded-xl bg-purple-500/15 flex items-center justify-center text-purple-400">
                        <Building2 size={18} />
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <div className={cn('font-bold text-[15px] leading-snug', isDarkMode ? 'text-[#F4F1EA]' : 'text-gray-900')}>
                      {client.type === 'physical'
                        ? `${client.lastName} ${client.firstName} ${client.middleName || ''}`
                        : client.organizationName}
                    </div>
                    <div className={cn('text-xs mt-0.5', isDarkMode ? 'text-[#6E6964]' : 'text-gray-400')}>
                        {client.type === 'physical' ? `Паспорт: ${client.passportSeries} ${client.passportNumber}` : `ИНН: ${client.inn}`}
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <div className={cn('text-sm font-semibold', isDarkMode ? 'text-[#F4F1EA]' : 'text-gray-800')}>{client.phone}</div>
                    <div className={cn('text-xs mt-0.5', isDarkMode ? 'text-[#6E6964]' : 'text-gray-400')}>{client.email || '—'}</div>
                  </td>
                  <td className="px-5 py-4">
                    <div className={cn('text-sm line-clamp-2', isDarkMode ? 'text-[#B4CDD2]/80' : 'text-gray-600')}>
                      {client.type === 'physical' ? (client.registrationAddress || '—') : (client.legalAddress || '—')}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-right">
                    {client.isBlacklisted ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-red-500/20 text-red-400 border border-red-500/30 text-[10px] font-bold uppercase">
                        <Ban size={12} />
                        Чёрный список
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-teal-400/20 text-teal-300 border border-teal-400/30 text-[10px] font-bold uppercase">
                        Активен
                      </span>
                    )}
                  </td>
                  {canDeleteClients && (
                    <td className="px-5 py-4 text-right">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setClientPendingDelete(client);
                        }}
                        className={cn(
                          "inline-flex h-9 w-9 items-center justify-center rounded-xl text-red-400 transition-all",
                          isDarkMode ? "bg-red-500/10 hover:bg-red-500/20 border border-red-500/20" : "bg-red-50 hover:bg-red-100"
                        )}
                        title="Удалить гостя"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState
            isDarkMode={isDarkMode}
            icon={<Users size={32} />}
            title={clients.length === 0 ? 'Гостей пока нет' : 'Гости не найдены'}
            description={
              clients.length === 0
                ? 'Добавьте первого гостя, чтобы создавать договоры и видеть историю бронирований.'
                : 'По текущему поиску или фильтру ничего не найдено. Попробуйте изменить запрос.'
            }
            action={clients.length === 0 ? (
              <button
                type="button"
                onClick={handleAddClient}
                className={cn(
                  "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-all",
                  isDarkMode ? "bg-[#D98E2B] text-[#1A1C1B] hover:bg-[#F2B35B]" : "bg-orange-500 text-white hover:bg-orange-600"
                )}
              >
                <Plus size={17} />
                Добавить гостя
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setFilter('all');
                }}
                className={cn(
                  "rounded-xl px-4 py-2 text-sm font-bold transition-all",
                  isDarkMode ? "bg-white/10 text-white hover:bg-white/15" : "bg-gray-100 text-gray-800 hover:bg-gray-200"
                )}
              >
                Сбросить фильтры
              </button>
            )}
          />
        )}
      </div>

      <div className={cn("flex items-center justify-between text-sm", isDarkMode ? "text-[#B4CDD2]/70" : "text-gray-500")}>
        <span>
          Страница {safeCurrentPage} из {pageCount} · показано {visibleClients.length} из {filteredClients.length}
        </span>
        <div className="flex items-center gap-2">
          <motion.button 
            whileTap={{ scale: 0.95 }}
            className={cn("px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors", isDarkMode ? "hover:bg-[#222421] text-[#B4CDD2] hover:text-[#F4F1EA]" : "hover:bg-gray-100")} 
            disabled={safeCurrentPage <= 1}
            onClick={() => setCurrentPage(page => clampPage(page - 1, pageCount))}
          >
            Назад
          </motion.button>
          <motion.button 
            whileTap={{ scale: 0.95 }}
            className={cn("px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors", isDarkMode ? "hover:bg-[#222421] text-[#B4CDD2] hover:text-[#F4F1EA]" : "hover:bg-gray-100")} 
            disabled={safeCurrentPage >= pageCount}
            onClick={() => setCurrentPage(page => clampPage(page + 1, pageCount))}
          >
            Вперёд
          </motion.button>
        </div>
      </div>

      {isModalOpen && (
        <ClientModal
          isDarkMode={isDarkMode}
          onClose={() => setIsModalOpen(false)}
          onSave={handleSaveClient}
          initialData={editingClient}
          mode={modalMode}
          setMode={setModalMode}
        />
      )}
      <ConfirmDialog
        isOpen={Boolean(clientPendingDelete)}
        isDarkMode={isDarkMode}
        title="Удалить гостя?"
        description={
          clientPendingDelete
            ? `Гость "${getClientDisplayName(clientPendingDelete)}" будет полностью удален из системы. Это действие нельзя отменить.`
            : ''
        }
        confirmLabel="Удалить гостя"
        isLoading={isDeletingClient}
        onCancel={() => {
          if (!isDeletingClient) setClientPendingDelete(null);
        }}
        onConfirm={() => {
          if (clientPendingDelete) handleDeleteClient(clientPendingDelete);
        }}
      />
    </div>
  );
}
