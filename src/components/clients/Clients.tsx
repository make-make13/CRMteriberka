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
    <div className="flex flex-col gap-3">
      {/* Заголовок */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight">Гости</h2>
        <motion.button
          onClick={handleAddClient}
          whileTap={{ scale: 0.95 }}
          className={cn(
            "flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all",
            isDarkMode ? "bg-[#F59E0B] text-[#050505] hover:bg-[#F97316] hover:text-white" : "bg-orange-500 text-white hover:bg-orange-600"
          )}
        >
          <Plus size={16} />
          Добавить гостя
        </motion.button>
      </div>

      {/* Поиск + фильтры */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8F9894]" size={15} />
          <input
            type="text"
            placeholder="Поиск по имени, телефону, email, паспорту..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={cn(
              "w-full pl-9 pr-4 h-9 rounded-lg text-sm outline-none transition-all border",
              isDarkMode
                ? "bg-[#161616] border-[#232323] text-[#F4F1EA] placeholder:text-[#8F9894]/60 focus:border-[#F59E0B]/60"
                : "bg-white border-gray-200 shadow-sm focus:border-orange-400"
            )}
          />
        </div>

        <div className={cn("flex items-center gap-0.5 p-0.5 rounded-lg shrink-0", isDarkMode ? "bg-[#111111]" : "bg-black/20")}>
          {clientFilterItems.map((item) => (
            <motion.button
              key={item.id}
              onClick={() => setFilter(item.id)}
              whileTap={{ scale: 0.95 }}
              className={cn(
                "flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap",
                filter === item.id
                  ? (isDarkMode ? "bg-[#F59E0B] text-[#050505]" : "bg-white text-black shadow-sm")
                  : (isDarkMode ? "text-[#8F9894] hover:bg-[#161616] hover:text-[#F4F1EA]" : "text-gray-500 hover:text-[#3D423E]")
              )}
            >
              {item.icon && <item.icon size={12} className={item.id === 'blacklist' && filter !== item.id ? 'text-[#F3B2BF]' : ''} />}
              {item.label}
            </motion.button>
          ))}
        </div>
      </div>

      {/* Таблица */}
      <div className={cn(
        "rounded-xl border overflow-hidden",
        isDarkMode ? "bg-[#111111] border-[#232323]" : "bg-white border-gray-200 shadow-sm"
      )}>
        {filteredClients.length > 0 ? (
          <table className="w-full border-collapse">
            <thead>
              <tr className={cn(
                "text-left text-[10px] uppercase tracking-widest font-bold",
                isDarkMode ? "text-[#8F9894] bg-[#161616]" : "text-gray-400 bg-gray-50"
              )}>
                <th className="px-4 py-2.5 border-b border-[#232323] w-14">Тип</th>
                <th className="px-4 py-2.5 border-b border-[#232323]">Имя / Организация</th>
                <th className="px-4 py-2.5 border-b border-[#232323]">Контакты</th>
                <th className="px-4 py-2.5 border-b border-[#232323]">Адрес</th>
                <th className="px-4 py-2.5 border-b border-[#232323] text-right">Статус</th>
                {canDeleteClients && <th className="px-4 py-2.5 border-b border-[#232323] text-right w-16">Действия</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#232323]">
              {visibleClients.map(client => (
                <tr
                  key={client.id}
                  onDoubleClick={() => handleViewClient(client)}
                  className={cn(
                    "group transition-colors cursor-pointer",
                    isDarkMode ? "hover:bg-[#161616]" : "hover:bg-gray-50",
                  )}
                >
                  {/* Тип */}
                  <td className="px-4 py-2.5">
                    {client.type === 'physical' ? (
                      <div className="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center text-blue-400">
                        <User size={15} />
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-lg bg-purple-500/15 flex items-center justify-center text-purple-400">
                        <Building2 size={15} />
                      </div>
                    )}
                  </td>
                  {/* Имя */}
                  <td className="px-4 py-2.5">
                    <div className={cn('font-semibold text-sm leading-snug', isDarkMode ? 'text-[#F4F1EA]' : 'text-gray-900')}>
                      {client.type === 'physical'
                        ? `${client.lastName} ${client.firstName} ${client.middleName || ''}`.trim()
                        : client.organizationName}
                    </div>
                    <div className={cn('text-xs mt-0.5', isDarkMode ? 'text-[#8F9894]' : 'text-gray-400')}>
                      {client.type === 'physical'
                        ? `Паспорт: ${client.passportSeries} ${client.passportNumber}`
                        : `ИНН: ${client.inn}`}
                    </div>
                  </td>
                  {/* Контакты */}
                  <td className="px-4 py-2.5">
                    <div className={cn('text-sm font-medium', isDarkMode ? 'text-[#F4F1EA]' : 'text-gray-800')}>{client.phone}</div>
                    <div className={cn('text-xs mt-0.5', isDarkMode ? 'text-[#8F9894]' : 'text-gray-400')}>{client.email || '—'}</div>
                  </td>
                  {/* Адрес */}
                  <td className="px-4 py-2.5">
                    <div className={cn('text-sm line-clamp-1', isDarkMode ? 'text-[#8F9894]' : 'text-gray-600')}>
                      {client.type === 'physical' ? (client.registrationAddress || '—') : (client.legalAddress || '—')}
                    </div>
                  </td>
                  {/* Статус */}
                  <td className="px-4 py-2.5 text-right">
                    {client.isBlacklisted ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-red-500/15 text-red-400 border border-red-500/25 text-[10px] font-bold uppercase tracking-wide">
                        <Ban size={10} />
                        Чёрный список
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-1 rounded-md bg-teal-400/15 text-teal-300 border border-teal-400/25 text-[10px] font-bold uppercase tracking-wide">
                        Активен
                      </span>
                    )}
                  </td>
                  {/* Действия */}
                  {canDeleteClients && (
                    <td className="px-4 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setClientPendingDelete(client);
                        }}
                        className={cn(
                          "inline-flex h-7 w-7 items-center justify-center rounded-lg text-red-400 transition-all opacity-0 group-hover:opacity-100",
                          isDarkMode ? "bg-red-500/10 hover:bg-red-500/20 border border-red-500/20" : "bg-red-50 hover:bg-red-100"
                        )}
                        title="Удалить гостя"
                      >
                        <Trash2 size={13} />
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
            icon={<Users size={28} />}
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
                  "inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition-all",
                  isDarkMode ? "bg-[#F59E0B] text-[#050505] hover:bg-[#F97316] hover:text-white" : "bg-orange-500 text-white hover:bg-orange-600"
                )}
              >
                <Plus size={15} />
                Добавить гостя
              </button>
            ) : (
              <button
                type="button"
                onClick={() => { setSearchQuery(''); setFilter('all'); }}
                className={cn(
                  "rounded-lg px-4 py-2 text-sm font-semibold transition-all",
                  isDarkMode ? "bg-[#161616] text-[#F4F1EA] hover:bg-[#232323]" : "bg-gray-100 text-gray-800 hover:bg-gray-200"
                )}
              >
                Сбросить фильтры
              </button>
            )}
          />
        )}
      </div>

      {/* Пагинация */}
      <div className={cn("flex items-center justify-between text-xs", isDarkMode ? "text-[#8F9894]" : "text-gray-500")}>
        <span>Страница {safeCurrentPage} из {pageCount} · показано {visibleClients.length} из {filteredClients.length}</span>
        <div className="flex items-center gap-1">
          <motion.button
            whileTap={{ scale: 0.95 }}
            className={cn("px-3 py-1.5 rounded-md disabled:opacity-40 transition-colors text-xs", isDarkMode ? "hover:bg-[#1A1A1A] text-[#8F9894] hover:text-[#F4F1EA]" : "hover:bg-gray-100")}
            disabled={safeCurrentPage <= 1}
            onClick={() => setCurrentPage(page => clampPage(page - 1, pageCount))}
          >
            Назад
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.95 }}
            className={cn("px-3 py-1.5 rounded-md disabled:opacity-40 transition-colors text-xs", isDarkMode ? "hover:bg-[#1A1A1A] text-[#8F9894] hover:text-[#F4F1EA]" : "hover:bg-gray-100")}
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
