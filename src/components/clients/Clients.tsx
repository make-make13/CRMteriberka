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
              isDarkMode ? "bg-[#222421] border-[#3D423E] text-[#F4F1EA] placeholder:text-[#B4CDD2]/45 focus:border-[#D98E2B]/60" : "bg-white border-gray-200 shadow-sm focus:border-orange-400"
            )}
          />
        </div>
        
        <div className={cn("flex items-center gap-2 p-1 rounded-xl", isDarkMode ? "bg-[#222421] border border-[#3D423E]" : "bg-black/20")}>
          {clientFilterItems.map((item) => (
            <motion.button
              key={item.id}
              onClick={() => setFilter(item.id)}
              whileTap={{ scale: 0.95 }}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                filter === item.id 
                  ? (isDarkMode ? "bg-[#D98E2B] text-[#1A1C1B]" : "bg-white text-black shadow-sm")
                  : (isDarkMode ? "text-[#B4CDD2] hover:bg-[#292B28] hover:text-[#F4F1EA]" : "text-gray-500 hover:text-[#3D423E]")
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
        isDarkMode ? "bg-[#292B28] border-[#3D423E]" : "bg-white border-gray-200 shadow-sm"
      )}>
        {filteredClients.length > 0 ? (
          <table className="w-full border-collapse">
            <thead>
              <tr className={cn(
                "text-left text-[10px] uppercase tracking-wider font-bold",
                isDarkMode ? "text-[#B4CDD2] bg-[#222421]" : "text-gray-400 bg-gray-50"
              )}>
                <th className="p-4 border-b border-[#3D423E]">Тип</th>
                <th className="p-4 border-b border-[#3D423E]">Имя / Организация</th>
                <th className="p-4 border-b border-[#3D423E]">Контакты</th>
                <th className="p-4 border-b border-[#3D423E]">Адрес</th>
                <th className="p-4 border-b border-[#3D423E] text-right">Статус</th>
                {canDeleteClients && <th className="p-4 border-b border-[#3D423E] text-right">Действия</th>}
              </tr>
            </thead>
            <tbody>
              {visibleClients.map(client => (
                <tr 
                  key={client.id} 
                  onDoubleClick={() => handleViewClient(client)}
                  className={cn(
                  "group transition-colors cursor-pointer",
                  isDarkMode ? "hover:bg-white/[0.02] border-[#3D423E]" : "hover:bg-gray-50 border-gray-100",
                  "border-b last:border-0"
                )}>
                  <td className="p-4">
                    {client.type === 'physical' ? (
                      <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500">
                        <User size={18} />
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-500">
                        <Building2 size={18} />
                      </div>
                    )}
                  </td>
                  <td className="p-4">
                    <div className="font-bold">
                      {client.type === 'physical' 
                        ? `${client.lastName} ${client.firstName} ${client.middleName || ''}`
                        : client.organizationName}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                        {client.type === 'physical' ? `Паспорт: ${client.passportSeries} ${client.passportNumber}` : `ИНН: ${client.inn}`}
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="text-sm">{client.phone}</div>
                    <div className="text-xs text-gray-500">{client.email || '—'}</div>
                  </td>
                  <td className="p-4">
                    <div className="text-sm line-clamp-2 text-gray-600 dark:text-gray-400">
                      {client.type === 'physical' ? (client.registrationAddress || '—') : (client.legalAddress || '—')}
                    </div>
                  </td>
                  <td className="p-4 text-right">
                    {client.isBlacklisted ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-red-500/10 text-red-500 text-[10px] font-bold uppercase">
                        <Ban size={12} />
                        Чёрный список
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-1 rounded-md bg-green-500/10 text-green-500 text-[10px] font-bold uppercase">
                        Активен
                      </span>
                    )}
                  </td>
                  {canDeleteClients && (
                    <td className="p-4 text-right">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setClientPendingDelete(client);
                        }}
                        className={cn(
                          "inline-flex h-9 w-9 items-center justify-center rounded-xl text-red-500 transition-all",
                          isDarkMode ? "bg-red-500/10 hover:bg-red-500/20" : "bg-red-50 hover:bg-red-100"
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
