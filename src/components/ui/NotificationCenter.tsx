/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion } from 'framer-motion';
import { Bell, AlertTriangle, X, CheckCircle2, Clock, Trash2 } from 'lucide-react';
import { format, isToday, isTomorrow, parseISO, addHours, addDays } from 'date-fns';
import { ru } from 'date-fns/locale';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Contract, Client, TaskReminder } from '../../types';
import { isAlertSnoozed, isPaymentAlertDismissed } from '../../utils/notificationAlerts';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function formatContractAmount(value: unknown) {
  const amount = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(amount) ? amount.toLocaleString() : '0';
}

interface NotificationCenterProps {
  isDarkMode: boolean;
  contracts: Contract[];
  clients: Client[];
  tasks: TaskReminder[];
  isOpen: boolean;
  onClose: () => void;
  onUpdateContract?: (contract: Contract) => void;
  onDeleteContract?: (contractId: string) => void;
  onUpdateTask?: (task: TaskReminder) => void;
  onOpenContract?: (contractId: string) => void;
}

export default function NotificationCenter({ 
  isDarkMode, 
  contracts, 
  clients, 
  tasks,
  isOpen, 
  onClose,
  onUpdateContract,
  onDeleteContract,
  onUpdateTask,
  onOpenContract
}: NotificationCenterProps) {
  const contractAlerts = contracts.reduce((acc, contract) => {
    // 1. Pre-booking reminder
    if (contract.status === 'pre_booking' && contract.nextReminderAt) {
      if (new Date() >= new Date(contract.nextReminderAt)) {
        acc.push({
          id: contract.id,
          contractId: contract.id,
          title: 'Предбронь: Истекает время',
          message: `Предбронь №${contract.number} не переведена в статус "Оплачен".`,
          type: 'pre_booking' as const,
          date: new Date().toISOString(),
          contract
        });
        return acc; // Skip payment alert if it's a pre-booking alert
      }
    }

    // 2. Payment reminder
    if (
      contract.status !== 'paid'
      && contract.remainder > 0
      && contract.status !== 'pre_booking'
      && !isAlertSnoozed(contract)
      && !isPaymentAlertDismissed(contract)
    ) {
      const hasUpcomingBooking = contract.bookings.some(booking => {
        const startDate = parseISO(booking.startTime);
        return isToday(startDate) || isTomorrow(startDate);
      });

      if (hasUpcomingBooking) {
        const client = clients.find(c => c.id === contract.clientId);
        const clientName = client ? (client.type === 'physical' ? `${client.lastName} ${client.firstName}` : client.organizationName) : 'Неизвестный клиент';
        
        acc.push({
          id: contract.id,
          contractId: contract.id,
          title: 'Оплата',
          message: `Договор №${contract.number} (${clientName}). Остаток: ${formatContractAmount(contract.remainder)} ₽. Заезд скоро!`,
          type: 'payment' as const,
          date: new Date().toISOString(),
          contract
        });
      }
    }

    return acc;
  }, [] as Array<{
    id: string;
    contractId: string;
    title: string;
    message: string;
    type: 'payment' | 'pre_booking';
    date: string;
    contract: Contract;
  }>);

  const taskAlerts = tasks
    .filter(task => !task.isArchived && task.hasReminder !== false && !task.isDone && new Date(task.remindAt) <= new Date())
    .map(task => ({
      id: `task-${task.id}`,
      title: 'Задача: напоминание',
      message: task.description ? `${task.title}. ${task.description}` : task.title,
      type: 'task' as const,
      date: task.remindAt,
      task,
    }));

  const alerts = [...contractAlerts, ...taskAlerts].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  const handleSnooze = (contract: Contract, hours: number) => {
    if (onUpdateContract) {
      onUpdateContract({
        ...contract,
        nextReminderAt: addHours(new Date(), hours).toISOString()
      });
    }
  };

  const handleDelete = (contractId: string) => {
    if (onDeleteContract) {
      onDeleteContract(contractId);
    }
  };

  const getContractClientName = (contract: Contract) => {
    const client = clients.find(c => c.id === contract.clientId);
    if (!client) return 'Неизвестный клиент';
    return client.type === 'physical'
      ? `${client.lastName} ${client.firstName}`.trim()
      : client.organizationName;
  };

  const handleOpenContract = (contractId: string) => {
    onOpenContract?.(contractId);
    onClose();
  };

  const handleDismissPaymentAlert = (contract: Contract) => {
    onUpdateContract?.({
      ...contract,
      dismissedPaymentAlertAt: new Date().toISOString(),
      dismissedPaymentAlertRemainder: contract.remainder,
    });
  };

  const handleTaskComplete = (task: TaskReminder) => {
    onUpdateTask?.({
      ...task,
      isDone: true,
      completedAt: new Date().toISOString(),
    });
  };

  const handleTaskSnooze = (task: TaskReminder, date: Date) => {
    onUpdateTask?.({
      ...task,
      remindAt: date.toISOString(),
      hasReminder: true,
      isDone: false,
      completedAt: undefined,
    });
  };

  if (!isOpen) return null;

  return (
    <div className={cn(
      "absolute top-full right-0 mt-4 w-96 rounded-3xl border shadow-2xl z-[200] overflow-hidden animate-in slide-in-from-top-2 duration-200",
      isDarkMode ? "bg-[#111111] border-white/10" : "bg-white border-gray-200"
    )}>
      <div className="p-6 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell size={18} className="text-orange-500" />
          <h3 className="font-bold">Уведомления</h3>
          {alerts.length > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-orange-500 text-black text-[10px] font-bold">
              {alerts.length}
            </span>
          )}
        </div>
        <motion.button 
          onClick={onClose} 
          whileTap={{ scale: 0.95 }}
          className="p-2 rounded-lg hover:bg-white/5 text-gray-500"
        >
          <X size={18} />
        </motion.button>
      </div>

      <div className="max-h-[400px] overflow-y-auto p-4 space-y-3">
        {alerts.length === 0 ? (
          <div className="py-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-green-500/10 flex items-center justify-center text-green-500 mx-auto">
              <CheckCircle2 size={24} />
            </div>
            <p className="text-sm text-gray-500 font-medium">Все оплаты под контролем</p>
          </div>
        ) : (
          alerts.map(alert => (
            <div 
              key={alert.id}
              className={cn(
                "p-4 rounded-2xl border flex flex-col gap-3 transition-all hover:scale-[1.02]",
                isDarkMode ? "bg-orange-500/5 border-orange-500/10" : "bg-orange-50 border-orange-100"
              )}
            >
                <div className="flex gap-4">
                  <div className="w-10 h-10 rounded-xl bg-orange-500/20 flex shrink-0 items-center justify-center text-orange-500">
                  {alert.type === 'task' ? <Clock size={20} /> : <AlertTriangle size={20} />}
                  </div>
                <div className="space-y-1">
                  <div className="text-xs font-bold text-orange-500 uppercase tracking-wider">{alert.title}</div>
                  {alert.type === 'payment' ? (
                    <p className="text-sm font-medium leading-tight">
                      Договор{' '}
                      <button
                        type="button"
                        onClick={() => handleOpenContract(alert.contractId)}
                        className="font-bold text-orange-400 underline decoration-orange-400/40 underline-offset-2 transition-colors hover:text-orange-300"
                      >
                        №{alert.contract.number} ({getContractClientName(alert.contract)})
                      </button>
                      . Остаток: {formatContractAmount(alert.contract.remainder)} ₽. Заезд скоро!
                    </p>
                  ) : (
                    <p className="text-sm font-medium leading-tight">{alert.message}</p>
                  )}
                  <div className="text-[10px] text-gray-500 font-bold uppercase mt-2">
                    {format(new Date(alert.date), 'HH:mm, d MMMM', { locale: ru })}
                  </div>
                </div>
              </div>
              
              {alert.type === 'pre_booking' && (
                <div className="flex items-center gap-2 mt-2 pt-3 border-t border-orange-500/10">
                  <motion.button 
                    onClick={() => handleSnooze(alert.contract, 6)}
                    whileTap={{ scale: 0.95 }}
                    className={cn(
                      "flex-1 py-1.5 px-2 rounded-lg text-[10px] font-bold uppercase flex items-center justify-center gap-1 transition-colors",
                      isDarkMode ? "bg-white/5 hover:bg-white/10 text-gray-300" : "bg-orange-500/10 hover:bg-orange-500/20 text-orange-700"
                    )}
                  >
                    <Clock size={12} />
                    +6 часов
                  </motion.button>
                  <motion.button 
                    onClick={() => handleSnooze(alert.contract, 24)}
                    whileTap={{ scale: 0.95 }}
                    className={cn(
                      "flex-1 py-1.5 px-2 rounded-lg text-[10px] font-bold uppercase flex items-center justify-center gap-1 transition-colors",
                      isDarkMode ? "bg-white/5 hover:bg-white/10 text-gray-300" : "bg-orange-500/10 hover:bg-orange-500/20 text-orange-700"
                    )}
                  >
                    <Clock size={12} />
                    +24 часа
                  </motion.button>
                  <motion.button 
                    onClick={() => handleDelete(alert.contractId)}
                    whileTap={{ scale: 0.95 }}
                    className={cn(
                      "p-1.5 rounded-lg transition-colors",
                      isDarkMode ? "bg-red-500/10 hover:bg-red-500/20 text-red-400" : "bg-red-50 hover:bg-red-100 text-red-500"
                    )}
                    title="Удалить предбронь"
                  >
                    <Trash2 size={14} />
                  </motion.button>
                </div>
              )}

              {alert.type === 'payment' && (
                <div className="flex items-center gap-2 mt-2 pt-3 border-t border-orange-500/10">
                  <motion.button
                    onClick={() => handleSnooze(alert.contract, 1)}
                    whileTap={{ scale: 0.95 }}
                    className={cn(
                      "flex-1 py-1.5 px-2 rounded-lg text-[10px] font-bold uppercase flex items-center justify-center gap-1 transition-colors",
                      isDarkMode ? "bg-white/5 hover:bg-white/10 text-gray-300" : "bg-orange-500/10 hover:bg-orange-500/20 text-orange-700"
                    )}
                  >
                    <Clock size={12} />
                    +1 час
                  </motion.button>
                  <motion.button
                    onClick={() => handleSnooze(alert.contract, 24)}
                    whileTap={{ scale: 0.95 }}
                    className={cn(
                      "flex-1 py-1.5 px-2 rounded-lg text-[10px] font-bold uppercase flex items-center justify-center gap-1 transition-colors",
                      isDarkMode ? "bg-white/5 hover:bg-white/10 text-gray-300" : "bg-orange-500/10 hover:bg-orange-500/20 text-orange-700"
                    )}
                  >
                    <Clock size={12} />
                    Завтра
                  </motion.button>
                  <motion.button
                    onClick={() => handleDismissPaymentAlert(alert.contract)}
                    whileTap={{ scale: 0.95 }}
                    className={cn(
                      "flex-1 py-1.5 px-2 rounded-lg text-[10px] font-bold uppercase flex items-center justify-center gap-1 transition-colors",
                      isDarkMode ? "bg-red-500/10 hover:bg-red-500/20 text-red-300" : "bg-red-50 hover:bg-red-100 text-red-700"
                    )}
                  >
                    <X size={12} />
                    Удалить
                  </motion.button>
                </div>
              )}

              {alert.type === 'task' && (
                <div className="flex items-center gap-2 mt-2 pt-3 border-t border-orange-500/10">
                  <motion.button 
                    onClick={() => handleTaskComplete(alert.task)}
                    whileTap={{ scale: 0.95 }}
                    className={cn(
                      "flex-1 py-1.5 px-2 rounded-lg text-[10px] font-bold uppercase flex items-center justify-center gap-1 transition-colors",
                      isDarkMode ? "bg-green-500/10 hover:bg-green-500/20 text-green-300" : "bg-green-50 hover:bg-green-100 text-green-700"
                    )}
                  >
                    <CheckCircle2 size={12} />
                    Выполнено
                  </motion.button>
                  <motion.button 
                    onClick={() => handleTaskSnooze(alert.task, addHours(new Date(), 1))}
                    whileTap={{ scale: 0.95 }}
                    className={cn(
                      "flex-1 py-1.5 px-2 rounded-lg text-[10px] font-bold uppercase flex items-center justify-center gap-1 transition-colors",
                      isDarkMode ? "bg-white/5 hover:bg-white/10 text-gray-300" : "bg-orange-500/10 hover:bg-orange-500/20 text-orange-700"
                    )}
                  >
                    <Clock size={12} />
                    +1 час
                  </motion.button>
                  <motion.button 
                    onClick={() => handleTaskSnooze(alert.task, addDays(new Date(), 1))}
                    whileTap={{ scale: 0.95 }}
                    className={cn(
                      "flex-1 py-1.5 px-2 rounded-lg text-[10px] font-bold uppercase flex items-center justify-center gap-1 transition-colors",
                      isDarkMode ? "bg-white/5 hover:bg-white/10 text-gray-300" : "bg-orange-500/10 hover:bg-orange-500/20 text-orange-700"
                    )}
                  >
                    <Clock size={12} />
                    Завтра
                  </motion.button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {alerts.length > 0 && (
        <div className="p-4 border-t border-white/5">
          <motion.button 
            whileTap={{ scale: 0.95 }}
            className="w-full py-3 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold uppercase tracking-widest transition-all"
          >
            Показать все
          </motion.button>
        </div>
      )}
    </div>
  );
}
