/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Grid3X3, 
  Users, 
  FileText, 
  ClipboardList,
  Inbox,
  Settings as SettingsIcon, 
  Bell, 
  Sun, 
  Moon,
  Loader2,
  LogOut,
  ShieldCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { addDays, format } from 'date-fns';

import Chessboard from './components/chessboard/Chessboard';
import LeadsView from './components/leads/Leads';
import ClientsView from './components/clients/Clients';
import ContractsView from './components/contracts/Contracts';
import AdditionalView from './components/additional/Additional';
import SettingsView from './components/settings/SettingsView';
import NotificationCenter from './components/ui/NotificationCenter';
import ContractModal from './components/contracts/ContractModal';
import PreBookingModal from './components/contracts/PreBookingModal';
import { Client, Contract, Settings, View, BaseType, TaskReminder, Lead, LeadPrebookingPrefill } from './types';
import { INITIAL_SETTINGS } from './constants';
import { Toaster } from 'react-hot-toast';
import { ToastProvider, useToast } from './context/ToastContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginModal from './components/auth/LoginModal';
import { backupApi, clientApi, contractApi, leadApi, settingsApi, taskApi } from './services/localApi';
import { getErrorMessage, getErrorConflict } from './utils/errors';
import ConfirmDialog from './components/common/ConfirmDialog';
import { getLogoutBackupDecision } from './utils/logoutBackupDecision';
import { getTasksToArchiveOnLogout } from './utils/taskArchive';
import { isAlertSnoozed, isPaymentAlertDismissed } from './utils/notificationAlerts';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const MOCK_CLIENTS: Client[] = [
  {
    id: '1',
    type: 'physical',
    firstName: 'Иван',
    lastName: 'Иванов',
    middleName: 'Иванович',
    phone: '+7 (999) 123-45-67',
    email: 'ivan@example.com',
    passportSeries: '1234',
    passportNumber: '567890',
    passportIssuedBy: 'УВД г. Москвы',
    passportIssueDate: '2010-05-15',
    registrationAddress: 'г. Москва, ул. Ленина, д. 1, кв. 10',
    birthDate: '1985-08-20',
    isBlacklisted: false,
    createdAt: new Date().toISOString()
  },
  {
    id: '2',
    type: 'legal',
    organizationName: 'ООО "Вектор"',
    inn: '7701234567',
    kpp: '770101001',
    ogrn: '1027700123456',
    legalAddress: 'г. Москва, ул. Пушкина, д. 10',
    bankName: 'ПАО Сбербанк',
    bik: '044525225',
    bankAccount: '40702810123456789012',
    contactPerson: 'Петров Петр Петрович',
    phone: '+7 (931) 802-21-51',
    email: 'info@vector.ru',
    isBlacklisted: true,
    createdAt: new Date().toISOString()
  },
  {
    id: '3',
    type: 'physical',
    firstName: 'Фёдор',
    lastName: 'Фёдоров',
    middleName: 'Фёдорович',
    phone: '+7 (999) 000-00-00',
    email: 'fedor@example.com',
    passportSeries: '1234',
    passportNumber: '567890',
    passportIssuedBy: 'УВД г. Москвы',
    passportIssueDate: '2010-05-15',
    registrationAddress: 'г. Москва, ул. Ленина, д. 1, кв. 10',
    birthDate: '1985-08-20',
    isBlacklisted: false,
    createdAt: new Date().toISOString()
  }
];

const MOCK_CONTRACTS: Contract[] = [
  {
    id: '1',
    number: 'ГБ-2024-001',
    clientId: '1',
    baseType: 'golubaya-bukhta',
    status: 'signed_not_paid',
    totalAmount: 45000,
    prepayment: 15000,
    remainder: 30000,
    dateSigned: format(new Date(), 'yyyy-MM-dd'),
    guestsCount: 4,
    bookings: [
      {
        id: 'b1',
        contractId: '1',
        objectId: 'gb-cottage-1',
        baseType: 'golubaya-bukhta',
        startTime: format(addDays(new Date(), 1), "yyyy-MM-dd'T'17:00:00"),
        endTime: format(addDays(new Date(), 3), "yyyy-MM-dd'T'14:00:00"),
        type: 'main',
        price: 45000
      }
    ],
    createdAt: new Date().toISOString()
  }
];

function AppShell() {
  const auth = useAuth();
  const { toast } = useToast();
  const [currentView, setCurrentView] = useState<View>('chessboard');
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [clients, setClients] = useState<Client[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [tasks, setTasks] = useState<TaskReminder[]>([]);
  const [settings, setSettings] = useState<Settings>(INITIAL_SETTINGS);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [logoutBackupPrompt, setLogoutBackupPrompt] = useState<'already-backed-up' | 'status-error' | null>(null);
  const [isLogoutFlowRunning, setIsLogoutFlowRunning] = useState(false);
  const [logoutFlowStep, setLogoutFlowStep] = useState<'checking' | 'creating-backup' | 'logging-out' | null>(null);

  useEffect(() => {
    if (!auth.manager) return;
    refreshData();
  }, [auth.manager]);

  const closeLogoutBackupPrompt = () => {
    if (isLogoutFlowRunning) return;
    setLogoutBackupPrompt(null);
  };

  const logoutOnly = async () => {
    setLogoutFlowStep('logging-out');
    try {
      await archiveCompletedTasksForLogout();
    } catch (error) {
      toast(getErrorMessage(error, 'Не удалось перенести выполненные задачи в архив'), 'error');
    }

    try {
      await auth.logout();
    } catch {
      // AuthContext clears local session even if the server-side logout request fails.
    }
  };

  const archiveCompletedTasksForLogout = async () => {
    const tasksToArchive = getTasksToArchiveOnLogout(tasks);
    if (tasksToArchive.length === 0) return;

    const archivedAt = new Date().toISOString();
    const savedTasks = await Promise.all(tasksToArchive.map(task => taskApi.update(task.id, {
      ...task,
      isArchived: true,
      archivedAt,
    })));

    setTasks(prev => prev.map(task => savedTasks.find(saved => saved.id === task.id) || task));
  };

  const runShutdownBackup = async () => {
    try {
      setLogoutFlowStep('creating-backup');
      const status = await backupApi.status();
      if (!status.rclone.available) {
        toast('Облачные резервные копии не настроены: rclone недоступен. Выход выполнен без отправки архива в облако.', 'error');
        return true;
      }
      const result = await backupApi.run('shutdown');
      if (result.success) {
        toast('Резервная копия создана и отправлена в оба облака.', 'success');
      } else {
        toast(`Резервная копия создана с ошибками: ${result.errors.join('; ')}`, 'error');
      }
      return true;
    } catch (error) {
      toast(getErrorMessage(error, 'Ошибка при создании резервной копии перед выходом'), 'error');
      return false;
    }
  };

  const logoutWithBackup = async () => {
    setIsLogoutFlowRunning(true);
    setLogoutFlowStep('creating-backup');
    const canLogout = await runShutdownBackup();
    if (canLogout) {
      await logoutOnly();
      return;
    }
    setLogoutFlowStep(null);
    setIsLogoutFlowRunning(false);
  };

  const logoutWithoutBackup = async () => {
    setIsLogoutFlowRunning(true);
    setLogoutFlowStep('logging-out');
    setLogoutBackupPrompt(null);
    await logoutOnly();
  };

  const handleLogout = async () => {
    if (!auth.canManageBackups) {
      await logoutOnly();
      return;
    }

    setIsLogoutFlowRunning(true);
    setLogoutFlowStep('checking');
    try {
      const status = await backupApi.status();
      const decision = getLogoutBackupDecision({
        canManageBackups: auth.canManageBackups,
        todayCloudBackupDone: status.todayCloudBackupDone,
      });

      if (decision === 'ask') {
        setLogoutBackupPrompt('already-backed-up');
        setLogoutFlowStep(null);
        setIsLogoutFlowRunning(false);
        return;
      }

      if (decision === 'run-backup') {
        const canLogout = await runShutdownBackup();
        if (canLogout) {
          await logoutOnly();
          return;
        }
      }
    } catch {
      setLogoutBackupPrompt('status-error');
    }
    setLogoutFlowStep(null);
    setIsLogoutFlowRunning(false);
  };

  const refreshData = async () => {
    try {
      const [clientsData, contractsData, settingsData, tasksData] = await Promise.all([
        clientApi.list(),
        contractApi.list(),
        settingsApi.get(),
        taskApi.list(),
      ]);
      setClients(clientsData);
      setContracts(contractsData);
      if (settingsData) setSettings(settingsData);
      setTasks(tasksData);
    } catch (error) {
      console.error('Error loading local data:', error);
      toast(getErrorMessage(error, 'Ошибка при загрузке локальных данных'), 'error');
    }
  };

  const activeContractAlertsCount = contracts.filter(contract => {
    if (contract.status === 'pre_booking') {
      if (contract.nextReminderAt) {
        return new Date() >= new Date(contract.nextReminderAt);
      }
      return false;
    }
    if (contract.status === 'paid' || contract.remainder <= 0) return false;
    if (isAlertSnoozed(contract)) return false;
    if (isPaymentAlertDismissed(contract)) return false;
    return contract.bookings.some(booking => {
      const startDate = new Date(booking.startTime);
      const today = new Date();
      const tomorrow = addDays(today, 1);
      return format(startDate, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd') || 
             format(startDate, 'yyyy-MM-dd') === format(tomorrow, 'yyyy-MM-dd');
    });
  }).length;
  const activeTaskAlertsCount = tasks.filter(task => !task.isArchived && task.hasReminder !== false && !task.isDone && new Date(task.remindAt) <= new Date()).length;
  const activeAlertsCount = activeContractAlertsCount + activeTaskAlertsCount;

  const [isContractModalOpen, setIsContractModalOpen] = useState(false);
  const [isPreBookingModalOpen, setIsPreBookingModalOpen] = useState(false);
  const [editingContract, setEditingContract] = useState<Contract | null>(null);
  const [editingPreBooking, setEditingPreBooking] = useState<Contract | null>(null);
  const [modalMode, setModalMode] = useState<'view' | 'edit'>('edit');
  const [prefilledBooking, setPrefilledBooking] = useState<{ objectId: string; date: Date; baseType: BaseType } | null>(null);
  const [leadPrebookingPrefill, setLeadPrebookingPrefill] = useState<LeadPrebookingPrefill | null>(null);
  const [updatedLeadFromPrebooking, setUpdatedLeadFromPrebooking] = useState<Lead | null>(null);
  const [isPrebookingConversionMode, setIsPrebookingConversionMode] = useState(false);
  const [contractConversionLeadId, setContractConversionLeadId] = useState<string | null>(null);

  const handleNewBooking = (objectId: string, date: Date, baseType: BaseType) => {
    setPrefilledBooking({ objectId, date, baseType });
    setLeadPrebookingPrefill(null);
    setEditingContract(null);
    setEditingPreBooking(null);
    setIsPrebookingConversionMode(false);
    setContractConversionLeadId(null);
    setModalMode('edit');
    setIsPreBookingModalOpen(true);
  };

  const handleCreatePrebookingFromLead = (lead: Lead) => {
    if (!lead.clientId || lead.prebookingId || lead.contractId || lead.status === 'rejected' || lead.status === 'duplicate') return;

    setLeadPrebookingPrefill({
      leadId: lead.id,
      clientId: lead.clientId,
      guestName: lead.guestName,
      phone: lead.phone,
      email: lead.email,
      desiredStartDate: lead.desiredStartDate,
      desiredEndDate: lead.desiredEndDate,
      desiredTime: lead.desiredTime,
      guestsCount: lead.guestsCount,
      message: lead.message,
      baseType: 'chunga-changa',
      objectId: lead.objectId,
    });
    setPrefilledBooking(null);
    setEditingContract(null);
    setEditingPreBooking(null);
    setIsPrebookingConversionMode(false);
    setContractConversionLeadId(null);
    setModalMode('edit');
    setIsPreBookingModalOpen(true);
  };

  const resolveLeadForConvertedPrebooking = async (contractId: string) => {
    try {
      const leads = await leadApi.list();
      const lead = leads.find(item => item.prebookingId === contractId || item.contractId === contractId);
      setContractConversionLeadId(lead?.id || null);
    } catch (error) {
      console.error('Error resolving lead for prebooking conversion:', error);
      setContractConversionLeadId(null);
    }
  };

  const handleEditContract = (contractId: string, mode: 'view' | 'edit' = 'view') => {
    const contract = contracts.find(c => c.id === contractId);
    if (contract) {
      if (contract.status === 'pre_booking') {
        setEditingPreBooking(contract);
        setPrefilledBooking(null);
        setIsPrebookingConversionMode(false);
        setContractConversionLeadId(null);
        setIsPreBookingModalOpen(true);
      } else {
        setEditingContract(contract);
        setPrefilledBooking(null);
        setIsPrebookingConversionMode(false);
        setContractConversionLeadId(null);
        setModalMode(mode);
        setIsContractModalOpen(true);
      }
    }
  };

  const handleSaveContract = async (contract: Contract) => {
    try {
      await contractApi.save(contract);
      if (isPrebookingConversionMode && contract.status !== 'pre_booking' && contractConversionLeadId) {
        const updatedLead = await leadApi.update(contractConversionLeadId, {
          contractId: contract.id,
          status: 'contract_created',
          convertedAt: new Date().toISOString(),
        });
        setUpdatedLeadFromPrebooking(updatedLead);
        toast('Договор создан', 'success');
      }
      if (leadPrebookingPrefill && contract.status === 'pre_booking') {
        const updatedLead = await leadApi.update(leadPrebookingPrefill.leadId, {
          prebookingId: contract.id,
          contractId: contract.id,
          status: 'prebooking_created',
          convertedAt: new Date().toISOString(),
        });
        setUpdatedLeadFromPrebooking(updatedLead);
        toast('Предбронь создана', 'success');
      }
      await refreshData();
      setIsContractModalOpen(false);
      setIsPreBookingModalOpen(false);
      setEditingContract(null);
      setEditingPreBooking(null);
      setLeadPrebookingPrefill(null);
      setIsPrebookingConversionMode(false);
      setContractConversionLeadId(null);
    } catch (error) {
      console.error('Error saving contract:', error);
      const conflict = getErrorConflict(error);
      if (conflict?.status === 'pre_booking') {
        const numberText = conflict.number ? `: ${conflict.number}` : ' (без номера)';
        const shouldReplace = window.confirm(
          `На это время уже есть предбронь${numberText}. Заменить эту предбронь новым договором?`
        );
        if (!shouldReplace) return;

        if (!conflict.contractId) {
          toast('Не удалось определить предбронь для замены. Попробуйте обновить страницу.', 'error');
          return;
        }

        try {
          // Удаляем предбронь
          await contractApi.delete(conflict.contractId);
          // Повторно сохраняем новый договор
          await contractApi.save(contract);
          await refreshData();
          setIsContractModalOpen(false);
          setIsPreBookingModalOpen(false);
          setEditingContract(null);
          setEditingPreBooking(null);
          toast('Предбронь заменена новым договором', 'success');
        } catch (replaceError) {
          console.error('Error replacing pre-booking:', replaceError);
          const replaceConflict = getErrorConflict(replaceError);
          if (replaceConflict?.status === 'pre_booking') {
            const replaceNumberText = replaceConflict.number ? `: ${replaceConflict.number}` : ' (без номера)';
            toast(`На это время появилась новая предбронь${replaceNumberText}. Попробуйте ещё раз.`, 'error');
          } else {
            toast(getErrorMessage(replaceError, 'Ошибка при замене предброни договором'), 'error');
          }
        }
      } else {
        toast(getErrorMessage(error, 'Ошибка при сохранении договора'), 'error');
      }
    }
  };

  const handleUpdateContract = async (contract: Contract) => {
    try {
      await contractApi.save(contract);
      await refreshData();
    } catch (error) {
      console.error('Error updating contract:', error);
      toast(getErrorMessage(error, 'Ошибка при обновлении договора'), 'error');
    }
  };

  const handleDeleteContract = async (contractId: string) => {
    try {
      await contractApi.delete(contractId);
      await refreshData();
      setEditingContract(null);
      setEditingPreBooking(null);
    } catch (error) {
      console.error('Error deleting contract:', error);
      toast(getErrorMessage(error, 'Ошибка при удалении договора'), 'error');
    }
  };

  const handleUpdateTask = async (task: TaskReminder) => {
    try {
      const saved = await taskApi.update(task.id, task);
      setTasks(prev => prev.map(item => item.id === saved.id ? saved : item));
    } catch (error) {
      console.error('Error updating task:', error);
      toast(getErrorMessage(error, 'Ошибка при обновлении задачи'), 'error');
    }
  };

  const renderView = () => {
    switch (currentView) {
      case 'chessboard':
        return (
          <Chessboard 
            isDarkMode={isDarkMode} 
            contracts={contracts} 
            clients={clients} 
            settings={settings}
            onNewBooking={handleNewBooking}
            onEditContract={handleEditContract}
          />
        );
      case 'clients':
        return (
          <ClientsView
            isDarkMode={isDarkMode}
            clients={clients}
            setClients={setClients}
            canDeleteClients={auth.canDeleteClients}
          />
        );
      case 'leads':
        return (
          <LeadsView
            isDarkMode={isDarkMode}
            onClientCreated={(client) => setClients(prev => prev.some(item => item.id === client.id) ? prev : [client, ...prev])}
            onCreatePrebookingFromLead={handleCreatePrebookingFromLead}
            updatedLeadFromPrebooking={updatedLeadFromPrebooking}
          />
        );
      case 'contracts':
        return (
          <ContractsView 
            isDarkMode={isDarkMode} 
            contracts={contracts} 
            setContracts={setContracts} 
            clients={clients} 
            settings={settings} 
            canDeleteContracts={auth.canDeleteContracts}
          />
        );
      case 'additional':
        return (
          <AdditionalView
            isDarkMode={isDarkMode}
            tasks={tasks}
            setTasks={setTasks}
            currentManagerName={auth.manager?.name || ''}
          />
        );
      case 'settings':
        return (
          <SettingsView
            isDarkMode={isDarkMode}
            settings={settings}
            setSettings={setSettings}
            canManageTemplates={auth.canManageTemplates}
            canManageEmail={auth.canManageEmail}
            canManageBackups={auth.canManageBackups}
            canManageManagers={auth.canManageManagers}
          />
        );
      default:
        return (
          <Chessboard 
            isDarkMode={isDarkMode} 
            contracts={contracts} 
            clients={clients} 
            settings={settings}
            onNewBooking={handleNewBooking}
            onEditContract={handleEditContract}
          />
        );
    }
  };

  if (auth.isCheckingAuth) {
    return (
      <div className={cn(
        "min-h-screen flex items-center justify-center transition-colors duration-300 font-sans",
        isDarkMode ? "bg-[#080807] text-[#F4F1EA]" : "bg-gray-50 text-gray-900"
      )}>
        <Loader2 className="animate-spin text-[#8CAFBE]" size={32} />
      </div>
    );
  }

  if (!auth.manager) {
    return <LoginModal isDarkMode={isDarkMode} />;
  }

  return (
      <div className={cn(
        "min-h-screen transition-colors duration-300 font-sans",
        isDarkMode ? "bg-[#080807] text-[#F4F1EA]" : "bg-gray-50 text-gray-900"
      )}>
        {/* Header */}
        <header className={cn(
          "sticky top-0 z-50 border-b backdrop-blur-md",
          isDarkMode ? "bg-[#080807]/88 border-[#6E6964]/25" : "bg-white/80 border-gray-200"
        )}>
          <div className={cn(
            "mx-auto px-6 h-20 flex items-center justify-between transition-all duration-300",
            currentView === 'chessboard' ? "max-w-full" : "max-w-[1600px]"
          )}>
            <div className="flex items-center gap-12">
              <div className="flex items-center gap-3">
                <img
                  src="/brand/only-logo-bm.png"
                  alt=""
                  className="h-10 w-10 object-contain"
                />
                <h1 className="text-xl font-bold tracking-tight">Большая Медведица</h1>
              </div>

              <nav className="flex items-center gap-1.5">
                {[
                  { id: 'chessboard' as View, label: 'Шахматка', icon: Grid3X3 },
                  { id: 'leads' as View, label: 'Заявки', icon: Inbox },
                  { id: 'clients' as View, label: 'Гости', icon: Users },
                  { id: 'contracts' as View, label: 'Договоры', icon: FileText },
                  { id: 'additional' as View, label: 'Дополнительно', icon: ClipboardList },
                  { id: 'settings' as View, label: 'Настройки', icon: SettingsIcon },
                ].map((item) => (
                  <motion.button
                    key={item.id}
                    onClick={() => setCurrentView(item.id)}
                    whileHover={{ y: -2, scale: 1.02 }}
                    whileTap={{ y: 0, scale: 0.96 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 28 }}
                    className={cn(
                      "group relative flex items-center gap-2 overflow-hidden px-4 py-2 rounded-xl text-sm font-bold transition-colors duration-200",
                      currentView === item.id 
                        ? "text-[#F4F1EA]"
                        : (isDarkMode ? "text-[#B4CDD2]/65 hover:bg-[#8CAFBE]/10 hover:text-[#F4F1EA]" : "text-gray-500 hover:bg-orange-50 hover:text-gray-900")
                    )}
                  >
                    {currentView === item.id && (
                      <motion.span
                        layoutId="main-nav-active-bg"
                        className={cn(
                          "absolute inset-0 rounded-xl",
                          isDarkMode ? "bg-[#6E6964]/28 ring-1 ring-[#B4CDD2]/20" : "bg-orange-500/80 shadow-sm shadow-orange-500/10"
                        )}
                        transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                      />
                    )}
                    <span className="relative z-10 flex items-center justify-center transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:scale-110">
                      <item.icon size={18} />
                    </span>
                    <span className="relative z-10">{item.label}</span>
                  </motion.button>
                ))}
              </nav>
            </div>

            <div className="flex items-center gap-4">
              <div className="relative">
                <motion.button 
                  onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
                  whileTap={{ scale: 0.9 }}
                  className={cn(
                    "p-2.5 rounded-xl border transition-all relative",
                    isDarkMode ? "bg-[#6E6964]/12 border-[#B4CDD2]/15 hover:bg-[#8CAFBE]/10" : "bg-white border-gray-200 hover:bg-gray-50"
                  )}
                >
                  <Bell size={20} className="text-gray-500" />
                  {activeAlertsCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[#8CAFBE] text-black text-[10px] font-bold flex items-center justify-center border-2 border-[#080807]">
                      {activeAlertsCount}
                    </span>
                  )}
                </motion.button>
                <NotificationCenter 
                  isDarkMode={isDarkMode} 
                  contracts={contracts} 
                  clients={clients} 
                  tasks={tasks}
                  isOpen={isNotificationsOpen} 
                  onClose={() => setIsNotificationsOpen(false)} 
                  onUpdateContract={handleUpdateContract}
                  onDeleteContract={handleDeleteContract}
                  onUpdateTask={handleUpdateTask}
                  onOpenContract={handleEditContract}
                />
              </div>

              <motion.button 
                onClick={() => setIsDarkMode(true)}
                whileTap={{ scale: 0.9 }}
                title="Тёмная фирменная тема включена"
                className={cn(
                  "p-2.5 rounded-xl border transition-all",
                  isDarkMode ? "bg-[#6E6964]/12 border-[#B4CDD2]/15 hover:bg-[#8CAFBE]/10" : "bg-white border-gray-200 hover:bg-gray-50"
                )}
              >
                {isDarkMode ? <Sun size={20} className="text-[#B4CDD2]" /> : <Moon size={20} className="text-gray-500" />}
              </motion.button>

              <div className="flex items-center gap-3 pl-4 border-l border-white/5">
                <div className="text-right">
                  <div className="text-xs font-bold">{auth.manager.name}</div>
                  <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                    {auth.manager.role === 'admin' ? 'Админ' : 'Менеджер'}
                  </div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#8CAFBE] to-[#6E6964] flex items-center justify-center font-bold text-[#080807] shadow-lg shadow-[#8CAFBE]/15">
                  {auth.manager.name.slice(0, 1).toUpperCase()}
                </div>
                <motion.button
                  onClick={handleLogout}
                  disabled={isLogoutFlowRunning}
                  whileTap={{ scale: 0.9 }}
                  title={auth.canManageBackups ? 'Выйти с проверкой резервной копии' : 'Выйти'}
                  className={cn(
                    "p-2.5 rounded-xl border transition-all disabled:opacity-60",
                    isDarkMode ? "bg-[#6E6964]/12 border-[#B4CDD2]/15 hover:bg-[#8CAFBE]/10" : "bg-white border-gray-200 hover:bg-gray-50"
                  )}
                >
                  <LogOut size={18} className={cn(isLogoutFlowRunning ? "text-[#8CAFBE]" : "text-gray-500")} />
                </motion.button>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className={cn(
          "mx-auto px-6 py-8 transition-all duration-300",
          currentView === 'chessboard' ? "max-w-full" : "max-w-[1600px]"
        )}>
          <motion.div
            key={currentView}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            {renderView()}
          </motion.div>
        </main>

        {isPreBookingModalOpen && (
          <PreBookingModal
            isOpen={isPreBookingModalOpen}
            isDarkMode={isDarkMode}
            onClose={() => {
              setIsPreBookingModalOpen(false);
              setEditingPreBooking(null);
              setLeadPrebookingPrefill(null);
              setIsPrebookingConversionMode(false);
              setContractConversionLeadId(null);
            }}
            onSave={(contract) => {
              void handleSaveContract(contract);
            }}
            onOpenContract={() => {
              const prebooking = editingPreBooking;
              setIsPreBookingModalOpen(false);
              setEditingContract(prebooking);
              setEditingPreBooking(null);
              setModalMode('edit');
              setIsPrebookingConversionMode(Boolean(prebooking && prebooking.status === 'pre_booking'));
              setContractConversionLeadId(null);
              if (prebooking) void resolveLeadForConvertedPrebooking(prebooking.id);
              setIsContractModalOpen(true);
            }}
            onDelete={(contractId) => {
              handleDeleteContract(contractId);
              setIsPreBookingModalOpen(false);
            }}
            prefilledBooking={prefilledBooking}
            leadPrefill={leadPrebookingPrefill}
            initialData={editingPreBooking}
          />
        )}

        {isContractModalOpen && (
          <ContractModal
            isOpen={isContractModalOpen}
            onClose={() => {
              setIsContractModalOpen(false);
              setEditingContract(null);
              setIsPrebookingConversionMode(false);
              setContractConversionLeadId(null);
            }}
            onSave={handleSaveContract}
            clients={clients}
            settings={settings}
            contracts={contracts}
            initialData={editingContract || undefined}
            initialMode={modalMode}
            prefilledBooking={prefilledBooking || undefined}
            isPrebookingConversion={isPrebookingConversionMode}
            isDarkMode={isDarkMode}
          />
        )}
        <AnimatePresence>
          {isLogoutFlowRunning && !logoutBackupPrompt && logoutFlowStep && (
            <motion.div
              className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                role="status"
                aria-live="polite"
                className={cn(
                  'w-full max-w-md overflow-hidden rounded-2xl border p-6 shadow-2xl',
                  isDarkMode
                    ? 'border-white/10 bg-[#111111] text-white shadow-black/40'
                    : 'border-gray-200 bg-white text-gray-950 shadow-gray-300/40'
                )}
                initial={{ opacity: 0, scale: 0.94, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 10 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#8CAFBE]/10 text-[#B4CDD2]">
                    <Loader2 size={22} className="animate-spin" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold">
                      {logoutFlowStep === 'checking'
                        ? 'Проверяем резервную копию'
                        : logoutFlowStep === 'creating-backup'
                          ? 'Создаем бэкап перед выходом'
                          : 'Выходим из пользователя'}
                    </h3>
                    <p className={cn('mt-2 text-sm leading-6', isDarkMode ? 'text-gray-400' : 'text-gray-600')}>
                      {logoutFlowStep === 'checking'
                        ? 'CRM смотрит, был ли сегодня успешный бэкап.'
                        : logoutFlowStep === 'creating-backup'
                          ? 'Это может занять немного времени: создается резервная копия и отправляется в облака.'
                          : 'Сессия пользователя закрывается.'}
                    </p>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
          {logoutBackupPrompt && (
            <motion.div
              className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) closeLogoutBackupPrompt();
              }}
            >
              <motion.div
                role="dialog"
                aria-modal="true"
                aria-labelledby="logout-backup-title"
                className={cn(
                  'w-full max-w-lg overflow-hidden rounded-2xl border shadow-2xl',
                  isDarkMode
                    ? 'border-white/10 bg-[#111111] text-white shadow-black/40'
                    : 'border-gray-200 bg-white text-gray-950 shadow-gray-300/40'
                )}
                initial={{ opacity: 0, scale: 0.94, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 10 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
              >
                <div className="flex items-start gap-4 border-b border-white/5 p-6">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#8CAFBE]/10 text-[#B4CDD2]">
                    {isLogoutFlowRunning ? <Loader2 size={22} className="animate-spin" /> : <ShieldCheck size={22} />}
                  </div>
                  <div>
                    <h3 id="logout-backup-title" className="text-lg font-bold">
                      {logoutBackupPrompt === 'already-backed-up'
                        ? 'Бэкап сегодня уже создан'
                        : 'Не удалось проверить бэкап'}
                    </h3>
                    <p className={cn('mt-2 text-sm leading-6', isDarkMode ? 'text-gray-400' : 'text-gray-600')}>
                      {logoutBackupPrompt === 'already-backed-up'
                        ? 'Можно выйти без нового бэкапа или создать ещё одну резервную копию перед выходом.'
                        : 'Статус сегодняшнего бэкапа сейчас не удалось получить. Можно создать резервную копию перед выходом или выйти без неё.'}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-3 p-5">
                  <button
                    type="button"
                    onClick={closeLogoutBackupPrompt}
                    disabled={isLogoutFlowRunning}
                    className={cn(
                      'h-10 rounded-xl px-4 text-sm font-bold transition-all disabled:opacity-50',
                      isDarkMode ? 'bg-white/10 text-white hover:bg-white/15' : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                    )}
                  >
                    Остаться
                  </button>
                  <button
                    type="button"
                    onClick={logoutWithoutBackup}
                    disabled={isLogoutFlowRunning}
                    className={cn(
                      'h-10 rounded-xl px-4 text-sm font-bold transition-all disabled:opacity-50',
                      isDarkMode ? 'border border-white/10 text-gray-200 hover:bg-white/10' : 'border border-gray-200 text-gray-700 hover:bg-gray-50'
                    )}
                  >
                    Выйти без бэкапа
                  </button>
                  <button
                    type="button"
                    onClick={logoutWithBackup}
                    disabled={isLogoutFlowRunning}
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#8CAFBE] px-5 text-sm font-bold text-black transition-all hover:bg-[#B4CDD2] disabled:opacity-60"
                  >
                    {isLogoutFlowRunning && <Loader2 size={16} className="animate-spin" />}
                    {logoutBackupPrompt === 'already-backed-up' ? 'Создать ещё и выйти' : 'Создать и выйти'}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
        <Toaster position="bottom-right" toastOptions={{
          style: {
            background: isDarkMode ? '#333' : '#fff',
            color: isDarkMode ? '#fff' : '#333',
          }
        }} />
      </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <AppShell />
      </ToastProvider>
    </AuthProvider>
  );
}
