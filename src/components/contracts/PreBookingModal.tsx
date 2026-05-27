import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Plus } from 'lucide-react';
import { format, addHours, addDays } from 'date-fns';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { BaseType, Contract, ContractStatus, LeadPrebookingPrefill } from '../../types';
import { CC_OBJECTS, GB_OBJECTS, GB_SERVICES } from '../../constants';
import { validateBookingPeriod } from '../../utils/bookingValidation';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface PreBookingModalProps {
  isOpen: boolean;
  isDarkMode: boolean;
  onClose: () => void;
  onSave: (contract: Contract) => void;
  onOpenContract: () => void;
  onDelete?: (contractId: string) => void;
  prefilledBooking: { objectId: string; date: Date; baseType: BaseType } | null;
  leadPrefill?: LeadPrebookingPrefill | null;
  initialData?: Contract | null;
}

export default function PreBookingModal({
  isOpen,
  isDarkMode,
  onClose,
  onSave,
  onOpenContract,
  onDelete,
  prefilledBooking,
  leadPrefill,
  initialData
}: PreBookingModalProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('+7 ');
  const [email, setEmail] = useState('');
  const [guestsCount, setGuestsCount] = useState('1');
  const [comment, setComment] = useState('');
  const [bookingPrice, setBookingPrice] = useState('0');
  const [selectedObjectId, setSelectedObjectId] = useState('');
  const [showComment, setShowComment] = useState(false);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;
    let digits = value.replace(/\D/g, '');
    
    if (!digits) {
      setPhone('+7 ');
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
    
    setPhone(formatted);
  };

  const handleStartTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newStartTime = e.target.value;
    setStartTime(newStartTime);
    setError(null);
    
    if (newStartTime && startDate) {
      const start = new Date(`${startDate}T${newStartTime}`);
      const end = new Date(`${endDate}T${endTime}`);
      const minHours = isCC ? 3 : 1;
      const minEnd = addHours(start, minHours);
      
      if (end < minEnd) {
        setEndDate(format(minEnd, 'yyyy-MM-dd'));
        setEndTime(format(minEnd, 'HH:mm'));
      }
    }
  };

  const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newStartDate = e.target.value;
    setStartDate(newStartDate);
    setError(null);
    
    if (newStartDate && endDate) {
      const start = new Date(newStartDate);
      const end = new Date(endDate);
      
      if (isGBCottage) {
        const minEnd = addDays(start, 1);
        if (end < minEnd) {
          setEndDate(format(minEnd, 'yyyy-MM-dd'));
        }
      } else {
        const startDateTime = new Date(`${newStartDate}T${startTime}`);
        const endDateTime = new Date(`${endDate}T${endTime}`);
        const minHours = isCC ? 3 : 1;
        const minEnd = addHours(startDateTime, minHours);
        
        if (endDateTime < minEnd) {
          setEndDate(format(minEnd, 'yyyy-MM-dd'));
          setEndTime(format(minEnd, 'HH:mm'));
        }
      }
    }
  };

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        // Parse comment to extract name, phone, email
        const commentLines = initialData.comment.split('\n');
        let parsedName = '';
        let parsedPhone = '+7 ';
        let parsedEmail = '';
        let parsedComment = '';
        
        let commentStartIndex = 0;
        for (let i = 0; i < commentLines.length; i++) {
          const line = commentLines[i];
          if (line.startsWith('Имя: ')) parsedName = line.substring(5);
          else if (line.startsWith('Телефон: ')) parsedPhone = line.substring(9);
          else if (line.startsWith('Email: ')) parsedEmail = line.substring(7);
          else if (line === '') {
            commentStartIndex = i + 1;
            break;
          } else {
            commentStartIndex = i;
            break;
          }
        }
        
        if (commentStartIndex < commentLines.length) {
          parsedComment = commentLines.slice(commentStartIndex).join('\n');
        }

        setName(parsedName);
        setPhone(parsedPhone);
        setEmail(parsedEmail);
        setGuestsCount(initialData.guestsCount.toString());
        setComment(parsedComment);
        setBookingPrice(String(initialData.bookings[0]?.price || initialData.totalAmount || 0));
        setSelectedObjectId(initialData.bookings[0]?.objectId || '');
        setShowComment(!!parsedComment);
        setError(null);

        const booking = initialData.bookings[0];
        if (booking) {
          const start = new Date(booking.startTime);
          const end = new Date(booking.endTime);
          setStartDate(format(start, 'yyyy-MM-dd'));
          setEndDate(format(end, 'yyyy-MM-dd'));
          setStartTime(format(start, 'HH:mm'));
          setEndTime(format(end, 'HH:mm'));
        }
      } else if (leadPrefill) {
        const start = leadPrefill.desiredStartDate ? new Date(`${leadPrefill.desiredStartDate}T${leadPrefill.desiredTime || '14:00'}`) : new Date();
        const fallbackEnd = addDays(start, 1);

        setName(leadPrefill.guestName || 'Гость без имени');
        setPhone(leadPrefill.phone || '+7 ');
        setEmail(leadPrefill.email || '');
        setGuestsCount(leadPrefill.guestsCount ? String(leadPrefill.guestsCount) : '1');
        setComment(leadPrefill.message || '');
        setBookingPrice('0');
        setSelectedObjectId(leadPrefill.objectId || '');
        setShowComment(Boolean(leadPrefill.message));
        setError(null);
        setStartDate(leadPrefill.desiredStartDate || format(start, 'yyyy-MM-dd'));
        setEndDate(leadPrefill.desiredEndDate || format(fallbackEnd, 'yyyy-MM-dd'));
        setStartTime(leadPrefill.desiredTime || '14:00');
        setEndTime('12:00');
      } else if (prefilledBooking) {
        setName('');
        setPhone('+7 ');
        setEmail('');
        setGuestsCount('1');
        setComment('');
        setBookingPrice('0');
        setSelectedObjectId(prefilledBooking.objectId);
        setShowComment(false);
        setError(null);

        const isGBCottage = GB_OBJECTS.some(obj => obj.id === prefilledBooking.objectId);
        const isCC = prefilledBooking.baseType === 'chunga-changa';
        
        if (isGBCottage) {
          setStartDate(format(prefilledBooking.date, 'yyyy-MM-dd'));
          setEndDate(format(addDays(prefilledBooking.date, 1), 'yyyy-MM-dd'));
        } else {
          const start = prefilledBooking.date;
          let end = new Date(start);
          if (isCC) {
            end = addHours(start, 3);
          } else {
            end = addHours(start, 1);
          }
          setStartDate(format(start, 'yyyy-MM-dd'));
          setEndDate(format(end, 'yyyy-MM-dd'));
          setStartTime(format(start, 'HH:mm'));
          setEndTime(format(end, 'HH:mm'));
        }
      }
    }
  }, [isOpen, prefilledBooking, leadPrefill, initialData]);

  if (!isOpen || (!prefilledBooking && !leadPrefill && !initialData)) return null;

  const currentObjectId = initialData ? initialData.bookings[0]?.objectId : selectedObjectId;
  const currentBaseType = initialData ? initialData.baseType : leadPrefill?.baseType || prefilledBooking?.baseType;
  const objectOptions = currentBaseType === 'golubaya-bukhta' ? [...GB_OBJECTS, ...GB_SERVICES] : CC_OBJECTS;

  const isGBCottage = GB_OBJECTS.some(obj => obj.id === currentObjectId);
  const isCC = currentBaseType === 'chunga-changa';
  const formatObjectOptionLabel = (object: typeof objectOptions[number]) => [
    object.name,
    object.category,
    object.capacity ? `${object.capacity} чел` : '',
    object.seaView ? 'вид на море' : '',
    object.pricePerNight ? `${object.pricePerNight.toLocaleString('ru-RU')} ₽/ночь` : '',
  ].filter(Boolean).join(' · ');

  const handleSave = () => {
    const phoneDigits = phone.replace(/\D/g, '');
    if (!name || phoneDigits.length < 11) {
      setError('Пожалуйста, заполните обязательные поля (Имя и корректный Телефон)');
      return;
    }
    if (!currentObjectId) {
      setError('Выберите номер для предброни');
      return;
    }

    const bookingPeriod = validateBookingPeriod({
      isGBCottage,
      isCC,
      startDate,
      endDate,
      startTime,
      endTime,
    });

    if (bookingPeriod.ok === false) {
      setError(bookingPeriod.error);
      return;
    }

    const contractId = initialData ? initialData.id : Math.random().toString(36).substr(2, 9);
    const price = Number(bookingPrice) || 0;

    const newContract: Contract = {
      id: contractId,
      number: initialData ? initialData.number : `ПБ-${format(new Date(), 'yyMMdd-HHmm')}`,
      clientId: initialData ? initialData.clientId : leadPrefill?.clientId || '',
      baseType: currentBaseType!,
      status: 'pre_booking',
      totalAmount: initialData ? initialData.totalAmount : price,
      prepayment: initialData ? initialData.prepayment : 0,
      remainder: initialData ? initialData.remainder : price,
      createdAt: initialData ? initialData.createdAt : new Date().toISOString(),
      dateSigned: initialData ? initialData.dateSigned : format(new Date(), 'yyyy-MM-dd'),
      nextReminderAt: initialData ? initialData.nextReminderAt : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      guestsCount: parseInt(guestsCount) || 1,
      comment: comment,
      bookings: [
        {
          id: initialData?.bookings?.[0]?.id || Math.random().toString(36).substr(2, 9),
          contractId: contractId,
          objectId: currentObjectId!,
          baseType: currentBaseType!,
          type: isGBCottage ? 'main' : (isCC ? 'main' : 'service'),
          startTime: bookingPeriod.startDateTime,
          endTime: bookingPeriod.endDateTime,
          price: initialData?.bookings?.[0]?.price || price
        }
      ]
    };

    newContract.comment = `Имя: ${name}\nТелефон: ${phone}\nEmail: ${email}\n\n${comment}`;

    onSave(newContract);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className={cn(
        "w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col",
        isDarkMode ? "bg-[#1a1a1a] text-white" : "bg-white text-gray-900"
      )}>
        <div className="flex items-center justify-between p-6 pb-4">
          <h2 className="text-xl font-bold">{initialData ? 'Предбронь' : 'Создание предброни'}</h2>
          <motion.button 
            onClick={onClose}
            whileTap={{ scale: 0.95 }}
            className={cn(
              "p-2 rounded-lg transition-colors",
              isDarkMode ? "hover:bg-white/10 text-gray-400" : "hover:bg-gray-100 text-gray-600"
            )}
          >
            <X size={20} />
          </motion.button>
        </div>

        <div className="p-6 pt-0 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm font-medium">
              {error}
            </div>
          )}

          {leadPrefill && (
            <div>
              <label className="block text-xs font-bold mb-1.5">Номер <span className="text-red-500">*</span></label>
              <select
                value={selectedObjectId}
                onChange={event => {
                  setSelectedObjectId(event.target.value);
                  setError(null);
                }}
                className={cn(
                  "w-full px-4 py-2.5 rounded-xl border outline-none transition-all",
                  isDarkMode ? "bg-[#0f0f0f] border-white/10 focus:border-[#eab308]" : "bg-gray-50 border-gray-200 focus:border-[#eab308]"
                )}
              >
                <option value="">Выберите номер</option>
                {objectOptions.map(object => (
                  <option key={object.id} value={object.id}>{formatObjectOptionLabel(object)}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold mb-1.5">Имя <span className="text-red-500">*</span></label>
            <input 
              type="text" 
              placeholder="Фамилия И.О."
              value={name}
              onChange={e => setName(e.target.value)}
              className={cn(
                "w-full px-4 py-2.5 rounded-xl border outline-none transition-all",
                isDarkMode ? "bg-[#0f0f0f] border-white/10 focus:border-[#eab308]" : "bg-gray-50 border-gray-200 focus:border-[#eab308]"
              )}
            />
          </div>

          <div>
            <label className="block text-xs font-bold mb-1.5">Телефон <span className="text-red-500">*</span></label>
            <input 
              type="text" 
              value={phone}
              onChange={handlePhoneChange}
              placeholder="+7 (999) 000-00-00"
              maxLength={18}
              className={cn(
                "w-full px-4 py-2.5 rounded-xl border outline-none transition-all",
                isDarkMode ? "bg-[#0f0f0f] border-white/10 focus:border-[#eab308]" : "bg-gray-50 border-gray-200 focus:border-[#eab308]"
              )}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {leadPrefill && (
              <>
                <div>
                  <label className="block text-xs font-bold mb-1.5 uppercase text-gray-500">Дата заезда</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={handleStartDateChange}
                    className={cn(
                      "w-full px-4 py-2.5 rounded-xl border outline-none transition-all",
                      isDarkMode ? "bg-[#0f0f0f] border-white/10 focus:border-[#eab308]" : "bg-gray-50 border-gray-200 focus:border-[#eab308]"
                    )}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1.5 uppercase text-gray-500">Дата выезда</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    className={cn(
                      "w-full px-4 py-2.5 rounded-xl border outline-none transition-all",
                      isDarkMode ? "bg-[#0f0f0f] border-white/10 focus:border-[#eab308]" : "bg-gray-50 border-gray-200 focus:border-[#eab308]"
                    )}
                  />
                </div>
              </>
            )}
            <div>
              <label className="block text-xs font-bold mb-1.5 uppercase text-gray-500">
                {isGBCottage ? 'Дата заезда' : 'Заезд'}
              </label>
              {isGBCottage ? (
                <input 
                  type="date" 
                  value={startDate}
                  onChange={handleStartDateChange}
                  className={cn(
                    "w-full px-4 py-2.5 rounded-xl border outline-none transition-all",
                    isDarkMode ? "bg-[#0f0f0f] border-white/10 focus:border-[#eab308]" : "bg-gray-50 border-gray-200 focus:border-[#eab308]"
                  )}
                />
              ) : (
                <input 
                  type="time" 
                  value={startTime}
                  onChange={handleStartTimeChange}
                  className={cn(
                    "w-full px-4 py-2.5 rounded-xl border outline-none transition-all",
                    isDarkMode ? "bg-[#0f0f0f] border-white/10 focus:border-[#eab308]" : "bg-gray-50 border-gray-200 focus:border-[#eab308]"
                  )}
                />
              )}
            </div>
            <div>
              <label className="block text-xs font-bold mb-1.5 uppercase text-gray-500">
                {isGBCottage ? 'Дата выезда' : 'Выезд'}
              </label>
              {isGBCottage ? (
                <input 
                  type="date" 
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className={cn(
                    "w-full px-4 py-2.5 rounded-xl border outline-none transition-all",
                    isDarkMode ? "bg-[#0f0f0f] border-white/10 focus:border-[#eab308]" : "bg-gray-50 border-gray-200 focus:border-[#eab308]"
                  )}
                />
              ) : (
                <input 
                  type="time" 
                  value={endTime}
                  onChange={e => setEndTime(e.target.value)}
                  className={cn(
                    "w-full px-4 py-2.5 rounded-xl border outline-none transition-all",
                    isDarkMode ? "bg-[#0f0f0f] border-white/10 focus:border-[#eab308]" : "bg-gray-50 border-gray-200 focus:border-[#eab308]"
                  )}
                />
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold mb-1.5">Кол-во человек</label>
              <input 
                type="number" 
                min="1"
                value={guestsCount}
                onChange={e => setGuestsCount(e.target.value)}
                className={cn(
                  "w-full px-4 py-2.5 rounded-xl border outline-none transition-all",
                  isDarkMode ? "bg-[#0f0f0f] border-white/10 focus:border-[#eab308]" : "bg-gray-50 border-gray-200 focus:border-[#eab308]"
                )}
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1.5">Email</label>
              <input 
                type="email" 
                placeholder="email@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className={cn(
                  "w-full px-4 py-2.5 rounded-xl border outline-none transition-all",
                  isDarkMode ? "bg-[#0f0f0f] border-white/10 focus:border-[#eab308]" : "bg-gray-50 border-gray-200 focus:border-[#eab308]"
                )}
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-bold mb-1.5">Цена</label>
              <input
                type="number"
                min="0"
                value={bookingPrice}
                onChange={e => setBookingPrice(e.target.value)}
                className={cn(
                  "w-full px-4 py-2.5 rounded-xl border outline-none transition-all",
                  isDarkMode ? "bg-[#0f0f0f] border-white/10 focus:border-[#eab308]" : "bg-gray-50 border-gray-200 focus:border-[#eab308]"
                )}
              />
            </div>
          </div>

          {!showComment ? (
            <motion.button 
              onClick={() => setShowComment(true)}
              whileTap={{ scale: 0.95 }}
              className="flex items-center gap-2 text-xs font-bold text-gray-400 hover:text-gray-300 uppercase tracking-wider mt-2"
            >
              <Plus size={14} className="text-[#eab308]" />
              Добавить комментарий
            </motion.button>
          ) : (
            <div>
              <label className="block text-xs font-bold mb-1.5 uppercase text-gray-500">Комментарий</label>
              <textarea 
                value={comment}
                onChange={e => setComment(e.target.value)}
                rows={3}
                className={cn(
                  "w-full px-4 py-2.5 rounded-xl border outline-none transition-all resize-none",
                  isDarkMode ? "bg-[#0f0f0f] border-white/10 focus:border-[#eab308]" : "bg-gray-50 border-gray-200 focus:border-[#eab308]"
                )}
              />
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <motion.button 
              onClick={handleSave}
              whileTap={{ scale: 0.95 }}
              className="flex-1 bg-[#ffc107] hover:bg-[#ffca28] text-black font-bold py-3 rounded-xl transition-colors"
            >
              Сохранить
            </motion.button>
            <motion.button 
              onClick={onOpenContract}
              whileTap={{ scale: 0.95 }}
              className={cn(
                "flex-1 font-bold py-3 rounded-xl transition-colors",
                isDarkMode ? "bg-[#0f0f0f] hover:bg-[#1a1a1a] text-white border border-white/10" : "bg-gray-100 hover:bg-gray-200 text-gray-900"
              )}
            >
              Договор
            </motion.button>
          </div>
          
          <div className="flex justify-between items-center mt-2">
            {initialData && onDelete ? (
              <motion.button 
                onClick={() => onDelete(initialData.id)}
                whileTap={{ scale: 0.95 }}
                className="text-sm text-red-500 hover:text-red-400 transition-colors py-2 px-4"
              >
                Удалить предбронь
              </motion.button>
            ) : (
              <div />
            )}
            <motion.button 
              onClick={onClose}
              whileTap={{ scale: 0.95 }}
              className="text-sm text-gray-400 hover:text-gray-300 transition-colors py-2 px-4"
            >
              Отмена
            </motion.button>
          </div>
        </div>
      </div>
    </div>
  );
}
