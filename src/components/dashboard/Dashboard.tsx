/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  BedDouble,
  Wallet,
  FileText,
  Inbox,
  TrendingUp,
  AlertCircle,
  CalendarCheck,
  CheckCircle2,
  Calendar,
  type LucideIcon
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  startOfMonth,
  endOfMonth,
  parseISO,
  isWithinInterval,
  format,
  startOfDay,
  endOfDay,
  subDays
} from 'date-fns';
import { ru } from 'date-fns/locale';
import type { Client, Contract, Lead, View } from '../../types';
import { CC_OBJECTS, GB_OBJECTS } from '../../constants';
import { leadApi } from '../../services/localApi';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Безопасное форматирование суммы (не падает на null/NaN/legacy-строках). */
function money(value: unknown) {
  const n = typeof value === 'number' ? value : Number(value);
  return `${Number.isFinite(n) ? n.toLocaleString('ru-RU') : '0'} ₽`;
}

function safeDate(value?: string): Date | null {
  if (!value) return null;
  const d = parseISO(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function plural(count: number, one: string, two: string, five: string) {
  const n = Math.abs(count) % 100;
  const n1 = n % 10;
  if (n > 10 && n < 20) return five;
  if (n1 > 1 && n1 < 5) return two;
  if (n1 === 1) return one;
  return five;
}

function getClientShortName(clientId: string, clients: Client[]): string {
  const client = clients.find(c => c.id === clientId);
  if (!client) return '—';
  if (client.type === 'physical') {
    const last = client.lastName || '';
    const first = client.firstName || '';
    const initial = first ? ` ${first[0]}.` : '';
    return `${last}${initial}`.trim() || 'Физическое лицо';
  } else {
    return client.organizationName || 'Юридическое лицо';
  }
}

function getObjectName(objectId: string): string {
  const obj = [...CC_OBJECTS, ...GB_OBJECTS].find(o => o.id === objectId);
  return obj ? obj.name : objectId;
}

function formatEventDate(dateStr: string): string {
  const d = safeDate(dateStr);
  if (!d) return '—';
  return format(d, 'd MMM', { locale: ru });
}

interface DashboardProps {
  isDarkMode: boolean;
  contracts: Contract[];
  clients: Client[];
  onViewChange?: (view: View) => void;
}

type PeriodMode = 'today' | '7days' | 'month' | 'custom';

export default function Dashboard({ isDarkMode, contracts, clients, onViewChange }: DashboardProps) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [periodMode, setPeriodMode] = useState<PeriodMode>('7days');
  
  const [customStart, setCustomStart] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  
  const [customEnd, setCustomEnd] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });

  useEffect(() => {
    let cancelled = false;
    leadApi
      .list()
      .then(fetchedLeads => {
        if (!cancelled) setLeads(fetchedLeads);
      })
      .catch(() => {
        if (!cancelled) setLeads([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Расчёт временного интервала для отчёта
  const dateInterval = useMemo(() => {
    const now = new Date();
    let start = new Date();
    let end = new Date();

    if (periodMode === 'today') {
      start = startOfDay(now);
      end = endOfDay(now);
    } else if (periodMode === '7days') {
      start = startOfDay(subDays(now, 6));
      end = endOfDay(now);
    } else if (periodMode === 'month') {
      start = startOfMonth(now);
      end = endOfMonth(now);
    } else if (periodMode === 'custom') {
      start = startOfDay(safeDate(customStart) || subDays(now, 7));
      end = endOfDay(safeDate(customEnd) || now);
    }

    return { start, end };
  }, [periodMode, customStart, customEnd]);

  // Вычисление ключевых показателей по выбранному периоду
  const periodStats = useMemo(() => {
    const totalRooms = CC_OBJECTS.length + GB_OBJECTS.length; // 20 + 11 = 31

    // Получаем массив дней в интервале
    const daysInInterval: Date[] = [];
    const current = new Date(dateInterval.start);
    while (current <= dateInterval.end) {
      daysInInterval.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }

    // Все бронирования комнат (основные) без учета отмененных
    const mainBookings = contracts
      .filter(c => c.status !== 'cancelled')
      .flatMap(c => (c.bookings || []).filter(b => b.type === 'main'));

    // Подсчет занятых номеро-ночей
    let occupiedNightsCount = 0;
    for (const d of daysInInterval) {
      const dStr = format(d, 'yyyy-MM-dd');
      for (const b of mainBookings) {
        const bStartStr = b.startTime.split('T')[0];
        const bEndStr = b.endTime.split('T')[0];
        if (dStr >= bStartStr && dStr < bEndStr) {
          occupiedNightsCount++;
        }
      }
    }

    const totalAvailableNights = daysInInterval.length * totalRooms;
    const occupancyPct = totalAvailableNights > 0 
      ? Math.round((occupiedNightsCount / totalAvailableNights) * 100) 
      : 0;

    // Договоры, у которых дата заезда (или дата создания) попадает в период
    const contractsInPeriod = contracts.filter(c => {
      const main = (c.bookings || []).find(b => b.type === 'main') || (c.bookings || [])[0];
      const checkIn = main ? safeDate(main.startTime) : safeDate(c.createdAt);
      return checkIn && isWithinInterval(checkIn, { start: dateInterval.start, end: dateInterval.end });
    });

    const activeContractsInPeriod = contractsInPeriod.filter(c => c.status !== 'cancelled' && c.status !== 'pre_booking');

    const arrivalsInPeriod = mainBookings.filter(b => {
      const start = safeDate(b.startTime);
      return start && isWithinInterval(start, { start: dateInterval.start, end: dateInterval.end });
    });

    const departuresInPeriod = mainBookings.filter(b => {
      const end = safeDate(b.endTime);
      return end && isWithinInterval(end, { start: dateInterval.start, end: dateInterval.end });
    });

    // Финансовые показатели по договорам за период
    const revenuePeriod = activeContractsInPeriod.reduce((sum, c) => sum + Number(c.totalAmount || 0), 0);
    const prepaidPeriod = activeContractsInPeriod.reduce((sum, c) => sum + Number(c.prepayment || 0), 0);
    const debtPeriod = activeContractsInPeriod.reduce((sum, c) => sum + Number(c.remainder || 0), 0);

    // Заявки за период
    const leadsInPeriod = leads.filter(l => {
      const d = safeDate(l.createdAt);
      return d && isWithinInterval(d, { start: dateInterval.start, end: dateInterval.end });
    });

    const totalLeads = leadsInPeriod.length;
    const convertedLeads = leadsInPeriod.filter(l => Boolean(l.contractId) || ['client_created', 'prebooking_created', 'contract_created'].includes(l.status)).length;
    const conversionPct = totalLeads > 0 ? Math.round((convertedLeads / totalLeads) * 100) : 0;

    return {
      occupancyPct,
      occupiedNightsCount,
      totalAvailableNights,
      arrivalsCount: arrivalsInPeriod.length,
      departuresCount: departuresInPeriod.length,
      contractsCount: contractsInPeriod.length,
      activeContractsCount: activeContractsInPeriod.length,
      revenuePeriod,
      prepaidPeriod,
      debtPeriod,
      totalLeads,
      convertedLeads,
      conversionPct,
      leadsInPeriodNew: leadsInPeriod.filter(l => l.status === 'new').length
    };
  }, [contracts, leads, dateInterval]);

  // Данные для блока "Требует внимания" (актуальное состояние на сегодня)
  const attentionItems = useMemo(() => {
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);

    const newLeads = leads.filter(l => l.status === 'new');
    const confirmedLeadsNoPre = leads.filter(l => l.status === 'confirmed' && !l.prebookingId && !l.contractId);
    const prebookingsWithoutContract = contracts.filter(c => c.status === 'pre_booking');
    const contractsWithDebt = contracts.filter(c => c.status !== 'cancelled' && c.status !== 'pre_booking' && c.status !== 'paid' && c.remainder > 0);

    const arrivalsToday = contracts
      .filter(c => c.status !== 'cancelled')
      .flatMap(c => (c.bookings || []).filter(b => b.type === 'main'))
      .filter(b => {
        const start = safeDate(b.startTime);
        return start && isWithinInterval(start, { start: todayStart, end: todayEnd });
      });

    const departuresToday = contracts
      .filter(c => c.status !== 'cancelled')
      .flatMap(c => (c.bookings || []).filter(b => b.type === 'main'))
      .filter(b => {
        const end = safeDate(b.endTime);
        return end && isWithinInterval(end, { start: todayStart, end: todayEnd });
      });

    return [
      {
        id: 'new-leads',
        count: newLeads.length,
        text: `${plural(newLeads.length, 'новая заявка требует', 'новые заявки требуют', 'новых заявок требуют')} обработки`,
        color: 'blue',
        icon: Inbox,
        cta: 'Открыть заявки',
        view: 'leads' as View
      },
      {
        id: 'confirmed-no-pre',
        count: confirmedLeadsNoPre.length,
        text: `${plural(confirmedLeadsNoPre.length, 'подтвержденная заявка', 'подтвержденные заявки', 'подтвержденных заявок')} без брони`,
        color: 'amber',
        icon: AlertCircle,
        cta: 'Открыть заявки',
        view: 'leads' as View
      },
      {
        id: 'pre-no-contract',
        count: prebookingsWithoutContract.length,
        text: `${plural(prebookingsWithoutContract.length, 'предбронь', 'предброни', 'предброней')} без оформленного договора`,
        color: 'amber',
        icon: FileText,
        cta: 'Проверить предброни',
        view: 'contracts' as View
      },
      {
        id: 'debt',
        count: contractsWithDebt.length,
        text: `${plural(contractsWithDebt.length, 'активный договор', 'активных договора', 'активных договоров')} с задолженностью`,
        color: 'red',
        icon: Wallet,
        cta: 'Проверить долги',
        view: 'contracts' as View
      },
      {
        id: 'arrivals',
        count: arrivalsToday.length,
        text: `${plural(arrivalsToday.length, 'заезд ожидается', 'заезда ожидаются', 'заездов ожидаются')} сегодня`,
        color: 'green',
        icon: BedDouble,
        cta: 'Посмотреть заезды',
        view: 'chessboard' as View
      },
      {
        id: 'departures',
        count: departuresToday.length,
        text: `${plural(departuresToday.length, 'выезд запланирован', 'выезда запланированы', 'выездов запланированы')} сегодня`,
        color: 'indigo',
        icon: CalendarCheck,
        cta: 'Посмотреть выезды',
        view: 'chessboard' as View
      }
    ].filter(item => item.count > 0);
  }, [contracts, leads]);

  // Ближайшие заезды и выезды (следующие 5 событий начиная с сегодняшнего дня)
  const upcomingArrivals = useMemo(() => {
    const todayLimit = startOfDay(new Date());
    return contracts
      .filter(c => c.status !== 'cancelled')
      .flatMap(c => (c.bookings || []).filter(b => b.type === 'main').map(b => ({ b, c })))
      .filter(({ b }) => {
        const d = safeDate(b.startTime);
        return d && d >= todayLimit;
      })
      .sort((a, b) => (safeDate(a.b.startTime)?.getTime() || 0) - (safeDate(b.b.startTime)?.getTime() || 0))
      .slice(0, 5);
  }, [contracts]);

  const upcomingDepartures = useMemo(() => {
    const todayLimit = startOfDay(new Date());
    return contracts
      .filter(c => c.status !== 'cancelled')
      .flatMap(c => (c.bookings || []).filter(b => b.type === 'main').map(b => ({ b, c })))
      .filter(({ b }) => {
        const d = safeDate(b.endTime);
        return d && d >= todayLimit;
      })
      .sort((a, b) => (safeDate(a.b.endTime)?.getTime() || 0) - (safeDate(b.b.endTime)?.getTime() || 0))
      .slice(0, 5);
  }, [contracts]);

  // Формулирование вывода отчёта за период
  const reportText = useMemo(() => {
    const cCount = periodStats.activeContractsCount;
    const lCount = periodStats.totalLeads;
    const debtStr = money(periodStats.debtPeriod);
    
    const contractsText = `${cCount} ${plural(cCount, 'активный договор', 'активных договора', 'активных договоров')}`;
    const leadsText = `${lCount} ${plural(lCount, 'заявка', 'заявки', 'заявок')}`;
    
    return `За выбранный период создано ${contractsText}, поступило ${leadsText}, остаток к оплате составляет ${debtStr}.`;
  }, [periodStats]);

  const cardClass = cn(
    'rounded-2xl border p-5 transition-all duration-200',
    isDarkMode ? 'bg-[#111111] border-[#232323]' : 'bg-white border-gray-200 shadow-sm',
  );
  const labelClass = cn(
    'text-[10px] font-bold uppercase tracking-wider',
    isDarkMode ? 'text-[#8F9894]' : 'text-gray-500',
  );
  const valueClass = cn('mt-1 text-2xl font-bold', isDarkMode ? 'text-[#F4F1EA]' : 'text-gray-900');
  const subClass = cn('mt-0.5 text-xs', isDarkMode ? 'text-[#8F9894]' : 'text-gray-400');

  const KpiCard = ({
    icon: Icon,
    label,
    value,
    sub,
    accent,
  }: {
    icon: LucideIcon;
    label: string;
    value: string;
    sub?: string;
    accent?: string;
  }) => (
    <div className={cardClass}>
      <div className="flex items-center justify-between">
        <span className={labelClass}>{label}</span>
        <div className={cn(
          'p-1.5 rounded-lg text-xs',
          accent || (isDarkMode ? 'bg-[#1c1c1c] text-gray-400' : 'bg-gray-50 text-gray-500')
        )}>
          <Icon size={16} />
        </div>
      </div>
      <div className={valueClass}>{value}</div>
      {sub && <div className={subClass}>{sub}</div>}
    </div>
  );

  const periodButtons = [
    { id: 'today', label: 'Сегодня' },
    { id: '7days', label: '7 дней' },
    { id: 'month', label: 'Месяц' },
    { id: 'custom', label: 'Произвольный период' },
  ];

  return (
    <div className="space-y-6">
      {/* Шапка дашборда */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4 border-gray-100 dark:border-[#232323]">
        <div>
          <h2 className={cn('text-xl font-bold', isDarkMode ? 'text-[#F4F1EA]' : 'text-gray-900')}>Сводка</h2>
          <p className={subClass}>Оперативная информация по бронированиям, заявкам и оплатам</p>
        </div>

        {/* Переключатель периода */}
        <div className="flex flex-wrap items-center gap-2">
          <div className={cn(
            'flex rounded-xl p-0.5 border',
            isDarkMode ? 'bg-[#181818] border-[#2c2c2c]' : 'bg-gray-100 border-gray-200'
          )}>
            {periodButtons.map(btn => (
              <button
                key={btn.id}
                onClick={() => setPeriodMode(btn.id as PeriodMode)}
                className={cn(
                  'px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all',
                  periodMode === btn.id
                    ? (isDarkMode ? 'bg-[#2D2D2D] text-[#F4F1EA] shadow-sm' : 'bg-white text-gray-900 shadow-sm')
                    : (isDarkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-900')
                )}
              >
                {btn.label}
              </button>
            ))}
          </div>

          {periodMode === 'custom' && (
            <div className="flex items-center gap-2 mt-2 sm:mt-0">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className={cn(
                  'px-2 py-1 text-xs rounded-lg border outline-none focus:ring-1',
                  isDarkMode
                    ? 'bg-[#181818] border-[#2c2c2c] text-[#F4F1EA] focus:ring-orange-500'
                    : 'bg-white border-gray-300 text-gray-900 focus:ring-blue-500'
                )}
              />
              <span className={cn('text-xs', isDarkMode ? 'text-gray-500' : 'text-gray-400')}>—</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className={cn(
                  'px-2 py-1 text-xs rounded-lg border outline-none focus:ring-1',
                  isDarkMode
                    ? 'bg-[#181818] border-[#2c2c2c] text-[#F4F1EA] focus:ring-orange-500'
                    : 'bg-white border-gray-300 text-gray-900 focus:ring-blue-500'
                )}
              />
            </div>
          )}
        </div>
      </div>

      {/* Сетка карточек показателей */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={BedDouble}
          label="Загрузка за период"
          value={`${periodStats.occupancyPct}%`}
          sub={`${periodStats.occupiedNightsCount} ${plural(periodStats.occupiedNightsCount, 'номер-ночь занята', 'номер-ночи заняты', 'номер-ночей занято')} из ${periodStats.totalAvailableNights} доступных`}
          accent={isDarkMode ? 'bg-orange-500/10 text-orange-400' : 'bg-orange-50 text-orange-600'}
        />
        <KpiCard
          icon={CalendarCheck}
          label="Заезды"
          value={String(periodStats.arrivalsCount)}
          sub="За выбранный период"
          accent={isDarkMode ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-50 text-emerald-600'}
        />
        <KpiCard
          icon={CalendarCheck}
          label="Выезды"
          value={String(periodStats.departuresCount)}
          sub="За выбранный период"
          accent={isDarkMode ? 'bg-blue-500/10 text-blue-400' : 'bg-blue-50 text-blue-600'}
        />
        <KpiCard
          icon={FileText}
          label="Активные договоры"
          value={String(periodStats.activeContractsCount)}
          sub={`Всего создано: ${periodStats.contractsCount}`}
          accent={isDarkMode ? 'bg-indigo-500/10 text-indigo-400' : 'bg-indigo-50 text-indigo-600'}
        />
        <KpiCard
          icon={Wallet}
          label="Выручка за период"
          value={money(periodStats.revenuePeriod)}
          sub={`Оплачено: ${money(periodStats.prepaidPeriod)}`}
          accent={isDarkMode ? 'bg-teal-500/10 text-teal-400' : 'bg-teal-50 text-teal-600'}
        />
        <KpiCard
          icon={AlertCircle}
          label="Остаток к оплате"
          value={money(periodStats.debtPeriod)}
          sub="По договорам периода"
          accent={isDarkMode ? 'bg-rose-500/10 text-rose-400' : 'bg-rose-50 text-rose-600'}
        />
        <KpiCard
          icon={Inbox}
          label="Новые за период"
          value={String(periodStats.leadsInPeriodNew)}
          sub={`Всего получено: ${periodStats.totalLeads}`}
          accent={isDarkMode ? 'bg-cyan-500/10 text-cyan-400' : 'bg-cyan-50 text-cyan-600'}
        />
        <KpiCard
          icon={TrendingUp}
          label="Конверсия заявок"
          value={`${periodStats.conversionPct}%`}
          sub={`Договоров: ${periodStats.convertedLeads}`}
          accent={isDarkMode ? 'bg-violet-500/10 text-violet-400' : 'bg-violet-50 text-violet-600'}
        />
      </div>

      {/* Оперативные блоки */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Блок: Требует внимания */}
        <div className={cardClass}>
          <h3 className={cn('text-sm font-bold uppercase tracking-wider mb-4 border-b pb-2 border-gray-100 dark:border-[#232323]', isDarkMode ? 'text-gray-400' : 'text-gray-500')}>
            Требует внимания
          </h3>
          {attentionItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <CheckCircle2 className="text-emerald-500 mb-2" size={32} />
              <p className={cn('text-sm font-semibold', isDarkMode ? 'text-[#F4F1EA]' : 'text-gray-900')}>Нет срочных задач</p>
              <p className={cn('text-xs mt-1', isDarkMode ? 'text-gray-500' : 'text-gray-400')}>Вся оперативная работа выполнена</p>
            </div>
          ) : (
            <div className="space-y-3">
              {attentionItems.map(item => {
                const Icon = item.icon;
                return (
                  <div key={item.id} className={cn(
                    'flex items-center gap-4 p-4 rounded-xl border transition-all duration-150',
                    isDarkMode ? 'bg-[#161616] border-[#242424]' : 'bg-gray-50 border-gray-100 hover:shadow-xs'
                  )}>
                    <div className={cn(
                      'p-2.5 rounded-lg shrink-0',
                      item.color === 'red' && (isDarkMode ? 'bg-red-500/10 text-red-400' : 'bg-red-50 text-red-600'),
                      item.color === 'amber' && (isDarkMode ? 'bg-amber-500/10 text-amber-400' : 'bg-amber-50 text-amber-600'),
                      item.color === 'blue' && (isDarkMode ? 'bg-blue-500/10 text-blue-400' : 'bg-blue-50 text-blue-600'),
                      item.color === 'green' && (isDarkMode ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-50 text-emerald-600'),
                      item.color === 'indigo' && (isDarkMode ? 'bg-indigo-500/10 text-indigo-400' : 'bg-indigo-50 text-indigo-600')
                    )}>
                      <Icon size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className={cn('text-[9px] font-bold uppercase tracking-wider block', isDarkMode ? 'text-gray-500' : 'text-gray-400')}>
                        {item.id === 'new-leads' && 'Новые к обработке'}
                        {item.id === 'confirmed-no-pre' && 'Ожидают действий'}
                        {item.id === 'pre-no-contract' && 'Неоформленные брони'}
                        {item.id === 'debt' && 'Задолженность'}
                        {item.id === 'arrivals' && 'Заезды'}
                        {item.id === 'departures' && 'Выезды'}
                      </span>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className={cn('text-sm font-semibold truncate', isDarkMode ? 'text-[#F4F1EA]' : 'text-gray-800')}>
                          {item.text}
                        </p>
                      </div>
                    </div>
                    
                    {item.cta && onViewChange && (
                      <button
                        onClick={() => onViewChange(item.view)}
                        className={cn(
                          'text-xs font-bold underline transition-all hover:no-underline shrink-0 px-3 py-1.5 rounded-lg ml-auto hidden sm:block',
                          item.color === 'red' && (isDarkMode ? 'text-red-400 hover:bg-red-500/10' : 'text-red-600 hover:bg-red-50'),
                          item.color === 'amber' && (isDarkMode ? 'text-amber-400 hover:bg-amber-500/10' : 'text-amber-600 hover:bg-amber-50'),
                          item.color === 'blue' && (isDarkMode ? 'text-blue-400 hover:bg-blue-500/10' : 'text-blue-600 hover:bg-blue-50'),
                          item.color === 'green' && (isDarkMode ? 'text-emerald-400 hover:bg-emerald-500/10' : 'text-emerald-600 hover:bg-emerald-50'),
                          item.color === 'indigo' && (isDarkMode ? 'text-indigo-400 hover:bg-indigo-500/10' : 'text-indigo-600 hover:bg-indigo-50')
                        )}
                      >
                        {item.cta}
                      </button>
                    )}

                    <span className={cn(
                      'px-2.5 py-0.5 rounded-full text-xs font-bold shrink-0 ml-2',
                      item.color === 'red' && 'bg-red-500 text-white',
                      item.color === 'amber' && 'bg-amber-500 text-white',
                      item.color === 'blue' && 'bg-blue-500 text-white',
                      item.color === 'green' && 'bg-emerald-500 text-white',
                      item.color === 'indigo' && 'bg-indigo-500 text-white'
                    )}>
                      {item.count}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Блок: Отчёт за период для руководства */}
        <div className={cardClass}>
          <div className="flex items-center justify-between border-b pb-2 mb-4 border-gray-100 dark:border-[#232323]">
            <h3 className={cn('text-sm font-bold uppercase tracking-wider', isDarkMode ? 'text-gray-400' : 'text-gray-500')}>
              Отчёт за период
            </h3>
            <span className={cn('text-[10px] px-2.5 py-0.5 rounded-full font-bold', isDarkMode ? 'bg-[#181818] text-gray-300' : 'bg-gray-100 text-gray-600')}>
              {format(dateInterval.start, 'dd.MM.yyyy')} — {format(dateInterval.end, 'dd.MM.yyyy')}
            </span>
          </div>

          <div className="space-y-4">
            {/* Блок Главное */}
            <div className={cn('p-4 rounded-xl border text-xs space-y-2', isDarkMode ? 'bg-[#161616] border-[#242424]' : 'bg-gray-50 border-gray-100')}>
              <div className={cn('font-bold uppercase tracking-wider text-[9px] mb-1', isDarkMode ? 'text-gray-400' : 'text-gray-500')}>
                Главное
              </div>
              <div className="flex justify-between items-center py-0.5">
                <span className={isDarkMode ? 'text-gray-400' : 'text-gray-500'}>Создано договоров:</span>
                <span className={cn('font-bold text-sm', isDarkMode ? 'text-[#F4F1EA]' : 'text-gray-900')}>{periodStats.contractsCount}</span>
              </div>
              <div className="flex justify-between items-center py-0.5">
                <span className={isDarkMode ? 'text-gray-400' : 'text-gray-500'}>Поступило заявок:</span>
                <span className={cn('font-bold text-sm', isDarkMode ? 'text-[#F4F1EA]' : 'text-gray-900')}>{periodStats.totalLeads}</span>
              </div>
              <div className="flex justify-between items-center py-0.5 border-t border-gray-100 dark:border-[#242424] pt-2">
                <span className={isDarkMode ? 'text-gray-400' : 'text-gray-500'}>Оплачено за период:</span>
                <span className="font-bold text-emerald-500 text-sm">{money(periodStats.prepaidPeriod)}</span>
              </div>
              <div className="flex justify-between items-center py-0.5">
                <span className={isDarkMode ? 'text-gray-400' : 'text-gray-500'}>Остаток к оплате:</span>
                <span className="font-bold text-rose-400 text-sm">{money(periodStats.debtPeriod)}</span>
              </div>
              <div className="flex justify-between items-center py-0.5">
                <span className={isDarkMode ? 'text-gray-400' : 'text-gray-500'}>Средняя загрузка:</span>
                <span className={cn('font-bold text-sm', isDarkMode ? 'text-[#F4F1EA]' : 'text-gray-900')}>{periodStats.occupancyPct}%</span>
              </div>
            </div>

            {/* Прогресс-бар загрузки */}
            <div className="space-y-1">
              <div className="flex justify-between items-center text-xs">
                <span className={subClass}>Средняя загрузка фонда</span>
                <span className={cn('font-bold', isDarkMode ? 'text-[#F4F1EA]' : 'text-gray-900')}>{periodStats.occupancyPct}%</span>
              </div>
              <div className={cn('h-2.5 w-full overflow-hidden rounded-full', isDarkMode ? 'bg-[#232323]' : 'bg-gray-100')}>
                <div
                  className="h-full rounded-full bg-orange-500 transition-all duration-300"
                  style={{ width: `${Math.min(100, periodStats.occupancyPct)}%` }}
                />
              </div>
            </div>

            <div className="border-t pt-3 border-gray-100 dark:border-[#232323] space-y-1">
              <span className={subClass}>Выводы по периоду</span>
              <p className={cn('text-xs leading-relaxed font-medium', isDarkMode ? 'text-gray-300' : 'text-gray-700')}>
                {reportText}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Ближайшие события */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Ближайшие заезды */}
        <div className={cardClass}>
          <h3 className={cn('text-sm font-bold uppercase tracking-wider mb-4 border-b pb-2 border-gray-100 dark:border-[#232323]', isDarkMode ? 'text-gray-400' : 'text-gray-500')}>
            Ближайшие заезды
          </h3>
          {upcomingArrivals.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Calendar className={cn('mb-1.5 opacity-40', isDarkMode ? 'text-gray-500' : 'text-gray-400')} size={24} />
              <p className={cn('text-xs font-semibold', isDarkMode ? 'text-gray-500' : 'text-gray-400')}>Нет запланированных заездов</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-[#232323] max-h-[320px] overflow-y-auto">
              {upcomingArrivals.map(({ b, c }) => (
                <div key={b.id} className="py-2.5 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className={cn('text-xs font-bold truncate', isDarkMode ? 'text-[#F4F1EA]' : 'text-gray-900')}>
                      {getClientShortName(c.clientId, clients)}
                    </p>
                    <p className={cn('text-[10px] mt-0.5', isDarkMode ? 'text-gray-400' : 'text-gray-500')}>
                      {getObjectName(b.objectId)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={cn('text-xs font-bold', isDarkMode ? 'text-[#F4F1EA]' : 'text-gray-900')}>
                      {formatEventDate(b.startTime)}
                    </p>
                    <span className={cn(
                      'inline-block px-2 py-0.5 rounded text-[8px] font-bold mt-1 uppercase tracking-wider',
                      c.status === 'paid' && (isDarkMode ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-50 text-emerald-700'),
                      c.status === 'partial_paid' && (isDarkMode ? 'bg-orange-500/10 text-orange-400' : 'bg-orange-50 text-orange-700'),
                      c.status === 'signed_not_paid' && (isDarkMode ? 'bg-red-500/10 text-red-400' : 'bg-red-50 text-red-700'),
                      c.status === 'pre_booking' && (isDarkMode ? 'bg-blue-500/10 text-blue-400' : 'bg-blue-50 text-blue-700')
                    )}>
                      {c.status === 'paid' && 'Оплачен'}
                      {c.status === 'partial_paid' && 'Частично'}
                      {c.status === 'signed_not_paid' && 'Ждет оплаты'}
                      {c.status === 'pre_booking' && 'Предбронь'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Ближайшие выезды */}
        <div className={cardClass}>
          <h3 className={cn('text-sm font-bold uppercase tracking-wider mb-4 border-b pb-2 border-gray-100 dark:border-[#232323]', isDarkMode ? 'text-gray-400' : 'text-gray-500')}>
            Ближайшие выезды
          </h3>
          {upcomingDepartures.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Calendar className={cn('mb-1.5 opacity-40', isDarkMode ? 'text-gray-500' : 'text-gray-400')} size={24} />
              <p className={cn('text-xs font-semibold', isDarkMode ? 'text-gray-500' : 'text-gray-400')}>Нет запланированных выездов</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-[#232323] max-h-[320px] overflow-y-auto">
              {upcomingDepartures.map(({ b, c }) => (
                <div key={b.id} className="py-2.5 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className={cn('text-xs font-bold truncate', isDarkMode ? 'text-[#F4F1EA]' : 'text-gray-900')}>
                      {getClientShortName(c.clientId, clients)}
                    </p>
                    <p className={cn('text-[10px] mt-0.5', isDarkMode ? 'text-gray-400' : 'text-gray-500')}>
                      {getObjectName(b.objectId)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={cn('text-xs font-bold', isDarkMode ? 'text-[#F4F1EA]' : 'text-gray-900')}>
                      {formatEventDate(b.endTime)}
                    </p>
                    <span className={cn(
                      'inline-block px-2 py-0.5 rounded text-[8px] font-bold mt-1 uppercase tracking-wider',
                      c.status === 'paid' && (isDarkMode ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-50 text-emerald-700'),
                      c.status === 'partial_paid' && (isDarkMode ? 'bg-orange-500/10 text-orange-400' : 'bg-orange-50 text-orange-700'),
                      c.status === 'signed_not_paid' && (isDarkMode ? 'bg-red-500/10 text-red-400' : 'bg-red-50 text-red-700'),
                      c.status === 'pre_booking' && (isDarkMode ? 'bg-blue-500/10 text-blue-400' : 'bg-blue-50 text-blue-700')
                    )}>
                      {c.status === 'paid' && 'Оплачен'}
                      {c.status === 'partial_paid' && 'Частично'}
                      {c.status === 'signed_not_paid' && 'Ждет оплаты'}
                      {c.status === 'pre_booking' && 'Предбронь'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {clients.length === 0 && contracts.length === 0 && (
        <p className={subClass}>Пока нет данных — создайте первого гостя и договор, и показатели появятся здесь.</p>
      )}
    </div>
  );
}
