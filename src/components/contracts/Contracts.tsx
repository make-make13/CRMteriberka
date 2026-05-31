/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Plus, Search, Calendar, FileText, CheckCircle2, Clock, AlertCircle, XCircle, Trash2, Printer, Mail, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Contract, Client, Settings, ContractStatus } from '../../types';
import ContractModal from './ContractModal';
import { contractApi, emailSettingsApi, bmDocxApi } from '../../services/localApi';
import { getErrorMessage, getErrorConflict } from '../../utils/errors';
import { bookingOverlapsDateRange, contractMatchesSearch } from '../../utils/listFilters';
import ConfirmDialog from '../common/ConfirmDialog';
import EmptyState from '../common/EmptyState';
import { useToast } from '../../context/ToastContext';
import DocumentPreviewModal, { type DocumentPreviewMode } from '../common/DocumentPreviewModal';
import { prepareContractDataFromContract } from '../../utils/contractDocumentData';
import { emailService } from '../../services/emailService';
import { clampPage, getPageCount, getPageItems } from '../../utils/pagination';
import { formatVisibleContractNumber } from '../../utils/contractNumbers';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const CONTRACTS_PAGE_SIZE = 100;

interface ContractsProps {
  isDarkMode: boolean;
  contracts: Contract[];
  setContracts: React.Dispatch<React.SetStateAction<Contract[]>>;
  clients: Client[];
  settings: Settings;
  canDeleteContracts?: boolean;
}

interface PreviewEmailPayload {
  contractId: string;
  contractNumber: string;
  toEmail: string;
  toName: string;
  documentType: 'Договор' | 'Пакет документов';
}

export default function Contracts({ isDarkMode, contracts, setContracts, clients, settings, canDeleteContracts = false }: ContractsProps) {
  const { toast } = useToast();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingContract, setEditingContract] = useState<Contract | null>(null);
  const [modalMode, setModalMode] = useState<'view' | 'edit'>('edit');
  const [statusFilter, setStatusFilter] = useState<ContractStatus | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [contractPendingDelete, setContractPendingDelete] = useState<Contract | null>(null);
  const [isDeletingContract, setIsDeletingContract] = useState(false);
  const [quickGeneratingId, setQuickGeneratingId] = useState<string | null>(null);
  const [bmDocxDownloadingId, setBmDocxDownloadingId] = useState<string | null>(null);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [previewPdfBlob, setPreviewPdfBlob] = useState<Blob | null>(null);
  const [previewFileName, setPreviewFileName] = useState('');
  const [previewMode, setPreviewMode] = useState<DocumentPreviewMode>('print');
  const [previewEmailPayload, setPreviewEmailPayload] = useState<PreviewEmailPayload | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const dateToRef = useRef<HTMLInputElement>(null);

  const handleDateChange = (value: string, setter: (v: string) => void, nextRef?: React.RefObject<HTMLInputElement | null>) => {
    const digits = value.replace(/\D/g, '');
    let masked = '';
    if (digits.length > 0) {
      masked = digits.substring(0, 2);
      if (digits.length > 2) {
        masked += '.' + digits.substring(2, 4);
        if (digits.length > 4) {
          masked += '.' + digits.substring(4, 8);
        }
      }
    }
    setter(masked);
    if (masked.length === 10 && nextRef?.current) {
      nextRef.current.focus();
    }
  };

  const getStatusIcon = (status: ContractStatus) => {
    switch (status) {
      case 'pre_booking': return <Clock size={14} className="text-blue-400" />;
      case 'signed_not_paid': return <AlertCircle size={14} className="text-current" />;
      case 'partial_paid': return <Clock size={14} className="text-current" />;
      case 'paid': return <CheckCircle2 size={14} className="text-current" />;
      case 'cancelled': return <XCircle size={14} className="text-current" />;
    }
  };

  const getStatusLabel = (status: ContractStatus) => {
    switch (status) {
      case 'pre_booking': return 'Предбронь';
      case 'signed_not_paid': return 'Не оплачен';
      case 'partial_paid': return 'Частично оплачен';
      case 'paid': return 'Оплачен';
      case 'cancelled': return 'Аннулирован';
    }
  };

  const clientsById = useMemo(() => new Map(clients.map(client => [client.id, client])), [clients]);

  // pre_booking — это инструмент шахматки, не договор; скрываем из раздела "Договоры"
  const realContracts = useMemo(() => contracts.filter(c => c.status !== 'pre_booking'), [contracts]);

  const filteredContracts = useMemo(() => realContracts.filter(contract => {
    const client = clientsById.get(contract.clientId);
    const matchesSearch = contractMatchesSearch(contract, client, searchQuery);
    const matchesStatus = statusFilter === 'all' || contract.status === statusFilter;

    const matchesDate = (() => {
      if (!dateFrom && !dateTo) return true;
      return contract.bookings.some(booking => bookingOverlapsDateRange(booking, dateFrom, dateTo));
    })();

    return matchesSearch && matchesStatus && matchesDate;
  }), [clientsById, realContracts, dateFrom, dateTo, searchQuery, statusFilter]);

  const pageCount = getPageCount(filteredContracts.length, CONTRACTS_PAGE_SIZE);
  const safeCurrentPage = clampPage(currentPage, pageCount);
  const visibleContracts = useMemo(
    () => getPageItems(filteredContracts, safeCurrentPage, CONTRACTS_PAGE_SIZE),
    [filteredContracts, safeCurrentPage],
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [dateFrom, dateTo, searchQuery, statusFilter]);

  useEffect(() => {
    setCurrentPage(page => clampPage(page, pageCount));
  }, [pageCount]);


  const handleAddContract = () => {
    setEditingContract(null);
    setModalMode('edit');
    setIsModalOpen(true);
  };

  const handleEditContract = (contract: Contract, mode: 'view' | 'edit' = 'view') => {
    setEditingContract(contract);
    setModalMode(mode);
    setIsModalOpen(true);
  };

  const handleSaveContract = async (contract: Contract) => {
    try {
      const saved = await contractApi.save(contract);
      setContracts(prev => {
        const exists = prev.some(item => item.id === saved.id);
        return exists ? prev.map(item => item.id === saved.id ? saved : item) : [saved, ...prev];
      });
      setIsModalOpen(false);
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
        const preBookingId = conflict.contractId;

        try {
          // Удаляем предбронь
          await contractApi.delete(preBookingId);
          // Повторно сохраняем новый договор
          const saved = await contractApi.save(contract);
          // Обновляем состояние: удаляем pre_booking (если есть) и добавляем новый договор
          setContracts(prev => {
            const withoutPreBooking = prev.filter(item => item.id !== preBookingId);
            const exists = withoutPreBooking.some(item => item.id === saved.id);
            return exists ? withoutPreBooking.map(item => item.id === saved.id ? saved : item) : [saved, ...withoutPreBooking];
          });
          setIsModalOpen(false);
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

  const requestDeleteContract = (contractId: string) => {
    const contract = contracts.find(item => item.id === contractId);
    if (contract) setContractPendingDelete(contract);
  };

  const handleDeleteContract = async (contract: Contract) => {
    setIsDeletingContract(true);
    try {
      await contractApi.delete(contract.id);
      setContracts(prev => prev.filter(item => item.id !== contract.id));
      setContractPendingDelete(null);
      setIsModalOpen(false);
    } catch (error) {
      console.error('Error deleting contract:', error);
      toast(getErrorMessage(error, 'Ошибка при удалении договора'), 'error');
    } finally {
      setIsDeletingContract(false);
    }
  };

  const buildPreviewEmailPayload = (
    contract: Contract,
    client: Client,
    documentType: PreviewEmailPayload['documentType'],
  ): PreviewEmailPayload => ({
    contractId: contract.id,
    contractNumber: contract.number,
    toEmail: client.email || '',
    toName: client.type === 'physical'
      ? `${client.lastName} ${client.firstName}`.trim()
      : client.organizationName,
    documentType,
  });

  const handleQuickGenerate = async (contract: Contract, type: DocumentPreviewMode) => {
    const client = clientsById.get(contract.clientId);
    if (!client) {
      toast('Гость договора не найден', 'error');
      return;
    }

    setQuickGeneratingId(`${contract.id}:${type}`);
    try {
      let pdfBlob: Blob;

      if (contract.baseType === 'chunga-changa') {
        // БМ-договор: active DOCX-шаблон → fallback на code generator.
        const bmMode = type === 'send' ? 'signed' : 'print';
        const { blob: contractBlob } = await bmDocxApi.downloadBmContract(
          String(contract.id), bmMode, 'pdf', 'template-fallback',
        );
        if (type === 'send') {
          // «На отправку»: договор (DOCX) + счёт + акт
          const contractData = prepareContractDataFromContract(contract, client);
          const { generateBmSendPackageBlob } = await import('../../utils/docx/bmSendPackage');
          pdfBlob = await generateBmSendPackageBlob(contractBlob, contractData);
        } else {
          // «На печать»: только договор без печати и подписи
          pdfBlob = contractBlob;
        }
      } else {
        // Не-БМ договор: прежняя PDFMe-генерация
        const { generatePdfmeContractBlob } = await import('../../utils/pdfmeDocumentGenerator');
        pdfBlob = await generatePdfmeContractBlob(prepareContractDataFromContract(contract, client), type);
      }

      setPreviewMode(type);
      setPreviewPdfBlob(pdfBlob);
      setPreviewFileName(type === 'send' ? `Пакет_документов_${contract.number}` : `Договор_на_печать_${contract.number}`);
      setPreviewEmailPayload(buildPreviewEmailPayload(
        contract,
        client,
        type === 'send' ? 'Пакет документов' : 'Договор',
      ));
      setIsPreviewOpen(true);
    } catch (error) {
      console.error('Quick document generation error:', error);
      toast(getErrorMessage(error, 'Ошибка при формировании документа'), 'error');
    } finally {
      setQuickGeneratingId(null);
    }
  };

  // --- Генерация счёта + акта вместе для БМ ---
  const handleBmInvoiceActDownload = async (
    contract: Contract,
    mode: 'send' | 'print',
  ) => {
    const client = clientsById.get(contract.clientId);
    if (!client) { toast('Гость договора не найден', 'error'); return; }
    const key = `${contract.id}:invoiceact:${mode}`;
    setBmDocxDownloadingId(key);
    try {
      const contractData = prepareContractDataFromContract(contract, client);
      const { generateBmInvoiceActPdf } = await import('../../utils/docx/bmSendPackage');
      const blob = await generateBmInvoiceActPdf(contractData, mode);
      const suffix = mode === 'send' ? 'на_отправку' : 'на_печать';
      const safeNum = String(contract.number || contract.id).replace(/[^A-Za-z0-9_\-]/g, '_');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Счёт_и_акт_${safeNum}_${suffix}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Invoice+act download error:', error);
      toast(getErrorMessage(error, 'Ошибка генерации документа'), 'error');
    } finally {
      setBmDocxDownloadingId(null);
    }
  };


  const handlePreviewEmail = async () => {
    if (!previewEmailPayload) {
      toast('Документ ещё не подготовлен', 'error');
      return;
    }
    if (!previewPdfBlob) {
      toast('PDF для отправки не найден', 'error');
      return;
    }
    if (!previewEmailPayload.toEmail) {
      toast('У гостя не указан email', 'error');
      return;
    }

    setIsSendingEmail(true);
    try {
      const smtpData = await emailSettingsApi.get();
      await emailService.send({
        ...previewEmailPayload,
        docxBlob: previewPdfBlob,
        sentBy: 'system',
        customMessage: smtpData?.defaultMessage,
        senderName: smtpData?.senderName,
      });
      toast('Документ успешно отправлен на email', 'success');
    } catch (error) {
      console.error('Quick email sending error:', error);
      toast(getErrorMessage(error, 'Ошибка при отправке email'), 'error');
    } finally {
      setIsSendingEmail(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Договоры</h2>
        <div className="flex items-center gap-2">
          <motion.button
            onClick={handleAddContract}
            whileTap={{ scale: 0.95 }}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
              isDarkMode ? "bg-[#F59E0B] text-[#050505] hover:bg-[#D97706]" : "bg-orange-500 text-white hover:bg-orange-600"
            )}
          >
            <Plus size={18} />
            Новый договор
          </motion.button>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
          <input 
            type="text" 
            placeholder="Поиск по ФИО, телефону, номеру договора..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={cn(
              "w-full pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none transition-all border",
              isDarkMode ? "bg-[#161616] border-[#262626] text-[#F5F5F5] placeholder:text-[#8B8B8B]/60 focus:border-[#F97316]/60" : "bg-white border-gray-200 shadow-sm"
            )}
          />
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            {/* ... */}
            {[
              { id: 'all', label: 'Все' },
              { id: 'signed_not_paid', label: 'Не оплачен' },
              { id: 'partial_paid', label: 'Частичная предоплата' },
              { id: 'paid', label: 'Оплачен' },
              { id: 'cancelled', label: 'Аннулирован' },
            ].map((item) => (
              <motion.button
                key={item.id}
                onClick={() => setStatusFilter(item.id as any)}
                whileTap={{ scale: 0.95 }}
                className={cn(
                  "px-4 py-2 rounded-xl text-sm font-medium transition-all",
                  statusFilter === item.id
                    ? (isDarkMode ? "bg-[#F59E0B] text-[#050505] shadow-[0_0_15px_rgba(245,158,11,0.3)]" : "bg-orange-500 text-white shadow-sm")
                    : (isDarkMode ? "bg-[#161616] border border-[#262626] text-[#8B8B8B] hover:bg-[#1A1A1A] hover:text-[#F5F5F5]" : "bg-gray-100 text-gray-600 hover:bg-gray-200")
                )}
              >
                {item.label}
              </motion.button>
            ))}
          </div>

          <div className={cn("flex items-center gap-3 text-sm", isDarkMode ? "text-[#8B8B8B]" : "text-gray-500")}>
            <span>Период заселения:</span>
            <div className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all",
              isDarkMode ? "bg-[#161616] border-[#262626] focus-within:border-[#F97316]/60" : "bg-white border-gray-200"
            )}>
              <Calendar size={14} className={isDarkMode ? "text-[#8B8B8B]" : "text-gray-500"} />
              <span className={cn("text-xs", isDarkMode ? "text-[#8B8B8B]" : "text-gray-500")}>с</span>
              <input 
                type="text" 
                placeholder="ДД.ММ.ГГГГ"
                value={dateFrom}
                onChange={(e) => handleDateChange(e.target.value, setDateFrom, dateToRef)}
                maxLength={10}
                className={cn("bg-transparent border-none outline-none text-sm w-24", isDarkMode ? "text-[#F5F5F5] placeholder:text-[#8B8B8B]/50" : "text-gray-300 placeholder:text-gray-600")}
              />
            </div>
            <div className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all",
              isDarkMode ? "bg-[#161616] border-[#262626] focus-within:border-[#F97316]/60" : "bg-white border-gray-200"
            )}>
              <Calendar size={14} className={isDarkMode ? "text-[#8B8B8B]" : "text-gray-500"} />
              <span className={cn("text-xs", isDarkMode ? "text-[#8B8B8B]" : "text-gray-500")}>по</span>
              <input 
                type="text" 
                ref={dateToRef}
                placeholder="ДД.ММ.ГГГГ"
                value={dateTo}
                onChange={(e) => handleDateChange(e.target.value, setDateTo)}
                maxLength={10}
                className={cn("bg-transparent border-none outline-none text-sm w-24", isDarkMode ? "text-[#F5F5F5] placeholder:text-[#8B8B8B]/50" : "text-gray-300 placeholder:text-gray-600")}
              />
            </div>
            {(dateFrom || dateTo) && (
              <button 
                onClick={() => { setDateFrom(''); setDateTo(''); }}
                className={cn("p-1.5 rounded-lg transition-colors", isDarkMode ? "hover:bg-[#1A1A1A] text-[#8B8B8B]" : "hover:bg-gray-50 text-gray-400")}
                title="Очистить фильтр"
              >
                <XCircle size={16} />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className={cn(
        "rounded-2xl border overflow-hidden",
        isDarkMode ? "bg-[#0A0A0A] border-[#262626]" : "bg-white border-gray-200 shadow-sm"
      )}>
        {filteredContracts.length > 0 ? (
          <table className="w-full border-collapse">
            <colgroup>
              <col className="w-[12%]" />
              <col className="w-[28%]" />
              <col className="w-[16%]" />
              <col className="w-[13%]" />
              <col className="w-[31%]" />
            </colgroup>
            <thead>
              <tr className={cn(
                "text-left text-[10px] uppercase tracking-wider font-bold",
                isDarkMode ? "text-[#8B8B8B] bg-[#161616]" : "text-gray-400 bg-gray-50"
              )}>
                <th className="px-5 py-3 border-b border-[#262626]">№ Договора</th>
                <th className="px-5 py-3 border-b border-[#262626]">Гость</th>
                <th className="px-5 py-3 border-b border-[#262626]">Финансы</th>
                <th className="px-5 py-3 border-b border-[#262626]">Статус</th>
                <th className="px-5 py-3 border-b border-[#262626] text-left">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#262626]">
              {visibleContracts.map(contract => {
                const client = clientsById.get(contract.clientId);
                return (
                  <tr key={contract.id}
                    onDoubleClick={() => handleEditContract(contract, 'view')}
                    className={cn(
                      "group transition-colors cursor-pointer select-none",
                      isDarkMode ? "hover:bg-[#1A1A1A] text-[#F5F5F5]" : "hover:bg-gray-50",
                    )}
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center", isDarkMode ? "bg-[#161616] text-[#8B8B8B]" : "bg-gray-100 text-gray-500")}>
                          <FileText size={18} />
                        </div>
                        <div className={cn('font-bold text-sm', isDarkMode ? 'text-[#8B8B8B]' : 'text-gray-700')}>{formatVisibleContractNumber(contract.number, contract.baseType)}</div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className={cn('font-bold text-[15px] leading-snug', isDarkMode ? 'text-[#F5F5F5]' : 'text-gray-900')}>
                        {client
                          ? (client.type === 'physical' ? `${client.lastName} ${client.firstName}` : client.organizationName)
                          : 'Неизвестный гость'}
                      </div>
                      <div className={cn("text-xs mt-0.5", isDarkMode ? "text-[#8B8B8B]" : "text-gray-400")}>
                        {(() => {
                          const mainBooking = contract.bookings.find(b => b.type === 'main') || contract.bookings[0];
                          if (mainBooking) {
                            return format(new Date(mainBooking.startTime), 'd MMMM yyyy', { locale: ru });
                          }
                          return format(new Date(contract.dateSigned), 'd MMMM yyyy', { locale: ru });
                        })()}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className={cn('font-bold text-sm', isDarkMode ? 'text-[#F5F5F5]' : 'text-gray-900')}>{contract.totalAmount.toLocaleString()} ₽</div>
                      <div className={cn("text-xs mt-0.5", isDarkMode ? "text-[#8B8B8B]" : "text-gray-400")}>Остаток: {contract.remainder.toLocaleString()} ₽</div>
                    </td>
                    <td className="px-5 py-4">
                      <span className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
                        contract.status === 'paid'
                          ? "bg-green-500/10 text-green-500"
                          : contract.status === 'cancelled'
                            ? "bg-red-500/10 text-red-500"
                            : contract.status === 'signed_not_paid'
                              ? "bg-orange-500/10 text-orange-500"
                              : "bg-blue-500/10 text-blue-500"
                      )}>
                        {getStatusIcon(contract.status)}
                        {getStatusLabel(contract.status)}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div
                        className="flex items-center justify-start gap-2"
                        onClick={(event) => event.stopPropagation()}
                        onDoubleClick={(event) => event.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => handleQuickGenerate(contract, 'print')}
                          disabled={quickGeneratingId === `${contract.id}:print`}
                          className={cn(
                            "inline-flex min-h-9 items-center gap-2 rounded-xl px-3 text-xs font-bold transition-all disabled:cursor-wait disabled:opacity-60",
                            isDarkMode ? "bg-[#161616] text-[#F4F1EA] hover:bg-[#232323]" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                          )}
                        >
                          {quickGeneratingId === `${contract.id}:print` ? <Loader2 size={14} className="animate-spin" /> : <Printer size={14} />}
                          На печать
                        </button>
                        <button
                          type="button"
                          onClick={() => handleQuickGenerate(contract, 'send')}
                          disabled={quickGeneratingId === `${contract.id}:send`}
                          className={cn(
                            "inline-flex min-h-9 items-center gap-2 rounded-xl px-3 text-xs font-bold transition-all disabled:cursor-wait disabled:opacity-60",
                            isDarkMode ? "bg-orange-500/10 text-orange-400 hover:bg-orange-500/20" : "bg-orange-50 text-orange-700 hover:bg-orange-100"
                          )}
                        >
                          {quickGeneratingId === `${contract.id}:send` ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                          На отправку
                        </button>

                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <EmptyState
            isDarkMode={isDarkMode}
            icon={<FileText size={32} />}
            title={realContracts.length === 0 ? 'Договоров пока нет' : 'Договоры не найдены'}
            description={
              realContracts.length === 0
                ? 'Создайте первый договор, чтобы начать работу.'
                : 'По текущему поиску, периоду или фильтрам ничего не найдено.'
            }
            action={realContracts.length === 0 ? (
              <button
                type="button"
                onClick={handleAddContract}
                className={cn(
                  "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-all",
                  isDarkMode ? "bg-[#F59E0B] text-[#050505] hover:bg-[#D97706]" : "bg-orange-500 text-white hover:bg-orange-600"
                )}
              >
                <Plus size={17} />
                Новый договор
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('all');
                  setDateFrom('');
                  setDateTo('');
                }}
                className={cn(
                  "rounded-xl px-4 py-2 text-sm font-bold transition-all",
                  isDarkMode ? "bg-[#161616] text-[#F5F5F5] hover:bg-[#1A1A1A]" : "bg-gray-100 text-gray-800 hover:bg-gray-200"
                )}
              >
                Сбросить фильтры
              </button>
            )}
          />
        )}
      </div>

      <div className={cn("flex items-center justify-between text-sm", isDarkMode ? "text-[#8B8B8B]" : "text-gray-500")}>
        <span>
          Страница {safeCurrentPage} из {pageCount} · показано {visibleContracts.length} из {filteredContracts.length}
        </span>
        <div className="flex items-center gap-2">
          <motion.button 
            whileTap={{ scale: 0.95 }}
            className={cn("px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors", isDarkMode ? "hover:bg-[#1A1A1A] text-[#8B8B8B] hover:text-[#F5F5F5]" : "hover:bg-gray-100")} 
            disabled={safeCurrentPage <= 1}
            onClick={() => setCurrentPage(page => clampPage(page - 1, pageCount))}
          >
            Назад
          </motion.button>
          <motion.button 
            whileTap={{ scale: 0.95 }}
            className={cn("px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors", isDarkMode ? "hover:bg-[#1A1A1A] text-[#8B8B8B] hover:text-[#F5F5F5]" : "hover:bg-gray-100")} 
            disabled={safeCurrentPage >= pageCount}
            onClick={() => setCurrentPage(page => clampPage(page + 1, pageCount))}
          >
            Вперёд
          </motion.button>
        </div>
      </div>

      {isModalOpen && (
        <ContractModal 
          isOpen={isModalOpen}
          isDarkMode={isDarkMode} 
          onClose={() => setIsModalOpen(false)} 
          onSave={handleSaveContract}
          initialData={editingContract}
          initialMode={modalMode}
          clients={clients}
          settings={settings}
          contracts={contracts}
          canDeleteContract={canDeleteContracts}
          onDelete={requestDeleteContract}
        />
      )}
      <DocumentPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => {
          setIsPreviewOpen(false);
          setPreviewEmailPayload(null);
          setPreviewPdfBlob(null);
        }}
        pdfBlob={previewPdfBlob}
        fileName={previewFileName}
        isDarkMode={isDarkMode}
        previewMode={previewMode}
        onEmail={handlePreviewEmail}
        isEmailing={isSendingEmail}
      />
      <ConfirmDialog
        isOpen={Boolean(contractPendingDelete)}
        isDarkMode={isDarkMode}
        title="Удалить договор?"
        description={
          contractPendingDelete
            ? `Договор №${contractPendingDelete.number} будет полностью удален из системы. Это действие нельзя отменить.`
            : ''
        }
        confirmLabel="Удалить договор"
        isLoading={isDeletingContract}
        onCancel={() => {
          if (!isDeletingContract) setContractPendingDelete(null);
        }}
        onConfirm={() => {
          if (contractPendingDelete) handleDeleteContract(contractPendingDelete);
        }}
      />
    </div>
  );
}
