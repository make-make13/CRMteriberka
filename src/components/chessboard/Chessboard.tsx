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
  const [selectedObjectId, setSelectedObjectId] = useState('all');

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
    () => selectedObjectId === 'all' ? roomObjects : roomObjects.filter(object => object.id === selectedObjectId),
    [roomObjects, selectedObjectId],
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

  const getStatusLabel = (status: string | undefined) => {
    switch (status) {
      case 'pre_booking': return 'Ожидает';
      case 'signed_not_paid': return 'Занят';
      case 'partial_paid': return 'Частично оплачен';
      case 'paid': return 'Проживает';
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
    if (status === 'pre_booking') return 'bg-blue-500/20 text-blue-100 border-blue-400/40';
    if (status === 'signed_not_paid') return 'bg-orange-500/20 text-orange-100 border-orange-400/40';
    if (status === 'partial_paid') return 'bg-amber-500/20 text-amber-100 border-amber-400/40';
    if (status === 'paid') return 'bg-green-500/20 text-green-100 border-green-400/40';
    return 'bg-white/5 text-gray-300 border-white/10';
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
          return contract ? `${getStatusLabel(contract.status)}${client ? ` - ${client.name}` : ''}` : '';
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
        isDarkMode ? "bg-[#111111] border-white/5" : "bg-white border-gray-200 shadow-sm",
      )}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <motion.button
              onClick={() => setSelectedMonth(subMonths(selectedMonth, 1))}
              whileTap={{ scale: 0.9 }}
              className={cn(
                "p-2 rounded-lg transition-all",
                isDarkMode ? "hover:bg-white/5 text-gray-400" : "hover:bg-gray-100 text-gray-600",
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
                isDarkMode ? "hover:bg-white/5 text-gray-400" : "hover:bg-gray-100 text-gray-600",
              )}
            >
              <ChevronRight size={20} />
            </motion.button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className={cn(
              "flex items-center rounded-xl p-1",
              isDarkMode ? "bg-white/5" : "bg-gray-100",
            )}>
              {PERIODS.map(period => (
                <button
                  key={period.id}
                  onClick={() => setSelectedPeriod(period.id)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                    selectedPeriod === period.id
                      ? "bg-orange-500 text-white"
                      : isDarkMode ? "text-gray-400 hover:text-white" : "text-gray-600 hover:text-gray-900",
                  )}
                >
                  {period.label}
                </button>
              ))}
            </div>

            <select
              value={selectedObjectId}
              onChange={event => setSelectedObjectId(event.target.value)}
              className={cn(
                "h-9 rounded-lg border px-3 text-sm outline-none transition-all",
                isDarkMode ? "bg-white/5 border-white/10 text-gray-200" : "bg-white border-gray-200 text-gray-800",
              )}
            >
              <option value="all">Все номера</option>
              {roomObjects.map(object => (
                <option key={object.id} value={object.id}>{getRoomName(object)}</option>
              ))}
            </select>

            <select
              disabled
              value="all"
              className={cn(
                "h-9 rounded-lg border px-3 text-sm outline-none opacity-50",
                isDarkMode ? "bg-white/5 border-white/10 text-gray-400" : "bg-white border-gray-200 text-gray-500",
              )}
            >
              <option value="all">Все категории</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <motion.button
              onClick={handleExportExcel}
              whileTap={{ scale: 0.95 }}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                isDarkMode ? "bg-white/5 hover:bg-white/10 text-gray-400" : "bg-gray-100 hover:bg-gray-200 text-gray-600",
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
                isDarkMode ? "bg-white/5 hover:bg-white/10 text-gray-400" : "bg-gray-100 hover:bg-gray-200 text-gray-600",
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
                      <Mail size={18} className="text-orange-500" />
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

        <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500">
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-white/10 border border-white/10" />Свободен</div>
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-orange-500/50" />Занят</div>
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-blue-500/50" />Ожидает</div>
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-green-500/50" />Проживает</div>
          <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-gray-600" />Закрыт</div>
        </div>
      </div>

      <div className={cn(
        "rounded-2xl border overflow-hidden",
        isDarkMode ? "bg-[#111111] border-white/5" : "bg-white border-gray-200 shadow-sm",
      )}>
        <div className="overflow-x-auto">
          <div className="min-w-[980px]">
            <div className="grid grid-cols-[220px_1fr] border-b border-white/5">
              <div className={cn(
                "p-3 text-[10px] uppercase tracking-wider font-semibold border-r",
                isDarkMode ? "text-gray-500 border-white/5" : "text-gray-400 border-gray-100",
              )}>
                Номера
              </div>
              <div
                className="grid"
                style={{ gridTemplateColumns: `repeat(${visibleDays.length}, minmax(72px, 1fr))` }}
              >
                {visibleDays.map(day => (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      "p-2 text-center border-r last:border-r-0",
                      isDarkMode ? "border-white/5" : "border-gray-100",
                    )}
                  >
                    <div className="text-sm font-black">{format(day, 'd', { locale: ru })}</div>
                    <div className="text-[10px] uppercase tracking-wider text-gray-500">{format(day, 'EEE', { locale: ru })}</div>
                  </div>
                ))}
              </div>
            </div>

            {visibleObjects.map(object => {
              const visibleBookings = getVisibleBookingsForObject(object.id);

              return (
                <div key={object.id} className="grid grid-cols-[220px_1fr] min-h-[72px] border-b border-white/5 last:border-b-0">
                  <div className={cn(
                    "p-3 border-r flex flex-col justify-center",
                    isDarkMode ? "border-white/5" : "border-gray-100",
                  )}>
                    <div className="flex items-baseline gap-2">
                      <div className="text-sm font-black leading-none">{getRoomName(object)}</div>
                      <div className="min-w-0 truncate text-[11px] font-semibold text-gray-400">{getRoomCategory(object)}</div>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] leading-tight text-gray-500">
                      {getRoomMeta(object).map(item => (
                        <span key={item}>{item}</span>
                      ))}
                    </div>
                  </div>

                  <div className="relative">
                    <div
                      className="grid h-full min-h-[72px]"
                      style={{ gridTemplateColumns: `repeat(${visibleDays.length}, minmax(72px, 1fr))` }}
                    >
                      {visibleDays.map(day => {
                        const booking = getBookingForObjectOnDay(object.id, day);
                        return (
                          <button
                            key={day.toISOString()}
                            onClick={() => !booking && handleFreeCellClick(object.id, day)}
                            className={cn(
                              "border-r last:border-r-0 transition-all",
                              isDarkMode ? "border-white/5 hover:bg-white/[0.03]" : "border-gray-100 hover:bg-gray-50",
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
                      return (
                        <button
                          key={booking.id}
                          onClick={() => handleBookingClick(booking.contractId)}
                          className={cn(
                            "absolute top-1/2 -translate-y-1/2 h-10 rounded-md border px-2.5 text-left shadow-sm overflow-hidden transition-all hover:brightness-110",
                            getStatusClasses(contract.status),
                          )}
                          style={{
                            left: `calc(${(span.startIndex / visibleDays.length) * 100}% + 4px)`,
                            width: `calc(${(span.daySpan / visibleDays.length) * 100}% - 8px)`,
                          }}
                          title={`${getStatusLabel(contract.status)}${client ? `: ${client.name}` : ''}`}
                        >
                          <div className="truncate text-xs font-black">{client?.name ?? 'Гость'}</div>
                          <div className="truncate text-[10px] opacity-80">{getStatusLabel(contract.status)}</div>
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
