/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, User, Building2, Phone, Mail, MapPin, Calendar, CreditCard, ShieldAlert, ShieldCheck } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Client, PhysicalClient, LegalClient, ClientType } from '../../types';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ClientModalProps {
  isDarkMode: boolean;
  onClose: () => void;
  onSave: (client: Client) => void;
  initialData?: Client | null;
  mode?: 'create' | 'edit' | 'view';
  setMode?: (mode: 'create' | 'edit' | 'view') => void;
}

interface ClientFormValues {
  id?: string;
  type: ClientType;
  firstName?: string;
  lastName?: string;
  middleName?: string;
  birthDate?: string;
  phone: string;
  email?: string;
  passportSeries?: string;
  passportNumber?: string;
  passportIssuedBy?: string;
  passportIssueDate?: string;
  registrationAddress?: string;
  organizationName?: string;
  inn?: string;
  kpp?: string;
  ogrn?: string;
  legalAddress?: string;
  contactPerson?: string;
  bankName?: string;
  bankAccount?: string;
  corrAccount?: string;
  bik?: string;
  additionalInfo?: string;
  isBlacklisted: boolean;
  createdAt?: string;
}

export default function ClientModal({ isDarkMode, onClose, onSave, initialData, mode = 'create', setMode }: ClientModalProps) {
  const [clientType, setClientType] = useState<ClientType>(initialData?.type || 'physical');
  const [isBlacklisted, setIsBlacklisted] = useState(initialData?.isBlacklisted || false);
  const [showAdditionalInfo, setShowAdditionalInfo] = useState(false);
  const isViewMode = mode === 'view';
  const today = new Date().toISOString().split('T')[0];
  const clientFormId = 'client-modal-form';
  const requiredPhoneRule = {
    validate: (value: string) => value.replace(/\D/g, '').length >= 11 || 'Укажите телефон',
  };
  const renderFieldError = (message?: string) => (
    message ? <p className="text-[10px] font-semibold text-red-500 mt-1">{message}</p> : null
  );

  const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<ClientFormValues>({
    defaultValues: (initialData as any) || {
      type: 'physical',
      isBlacklisted: false,
      phone: '+7 '
    }
  });

  useEffect(() => {
    if (initialData) {
      reset(initialData as any);
      setClientType(initialData.type);
      setIsBlacklisted(initialData.isBlacklisted);
    }
  }, [initialData, reset]);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;
    let digits = value.replace(/\D/g, '');
    
    if (!digits) {
      setValue('phone', '+7 ');
      return;
    }

    // Always strip the first '7' or '8' (the country code we provide)
    if (digits.startsWith('7') || digits.startsWith('8')) {
      digits = digits.substring(1);
    }
    
    // Handle mistakes:
    // 1. Pasted full number (11+ digits starting with 7 or 8)
    if (digits.length >= 11 && (digits.startsWith('7') || digits.startsWith('8'))) {
      digits = digits.substring(1);
    } 
    // 2. Typed 7 or 8 as the first digit
    else if (digits.length === 1 && (digits === '7' || digits === '8')) {
      digits = '';
    }
    // 3. Typed 89 or 79 (clearly meant 9...)
    else if (digits.startsWith('89') || digits.startsWith('79')) {
      digits = digits.substring(1);
    }
    
    // Limit to 10 digits (Russian phone number without country code)
    digits = digits.substring(0, 10);
    
    let formatted = '+7';
    if (digits.length > 0) {
      formatted += ` (${digits.substring(0, 3)}`;
    }
    if (digits.length >= 4) {
      formatted += `) ${digits.substring(3, 6)}`;
    }
    if (digits.length >= 7) {
      formatted += `-${digits.substring(6, 8)}`;
    }
    if (digits.length >= 9) {
      formatted += `-${digits.substring(8, 10)}`;
    }
    
    setValue('phone', formatted);
  };

  const handlePassportSeriesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').substring(0, 4);
    setValue('passportSeries', value);
    if (value.length === 4) {
      const nextField = document.getElementsByName('passportNumber')[0] as HTMLInputElement;
      if (nextField) nextField.focus();
    }
  };

  const handlePassportNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').substring(0, 6);
    setValue('passportNumber', value);
  };

  const handlePassportNumberKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && (e.target as HTMLInputElement).value === '') {
      const prevField = document.getElementsByName('passportSeries')[0] as HTMLInputElement;
      if (prevField) prevField.focus();
    }
  };

  const onSubmit = (data: ClientFormValues) => {
    const common = {
      id: initialData?.id || Math.random().toString(36).substr(2, 9),
      type: clientType,
      isBlacklisted,
      createdAt: initialData?.createdAt || new Date().toISOString(),
      phone: data.phone,
      email: data.email || '',
      additionalInfo: data.additionalInfo || ''
    };

    let client: Client;
    if (clientType === 'physical') {
      client = {
        ...common,
        type: 'physical',
        firstName: data.firstName || '',
        lastName: data.lastName || '',
        middleName: data.middleName,
        birthDate: data.birthDate || '',
        passportSeries: data.passportSeries || '',
        passportNumber: data.passportNumber || '',
        passportIssuedBy: data.passportIssuedBy || '',
        passportIssueDate: data.passportIssueDate || '',
        registrationAddress: data.registrationAddress || '',
      } as PhysicalClient;
    } else {
      client = {
        ...common,
        type: 'legal',
        organizationName: data.organizationName || '',
        inn: data.inn || '',
        kpp: data.kpp || '',
        ogrn: data.ogrn || '',
        legalAddress: data.legalAddress || '',
        contactPerson: data.contactPerson || '',
        bankName: data.bankName || '',
        bankAccount: data.bankAccount || '',
        corrAccount: data.corrAccount || '',
        bik: data.bik || '',
      } as LegalClient;
    }

    onSave(client);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className={cn(
        "w-full max-w-4xl rounded-3xl overflow-hidden shadow-2xl border animate-in fade-in zoom-in duration-200",
        isDarkMode ? "bg-[#222421] border-[#3D423E]" : "bg-white border-gray-200"
      )}>
        {/* Header */}
        <div className={cn("p-6 border-b flex items-center justify-between", isDarkMode ? "border-[#3D423E]" : "border-gray-100")}>
          <h2 className={cn("text-xl font-bold", isDarkMode ? "text-[#F4F1EA]" : "text-gray-900")}>
            {mode === 'create' ? 'Новый гость' : mode === 'edit' ? 'Редактировать гостя' : 'Карточка гостя'}
          </h2>
          <div className="flex items-center gap-2">
            {isViewMode && setMode && (
              <motion.button 
                onClick={() => setMode('edit')}
                whileTap={{ scale: 0.95 }}
                className={cn(
                  "px-4 py-2 rounded-lg text-sm font-medium transition-all border",
                  isDarkMode ? "bg-[#222421] border-[#3D423E] hover:border-[#B4CDD2] text-[#B4CDD2] hover:text-[#F4F1EA]" : "bg-gray-100 border-gray-200 hover:bg-gray-200 text-gray-900"
                )}
              >
                Редактировать
              </motion.button>
            )}
            <motion.button 
              onClick={onClose} 
              whileTap={{ scale: 0.95 }}
              className={cn("p-2 rounded-lg transition-colors", isDarkMode ? "hover:bg-[#3D423E] text-[#B4CDD2] hover:text-[#F4F1EA]" : "hover:bg-gray-100 text-gray-500")}
            >
              <X size={20} />
            </motion.button>
          </div>
        </div>

        {/* Type Toggle */}
        {!isViewMode && (
          <div className="px-6 pt-6">
            <div className={cn("flex p-1 rounded-xl", isDarkMode ? "bg-[#1A1C1B] border border-[#3D423E]" : "bg-black/20")}>
              <motion.button
                type="button"
                onClick={() => setClientType('physical')}
                whileTap={{ scale: 0.95 }}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all",
                  clientType === 'physical' 
                    ? (isDarkMode ? "bg-[#8CAFBE] text-[#222421]" : "bg-white text-black shadow-sm")
                    : (isDarkMode ? "text-[#B4CDD2] hover:text-[#F4F1EA]" : "text-gray-500 hover:text-gray-700")
                )}
              >
                <User size={16} />
                Физлицо
              </motion.button>
              <motion.button
                type="button"
                onClick={() => setClientType('legal')}
                whileTap={{ scale: 0.95 }}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all",
                  clientType === 'legal' 
                    ? (isDarkMode ? "bg-[#8CAFBE] text-[#222421]" : "bg-white text-black shadow-sm")
                    : (isDarkMode ? "text-[#B4CDD2] hover:text-[#F4F1EA]" : "text-gray-500 hover:text-gray-700")
                )}
              >
                <Building2 size={16} />
                Юрлицо
              </motion.button>
            </div>
          </div>
        )}

        <form id={clientFormId} onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {clientType === 'physical' ? (
            <div className="space-y-6">
              {/* Row 1: Name */}
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Фамилия *</label>
                  <input 
                    {...register('lastName', { required: clientType === 'physical' ? 'Укажите фамилию' : false })}
                    disabled={isViewMode}
                    className={cn(
                      "w-full px-4 py-2.5 rounded-xl text-sm outline-none border transition-all",
                      isDarkMode ? "bg-[#1A1C1B] border-[#3D423E] text-[#F4F1EA] placeholder:text-[#B4CDD2]/40 focus:border-[#8CAFBE]/60" : "bg-gray-50 border-gray-200 focus:border-orange-500",
                      isViewMode && "opacity-70 cursor-default",
                      errors.lastName && "border-red-500"
                    )}
                  />
                  {renderFieldError(errors.lastName?.message)}
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Имя *</label>
                  <input 
                    {...register('firstName', { required: clientType === 'physical' ? 'Укажите имя' : false })}
                    disabled={isViewMode}
                    className={cn(
                      "w-full px-4 py-2.5 rounded-xl text-sm outline-none border transition-all",
                      isDarkMode ? "bg-[#1A1C1B] border-[#3D423E] text-[#F4F1EA] placeholder:text-[#B4CDD2]/40 focus:border-[#8CAFBE]/60" : "bg-gray-50 border-gray-200 focus:border-orange-500",
                      isViewMode && "opacity-70 cursor-default",
                      errors.firstName && "border-red-500"
                    )}
                  />
                  {renderFieldError(errors.firstName?.message)}
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Отчество</label>
                  <input 
                    {...register('middleName')}
                    disabled={isViewMode}
                    className={cn(
                      "w-full px-4 py-2.5 rounded-xl text-sm outline-none border transition-all",
                      isDarkMode ? "bg-[#1A1C1B] border-[#3D423E] text-[#F4F1EA] placeholder:text-[#B4CDD2]/40 focus:border-[#8CAFBE]/60" : "bg-gray-50 border-gray-200 focus:border-orange-500",
                      isViewMode && "opacity-70 cursor-default"
                    )}
                  />
                </div>
              </div>

              {/* Row 2: Contacts & DOB */}
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Дата рождения</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                    <input 
                      type="date"
                      {...register('birthDate', {
                        validate: value => !value || value <= today || 'Дата не может быть в будущем'
                      })}
                      max={today}
                      disabled={isViewMode}
                      className={cn(
                        "w-full pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none border transition-all",
                        isDarkMode ? "bg-[#1A1C1B] border-[#3D423E] text-[#F4F1EA] placeholder:text-[#B4CDD2]/40 focus:border-[#8CAFBE]/60" : "bg-gray-50 border-gray-200 focus:border-orange-500",
                        isViewMode && "opacity-70 cursor-default",
                        errors.birthDate && "border-red-500"
                      )}
                    />
                  </div>
                  {errors.birthDate && <p className="text-[10px] text-red-500 mt-1">{errors.birthDate.message}</p>}
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Телефон *</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                    <input 
                      {...register('phone', { 
                        ...requiredPhoneRule,
                        onChange: handlePhoneChange
                      })}
                      disabled={isViewMode}
                      className={cn(
                        "w-full pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none border transition-all",
                        isDarkMode ? "bg-[#1A1C1B] border-[#3D423E] text-[#F4F1EA] placeholder:text-[#B4CDD2]/40 focus:border-[#8CAFBE]/60" : "bg-gray-50 border-gray-200 focus:border-orange-500",
                        isViewMode && "opacity-70 cursor-default",
                        errors.phone && "border-red-500"
                      )}
                    />
                  </div>
                  {renderFieldError(errors.phone?.message)}
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                    <input 
                      {...register('email')}
                      disabled={isViewMode}
                      className={cn(
                        "w-full pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none border transition-all",
                        isDarkMode ? "bg-[#1A1C1B] border-[#3D423E] text-[#F4F1EA] placeholder:text-[#B4CDD2]/40 focus:border-[#8CAFBE]/60" : "bg-gray-50 border-gray-200 focus:border-orange-500",
                        isViewMode && "opacity-70 cursor-default"
                      )}
                    />
                  </div>
                </div>
              </div>

              {/* Row 3 & 4: Passport */}
              <div className={cn("p-4 rounded-2xl border space-y-4", isDarkMode ? "bg-[#292B28] border-[#3D423E]" : "bg-black/20 border-white/5")}>
                <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Паспортные данные</div>
                
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Серия</label>
                    <input 
                      {...register('passportSeries', { onChange: handlePassportSeriesChange })}
                      placeholder="0000"
                      disabled={isViewMode}
                      className={cn(
                        "w-full px-4 py-2.5 rounded-xl text-sm outline-none border transition-all",
                        isDarkMode ? "bg-[#1A1C1B] border-[#3D423E] text-[#F4F1EA] placeholder:text-[#B4CDD2]/40 focus:border-[#8CAFBE]/60" : "bg-gray-50 border-gray-200 focus:border-orange-500",
                        isViewMode && "opacity-70 cursor-default"
                      )}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Номер</label>
                    <input 
                      {...register('passportNumber', { 
                        onChange: handlePassportNumberChange,
                      })}
                      onKeyDown={handlePassportNumberKeyDown}
                      placeholder="000000"
                      disabled={isViewMode}
                      className={cn(
                        "w-full px-4 py-2.5 rounded-xl text-sm outline-none border transition-all",
                        isDarkMode ? "bg-[#1A1C1B] border-[#3D423E] text-[#F4F1EA] placeholder:text-[#B4CDD2]/40 focus:border-[#8CAFBE]/60" : "bg-gray-50 border-gray-200 focus:border-orange-500",
                        isViewMode && "opacity-70 cursor-default"
                      )}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Дата выдачи</label>
                    <input 
                      type="date"
                      {...register('passportIssueDate', {
                        validate: value => !value || value <= today || 'Дата не может быть в будущем'
                      })}
                      max={today}
                      disabled={isViewMode}
                      className={cn(
                        "w-full px-4 py-2.5 rounded-xl text-sm outline-none border transition-all",
                        isDarkMode ? "bg-[#1A1C1B] border-[#3D423E] text-[#F4F1EA] placeholder:text-[#B4CDD2]/40 focus:border-[#8CAFBE]/60" : "bg-gray-50 border-gray-200 focus:border-orange-500",
                        isViewMode && "opacity-70 cursor-default",
                        errors.passportIssueDate && "border-red-500"
                      )}
                    />
                    {errors.passportIssueDate && <p className="text-[10px] text-red-500 mt-1">{errors.passportIssueDate.message}</p>}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Кем выдан</label>
                  <input 
                    {...register('passportIssuedBy')}
                    disabled={isViewMode}
                    className={cn(
                      "w-full px-4 py-2.5 rounded-xl text-sm outline-none border transition-all",
                      isDarkMode ? "bg-[#1A1C1B] border-[#3D423E] text-[#F4F1EA] placeholder:text-[#B4CDD2]/40 focus:border-[#8CAFBE]/60" : "bg-gray-50 border-gray-200 focus:border-orange-500",
                      isViewMode && "opacity-70 cursor-default"
                    )}
                  />
                </div>
              </div>

              {/* Row 5: Address */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Адрес регистрации</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 text-gray-500" size={16} />
                  <textarea 
                    {...register('registrationAddress')}
                    disabled={isViewMode}
                    rows={2}
                    className={cn(
                      "w-full pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none border transition-all resize-none",
                      isDarkMode ? "bg-[#1A1C1B] border-[#3D423E] text-[#F4F1EA] placeholder:text-[#B4CDD2]/40 focus:border-[#8CAFBE]/60" : "bg-gray-50 border-gray-200 focus:border-orange-500",
                      isViewMode && "opacity-70 cursor-default"
                    )}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Название организации *</label>
                <input 
                  {...register('organizationName', { required: clientType === 'legal' ? 'Укажите название организации' : false })}
                  disabled={isViewMode}
                  className={cn(
                    "w-full px-4 py-2.5 rounded-xl text-sm outline-none border transition-all",
                    isDarkMode ? "bg-[#1A1C1B] border-[#3D423E] text-[#F4F1EA] placeholder:text-[#B4CDD2]/40 focus:border-[#8CAFBE]/60" : "bg-gray-50 border-gray-200 focus:border-orange-500",
                    isViewMode && "opacity-70 cursor-default",
                    errors.organizationName && "border-red-500"
                  )}
                />
                {renderFieldError(errors.organizationName?.message)}
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">ИНН *</label>
                <input 
                  {...register('inn', { required: clientType === 'legal' ? 'Укажите ИНН' : false })}
                  disabled={isViewMode}
                  className={cn(
                    "w-full px-4 py-2.5 rounded-xl text-sm outline-none border transition-all",
                    isDarkMode ? "bg-[#1A1C1B] border-[#3D423E] text-[#F4F1EA] placeholder:text-[#B4CDD2]/40 focus:border-[#8CAFBE]/60" : "bg-gray-50 border-gray-200 focus:border-orange-500",
                    isViewMode && "opacity-70 cursor-default",
                    errors.inn && "border-red-500"
                  )}
                />
                {renderFieldError(errors.inn?.message)}
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">КПП</label>
                <input 
                  {...register('kpp')}
                  disabled={isViewMode}
                  className={cn(
                    "w-full px-4 py-2.5 rounded-xl text-sm outline-none border transition-all",
                    isDarkMode ? "bg-[#1A1C1B] border-[#3D423E] text-[#F4F1EA] placeholder:text-[#B4CDD2]/40 focus:border-[#8CAFBE]/60" : "bg-gray-50 border-gray-200 focus:border-orange-500",
                    isViewMode && "opacity-70 cursor-default"
                  )}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">ОГРН</label>
                <input 
                  {...register('ogrn')}
                  disabled={isViewMode}
                  className={cn(
                    "w-full px-4 py-2.5 rounded-xl text-sm outline-none border transition-all",
                    isDarkMode ? "bg-[#1A1C1B] border-[#3D423E] text-[#F4F1EA] placeholder:text-[#B4CDD2]/40 focus:border-[#8CAFBE]/60" : "bg-gray-50 border-gray-200 focus:border-orange-500",
                    isViewMode && "opacity-70 cursor-default"
                  )}
                />
              </div>
              <div className="col-span-2 space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Юридический адрес</label>
                <input 
                  {...register('legalAddress')}
                  disabled={isViewMode}
                  className={cn(
                    "w-full px-4 py-2.5 rounded-xl text-sm outline-none border transition-all",
                    isDarkMode ? "bg-[#1A1C1B] border-[#3D423E] text-[#F4F1EA] placeholder:text-[#B4CDD2]/40 focus:border-[#8CAFBE]/60" : "bg-gray-50 border-gray-200 focus:border-orange-500",
                    isViewMode && "opacity-70 cursor-default"
                  )}
                />
              </div>
              <div className="col-span-2 space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Контактное лицо (подписант)</label>
                <input 
                  {...register('contactPerson')}
                  disabled={isViewMode}
                  className={cn(
                    "w-full px-4 py-2.5 rounded-xl text-sm outline-none border transition-all",
                    isDarkMode ? "bg-[#1A1C1B] border-[#3D423E] text-[#F4F1EA] placeholder:text-[#B4CDD2]/40 focus:border-[#8CAFBE]/60" : "bg-gray-50 border-gray-200 focus:border-orange-500",
                    isViewMode && "opacity-70 cursor-default"
                  )}
                />
              </div>

              <div className={cn("col-span-2 grid grid-cols-2 gap-4 p-4 rounded-2xl border", isDarkMode ? "bg-[#292B28] border-[#3D423E]" : "bg-black/20 border-white/5")}>
                <div className="col-span-2 text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Банковские реквизиты</div>
                <div className="col-span-2 space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Банк</label>
                  <input 
                    {...register('bankName')}
                    disabled={isViewMode}
                    className={cn(
                      "w-full px-4 py-2.5 rounded-xl text-sm outline-none border transition-all",
                      isDarkMode ? "bg-[#1A1C1B] border-[#3D423E] text-[#F4F1EA] placeholder:text-[#B4CDD2]/40 focus:border-[#8CAFBE]/60" : "bg-gray-50 border-gray-200 focus:border-orange-500",
                      isViewMode && "opacity-70 cursor-default"
                    )}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Р/С</label>
                  <input 
                    {...register('bankAccount')}
                    disabled={isViewMode}
                    className={cn(
                      "w-full px-4 py-2.5 rounded-xl text-sm outline-none border transition-all",
                      isDarkMode ? "bg-[#1A1C1B] border-[#3D423E] text-[#F4F1EA] placeholder:text-[#B4CDD2]/40 focus:border-[#8CAFBE]/60" : "bg-gray-50 border-gray-200 focus:border-orange-500",
                      isViewMode && "opacity-70 cursor-default"
                    )}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">К/С</label>
                  <input 
                    {...register('corrAccount')}
                    disabled={isViewMode}
                    className={cn(
                      "w-full px-4 py-2.5 rounded-xl text-sm outline-none border transition-all",
                      isDarkMode ? "bg-[#1A1C1B] border-[#3D423E] text-[#F4F1EA] placeholder:text-[#B4CDD2]/40 focus:border-[#8CAFBE]/60" : "bg-gray-50 border-gray-200 focus:border-orange-500",
                      isViewMode && "opacity-70 cursor-default"
                    )}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">БИК</label>
                  <input 
                    {...register('bik')}
                    disabled={isViewMode}
                    className={cn(
                      "w-full px-4 py-2.5 rounded-xl text-sm outline-none border transition-all",
                      isDarkMode ? "bg-[#1A1C1B] border-[#3D423E] text-[#F4F1EA] placeholder:text-[#B4CDD2]/40 focus:border-[#8CAFBE]/60" : "bg-gray-50 border-gray-200 focus:border-orange-500",
                      isViewMode && "opacity-70 cursor-default"
                    )}
                  />
                </div>
              </div>
              
              {/* Contacts for Legal Entity */}
              <div className="col-span-2 grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Телефон *</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                    <input 
                      {...register('phone', { 
                        ...requiredPhoneRule,
                        onChange: handlePhoneChange
                      })}
                      disabled={isViewMode}
                      className={cn(
                        "w-full pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none border transition-all",
                        isDarkMode ? "bg-[#1A1C1B] border-[#3D423E] text-[#F4F1EA] placeholder:text-[#B4CDD2]/40 focus:border-[#8CAFBE]/60" : "bg-gray-50 border-gray-200 focus:border-orange-500",
                        isViewMode && "opacity-70 cursor-default",
                        errors.phone && "border-red-500"
                      )}
                    />
                  </div>
                  {renderFieldError(errors.phone?.message)}
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                    <input 
                      {...register('email')}
                      disabled={isViewMode}
                      className={cn(
                        "w-full pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none border transition-all",
                        isDarkMode ? "bg-[#1A1C1B] border-[#3D423E] text-[#F4F1EA] placeholder:text-[#B4CDD2]/40 focus:border-[#8CAFBE]/60" : "bg-gray-50 border-gray-200 focus:border-orange-500",
                        isViewMode && "opacity-70 cursor-default"
                      )}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

      {/* Common Fields */}
      <div className={cn("pt-4 border-t space-y-4", isDarkMode ? "border-[#3D423E]" : "border-white/5")}>
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setShowAdditionalInfo(!showAdditionalInfo)}
            className={cn(
              "flex items-center gap-2 text-xs font-bold uppercase tracking-wider transition-colors",
              isDarkMode ? "text-[#B4CDD2]/75 hover:text-[#8CAFBE]" : "text-gray-500 hover:text-orange-500"
            )}
          >
            <span className="w-4 h-4 flex items-center justify-center border border-current rounded-sm">
              {showAdditionalInfo ? '-' : '+'}
            </span>
            Дополнительная информация
          </button>
          
          {showAdditionalInfo && (
            <textarea 
              {...register('additionalInfo')}
              disabled={isViewMode}
              rows={3}
              className={cn(
                "w-full px-4 py-2.5 rounded-xl text-sm outline-none border transition-all resize-none mt-2",
                isDarkMode ? "bg-[#1A1C1B] border-[#3D423E] text-[#F4F1EA] placeholder:text-[#B4CDD2]/40 focus:border-[#8CAFBE]/60" : "bg-gray-50 border-gray-200 focus:border-orange-500",
                isViewMode && "opacity-70 cursor-default"
              )}
            />
          )}
        </div>

        <div>
          <button
            type="button"
            onClick={() => !isViewMode && setIsBlacklisted(!isBlacklisted)}
            disabled={isViewMode}
            className={cn(
              "flex items-center gap-3 p-4 rounded-2xl border transition-all w-full",
              isBlacklisted 
                ? (isDarkMode ? "bg-[#F3B2BF]/15 border-[#F3B2BF]/30 text-[#F3B2BF]" : "bg-red-500/10 border-red-500/20 text-red-500") 
                : (isDarkMode ? "bg-[#1A1C1B] border-[#3D423E] text-[#B4CDD2]/70 hover:bg-[#292B28]" : "bg-gray-50 border-gray-100 text-gray-500"),
              isViewMode && "cursor-default opacity-80"
            )}
          >
            {isBlacklisted ? <ShieldAlert size={20} /> : <ShieldCheck size={20} />}
            <div className="text-left">
              <div className="text-xs font-bold uppercase tracking-wider">Черный список</div>
              <div className="text-[10px] opacity-70 font-medium">Гость {isBlacklisted ? 'находится' : 'не находится'} в черном списке</div>
            </div>
          </button>
        </div>
      </div>
    </form>

    {/* Footer */}
    <div className={cn("p-6 border-t flex items-center justify-end gap-3", isDarkMode ? "border-[#3D423E]" : "border-white/5")}>
      <motion.button 
        type="button"
        onClick={onClose}
        whileTap={{ scale: 0.95 }}
        className={cn(
          "px-6 py-2.5 rounded-xl text-sm font-bold transition-all border",
          isDarkMode ? "bg-[#222421] border-[#3D423E] hover:border-[#B4CDD2] text-[#B4CDD2] hover:text-[#F4F1EA]" : "bg-white border-gray-200 hover:bg-gray-100 text-gray-600"
        )}
      >
        Отмена
      </motion.button>
      {isViewMode ? (
        <motion.button 
          type="button"
          onClick={() => {
            // TODO: Handle create contract from client
            onClose();
          }}
          whileTap={{ scale: 0.95 }}
          className={cn(
            "px-10 py-2.5 rounded-xl text-sm font-bold transition-all",
            isDarkMode ? "bg-[#D98E2B] text-[#1A1C1B] hover:bg-[#F2B35B]" : "bg-orange-500 text-white hover:bg-orange-600"
          )}
        >
          Создать договор
        </motion.button>
      ) : (
        <motion.button 
          type="submit"
          form={clientFormId}
          whileTap={{ scale: 0.95 }}
          className={cn(
            "px-10 py-2.5 rounded-xl text-sm font-bold transition-all",
            isDarkMode ? "bg-[#D98E2B] text-[#1A1C1B] hover:bg-[#F2B35B]" : "bg-orange-500 text-white hover:bg-orange-600"
          )}
        >
          {initialData ? 'Сохранить' : 'Создать'}
        </motion.button>
      )}
    </div>
      </div>
    </div>
  );
}
