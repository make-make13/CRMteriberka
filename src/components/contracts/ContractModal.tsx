import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, Search, Calendar, Clock, Check, ChevronDown, Plus, Trash2, Edit2, FileText, History, BadgePercent } from 'lucide-react';
import { motion } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { format, differenceInDays, differenceInHours, differenceInCalendarDays, addHours, startOfHour, addDays, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Contract, Client, Settings, BaseType, ContractStatus, Booking } from '../../types';
import { GB_OBJECTS, GB_SERVICES } from '../../constants';
import { formatVisibleContractNumber, getNextContractNumberValue, resolveContractNumberCategory, type ContractNumberCategory } from '../../utils/contractNumbers';
import DocumentPreviewModal, { type DocumentPreviewMode } from '../common/DocumentPreviewModal';
import { emailService } from '../../services/emailService';
import { emailSettingsApi, bmDocxApi } from '../../services/localApi';
import { useRoomCatalog } from '../../hooks/useRoomCatalog';
import { buildClientContractHistory } from '../../utils/clientHistory';
import { prepareContractDataFromContract } from '../../utils/contractDocumentData';
import { phoneMatchesSearch } from '../../utils/phoneSearch';
import { useToast } from '../../context/ToastContext';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function formatContractAmount(value: unknown, locales?: Intl.LocalesArgument) {
  const amount = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(amount) ? amount.toLocaleString(locales) : '0';
}

interface ContractModalProps {
  isOpen: boolean;
  isDarkMode: boolean;
  onClose: () => void;
  onSave: (contract: Contract) => void;
  initialData?: Contract | null;
  clients: Client[];
  settings: Settings;
  contracts: Contract[];
  prefilledBooking?: { objectId: string; date: Date; baseType: BaseType };
  initialMode?: 'view' | 'edit';
  canDeleteContract?: boolean;
  onDelete?: (contractId: string) => void;
  isPrebookingConversion?: boolean;
}

interface FormValues {
  number: string;
  dateSigned: string;
  totalAmount: number;
  prepayment: number;
  guestsCount: number;
  comment: string;
  
  ccCottageId: string;
  ccIsDaily: boolean;
  ccCheckInDate: string;
  ccCheckInTime: string;
  ccCheckOutDate: string;
  ccCheckOutTime: string;
  
  gbHasCottage: boolean;
  gbCottageId: string;
  gbCheckInDate: string;
  gbCheckInTime: string;
  gbCheckOutDate: string;
  gbCheckOutTime: string;
  gbDaysCount: number;
  
  gbHasBath: boolean;
  gbBathDate: string;
  gbBathTimeFrom: string;
  gbBathTimeTo: string;
  gbBathCost: number;
  gbBathGuests: number;
  
  gbHasFurako: boolean;
  gbFurakoDate: string;
  gbFurakoTimeFrom: string;
  gbFurakoTimeTo: string;
  gbFurakoCost: number;
  gbFurakoGuests: number;
}

type GeneratedDocumentType = 'print' | 'send';

interface PreviewEmailPayload {
  contractId: string;
  contractNumber: string;
  toEmail: string;
  toName: string;
  documentType: 'Договор' | 'Пакет документов' | 'Счёт и акт';
}

const getContractCategory = (contract: Contract): ContractNumberCategory => {
  const hasMainBooking = contract.bookings.some(b => b.type === 'main');
  const hasBath = contract.bookings.some(b => b.objectId === 'gb-bath');
  const hasFurako = contract.bookings.some(b => b.objectId === 'gb-furako');

  return resolveContractNumberCategory({
    baseType: contract.baseType,
    hasMainBooking,
    hasBath,
    hasFurako,
  });
};

const getHistoryStatusLabel = (status: ContractStatus) => {
  switch (status) {
    case 'pre_booking': return 'Предбронь';
    case 'signed_not_paid': return 'Не оплачен';
    case 'partial_paid': return 'Частично оплачен';
    case 'paid': return 'Оплачен';
    case 'cancelled': return 'Аннулирован';
  }
};

const getHistoryStatusClass = (status: ContractStatus) => {
  switch (status) {
    case 'paid': return 'bg-green-500/10 text-green-500';
    case 'partial_paid': return 'bg-yellow-500/10 text-yellow-500';
    case 'cancelled': return 'bg-red-500/10 text-red-500';
    case 'pre_booking': return 'bg-blue-500/10 text-blue-500';
    default: return 'bg-orange-500/10 text-orange-500';
  }
};

const getHistoryBaseLabel = (baseType: BaseType) => (
  baseType === 'chunga-changa' ? 'Большая Медведица' : 'Архив'
);

const getHistoryObjectLabel = (objectId?: string) => {
  if (!objectId) return 'Без номера';
  if (objectId === 'gb-bath') return 'Баня';
  if (objectId === 'gb-furako') return 'Фурако';
  if (objectId.startsWith('cc-')) return `Номер №${objectId.replace('cc-', '')}`;
  if (objectId.startsWith('gb-')) return `Номер №${objectId.replace('gb-', '').replace('-', '.')}`;
  return objectId;
};

const formatHistoryDate = (value?: string) => {
  if (!value) return 'Дата не указана';
  try {
    const date = parseISO(value);
    if (isNaN(date.getTime())) return 'Дата не указана';
    return format(date, 'dd.MM.yyyy HH:mm');
  } catch {
    return 'Дата не указана';
  }
};

const getStatusFromPayment = (prepayment: number, totalAmount: number): ContractStatus => {
  if (prepayment <= 0) return 'signed_not_paid';
  if (prepayment >= totalAmount) return 'paid';
  return 'partial_paid';
};

export default function ContractModal({
  isOpen,
  isDarkMode,
  onClose,
  onSave,
  initialData,
  clients,
  settings,
  contracts,
  prefilledBooking,
  initialMode = 'edit',
  canDeleteContract = false,
  onDelete,
  isPrebookingConversion = false,
}: ContractModalProps) {
  const { toast } = useToast();
  const baseType = 'chunga-changa' as BaseType;
  const isLegacyGbContract = initialData?.baseType === 'golubaya-bukhta';
  const isConvertingPreBooking = Boolean(isPrebookingConversion && initialData?.status === 'pre_booking');
  const [status, setStatus] = useState<ContractStatus>(
    isConvertingPreBooking
      ? getStatusFromPayment(initialData?.prepayment || 0, initialData?.totalAmount || 0)
      : initialData?.status || 'signed_not_paid'
  );
  const [mode, setMode] = useState<'view' | 'edit'>(initialMode);
  const [clientSearch, setClientSearch] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(initialData?.clientId || null);
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [showComment, setShowComment] = useState(!!initialData?.comment);
  const [showGenerateDropdown, setShowGenerateDropdown] = useState(false);
  const [previewPdfBlob, setPreviewPdfBlob] = useState<Blob | null>(null);
  const [previewFileName, setPreviewFileName] = useState('');
  const [previewMode, setPreviewMode] = useState<DocumentPreviewMode>('print');
  const [previewEmailPayload, setPreviewEmailPayload] = useState<PreviewEmailPayload | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [showClientHistory, setShowClientHistory] = useState(false);

  const [showCcCottageDropdown, setShowCcCottageDropdown] = useState(false);
  const [showGbCottageDropdown, setShowGbCottageDropdown] = useState(false);
  const clientDropdownRef = useRef<HTMLDivElement>(null);
  const ccDropdownRef = useRef<HTMLDivElement>(null);
  const gbDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (clientDropdownRef.current && !clientDropdownRef.current.contains(event.target as Node)) {
        setShowClientDropdown(false);
      }
      if (ccDropdownRef.current && !ccDropdownRef.current.contains(event.target as Node)) {
        setShowCcCottageDropdown(false);
      }
      if (gbDropdownRef.current && !gbDropdownRef.current.contains(event.target as Node)) {
        setShowGbCottageDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const initialCategory = useMemo(() => {
    if (initialData) return getContractCategory(initialData);
    return resolveContractNumberCategory({
      baseType: prefilledBooking?.baseType || 'chunga-changa',
      prefilledObjectId: prefilledBooking?.objectId,
    });
  }, [initialData, prefilledBooking]);

  const initialNextContractNumber = useMemo(() => {
    const relevantContracts = contracts.filter(c =>
      getContractCategory(c) === initialCategory &&
      c.status !== 'pre_booking'
    );
    return getNextContractNumberValue(relevantContracts.map(contract => contract.number), initialCategory);
  }, [contracts, initialCategory]);

  const isPrebookingNumberReplaced = Boolean(isConvertingPreBooking && initialData?.number.startsWith('ПБ-'));
  const initialContractNumber = isPrebookingNumberReplaced
    ? initialNextContractNumber
    : initialData ? formatVisibleContractNumber(initialData.number, initialData.baseType) : initialNextContractNumber;

  const safeFormat = (dateStr: string | undefined, formatStr: string, fallback: string) => {
    if (!dateStr) return fallback;
    try {
      const date = parseISO(dateStr);
      if (isNaN(date.getTime())) return fallback;
      return format(date, formatStr);
    } catch {
      return fallback;
    }
  };

  const { objects: ccObjects } = useRoomCatalog();
  const initialMainBooking = initialData?.bookings.find(b => b.type === 'main');
  const ccObjectOptions = useMemo(() => {
    if (!initialMainBooking || ccObjects.some(object => object.id === initialMainBooking.objectId)) {
      return ccObjects;
    }
    return [
      {
        id: initialMainBooking.objectId,
        name: 'Старый объект / неактивный объект',
        baseType: 'chunga-changa' as BaseType,
        type: 'house' as const,
      },
      ...ccObjects,
    ];
  }, [ccObjects, initialMainBooking]);

  const getCcObjectLabel = (objectId: string) => {
    const object = ccObjectOptions.find(o => o.id === objectId);
    return object ? object.name : 'Старый объект / неактивный объект';
  };


  const { register, handleSubmit, watch, setValue, getValues, formState: { errors } } = useForm<FormValues>({
    defaultValues: {
      number: initialContractNumber,
      dateSigned: initialData?.dateSigned || format(new Date(), 'yyyy-MM-dd'),
      totalAmount: initialData?.totalAmount || 0,
      prepayment: initialData?.prepayment || 0,
      guestsCount: initialData?.guestsCount || 0,
      comment: initialData?.comment || '',

      // CC
      ccCottageId: initialMainBooking?.objectId || (prefilledBooking?.baseType === 'chunga-changa' ? prefilledBooking.objectId : ''),
      ccIsDaily: (() => {
        if (initialData?.baseType === 'chunga-changa' && initialData.bookings.length > 0) {
          const start = parseISO(initialData.bookings[0].startTime);
          const end = parseISO(initialData.bookings[0].endTime);
          if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
            const diffHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
            return diffHours >= 20;
          }
        }
        return false;
      })(),
      ccCheckInDate: initialMainBooking ? safeFormat(initialMainBooking.startTime, "yyyy-MM-dd", format(new Date(), "yyyy-MM-dd")) : (prefilledBooking?.baseType === 'chunga-changa' ? format(prefilledBooking.date, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd")),
      ccCheckInTime: initialMainBooking ? safeFormat(initialMainBooking.startTime, "HH:mm", "14:00") : (prefilledBooking?.baseType === 'chunga-changa' ? format(prefilledBooking.date, "HH:mm") : "14:00"),
      ccCheckOutDate: initialMainBooking ? safeFormat(initialMainBooking.endTime, "yyyy-MM-dd", format(addDays(new Date(), 1), "yyyy-MM-dd")) : (prefilledBooking?.baseType === 'chunga-changa' ? format(addHours(prefilledBooking.date, 3), "yyyy-MM-dd") : format(addDays(new Date(), 1), "yyyy-MM-dd")),
      ccCheckOutTime: initialMainBooking ? safeFormat(initialMainBooking.endTime, "HH:mm", "17:00") : (prefilledBooking?.baseType === 'chunga-changa' ? format(addHours(prefilledBooking.date, 3), "HH:mm") : "17:00"),
      
      // GB
      gbHasCottage: initialData?.baseType === 'golubaya-bukhta'
        ? initialData.bookings.some(b => b.type === 'main')
        : prefilledBooking?.baseType === 'golubaya-bukhta'
          ? !['gb-bath', 'gb-furako'].includes(prefilledBooking.objectId)
          : true,
      gbCottageId: initialData?.baseType === 'golubaya-bukhta' && initialData.bookings.find(b => b.type === 'main')
        ? initialData.bookings.find(b => b.type === 'main')!.objectId
        : (prefilledBooking?.baseType === 'golubaya-bukhta' && !['gb-bath', 'gb-furako'].includes(prefilledBooking.objectId) ? prefilledBooking.objectId : ''),
      gbCheckInDate: initialData?.baseType === 'golubaya-bukhta' && initialData.bookings.find(b => b.type === 'main') ? safeFormat(initialData.bookings.find(b => b.type === 'main')!.startTime, "yyyy-MM-dd", format(new Date(), "yyyy-MM-dd")) : (prefilledBooking?.baseType === 'golubaya-bukhta' ? format(prefilledBooking.date, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd")),
      gbCheckInTime: initialData?.baseType === 'golubaya-bukhta' && initialData.bookings.find(b => b.type === 'main') ? safeFormat(initialData.bookings.find(b => b.type === 'main')!.startTime, "HH:mm", "17:00") : "17:00",
      gbCheckOutDate: initialData?.baseType === 'golubaya-bukhta' && initialData.bookings.find(b => b.type === 'main') ? safeFormat(initialData.bookings.find(b => b.type === 'main')!.endTime, "yyyy-MM-dd", format(addDays(new Date(), 1), "yyyy-MM-dd")) : (prefilledBooking?.baseType === 'golubaya-bukhta' ? format(addDays(prefilledBooking.date, 1), "yyyy-MM-dd") : format(addDays(new Date(), 1), "yyyy-MM-dd")),
      gbCheckOutTime: initialData?.baseType === 'golubaya-bukhta' && initialData.bookings.find(b => b.type === 'main') ? safeFormat(initialData.bookings.find(b => b.type === 'main')!.endTime, "HH:mm", "14:00") : "14:00",
      gbDaysCount: (() => {
        if (initialData?.baseType === 'golubaya-bukhta') {
          const mainBooking = initialData.bookings.find(b => b.type === 'main');
          if (mainBooking) {
            const start = parseISO(mainBooking.startTime);
            const end = parseISO(mainBooking.endTime);
            if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
              return differenceInDays(end, start);
            }
          }
        }
        return 1;
      })(),
      
      gbHasBath: initialData?.baseType === 'golubaya-bukhta' && initialData.bookings.some(b => b.objectId === 'gb-bath')
        || prefilledBooking?.objectId === 'gb-bath',
      gbBathDate: initialData?.baseType === 'golubaya-bukhta' && initialData.bookings.find(b => b.objectId === 'gb-bath') ? safeFormat(initialData.bookings.find(b => b.objectId === 'gb-bath')!.startTime, "yyyy-MM-dd", format(new Date(), "yyyy-MM-dd")) : (prefilledBooking?.objectId === 'gb-bath' ? format(prefilledBooking.date, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd")),
      gbBathTimeFrom: initialData?.baseType === 'golubaya-bukhta' && initialData.bookings.find(b => b.objectId === 'gb-bath') ? safeFormat(initialData.bookings.find(b => b.objectId === 'gb-bath')!.startTime, "HH:mm", '18:00') : '18:00',
      gbBathTimeTo: initialData?.baseType === 'golubaya-bukhta' && initialData.bookings.find(b => b.objectId === 'gb-bath') ? safeFormat(initialData.bookings.find(b => b.objectId === 'gb-bath')!.endTime, "HH:mm", '20:00') : '20:00',
      gbBathCost: initialData?.baseType === 'golubaya-bukhta' && initialData.bookings.find(b => b.objectId === 'gb-bath') ? initialData.bookings.find(b => b.objectId === 'gb-bath')!.price || 0 : 0,
      gbBathGuests: 0,
      
      gbHasFurako: initialData?.baseType === 'golubaya-bukhta' && initialData.bookings.some(b => b.objectId === 'gb-furako')
        || prefilledBooking?.objectId === 'gb-furako',
      gbFurakoDate: initialData?.baseType === 'golubaya-bukhta' && initialData.bookings.find(b => b.objectId === 'gb-furako') ? safeFormat(initialData.bookings.find(b => b.objectId === 'gb-furako')!.startTime, "yyyy-MM-dd", format(new Date(), "yyyy-MM-dd")) : (prefilledBooking?.objectId === 'gb-furako' ? format(prefilledBooking.date, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd")),
      gbFurakoTimeFrom: initialData?.baseType === 'golubaya-bukhta' && initialData.bookings.find(b => b.objectId === 'gb-furako') ? safeFormat(initialData.bookings.find(b => b.objectId === 'gb-furako')!.startTime, "HH:mm", '18:00') : '18:00',
      gbFurakoTimeTo: initialData?.baseType === 'golubaya-bukhta' && initialData.bookings.find(b => b.objectId === 'gb-furako') ? safeFormat(initialData.bookings.find(b => b.objectId === 'gb-furako')!.endTime, "HH:mm", '20:00') : '20:00',
      gbFurakoCost: initialData?.baseType === 'golubaya-bukhta' && initialData.bookings.find(b => b.objectId === 'gb-furako') ? initialData.bookings.find(b => b.objectId === 'gb-furako')!.price || 0 : 0,
      gbFurakoGuests: 0,
    }
  });

  const contractNumber = watch('number') || initialContractNumber;
  const totalAmount = watch('totalAmount') || 0;
  const prepayment = watch('prepayment') || 0;
  const remainder = totalAmount - prepayment;

  const ccCottageId = watch('ccCottageId');
  const ccIsDaily = watch('ccIsDaily');
  const ccCheckInDate = watch('ccCheckInDate');
  const ccCheckInTime = watch('ccCheckInTime');
  const ccCheckOutDate = watch('ccCheckOutDate');

  // Количество ночей — производное от дат заезда/выезда
  const [ccNights, setCcNights] = useState<number>(() => {
    if (initialMainBooking?.startTime && initialMainBooking?.endTime) {
      const s = parseISO(initialMainBooking.startTime);
      const e = parseISO(initialMainBooking.endTime);
      const n = differenceInCalendarDays(e, s);
      return n > 0 ? n : 1;
    }
    return 1;
  });

  // Занятые номера ЧЧ для выбранных дат (исключаем отменённые и текущий договор)
  const occupiedRoomIds = useMemo<Set<string>>(() => {
    if (!ccCheckInDate || !ccCheckOutDate) return new Set();
    const newStart = parseISO(ccCheckInDate);
    const newEnd = parseISO(ccCheckOutDate);
    if (isNaN(newStart.getTime()) || isNaN(newEnd.getTime()) || newEnd <= newStart) return new Set();

    const occupied = new Set<string>();
    for (const contract of contracts) {
      if (contract.status === 'cancelled') continue;
      if (initialData && contract.id === initialData.id) continue;
      if (contract.baseType !== 'chunga-changa') continue;
      for (const booking of contract.bookings) {
        if (booking.type !== 'main') continue;
        const existStart = parseISO(booking.startTime);
        const existEnd = parseISO(booking.endTime);
        if (isNaN(existStart.getTime()) || isNaN(existEnd.getTime())) continue;
        // День выезда не считается занятым: existStart < newEnd && existEnd > newStart
        if (existStart < newEnd && existEnd > newStart) {
          occupied.add(booking.objectId);
        }
      }
    }
    return occupied;
  }, [ccCheckInDate, ccCheckOutDate, contracts, initialData]);

  const gbHasCottage = watch('gbHasCottage');
  const gbCottageId = watch('gbCottageId');
  const gbCheckInDate = watch('gbCheckInDate');
  const gbCheckOutDate = watch('gbCheckOutDate');
  const gbDaysCount = watch('gbDaysCount');
  const gbHasBath = watch('gbHasBath');
  const gbHasFurako = watch('gbHasFurako');

  const currentCategory = useMemo(() => resolveContractNumberCategory({
    baseType,
    hasMainBooking: gbHasCottage,
    hasBath: gbHasBath,
    hasFurako: gbHasFurako,
    prefilledObjectId: prefilledBooking?.objectId,
  }), [baseType, gbHasCottage, gbHasBath, gbHasFurako, prefilledBooking?.objectId]);

  const prevCcValues = useRef({
    ccCheckInDate: getValues('ccCheckInDate'),
    ccCheckInTime: getValues('ccCheckInTime'),
    ccIsDaily: getValues('ccIsDaily')
  });

  const prevGbValues = useRef({
    gbCheckInDate: getValues('gbCheckInDate'),
    gbCheckOutDate: getValues('gbCheckOutDate'),
    gbDaysCount: getValues('gbDaysCount')
  });

  // Цены номеров — из того же каталога (ccObjects), что и шахматка/предбронь,
  // чтобы изменения в Настройки → Стоимость номеров были видны везде одинаково.
  const roomPrices = useMemo(
    () => Object.fromEntries(ccObjects.map(o => [o.id, o.pricePerNight ?? 0])),
    [ccObjects],
  );

  // Автоподстановка стоимости: пересчитываем при смене номера или дат
  const prevAutoPriceKey = useRef('');
  useEffect(() => {
    if (mode !== 'edit') return;
    if (!ccCottageId || !ccCheckInDate || !ccCheckOutDate) return;

    const pricePerNight = roomPrices[ccCottageId];
    if (!pricePerNight) return;

    const checkIn = parseISO(ccCheckInDate);
    const checkOut = parseISO(ccCheckOutDate);
    if (isNaN(checkIn.getTime()) || isNaN(checkOut.getTime())) return;

    const nights = differenceInCalendarDays(checkOut, checkIn);
    if (nights <= 0) return;

    const calculatedAmount = pricePerNight * nights;
    const key = `${ccCottageId}|${ccCheckInDate}|${ccCheckOutDate}`;

    // Не перетираем, если комбинация не изменилась
    if (prevAutoPriceKey.current === key) return;
    prevAutoPriceKey.current = key;

    setValue('totalAmount', calculatedAmount);
  }, [ccCottageId, ccCheckInDate, ccCheckOutDate, roomPrices, mode, setValue]);

  // Синхронизируем ccNights при изменении дат заезда/выезда
  useEffect(() => {
    if (baseType !== 'chunga-changa') return;
    if (!ccCheckInDate || !ccCheckOutDate) return;
    const checkIn = parseISO(ccCheckInDate);
    const checkOut = parseISO(ccCheckOutDate);
    if (isNaN(checkIn.getTime()) || isNaN(checkOut.getTime())) return;
    const n = differenceInCalendarDays(checkOut, checkIn);
    if (n > 0) setCcNights(n);
  }, [ccCheckInDate, ccCheckOutDate, baseType]);

  const handleCcNightsChange = (newNights: number) => {
    if (newNights < 1 || !ccCheckInDate) return;
    const checkIn = parseISO(ccCheckInDate);
    if (isNaN(checkIn.getTime())) return;
    setCcNights(newNights);
    const checkOut = addDays(checkIn, newNights);
    setValue('ccCheckOutDate', format(checkOut, 'yyyy-MM-dd'));
    setValue('ccCheckOutTime', '12:00');
  };

  useEffect(() => {
    if (!initialData) {
      const relevantContracts = contracts.filter(c =>
        getContractCategory(c) === currentCategory &&
        c.status !== 'pre_booking'
      );
      const nextNum = getNextContractNumberValue(relevantContracts.map(contract => contract.number), currentCategory);
      if (getValues('number') !== nextNum) {
        setValue('number', nextNum);
      }
    }
  }, [currentCategory, contracts, initialData, setValue, getValues]);

  useEffect(() => {
    if (isConvertingPreBooking) return;
    if (baseType === 'chunga-changa' && ccCottageId !== 'cc-6' && ccCottageId !== 'cc-9') {
      if (getValues('ccIsDaily')) {
        setValue('ccIsDaily', false);
      }
    }
  }, [ccCottageId, baseType, setValue, getValues, isConvertingPreBooking]);

  useEffect(() => {
    if (baseType !== 'chunga-changa') return;

    const isCheckInDateChanged = ccCheckInDate !== prevCcValues.current.ccCheckInDate;
    const isCheckInTimeChanged = ccCheckInTime !== prevCcValues.current.ccCheckInTime;
    const isDailyChanged = ccIsDaily !== prevCcValues.current.ccIsDaily;

    if (!isCheckInDateChanged && !isCheckInTimeChanged && !isDailyChanged) return;

    if (ccCheckInDate) {
      if (ccIsDaily) {
        if (getValues('ccCheckInTime') !== '13:00') {
          setValue('ccCheckInTime', '13:00');
        }
        const checkInDateObj = parseISO(`${ccCheckInDate}T13:00`);
        if (!isNaN(checkInDateObj.getTime())) {
          let daysToAdd = 1;
          if (isCheckInDateChanged && !isDailyChanged) {
             const currentCheckOutDate = getValues('ccCheckOutDate');
             const prevCheckInDate = prevCcValues.current.ccCheckInDate;
             if (currentCheckOutDate && prevCheckInDate) {
               const prevIn = parseISO(prevCheckInDate);
               const currOut = parseISO(currentCheckOutDate);
               if (!isNaN(prevIn.getTime()) && !isNaN(currOut.getTime())) {
                 const diff = differenceInDays(currOut, prevIn);
                 if (diff > 0) daysToAdd = diff;
               }
             }
          }
          const checkOutDateObj = addDays(checkInDateObj, daysToAdd);
          const formattedOutDate = format(checkOutDateObj, "yyyy-MM-dd");
          if (getValues('ccCheckOutDate') !== formattedOutDate) {
            setValue('ccCheckOutDate', formattedOutDate);
          }
          if (getValues('ccCheckOutTime') !== '12:00') {
            setValue('ccCheckOutTime', '12:00');
          }
        }
      } else if (ccCheckInTime) {
        const checkInDateObj = parseISO(`${ccCheckInDate}T${ccCheckInTime}`);
        if (!isNaN(checkInDateObj.getTime())) {
          let hoursToAdd = 3;
          if ((isCheckInDateChanged || isCheckInTimeChanged) && !isDailyChanged) {
             const currentCheckOutDate = getValues('ccCheckOutDate');
             const currentCheckOutTime = getValues('ccCheckOutTime');
             const prevCheckInDate = prevCcValues.current.ccCheckInDate;
             const prevCheckInTime = prevCcValues.current.ccCheckInTime;
             if (currentCheckOutDate && currentCheckOutTime && prevCheckInDate && prevCheckInTime) {
               const prevIn = parseISO(`${prevCheckInDate}T${prevCheckInTime}`);
               const currOut = parseISO(`${currentCheckOutDate}T${currentCheckOutTime}`);
               if (!isNaN(prevIn.getTime()) && !isNaN(currOut.getTime())) {
                 const diff = differenceInHours(currOut, prevIn);
                 if (diff > 0) hoursToAdd = diff;
               }
             }
          }
          const checkOutDateObj = addHours(checkInDateObj, hoursToAdd);
          const formattedOutDate = format(checkOutDateObj, "yyyy-MM-dd");
          const formattedOutTime = format(checkOutDateObj, "HH:mm");
          if (getValues('ccCheckOutDate') !== formattedOutDate) {
            setValue('ccCheckOutDate', formattedOutDate);
          }
          if (getValues('ccCheckOutTime') !== formattedOutTime) {
            setValue('ccCheckOutTime', formattedOutTime);
          }
        }
      }
    }

    prevCcValues.current = { ccCheckInDate, ccCheckInTime, ccIsDaily };
  }, [ccCheckInDate, ccCheckInTime, ccIsDaily, baseType, setValue, getValues]);

  useEffect(() => {
    if (baseType !== 'golubaya-bukhta') return;

    const isCheckInChanged = gbCheckInDate !== prevGbValues.current.gbCheckInDate;
    const isCheckOutChanged = gbCheckOutDate !== prevGbValues.current.gbCheckOutDate;
    const isDaysChanged = gbDaysCount !== prevGbValues.current.gbDaysCount;

    if (!isCheckInChanged && !isCheckOutChanged && !isDaysChanged) return;

    if (isCheckInChanged || isDaysChanged) {
      if (gbCheckInDate && gbDaysCount !== undefined && !isNaN(Number(gbDaysCount))) {
        const checkInDate = parseISO(gbCheckInDate);
        if (!isNaN(checkInDate.getTime())) {
          const checkOutDate = addDays(checkInDate, Number(gbDaysCount));
          const formattedOut = format(checkOutDate, "yyyy-MM-dd");
          if (getValues('gbCheckOutDate') !== formattedOut) {
            setValue('gbCheckOutDate', formattedOut);
          }
        }
      }
    } else if (isCheckOutChanged) {
      if (gbCheckInDate && gbCheckOutDate) {
        const checkInDate = parseISO(gbCheckInDate);
        const checkOutDate = parseISO(gbCheckOutDate);
        if (!isNaN(checkInDate.getTime()) && !isNaN(checkOutDate.getTime())) {
          const days = differenceInCalendarDays(checkOutDate, checkInDate);
          if (days >= 0 && getValues('gbDaysCount') !== days) {
            setValue('gbDaysCount', days);
          }
        }
      }
    }

    prevGbValues.current = { gbCheckInDate, gbCheckOutDate, gbDaysCount };
  }, [gbCheckInDate, gbCheckOutDate, gbDaysCount, baseType, setValue, getValues]);

  useEffect(() => {
    if (status === 'cancelled') return;
    if (status === 'pre_booking' && !selectedClientId) return;

    if (prepayment === 0) {
      setStatus(selectedClientId ? 'signed_not_paid' : 'pre_booking');
    } else if (prepayment >= totalAmount) {
      setStatus('paid');
    } else {
      setStatus('partial_paid');
    }
  }, [totalAmount, prepayment, status, selectedClientId]);

  const filteredClients = useMemo(() => {
    if (!clientSearch) return [];
    const searchLower = clientSearch.toLowerCase();

    return clients.filter(c => {
      const fullName = (c.type === 'physical' ? `${c.lastName} ${c.firstName} ${c.middleName || ''}` : c.organizationName).toLowerCase();
      
      const searchParts = searchLower.split(/\s+/).filter(Boolean);
      const matchesName = searchParts.length > 0 && searchParts.every(part => fullName.includes(part));
      const matchesPhone = phoneMatchesSearch(c.phone, clientSearch);
      
      return matchesName || matchesPhone;
    });
  }, [clientSearch, clients]);

  const selectedClient = clients.find(c => c.id === selectedClientId);
  const clientHistory = useMemo(
    () => buildClientContractHistory(contracts, selectedClientId),
    [contracts, selectedClientId],
  );

  const buildPreviewEmailPayload = (
    contract: Contract,
    client: Client,
    documentType: PreviewEmailPayload['documentType'],
  ): PreviewEmailPayload => ({
    contractId: contract.id,
    contractNumber: contract.number,
    toEmail: client.email || '',
    toName: client.type === 'physical'
      ? `${client.lastName} ${client.firstName}`
      : client.organizationName,
    documentType,
  });

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
    } catch (error: any) {
      console.error('Email sending error:', error);
      let message = error.message || 'Ошибка при отправке email';
      if (message.includes('535 5.7.8')) {
        message = "Яндекс блокирует доступ (535 5.7.8). \n\nКак исправить:\n1. Зайдите в почту, которая указана в SMTP_USER\n2. Настройки -> Почтовые программы\n3. ВКЛЮЧИТЕ галочку 'С сервера smtp.yandex.ru по протоколу SMTP'\n4. Сохраните изменения.";
      }
      toast(message, 'error');
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handleBmInvoiceActGenerate = async (mode: 'send' | 'print') => {
    if (!selectedClient) { toast('Выберите гостя', 'error'); return; }
    if (!initialData?.id) { toast('Сначала сохраните договор, затем сформируйте документ.', 'info'); return; }
    setIsGenerating(true);
    setShowGenerateDropdown(false);
    try {
      const data = getValues();
      const contract = createContractObject(data);
      const contractData = prepareContractDataFromContract(contract, selectedClient);
      const { generateBmInvoiceActPdf } = await import('../../utils/docx/bmSendPackage');
      const pdfBlob = await generateBmInvoiceActPdf(contractData, mode);
      const fileName = mode === 'send'
        ? `Счёт_и_акт_на_отправку_${contract.number}`
        : `Счёт_и_акт_на_печать_${contract.number}`;
      setPreviewMode(mode);
      setPreviewPdfBlob(pdfBlob);
      setPreviewFileName(fileName);
      setPreviewEmailPayload(buildPreviewEmailPayload(contract, selectedClient, 'Счёт и акт'));
      setIsPreviewOpen(true);
    } catch (error: any) {
      console.error('Invoice+act generation error:', error);
      toast(error.message || 'Ошибка при генерации счёта и акта', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateDoc = async (type: GeneratedDocumentType) => {
    if (!selectedClient) {
      toast('Выберите гостя', 'error');
      return;
    }

    setIsGenerating(true);
    setShowGenerateDropdown(false);
    try {
      const data = getValues();
      const contract = createContractObject(data);
      const fileNames = {
        print: `Договор_на_печать_${contract.number}`,
        send: `Пакет_документов_${contract.number}`,
      };

      let pdfBlob: Blob;

      if (isLegacyGbContract) {
        // GB-договор (golubaya-bukhta) — старая PDFMe-генерация
        const contractData = prepareContractDataFromContract(contract, selectedClient);
        const { generatePdfmeContractBlob } = await import('../../utils/pdfmeDocumentGenerator');
        pdfBlob = await generatePdfmeContractBlob(contractData, type);
      } else {
        // БМ-договор (chunga-changa)
        if (!initialData?.id) {
          // Новый, ещё не сохранённый — шаблону нужен ID в БД
          toast('Сначала сохраните договор, затем сформируйте документ.', 'info');
          return;
        }
        // Saved BM contract: use editable DOCX template when available; fall back to code generator if template fails.
        const bmMode = type === 'send' ? 'signed' : 'print';
        const { blob: contractBlob } = await bmDocxApi.downloadBmContract(
          String(initialData.id), bmMode, 'pdf', 'template-fallback',
        );
        if (type === 'send') {
          // «На отправку»: договор (DOCX) + счёт + акт
          const contractData = prepareContractDataFromContract(contract, selectedClient);
          const { generateBmSendPackageBlob } = await import('../../utils/docx/bmSendPackage');
          pdfBlob = await generateBmSendPackageBlob(contractBlob, contractData);
        } else {
          // «На печать»: только договор без печати и подписи
          pdfBlob = contractBlob;
        }
      }

      setPreviewMode(type);
      setPreviewPdfBlob(pdfBlob);
      setPreviewFileName(fileNames[type]);
      setPreviewEmailPayload(buildPreviewEmailPayload(
        contract,
        selectedClient,
        type === 'send' ? 'Пакет документов' : 'Договор',
      ));
      setIsPreviewOpen(true);
    } catch (error: any) {
      console.error('Document generation error:', error);
      toast(error.message || 'Ошибка при генерации документа', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const createContractObject = (data: FormValues): Contract => {
    if (isLegacyGbContract && initialData) {
      return {
        ...initialData,
        number: data.number,
        dateSigned: data.dateSigned,
        clientId: selectedClientId!,
        status,
        totalAmount: data.totalAmount,
        prepayment: data.prepayment,
        remainder,
        guestsCount: data.guestsCount,
        comment: data.comment,
      };
    }

    const bookings: Booking[] = [];
    const contractId = initialData?.id || Math.random().toString(36).substr(2, 9);

    if (baseType === 'chunga-changa') {
      if (data.ccCheckInDate && data.ccCheckInTime && data.ccCheckOutDate && data.ccCheckOutTime) {
        const start = new Date(`${data.ccCheckInDate}T${data.ccCheckInTime}`);
        const end = new Date(`${data.ccCheckOutDate}T${data.ccCheckOutTime}`);
        
        if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
          bookings.push({
            id: initialMainBooking?.id || Math.random().toString(36).substr(2, 9),
            contractId,
            objectId: data.ccCottageId,
            baseType: 'chunga-changa',
            type: 'main',
            startTime: start.toISOString(),
            endTime: end.toISOString(),
            price: data.totalAmount,
          });
        }
      }
    } else {
      if (data.gbHasCottage && data.gbCheckInDate && data.gbCheckInTime && data.gbCheckOutDate && data.gbCheckOutTime) {
        const checkInDate = new Date(`${data.gbCheckInDate}T${data.gbCheckInTime}`);
        const checkOutDate = new Date(`${data.gbCheckOutDate}T${data.gbCheckOutTime}`);

        if (!isNaN(checkInDate.getTime()) && !isNaN(checkOutDate.getTime())) {
          bookings.push({
            id: initialMainBooking?.id || Math.random().toString(36).substr(2, 9),
            contractId,
            objectId: data.gbCottageId,
            baseType: 'golubaya-bukhta',
            type: 'main',
            startTime: checkInDate.toISOString(),
            endTime: checkOutDate.toISOString(),
            price: data.totalAmount - (data.gbHasBath ? data.gbBathCost : 0) - (data.gbHasFurako ? data.gbFurakoCost : 0)
          });
        }
      }

      if (data.gbHasBath && data.gbBathDate && data.gbBathTimeFrom && data.gbBathTimeTo) {
        const initialBathBooking = initialData?.bookings.find(b => b.objectId === 'gb-bath');
        const bathStart = new Date(`${data.gbBathDate}T${data.gbBathTimeFrom}`);
        const bathEnd = new Date(`${data.gbBathDate}T${data.gbBathTimeTo}`);
        if (!isNaN(bathStart.getTime()) && !isNaN(bathEnd.getTime())) {
          bookings.push({
            id: initialBathBooking?.id || Math.random().toString(36).substr(2, 9),
            contractId,
            objectId: 'gb-bath',
            baseType: 'golubaya-bukhta',
            type: 'service',
            startTime: bathStart.toISOString(),
            endTime: bathEnd.toISOString(),
            price: data.gbBathCost
          });
        }
      }

      if (data.gbHasFurako && data.gbFurakoDate && data.gbFurakoTimeFrom && data.gbFurakoTimeTo) {
        const initialFurakoBooking = initialData?.bookings.find(b => b.objectId === 'gb-furako');
        const furakoStart = new Date(`${data.gbFurakoDate}T${data.gbFurakoTimeFrom}`);
        const furakoEnd = new Date(`${data.gbFurakoDate}T${data.gbFurakoTimeTo}`);
        if (!isNaN(furakoStart.getTime()) && !isNaN(furakoEnd.getTime())) {
          bookings.push({
            id: initialFurakoBooking?.id || Math.random().toString(36).substr(2, 9),
            contractId,
            objectId: 'gb-furako',
            baseType: 'golubaya-bukhta',
            type: 'service',
            startTime: furakoStart.toISOString(),
            endTime: furakoEnd.toISOString(),
            price: data.gbFurakoCost
          });
        }
      }
    }

    return {
      id: contractId,
      number: data.number,
      dateSigned: data.dateSigned,
      clientId: selectedClientId!,
      baseType,
      status,
      totalAmount: data.totalAmount,
      prepayment: data.prepayment,
      remainder,
      guestsCount: data.guestsCount,
      comment: data.comment,
      createdAt: initialData?.createdAt || new Date().toISOString(),
      bookings
    };
  };

  const onSubmit = (data: FormValues) => {
    if (!selectedClientId) {
      toast('Выберите гостя', 'error');
      return;
    }
    if (!isLegacyGbContract && baseType === 'chunga-changa' && (!data.ccCottageId || !data.ccCheckInDate || !data.ccCheckOutDate)) {
      toast('Заполните данные бронирования', 'error');
      return;
    }
    if (!isLegacyGbContract && baseType === 'golubaya-bukhta' && data.gbHasCottage && (!data.gbCottageId || !data.gbCheckInDate || !data.gbCheckOutDate)) {
      toast('Заполните данные бронирования номера', 'error');
      return;
    }
    if (!isLegacyGbContract && baseType === 'golubaya-bukhta' && !data.gbHasCottage && !data.gbHasBath && !data.gbHasFurako) {
      toast('Выберите хотя бы одну услугу для бронирования', 'error');
      return;
    }

    const contract = createContractObject(data);
    onSave(contract);
  };

  const handleAnnul = () => {
    setStatus('cancelled');
    const data = getValues();
    const contract = createContractObject(data);
    contract.status = 'cancelled';
    onSave(contract);
  };

  const CustomCheckbox = ({ checked, onChange, label, colorClass, disabled }: { checked: boolean, onChange: (e: any) => void, label: string, colorClass: string, disabled?: boolean }) => (
    <label className={cn("flex items-center gap-3 group", disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer")}>
      <div className={cn(
        "w-5 h-5 rounded flex items-center justify-center transition-all border",
        checked 
          ? cn(colorClass, "border-transparent") 
          : (isDarkMode ? "bg-white/5 border-white/10 group-hover:border-white/20" : "bg-white border-gray-300 group-hover:border-gray-400")
      )}>
        {checked && <Check size={14} className="text-white" />}
      </div>
      <input type="checkbox" className="hidden" checked={checked} onChange={onChange} disabled={disabled} />
      <span className={cn("text-sm font-bold uppercase tracking-wider", checked ? colorClass.replace('bg-', 'text-') : "text-gray-500")}>{label}</span>
    </label>
  );

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className={cn(
        "w-full max-w-4xl rounded-3xl overflow-hidden shadow-2xl border animate-in fade-in zoom-in duration-200 flex flex-col max-h-[90vh]",
        isDarkMode ? "bg-[#111111] border-white/10" : "bg-white border-gray-200"
      )}>
        {/* Header */}
        <div className={cn("p-6 border-b flex items-center justify-between shrink-0", isDarkMode ? "border-[#3D423E]" : "border-gray-200")}>
          <div className="flex items-center gap-6">
            <h2 className="text-xl font-bold">{initialData ? `Договор №${contractNumber}` : 'Новый договор'}</h2>
            
            <div className={cn("flex items-center gap-2 px-4 py-1.5 rounded-lg border", isDarkMode ? "bg-white/[0.05] border-white/10" : "bg-gray-50 border-gray-200")}>
              <div className={cn("w-2 h-2 rounded-full", isDarkMode ? "bg-[#8CAFBE]" : "bg-orange-500")} />
              <span className="text-sm font-medium">Большая Медведица</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            {mode === 'view' && (
              <button 
                onClick={() => setMode('edit')}
                title="Редактировать"
                className={cn(
                  "flex items-center justify-center p-2 rounded-lg transition-all border",
                  isDarkMode ? "bg-[#292B28] border-[#3D423E] hover:border-[#B4CDD2] text-[#8CAFBE]" : "bg-white border-gray-200 hover:bg-gray-50 text-orange-500"
                )}
              >
                <Edit2 size={16} />
              </button>
            )}
            {mode === 'edit' && initialData && status !== 'cancelled' && (
              <button 
                type="button"
                onClick={handleAnnul}
                className={cn(
                  "px-3 py-1 rounded-lg text-[10px] font-bold uppercase transition-all border",
                  isDarkMode ? "bg-red-500/10 border-red-500/20 text-red-500 hover:bg-red-500/20" : "bg-red-50 border-red-200 text-red-600 hover:bg-red-100"
                )}
              >
                Аннулировать
              </button>
            )}
            {canDeleteContract && initialData && onDelete && (
              <button
                type="button"
                onClick={() => onDelete(initialData.id)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5",
                  isDarkMode ? "bg-red-500/15 text-red-300 hover:bg-red-500/25" : "bg-red-50 text-red-700 hover:bg-red-100"
                )}
              >
                <Trash2 size={14} />
                Удалить
              </button>
            )}
            <span className={cn(
              "px-2 py-1 rounded-md text-[10px] font-bold uppercase",
              status === 'paid' ? "bg-green-500/10 text-green-500" : 
              status === 'partial_paid' ? "bg-yellow-500/10 text-yellow-500" :
              status === 'cancelled' ? "bg-red-500/10 text-red-500" :
              "bg-orange-500/10 text-orange-500"
            )}>
              {status === 'paid' ? 'Оплачен' : 
               status === 'partial_paid' ? 'Частично оплачен' : 
               status === 'cancelled' ? 'Аннулирован' :
               'Не оплачен'}
            </span>
            <button onClick={onClose} className={cn("p-2 rounded-lg transition-colors", isDarkMode ? "hover:bg-[#292B28] text-[#B4CDD2]" : "hover:bg-gray-100 text-gray-500")}>
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
          <form id="contract-form" onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <fieldset disabled={mode === 'view'} className="space-y-6 border-none p-0 m-0">
            {isConvertingPreBooking && isPrebookingNumberReplaced && (
              <div className={cn(
                "rounded-xl border px-4 py-3 text-sm font-medium",
                isDarkMode ? "border-orange-500/20 bg-orange-500/10 text-orange-200" : "border-orange-200 bg-orange-50 text-orange-800"
              )}>
                Предбронь будет сохранена как договор. Номер договора обновлён автоматически.
              </div>
            )}
            <div className="flex justify-end gap-6 mb-4">
              <div className="flex items-center gap-2">
                <div className="text-[10px] text-gray-500 uppercase font-bold">№</div>
                <input 
                  {...register('number', { required: true })}
                  disabled={mode === 'view'}
                  className={cn(
                    "w-16 px-2 py-1 rounded-lg text-sm font-bold outline-none border transition-all text-right",
                    isDarkMode ? "bg-white/5 border-white/10 focus:border-orange-500 text-orange-500" : "bg-gray-50 border-gray-200 focus:border-orange-500 text-orange-500"
                  )}
                />
              </div>
              <div className="flex items-center gap-2">
                <div className="text-[10px] text-gray-500 uppercase font-bold">Дата</div>
                <input 
                  type="date"
                  {...register('dateSigned', { required: true })}
                  disabled={mode === 'view'}
                  className={cn(
                    "px-2 py-1 rounded-lg text-sm font-bold outline-none border transition-all",
                    isDarkMode ? "bg-white/5 border-white/10 focus:border-[#D98E2B]" : "bg-gray-50 border-gray-200 focus:border-orange-500"
                  )}
                />
              </div>
            </div>
            {/* Main Info & Cottage Selection */}
            <div className="flex gap-6">
              <section className={cn("space-y-2 relative", baseType === 'chunga-changa' ? "flex-1" : "w-full")} ref={clientDropdownRef}>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Гость *</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                  <input 
                    type="text"
                    placeholder="Поиск по ФИО или телефону..."
                    value={selectedClient ? (selectedClient.type === 'physical' ? `${selectedClient.lastName} ${selectedClient.firstName} ${selectedClient.middleName || ''}` : selectedClient.organizationName) : clientSearch}
                    disabled={mode === 'view'}
                    onChange={(e) => {
                      if (mode === 'view') return;
                      setClientSearch(e.target.value);
                      setSelectedClientId(null);
                      setShowClientDropdown(true);
                    }}
                    onFocus={() => mode === 'edit' && setShowClientDropdown(true)}
                    className={cn(
                      "w-full pl-9 pr-4 py-2 rounded-xl text-sm outline-none border transition-all",
                      isDarkMode ? "bg-white/5 border-white/10 focus:border-[#D98E2B]" : "bg-gray-50 border-gray-200 focus:border-orange-500",
                      selectedClient?.isBlacklisted && "border-red-500/50"
                    )}
                  />
                  {showClientDropdown && filteredClients.length > 0 && (
                    <div className={cn(
                      "absolute top-full left-0 w-full mt-2 rounded-xl border shadow-xl z-[100] max-h-60 overflow-y-auto custom-scrollbar",
                      isDarkMode ? "bg-[#1a1a1a] border-white/10" : "bg-white border-gray-200"
                    )}>
                      {filteredClients.map(client => (
                        <div 
                          key={client.id}
                          onClick={() => {
                            setSelectedClientId(client.id);
                            setShowClientDropdown(false);
                            setClientSearch('');
                          }}
                          className={cn(
                            "px-4 py-3 cursor-pointer border-b last:border-0 transition-colors",
                            isDarkMode ? "hover:bg-white/5 border-white/5" : "hover:bg-gray-50 border-gray-100"
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <div className="font-bold text-sm">
                              {client.type === 'physical' ? `${client.lastName} ${client.firstName} ${client.middleName || ''}` : client.organizationName}
                            </div>
                            {client.isBlacklisted && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/10 text-red-500 uppercase">ЧС</span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">{client.phone}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>

              {/* Cottage Selection (Right Side) - ONLY FOR CC */}
              {baseType === 'chunga-changa' && (
                <section className="flex-1">
                  <div className="space-y-2 relative" ref={ccDropdownRef}>
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Номер *</label>
                      {(ccCottageId === 'cc-6' || ccCottageId === 'cc-9') && (
                        <div className="flex items-center gap-2">
                          <input 
                            type="checkbox" 
                            id="ccIsDaily"
                            {...register('ccIsDaily')}
                            className="w-3 h-3 rounded border-gray-300 text-orange-500 focus:ring-orange-500"
                          />
                          <label htmlFor="ccIsDaily" className="text-[10px] font-bold text-gray-500 uppercase cursor-pointer">На сутки</label>
                        </div>
                      )}
                    </div>
                            {/* Триггер — показывает выбранный номер */}
                            <div
                              className={cn(
                                "w-full px-4 py-2.5 rounded-xl text-sm outline-none border transition-all flex items-center justify-between",
                                mode === 'edit' ? "cursor-pointer" : "cursor-default opacity-70 pointer-events-none",
                                isDarkMode ? "bg-white/5 border-white/10 hover:border-white/20" : "bg-gray-50 border-gray-200 hover:border-gray-300"
                              )}
                              onClick={() => mode === 'edit' && setShowCcCottageDropdown(!showCcCottageDropdown)}
                            >
                              <span>{ccCottageId ? ccObjectOptions.find(o => o.id === ccCottageId)?.name ?? getCcObjectLabel(ccCottageId) : 'Выберите номер'}</span>
                              <ChevronDown size={16} className="text-gray-500" />
                            </div>

                            {/* Компактный инфо-блок под выбранным номером */}
                            {ccCottageId && (() => {
                              const sel = ccObjectOptions.find(o => o.id === ccCottageId);
                              if (!sel) return null;
                              const parts = [
                                sel.category,
                                sel.capacity ? `до ${sel.capacity} гост.` : '',
                                sel.seaView ? 'вид на море' : '',
                                sel.pricePerNight ? `${sel.pricePerNight.toLocaleString('ru-RU')} ₽/ночь` : '',
                              ].filter(Boolean);
                              return (
                                <p className={cn("text-[11px] leading-tight mt-0.5", isDarkMode ? "text-gray-400" : "text-gray-500")}>
                                  {parts.join(' · ')}
                                </p>
                              );
                            })()}

                            {/* Сетка выбора номера */}
                            {showCcCottageDropdown && (
                              <div className={cn(
                                "absolute top-full left-0 w-full mt-2 rounded-xl border shadow-lg z-50 p-3",
                                isDarkMode ? "bg-[#1a1a1a] border-white/10" : "bg-white border-gray-200"
                              )}>
                                <div
                                  className="grid gap-1.5 overflow-y-auto"
                                  style={{ gridTemplateColumns: 'repeat(5, 1fr)', maxHeight: '220px' }}
                                >
                                  {ccObjectOptions.map(obj => {
                                    const isSelected = ccCottageId === obj.id;
                                    const isOccupied = !isSelected && occupiedRoomIds.has(obj.id);
                                    return (
                                      <button
                                        key={obj.id}
                                        type="button"
                                        disabled={isOccupied}
                                        title={isOccupied ? 'Занят на выбранные даты' : undefined}
                                        onClick={() => {
                                          if (isOccupied) return;
                                          setValue('ccCottageId', obj.id);
                                          setShowCcCottageDropdown(false);
                                        }}
                                        className={cn(
                                          "rounded-lg py-2 text-xs font-bold text-center transition-colors",
                                          isSelected
                                            ? "bg-orange-500 text-white"
                                            : isOccupied
                                              ? isDarkMode
                                                ? "bg-white/[0.02] text-gray-600 cursor-not-allowed line-through"
                                                : "bg-gray-50 text-gray-300 cursor-not-allowed line-through"
                                              : isDarkMode
                                                ? "bg-white/5 text-gray-300 hover:bg-white/10"
                                                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                                        )}
                                      >
                                        {obj.name}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                  </div>
                </section>
              )}
            </div>

            {/* Booking Details (Check-in/out) - ONLY FOR CC */}
            {baseType === 'chunga-changa' && (
              <section className="space-y-2">
                <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Время заезда и выезда</h3>
                {/* [дата заезда][время] | [дата выезда][время] | −[N ночей]+ */}
                <div className="flex items-center gap-2 flex-wrap">
                  <input type="date" {...register('ccCheckInDate')} disabled={mode === 'view'} className={cn("w-32 px-3 py-2 rounded-xl text-sm outline-none border", isDarkMode ? "bg-white/5 border-white/10" : "bg-gray-50 border-gray-200")} />
                  <input type="time" {...register('ccCheckInTime')} disabled={mode === 'view'} className={cn("w-24 px-3 py-2 rounded-xl text-sm outline-none border", isDarkMode ? "bg-white/5 border-white/10" : "bg-gray-50 border-gray-200")} />

                  <div className={cn("w-px h-6 self-center", isDarkMode ? "bg-white/10" : "bg-gray-200")} />

                  <input type="date" {...register('ccCheckOutDate')} disabled={mode === 'view'} className={cn("w-32 px-3 py-2 rounded-xl text-sm outline-none border", isDarkMode ? "bg-white/5 border-white/10" : "bg-gray-50 border-gray-200")} />
                  <input type="time" {...register('ccCheckOutTime')} disabled={mode === 'view'} className={cn("w-24 px-3 py-2 rounded-xl text-sm outline-none border", isDarkMode ? "bg-white/5 border-white/10" : "bg-gray-50 border-gray-200")} />

                  <div className={cn("w-px h-6 self-center", isDarkMode ? "bg-white/10" : "bg-gray-200")} />

                  {/* Счётчик ночей */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleCcNightsChange(ccNights - 1)}
                      disabled={mode === 'view' || ccNights <= 1}
                      className={cn(
                        "w-7 h-8 rounded-lg text-sm font-bold flex items-center justify-center transition-colors disabled:opacity-40",
                        isDarkMode ? "bg-white/5 hover:bg-white/10 text-gray-300" : "bg-gray-100 hover:bg-gray-200 text-gray-700"
                      )}
                    >−</button>
                    <input
                      type="number"
                      min={1}
                      value={ccNights}
                      onChange={e => {
                        const v = parseInt(e.target.value, 10);
                        if (!isNaN(v)) handleCcNightsChange(v);
                      }}
                      disabled={mode === 'view'}
                      className={cn(
                        "w-10 h-8 px-1 rounded-lg text-sm text-center outline-none border",
                        isDarkMode ? "bg-white/5 border-white/10 text-white" : "bg-gray-50 border-gray-200 text-gray-900"
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => handleCcNightsChange(ccNights + 1)}
                      disabled={mode === 'view'}
                      className={cn(
                        "w-7 h-8 rounded-lg text-sm font-bold flex items-center justify-center transition-colors disabled:opacity-40",
                        isDarkMode ? "bg-white/5 hover:bg-white/10 text-gray-300" : "bg-gray-100 hover:bg-gray-200 text-gray-700"
                      )}
                    >+</button>
                    <span className={cn("text-xs ml-0.5", isDarkMode ? "text-gray-500" : "text-gray-400")}>ночей</span>
                  </div>
                </div>
              </section>
            )}

            {baseType === 'golubaya-bukhta' && (
              <div className="space-y-6">
                {/* GB Main Cottage */}
                {(mode === 'edit' || gbHasCottage) && (
                  <div className={cn(
                    "p-6 rounded-2xl border relative group transition-all",
                    isDarkMode ? "bg-white/[0.02] border-white/5" : "bg-gray-50 border-gray-100",
                    !gbHasCottage && "opacity-50 grayscale"
                  )}>
                    <div className={cn("flex items-center gap-3", gbHasCottage && "mb-6")}>
                      <CustomCheckbox 
                        checked={gbHasCottage} 
                        onChange={(e) => setValue('gbHasCottage', e.target.checked)} 
                        label="Номер (Основной блок)" 
                        colorClass="bg-blue-500"
                        disabled={mode === 'view'}
                      />
                    </div>
                    {gbHasCottage && (
                      <div className="space-y-6 transition-all">
                        <div className="grid grid-cols-2 gap-6">
                          <div className="space-y-2 relative" ref={gbDropdownRef}>
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Номер *</label>
                            <div 
                              className={cn(
                                "w-full px-4 py-2.5 rounded-xl text-sm outline-none border transition-all flex items-center justify-between",
                                mode === 'edit' ? "cursor-pointer" : "cursor-default opacity-70 pointer-events-none",
                                isDarkMode ? "bg-white/5 border-white/10 hover:border-white/20" : "bg-gray-50 border-gray-200 hover:border-gray-300"
                              )}
                              onClick={() => mode === 'edit' && setShowGbCottageDropdown(!showGbCottageDropdown)}
                            >
                              <span>{gbCottageId ? (GB_OBJECTS.find(o => o.id === gbCottageId)?.name.split('№')[1]?.trim() || GB_OBJECTS.find(o => o.id === gbCottageId)?.name) : 'Выберите номер'}</span>
                              <ChevronDown size={16} className="text-gray-500" />
                            </div>
                            {showGbCottageDropdown && (
                              <div className={cn("absolute top-full left-0 w-full mt-2 rounded-xl border shadow-lg z-50", isDarkMode ? "bg-[#1a1a1a] border-white/10" : "bg-white border-gray-200")}>
                                {GB_OBJECTS.map(obj => (
                                  <div 
                                    key={obj.id} 
                                    className={cn("px-4 py-2 cursor-pointer text-sm", isDarkMode ? "hover:bg-white/5" : "hover:bg-gray-50")}
                                    onClick={() => {
                                      setValue('gbCottageId', obj.id);
                                      setShowGbCottageDropdown(false);
                                    }}
                                  >
                                    {obj.name.split('№')[1]?.trim() || obj.name}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Гостей</label>
                            <input 
                              type="number"
                              {...register('guestsCount', { valueAsNumber: true })}
                              disabled={mode === 'view'}
                              className={cn(
                                "w-full px-4 py-2.5 rounded-xl text-sm outline-none border transition-all",
                                isDarkMode ? "bg-white/5 border-white/10 focus:border-blue-500" : "bg-gray-50 border-gray-200 focus:border-blue-500"
                              )}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-[1fr_1fr_80px] gap-6">
                          <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Заезд</label>
                            <div className="flex items-center gap-2">
                              <input type="date" {...register('gbCheckInDate')} disabled={mode === 'view'} className={cn("flex-1 px-4 py-2 rounded-xl text-sm outline-none border", isDarkMode ? "bg-white/5 border-white/10" : "bg-gray-50 border-gray-200")} />
                              <input type="time" {...register('gbCheckInTime')} disabled={mode === 'view'} className={cn("w-32 px-4 py-2 rounded-xl text-sm outline-none border", isDarkMode ? "bg-white/5 border-white/10" : "bg-gray-50 border-gray-200")} />
                            </div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Выезд</label>
                            <div className="flex items-center gap-2">
                              <input type="date" {...register('gbCheckOutDate')} disabled={mode === 'view'} className={cn("flex-1 px-4 py-2 rounded-xl text-sm outline-none border", isDarkMode ? "bg-white/5 border-white/10" : "bg-gray-50 border-gray-200")} />
                              <input type="time" {...register('gbCheckOutTime')} disabled={mode === 'view'} className={cn("w-32 px-4 py-2 rounded-xl text-sm outline-none border", isDarkMode ? "bg-white/5 border-white/10" : "bg-gray-50 border-gray-200")} />
                            </div>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Дней</label>
                            <input 
                              type="number"
                              {...register('gbDaysCount', { valueAsNumber: true })}
                              disabled={mode === 'view'}
                              className={cn(
                                "w-full px-4 py-2 rounded-xl text-sm outline-none border transition-all",
                                isDarkMode ? "bg-white/5 border-white/10 focus:border-blue-500" : "bg-gray-50 border-gray-200 focus:border-blue-500"
                              )}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Additional Services */}
                {(mode === 'edit' || gbHasBath || gbHasFurako) && (
                  <>
                    <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest border-b border-white/5 pb-2 mt-6">Дополнительные услуги</h3>
                    <div className="grid grid-cols-2 gap-6">
                      {/* Russian Bath */}
                      {(mode === 'edit' || gbHasBath) && (
                        <div className={cn(
                          "p-6 rounded-2xl border transition-all",
                          isDarkMode ? "bg-white/[0.02] border-white/5" : "bg-gray-50 border-gray-100",
                          !gbHasBath && "opacity-50 grayscale"
                        )}>
                          <div className={cn(gbHasBath && "mb-6")}>
                            <CustomCheckbox 
                              checked={gbHasBath} 
                              onChange={(e) => setValue('gbHasBath', e.target.checked)} 
                              label="Русская баня" 
                              colorClass="bg-cyan-500"
                              disabled={mode === 'view'}
                            />
                          </div>
                          {gbHasBath && (
                            <div className="space-y-4 transition-all">
                              <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Дата услуги</label>
                                <input type="date" {...register('gbBathDate')} disabled={mode === 'view'} className={cn("w-full px-4 py-2 rounded-xl text-sm outline-none border", isDarkMode ? "bg-white/5 border-white/10" : "bg-gray-50 border-gray-200")} />
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Время с</label>
                                  <input type="time" {...register('gbBathTimeFrom')} disabled={mode === 'view'} className={cn("w-full px-4 py-2 rounded-xl text-sm outline-none border", isDarkMode ? "bg-white/5 border-white/10" : "bg-gray-50 border-gray-200")} />
                                </div>
                                <div className="space-y-2">
                                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Время по</label>
                                  <input type="time" {...register('gbBathTimeTo')} disabled={mode === 'view'} className={cn("w-full px-4 py-2 rounded-xl text-sm outline-none border", isDarkMode ? "bg-white/5 border-white/10" : "bg-gray-50 border-gray-200")} />
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Furako */}
                      {(mode === 'edit' || gbHasFurako) && (
                        <div className={cn(
                          "p-6 rounded-2xl border transition-all",
                          isDarkMode ? "bg-white/[0.02] border-white/5" : "bg-gray-50 border-gray-100",
                          !gbHasFurako && "opacity-50 grayscale"
                        )}>
                          <div className={cn(gbHasFurako && "mb-6")}>
                            <CustomCheckbox 
                              checked={gbHasFurako} 
                              onChange={(e) => setValue('gbHasFurako', e.target.checked)} 
                              label="Фурако" 
                              colorClass="bg-blue-400"
                              disabled={mode === 'view'}
                            />
                          </div>
                          {gbHasFurako && (
                            <div className="space-y-4 transition-all">
                              <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Дата услуги</label>
                                <input type="date" {...register('gbFurakoDate')} disabled={mode === 'view'} className={cn("w-full px-4 py-2 rounded-xl text-sm outline-none border", isDarkMode ? "bg-white/5 border-white/10" : "bg-gray-50 border-gray-200")} />
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Время с</label>
                                  <input type="time" {...register('gbFurakoTimeFrom')} disabled={mode === 'view'} className={cn("w-full px-4 py-2 rounded-xl text-sm outline-none border", isDarkMode ? "bg-white/5 border-white/10" : "bg-gray-50 border-gray-200")} />
                                </div>
                                <div className="space-y-2">
                                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Время по</label>
                                  <input type="time" {...register('gbFurakoTimeTo')} disabled={mode === 'view'} className={cn("w-full px-4 py-2 rounded-xl text-sm outline-none border", isDarkMode ? "bg-white/5 border-white/10" : "bg-gray-50 border-gray-200")} />
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Finance Section */}
            <section className="space-y-4">
              <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest border-b border-white/5 pb-2">Финансы</h3>
              
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Стоимость проживания (₽) *</label>
                    <input 
                      type="number"
                      {...register('totalAmount', { required: true, valueAsNumber: true })}
                      disabled={mode === 'view'}
                      className={cn(
                        "w-full px-4 py-2.5 rounded-xl text-sm outline-none border transition-all",
                        isDarkMode ? "bg-white/5 border-white/10 focus:border-[#D98E2B]" : "bg-gray-50 border-gray-200 focus:border-orange-500"
                      )}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Внесена предоплата (₽)</label>
                    <input 
                      type="number"
                      {...register('prepayment', { valueAsNumber: true })}
                      disabled={mode === 'view'}
                      className={cn(
                        "w-full px-4 py-2.5 rounded-xl text-sm outline-none border transition-all",
                        isDarkMode ? "bg-white/5 border-white/10 focus:border-[#D98E2B]" : "bg-gray-50 border-gray-200 focus:border-orange-500"
                      )}
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className={cn(
                    "p-6 rounded-2xl border",
                    isDarkMode ? "bg-white/[0.02] border-white/5" : "bg-gray-50 border-gray-100"
                  )}>
                    <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Итоговая стоимость (₽)</div>
                    <div className="text-3xl font-bold mt-1">{formatContractAmount(totalAmount)} ₽</div>
                  </div>
                  <div className={cn(
                    "p-6 rounded-2xl border",
                    isDarkMode ? "bg-orange-500/10 border-orange-500/20" : "bg-orange-50 border-orange-100"
                  )}>
                    <div className="text-[10px] font-bold text-orange-500 uppercase tracking-wider">Остаток к оплате</div>
                    <div className="text-3xl font-bold text-orange-500 mt-1">{formatContractAmount(remainder)} ₽</div>
                  </div>
                </div>
              </div>
            </section>

            {(mode === 'edit' || watch('comment')) && (
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Комментарий</label>
                {mode === 'view' ? (
                  <div className={cn(
                    "w-full px-4 py-2.5 rounded-xl text-sm border",
                    isDarkMode ? "bg-white/5 border-white/10 text-gray-300" : "bg-gray-50 border-gray-200 text-gray-700"
                  )}>
                    {watch('comment')}
                  </div>
                ) : (
                  <textarea 
                    {...register('comment')}
                    rows={3}
                    className={cn(
                      "w-full px-4 py-2.5 rounded-xl text-sm outline-none border transition-all resize-none",
                      isDarkMode ? "bg-white/5 border-white/10 focus:border-[#D98E2B]" : "bg-gray-50 border-gray-200 focus:border-orange-500"
                    )}
                  />
                )}
              </div>
            )}
            </fieldset>

            <section className={cn(
              "rounded-2xl border overflow-hidden",
              isDarkMode ? "bg-white/[0.02] border-white/5" : "bg-gray-50 border-gray-100"
            )}>
              <button
                type="button"
                onClick={() => setShowClientHistory(prev => !prev)}
                className={cn(
                  "w-full flex items-center justify-between gap-4 px-5 py-4 text-left transition-all",
                  isDarkMode ? "hover:bg-white/[0.04]" : "hover:bg-white"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-xl",
                    isDarkMode ? "bg-blue-500/10 text-blue-300" : "bg-blue-50 text-blue-700"
                  )}>
                    <History size={19} />
                  </div>
                  <div>
                    <div className="text-sm font-bold">История гостя</div>
                    <div className={cn("text-xs mt-0.5", isDarkMode ? "text-gray-400" : "text-gray-500")}>
                      {selectedClient
                        ? `${clientHistory.totalContracts} договоров за всё время, ${clientHistory.activeBookingCount} активных`
                        : 'Выберите гостя, чтобы увидеть историю'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {clientHistory.hasLoyaltyHint && (
                    <div className={cn(
                      "hidden sm:flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold",
                      isDarkMode ? "bg-orange-500/15 text-orange-300" : "bg-orange-50 text-orange-700"
                    )}>
                      <BadgePercent size={16} />
                      Можно рассмотреть скидку 10%
                    </div>
                  )}
                  <ChevronDown size={18} className={cn("text-gray-500 transition-transform", showClientHistory && "rotate-180")} />
                </div>
              </button>

              {showClientHistory && (
                <div className={cn(
                  "border-t px-5 py-4",
                  isDarkMode ? "border-white/5" : "border-gray-100"
                )}>
                  {clientHistory.hasLoyaltyHint && (
                    <div className={cn(
                      "mb-4 flex items-start gap-3 rounded-2xl border p-4",
                      isDarkMode ? "bg-orange-500/10 border-orange-500/20 text-orange-100" : "bg-orange-50 border-orange-100 text-orange-900"
                    )}>
                      <BadgePercent size={20} className="mt-0.5 shrink-0 text-orange-500" />
                      <div>
                        <div className="text-sm font-bold">Есть история 5+ бронирований</div>
                        <div className={cn("text-xs mt-1 leading-5", isDarkMode ? "text-orange-100/75" : "text-orange-800/80")}>
                          CRM только подсказывает про возможную скидку. Решение остаётся за менеджером.
                        </div>
                      </div>
                    </div>
                  )}

                  {!selectedClient ? (
                    <div className={cn("py-6 text-center text-sm", isDarkMode ? "text-gray-500" : "text-gray-500")}>
                      История появится после выбора гостя.
                    </div>
                  ) : clientHistory.items.length === 0 ? (
                    <div className={cn("py-6 text-center text-sm", isDarkMode ? "text-gray-500" : "text-gray-500")}>
                      На этого гостя договоры ещё не создавались.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {clientHistory.items.map(item => (
                        <div
                          key={item.contractId}
                          className={cn(
                            "grid grid-cols-[1fr_auto] gap-4 rounded-xl border px-4 py-3",
                            isDarkMode ? "bg-black/20 border-white/5" : "bg-white border-gray-100"
                          )}
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-bold">Договор №{item.contractNumber}</span>
                              <span className={cn("rounded-md px-2 py-0.5 text-[10px] font-bold uppercase", getHistoryStatusClass(item.status))}>
                                {getHistoryStatusLabel(item.status)}
                              </span>
                              <span className={cn("text-xs", isDarkMode ? "text-gray-400" : "text-gray-500")}>
                                {getHistoryBaseLabel(item.baseType)}
                              </span>
                            </div>
                            <div className={cn("mt-1 text-xs leading-5", isDarkMode ? "text-gray-400" : "text-gray-600")}>
                              {getHistoryObjectLabel(item.primaryBooking?.objectId)} · {formatHistoryDate(item.primaryBooking?.startTime)}
                              {item.primaryBooking?.endTime ? ` — ${formatHistoryDate(item.primaryBooking.endTime)}` : ''}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-bold">{formatContractAmount(item.totalAmount, 'ru-RU')} ₽</div>
                            <div className={cn("mt-1 text-[10px] uppercase tracking-wider", isDarkMode ? "text-gray-500" : "text-gray-400")}>
                              {item.bookings.length} брон.
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </section>
          </form>
        </div>

        {/* Footer */}
        <div className={cn("p-6 border-t flex items-center justify-between shrink-0", isDarkMode ? "border-[#3D423E]" : "border-gray-200")}>
          <div className="flex items-center gap-3">
            <div className="relative">
              <button 
                type="button" 
                onClick={() => setShowGenerateDropdown(!showGenerateDropdown)}
                disabled={isGenerating}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all border disabled:opacity-50",
                  isDarkMode ? "bg-[#292B28] border-[#3D423E] hover:border-[#B4CDD2] text-[#B4CDD2]" : "bg-white border-gray-200 hover:bg-gray-50"
                )}
              >
                <FileText size={18} />
                {isGenerating ? 'Формирование...' : 'Сформировать'}
                <ChevronDown size={16} className={cn("transition-transform", showGenerateDropdown && "rotate-180")} />
              </button>

              {showGenerateDropdown && (
                <div className={cn(
                  "absolute bottom-full left-0 mb-2 w-56 rounded-xl border shadow-xl z-[110] overflow-hidden",
                  isDarkMode ? "bg-[#292B28] border-[#3D423E]" : "bg-white border-gray-200"
                )}>
                  <button
                    type="button"
                    onClick={() => handleGenerateDoc('print')}
                    className={cn(
                      "w-full px-4 py-3 text-left text-sm flex items-center gap-3 transition-colors",
                      isDarkMode ? "hover:bg-[#222421] border-b border-[#3D423E]" : "hover:bg-gray-50 border-b border-gray-100"
                    )}
                  >
                    <FileText size={16} className="text-blue-500" />
                    На печать
                  </button>
                  <button
                    type="button"
                    onClick={() => handleGenerateDoc('send')}
                    className={cn(
                      "w-full px-4 py-3 text-left text-sm flex items-center gap-3 transition-colors",
                      isDarkMode ? "hover:bg-[#222421]" : "hover:bg-gray-50",
                      !isLegacyGbContract && (isDarkMode ? "border-b border-[#3D423E]" : "border-b border-gray-100")
                    )}
                  >
                    <FileText size={16} className="text-orange-500" />
                    На отправку
                  </button>
                  {!isLegacyGbContract && (<>
                    <button
                      type="button"
                      onClick={() => handleBmInvoiceActGenerate('print')}
                      className={cn(
                        "w-full px-4 py-3 text-left text-sm flex items-center gap-3 transition-colors",
                        isDarkMode ? "hover:bg-[#222421] border-b border-[#3D423E]" : "hover:bg-gray-50 border-b border-gray-100"
                      )}
                    >
                      <FileText size={16} className="text-blue-400" />
                      Счёт и акт на печать
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBmInvoiceActGenerate('send')}
                      className={cn(
                        "w-full px-4 py-3 text-left text-sm flex items-center gap-3 transition-colors",
                        isDarkMode ? "hover:bg-[#222421]" : "hover:bg-gray-50"
                      )}
                    >
                      <FileText size={16} className="text-orange-400" />
                      Счёт и акт на отправку
                    </button>
                  </>)}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {mode === 'edit' && (
              <>
                <motion.button
                  type="submit"
                  form="contract-form"
                  whileTap={{ scale: 0.95 }}
                  className={cn(
                    "px-10 py-2.5 rounded-xl text-sm font-bold transition-all",
                    isDarkMode ? "bg-[#D98E2B] text-[#1A1C1B] hover:bg-[#F2B35B]" : "bg-orange-500 text-white hover:bg-orange-600"
                  )}
                >
                  Сохранить
                </motion.button>
              </>
            )}
            <motion.button 
              type="button"
              onClick={onClose}
              whileTap={{ scale: 0.95 }}
              className={cn(
                "px-6 py-2.5 rounded-xl text-sm font-bold transition-all",
                isDarkMode ? "hover:bg-[#292B28] text-[#B4CDD2]/60 hover:text-[#B4CDD2]" : "hover:bg-gray-100 text-gray-600"
              )}
            >
              {mode === 'view' ? 'Закрыть' : 'Отмена'}
            </motion.button>
          </div>
        </div>
      </div>

      <DocumentPreviewModal 
        isOpen={isPreviewOpen}
        onClose={() => {
          setIsPreviewOpen(false);
          setPreviewEmailPayload(null);
        }}
        pdfBlob={previewPdfBlob}
        fileName={previewFileName}
        isDarkMode={isDarkMode}
        previewMode={previewMode}
        onEmail={handlePreviewEmail}
        isEmailing={isSendingEmail}
      />
    </div>
  );
}
