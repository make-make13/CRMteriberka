/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Mail } from 'lucide-react';
import { addMonths, format, subMonths } from 'date-fns';
import { ru } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { CC_OBJECTS } from '../../constants';
import { Booking, Contract, BaseType, Client, Settings, ObjectDefinition } from '../../types';
import * as XLSX from 'xlsx';
import { useToast } from '../../context/ToastContext';
import {
  getHotelCalendarPeriodDays,
  getVisibleBookingSpan,
  type HotelCalendarPeriod,
} from '../../utils/hotelCalendarGrid';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ChessboardProps {
  isDarkMode: boolean;
  contracts: Contract[];
  clients: Client[];
  settings: Settings;
  onNewBooking?: (objectId: string, date: Date, baseType: BaseType) => void;
  onEditContract?: (contractId: string, mode?: 'view' | 'edit') => void;
}

type IndexedBooking = Booking & { contract: Contract };

const PERIODS: { id: HotelCalendarPeriod; label: string }[] = [
  { id: '1-10', label: '1-10' },
  { id: '11-20', label: '11-20' },
  { id: '21-end', label: '21-конец' },
];

export default function Chessboard({ isDarkMode, contracts, clients, settings, onNewBooking, onEditContract }: ChessboardProps) {
  const { toast } = useToast();
  const activeBase: BaseType = 'chunga-changa';
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(() => new Date());
  const [selectedPeriod, setSelectedPeriod] = useState<HotelCalendarPeriod>('1-10');
  const [selectedCategory, setSelectedCategory] = useState('all');

  const visibleDays = useMemo(
    () => getHotelCalendarPeriodDays(selectedMonth, selectedPeriod),
    [selectedMonth, selectedPeriod],
  );

  const activeContracts = useMemo(() => contracts.filter(c => c.status !== 'cancelled'), [contracts]);
  const clientsById = useMemo(() => new Map(clients.map(client => [client.id, client])), [clients]);
  const contractsById = useMemo(() => new Map(activeContracts.map(contract => [contract.id, contract])), [activeContracts]);

  const roomObjects = useMemo(
    () => CC_OBJECTS.filter(object => object.baseType === activeBase),
    [activeBase],
  );

  const visibleObjects = useMemo(
    () => selectedCategory === 'all' ? roomObjects : roomObjects.filter(object => object.category === selectedCategory),
    [roomObjects, selectedCategory],
  );

  const bookingsByObject = useMemo(() => {
    const index = new Map<string, IndexedBooking[]>();
    for (const contract of activeContracts) {
      if (contract.baseType !== activeBase) continue;
      for (const booking of contract.bookings) {
        if (booking.baseType !== activeBase || booking.type !== 'main') continue;
        const items = index.get(booking.objectId) ?? [];
        items.push({ ...booking, contract });
        index.set(booking.objectId, items);
      }
    }
    return index;
  }, [activeBase, activeContracts]);

  const getBookingStatus = (booking: Booking, contract: Contract): string => {
    if (contract.status === 'pre_booking') {
      return 'pre_booking';
    }
    if (contract.status === 'closed') {
      return 'closed';
    }
    if (contract.status === 'cancelled') {
      return 'cancelled';
    }

    const now = new Date();
    const start = new Date(booking.startTime);
    const end = new Date(booking.endTime);
    const isStaying = now >= start && now <= end;

    if (isStaying) {
      return 'paid'; // Проживает
    }

    return 'signed_not_paid'; // Занят
  };

  const getStatusLabel = (status: string | undefined) => {
    switch (status) {
      case 'pre_booking': return 'Предбронь';
      case 'signed_not_paid': return 'Занят';
      case 'partial_paid': return 'Занят';
      case 'paid': return 'Проживает';
      case 'closed': return 'Закрыт';
      case 'cancelled': return 'Отменён';
      default: return 'Свободен';
    }
  };

  const getClientInfo = (contract: Contract | null | undefined) => {
    if (!contract) return null;
    let name = '';
    let phone = '';

    if (contract.status === 'pre_booking') {
      const commentLines = (contract.comment ?? '').split('\n');
      for (const line of commentLines) {
        if (line.startsWith('Имя: ')) name = line.substring(5);
        else if (line.startsWith('Телефон: ')) phone = line.substring(9);
      }
    } else {
      const client = clientsById.get(contract.clientId);
      if (client) {
        name = client.type === 'physical'
          ? `${client.lastName} ${client.firstName?.[0] ?? ''}.`
          : client.organizationName;
        phone = client.phone;
      }
    }

    if (!name && !phone) return null;
    return { name: name || 'Гость', phone };
  };

  const getRoomName = (object: ObjectDefinition) => object.name;

  const getRoomCategory = (object: ObjectDefinition) => object.category || 'Номер размещения';

  const formatRoomPrice = (price?: number) => (
    price ? `${price.toLocaleString('ru-RU')} ₽/ночь` : ''
  );

  const getRoomMeta = (object: ObjectDefinition) => [
    object.capacity ? `${object.capacity} чел` : '',
    object.seaView ? 'вид на море' : '',
    formatRoomPrice(object.pricePerNight),
  ].filter(Boolean);

  const getStatusClasses = (status: string | undefined) => {
    if (status === 'pre_booking') return 'bg-[#FFE08A] text-[#222421] border-[#FFE08A]';
    if (status === 'signed_not_paid' || status === 'partial_paid') return 'bg-[#F3B2BF] text-[#222421] border-[#F3B2BF]';
    if (status === 'paid') return 'bg-[#8CAFBE] text-[#222421] border-[#8CAFBE]';
    if (status === 'closed') return 'bg-[#6E6964] text-[#F4F1EA] border-[#6E6964]';
    return 'bg-[#2F3330] text-[#B4CDD2] border-[#3D423E]';
  };

  const getBookingForObjectOnDay = (objectId: string, date: Date) => {
    const objectBookings = bookingsByObject.get(objectId) ?? [];
    return objectBookings.find(booking => {
      const span = getVisibleBookingSpan(new Date(booking.startTime), new Date(booking.endTime), [date]);
      return span !== null;
    });
  };

  const getVisibleBookingsForObject = (objectId: string) => {
    const objectBookings = bookingsByObject.get(objectId) ?? [];
    return objectBookings
      .map(booking => {
        const span = getVisibleBookingSpan(new Date(booking.startTime), new Date(booking.endTime), visibleDays);
        return span ? { booking, span } : null;
      })
      .filter((item): item is { booking: IndexedBooking; span: { startIndex: number; daySpan: number } } => item !== null);
  };

  const buildReportWorkbook = () => {
    const monthLabel = format(selectedMonth, 'LLLL yyyy', { locale: ru });
    const periodLabel = visibleDays.length
      ? `${format(visibleDays[0], 'd MMMM', { locale: ru })} - ${format(visibleDays[visibleDays.length - 1], 'd MMMM yyyy', { locale: ru })}`
      : monthLabel;

    const wb = XLSX.utils.book_new();
    const rows = [
      [`Шахматка номеров: ${periodLabel}`],
      ['Большая Медведица'],
      ['Номер', 'Категория', 'Вместимость', 'Вид', 'Цена/ночь', ...visibleDays.map(day => format(day, 'd EEE', { locale: ru }))],
      ...visibleObjects.map(object => [
        getRoomName(object),
        getRoomCategory(object),
        object.capacity ? `${object.capacity} чел` : '',
        object.seaView ? 'вид на море' : '',
        formatRoomPrice(object.pricePerNight),
        ...visibleDays.map(day => {
          const booking = getBookingForObjectOnDay(object.id, day);
          const contract = booking ? contractsById.get(booking.contractId) : null;
          const client = getClientInfo(contract);
          return (contract && booking) ? `${getStatusLabel(getBookingStatus(booking, contract))}${client ? ` - ${client.name}` : ''}` : '';
        }),
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Шахматка');
    return { wb, periodLabel };
  };

  const handleSendEmail = async () => {
    if (!settings.emailForReports) {
      toast('Пожалуйста, укажите Email для отчетов в настройках', 'error');
      return;
    }

    setIsSendingEmail(true);
    try {
      const { wb, periodLabel } = buildReportWorkbook();
      const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });

      const response = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toEmail: settings.emailForReports,
          subject: `Шахматка номеров: ${periodLabel}`,
          htmlBody: `<p>Здравствуйте! Во вложении шахматка номеров за период ${periodLabel}.</p>`,
          attachmentBase64: excelBuffer,
          attachmentName: `Шахматка_${format(selectedMonth, 'yyyy-MM')}_${selectedPeriod}.xlsx`,
        }),
      });

      if (response.ok) {
        toast('Отчет успешно отправлен на ' + settings.emailForReports);
      } else {
        const error = await response.json();
        throw new Error(error.error || 'Ошибка при отправке');
      }
    } catch (e: any) {
      toast('Ошибка при отправке: ' + e.message, 'error');
    } finally {
      setIsSendingEmail(false);
    }
  };

  const handleExportExcel = () => {
    const { wb } = buildReportWorkbook();
    XLSX.writeFile(wb, `Шахматка_${format(selectedMonth, 'yyyy-MM')}_${selectedPeriod}.xlsx`);
  };

  const handleFreeCellClick = (objectId: string, date: Date) => {
    onNewBooking?.(objectId, date, activeBase);
  };

  const handleBookingClick = (contractId: string) => {
    onEditContract?.(contractId, 'view');
  };

  return (
    <div className="flex flex-col gap-6">
      <div className={cn(
        "flex flex-col gap-4 rounded-2xl border p-4",
        isDarkMode ? "bg-[#111111] border-white/10" : "bg-white border-gray-200 shadow-sm",
      )}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <motion.button
                onClick={() => setSelectedMonth(subMonths(selectedMonth, 1))}
                whileTap={{ scale: 0.9 }}
                className={cn(
                  "p-2 rounded-lg transition-all",
                  isDarkMode ? "hover:bg-[#292B28] text-[#B4CDD2] hover:text-[#F4F1EA]" : "hover:bg-gray-100 text-gray-600",
                )}
              >
                <ChevronLeft size={20} />
              </motion.button>
              <h2 className="text-xl font-bold min-w-[180px] text-center capitalize">
                {format(selectedMonth, 'LLLL yyyy', { locale: ru })}
              </h2>
              <motion.button
                onClick={() => setSelectedMonth(addMonths(selectedMonth, 1))}
                whileTap={{ scale: 0.9 }}
                className={cn(
                  "p-2 rounded-lg transition-all",
                  isDarkMode ? "hover:bg-[#292B28] text-[#B4CDD2] hover:text-[#F4F1EA]" : "hover:bg-gray-100 text-gray-600",
                )}
              >
                <ChevronRight size={20} />
              </motion.button>
            </div>

            <div className={cn(
              "flex items-center rounded-xl p-1",
              isDarkMode ? "bg-black/40" : "bg-gray-100",
            )}>
              {PERIODS.map(period => (
                <button
                  key={period.id}
                  onClick={() => setSelectedPeriod(period.id)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                    selectedPeriod === period.id
                      ? "bg-[#D98E2B] text-[#1A1C1B]"
                      : isDarkMode ? "text-[#B4CDD2] hover:text-[#F4F1EA]" : "text-gray-600 hover:text-gray-900",
                  )}
                >
                  {period.label}
                </button>
              ))}
            </div>

            <select
              value={selectedCategory}
              onChange={event => setSelectedCategory(event.target.value)}
              className={cn(
                "h-9 rounded-lg border px-3 text-sm outline-none transition-all",
                isDarkMode ? "bg-[#222421] border-[#3D423E] text-[#F4F1EA] focus:border-[#D98E2B]" : "bg-white border-gray-200 text-gray-800",
              )}
            >
              <option value="all">Все категории</option>
              <option value="Одноместный стандарт">Одноместный стандарт</option>
              <option value="Двухместный стандарт">Двухместный стандарт</option>
              <option value="Джуниор сьют">Джуниор сьют</option>
              <option value="Апартаменты">Апартаменты</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <motion.button
              onClick={handleExportExcel}
              whileTap={{ scale: 0.95 }}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                isDarkMode ? "bg-[#222421] border border-[#3D423E] hover:border-[#B4CDD2] text-[#B4CDD2] hover:text-[#F4F1EA]" : "bg-gray-100 hover:bg-gray-200 text-gray-600",
              )}
            >
              <Download size={18} />
              Экспорт Excel
            </motion.button>
            <motion.button
              onClick={handleSendEmail}
              disabled={isSendingEmail}
              whileTap={{ scale: 0.95 }}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                isDarkMode ? "bg-[#222421] border border-[#3D423E] hover:border-[#B4CDD2] text-[#B4CDD2] hover:text-[#F4F1EA]" : "bg-gray-100 hover:bg-gray-200 text-gray-600",
                isSendingEmail && "opacity-50 cursor-not-allowed",
              )}
            >
              <div className="relative w-5 h-5 flex items-center justify-center">
                <AnimatePresence mode="wait">
                  {isSendingEmail ? (
                    <motion.div
                      key="sending"
                      initial={{ x: -20, y: 10, opacity: 0, scale: 0.5 }}
                      animate={{ x: [0, 20], y: [0, -20], opacity: [1, 0], scale: [1, 0.8] }}
                      transition={{ duration: 0.8, repeat: Infinity, ease: "easeOut" }}
                      className="absolute"
                    >
                      <Mail size={18} className="text-[#8CAFBE]" />
                    </motion.div>
                  ) : (
                    <motion.div key="idle" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}>
                      <Mail size={18} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              {isSendingEmail ? 'Отправка...' : 'Отправить на почту'}
            </motion.button>
          </div>
        </div>

        <div className={cn(
          "flex flex-wrap items-center gap-4 text-xs p-3 rounded-xl border",
          isDarkMode ? "text-[#F4F1EA] bg-white/[0.04] border-white/10" : "text-gray-500 bg-gray-50 border-gray-100 shadow-sm"
        )}>
          <div className="flex items-center gap-2"><span className={cn("w-3 h-3 rounded-full border", isDarkMode ? "bg-[#2F3330] border-[#3D423E]" : "bg-white border-gray-300")} />Свободен</div>
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#F3B2BF]" />Занят</div>
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#FFE08A]" />Предбронь</div>
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#8CAFBE]" />Проживает</div>
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#6E6964]" />Закрыт</div>
        </div>
      </div>

      <div className={cn(
        "rounded-2xl border overflow-hidden",
        isDarkMode ? "bg-[#111111] border-white/10" : "bg-white border-gray-200 shadow-sm",
      )}>
        <div className="overflow-x-auto">
          <div className="min-w-[980px]">
            <div className={cn("grid grid-cols-[260px_1fr] border-b", isDarkMode ? "border-[#3D423E]" : "border-gray-200")}>
              <div className={cn(
                "p-3 text-[10px] uppercase tracking-wider font-semibold border-r",
                isDarkMode ? "text-[#B4CDD2] border-[#3D423E] bg-[#111111]" : "text-gray-400 border-gray-100 bg-gray-50/50",
              )}>
                Номера
              </div>
              <div
                className="grid"
                style={{ gridTemplateColumns: `repeat(${visibleDays.length}, minmax(50px, 1fr))` }}
              >
                {visibleDays.map(day => (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      "p-2 text-center border-r last:border-r-0",
                      isDarkMode ? "border-[#3D423E] bg-[#111111]" : "border-gray-100",
                    )}
                  >
                    <div className={cn("text-sm font-black", isDarkMode ? "text-[#F4F1EA]" : "text-gray-900")}>{format(day, 'd', { locale: ru })}</div>
                    <div className={cn("text-[10px] uppercase tracking-wider", isDarkMode ? "text-[#B4CDD2]" : "text-gray-500")}>{format(day, 'EEE', { locale: ru })}</div>
                  </div>
                ))}
              </div>
            </div>

            {visibleObjects.map(object => {
              const visibleBookings = getVisibleBookingsForObject(object.id);

              return (
                <div key={object.id} className={cn("grid grid-cols-[260px_1fr] min-h-[72px] border-b last:border-b-0", isDarkMode ? "border-[#3D423E]" : "border-gray-200")}>
                  <div className={cn(
                    "px-3 py-2.5 border-r flex flex-col justify-center gap-0.5",
                    isDarkMode ? "border-[#3D423E] bg-[#111111]" : "border-gray-100 bg-gray-50/20",
                  )}>
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-black leading-none text-[#F4F1EA]">{getRoomName(object)}</div>
                      {object.seaView && (
                        <span className="text-[9px] font-bold uppercase tracking-wide text-[#8CAFBE]">море</span>
                      )}
                    </div>
                    <div className={cn("text-[11px] font-semibold leading-tight", isDarkMode ? "text-[#B4CDD2]" : "text-gray-400")}>{getRoomCategory(object)}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {object.capacity && (
                        <span className={cn("text-[10px]", isDarkMode ? "text-[#B4CDD2]/60" : "text-gray-500")}>{object.capacity} чел</span>
                      )}
                      {object.pricePerNight && (
                        <span className={cn("text-[11px] font-bold", isDarkMode ? "text-[#D98E2B]/90" : "text-gray-700")}>{formatRoomPrice(object.pricePerNight)}</span>
                      )}
                    </div>
                  </div>

                  <div className="relative">
                    <div
                      className={cn("grid h-full min-h-[72px]", isDarkMode ? "bg-[#0d0d0d]" : "bg-white")}
                      style={{ gridTemplateColumns: `repeat(${visibleDays.length}, minmax(50px, 1fr))` }}
                    >
                      {visibleDays.map(day => {
                        const booking = getBookingForObjectOnDay(object.id, day);
                        return (
                          <button
                            key={day.toISOString()}
                            onClick={() => !booking && handleFreeCellClick(object.id, day)}
                            className={cn(
                              "border-r last:border-r-0 transition-all",
                              isDarkMode ? "border-[#3D423E] hover:bg-[#3D423E]/50" : "border-gray-100 hover:bg-gray-50",
                              booking && "cursor-default",
                            )}
                            aria-label={`${getRoomName(object)}, ${format(day, 'd MMMM yyyy', { locale: ru })}`}
                          />
                        );
                      })}
                    </div>

                    {visibleBookings.map(({ booking, span }) => {
                      const contract = contractsById.get(booking.contractId) ?? booking.contract;
                      const client = getClientInfo(contract);
                      const bookingStatus = getBookingStatus(booking, contract);
                      return (
                        <button
                          key={booking.id}
                          onClick={() => handleBookingClick(booking.contractId)}
                          className={cn(
                            "absolute top-1/2 -translate-y-1/2 h-9 rounded-md border px-2.5 text-left shadow-sm overflow-hidden transition-all hover:brightness-110",
                            getStatusClasses(bookingStatus),
                          )}
                          style={{
                            left: `calc(${(span.startIndex / visibleDays.length) * 100}% + 4px)`,
                            width: `calc(${(span.daySpan / visibleDays.length) * 100}% - 8px)`,
                          }}
                          title={`${getStatusLabel(bookingStatus)}${client ? `: ${client.name}` : ''}`}
                        >
                          <div className="truncate text-xs font-black">{client?.name ?? 'Гость'}</div>
                          <div className="truncate text-[10px] opacity-80">{getStatusLabel(bookingStatus)}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
