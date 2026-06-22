import React, { useEffect, useMemo, useState } from 'react';
import { BedDouble, Wallet, FileText, Inbox, TrendingUp, AlertCircle, CalendarCheck, type LucideIcon } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { startOfMonth, endOfMonth, parseISO, isWithinInterval, format } from 'date-fns';
import { ru } from 'date-fns/locale';
import type { Client, Contract } from '../../types';
import { CC_OBJECTS } from '../../constants';
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

interface DashboardProps {
  isDarkMode: boolean;
  contracts: Contract[];
  clients: Client[];
}

interface LeadStats {
  total: number;
  fresh: number;
  converted: number;
}

export default function Dashboard({ isDarkMode, contracts, clients }: DashboardProps) {
  const [leadStats, setLeadStats] = useState<LeadStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    leadApi
      .list()
      .then(leads => {
        if (cancelled) return;
        setLeadStats({
          total: leads.length,
          fresh: leads.filter(l => l.status === 'new').length,
          converted: leads.filter(l => Boolean(l.contractId)).length,
        });
      })
      .catch(() => {
        if (!cancelled) setLeadStats({ total: 0, fresh: 0, converted: 0 });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const stats = useMemo(() => {
    const totalRooms = CC_OBJECTS.length;
    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);

    const active = contracts.filter(c => c.status !== 'cancelled' && c.status !== 'pre_booking');

    // Загрузка сегодня: номера с непогашенной бронью, перекрывающей текущий момент.
    const occupiedRooms = new Set<string>();
    for (const c of contracts) {
      if (c.status === 'cancelled') continue;
      for (const b of c.bookings || []) {
        const start = safeDate(b.startTime);
        const end = safeDate(b.endTime);
        if (start && end && start <= now && now <= end) occupiedRooms.add(b.objectId);
      }
    }
    const occupancyPct = totalRooms ? Math.round((occupiedRooms.size / totalRooms) * 100) : 0;

    // Деньги за текущий месяц — по дате заезда основной брони договора.
    let revenueMonth = 0;
    let prepaidMonth = 0;
    for (const c of active) {
      const main = (c.bookings || []).find(b => b.type === 'main') || (c.bookings || [])[0];
      const checkIn = main ? safeDate(main.startTime) : null;
      if (checkIn && isWithinInterval(checkIn, { start: monthStart, end: monthEnd })) {
        revenueMonth += Number(c.totalAmount || 0);
        prepaidMonth += Number(c.prepayment || 0);
      }
    }

    const debt = active.reduce((sum, c) => sum + Number(c.remainder || 0), 0);

    return {
      totalRooms,
      occupied: occupiedRooms.size,
      occupancyPct,
      activeCount: active.length,
      revenueMonth,
      prepaidMonth,
      debt,
      byStatus: {
        signed_not_paid: active.filter(c => c.status === 'signed_not_paid').length,
        partial_paid: active.filter(c => c.status === 'partial_paid').length,
        paid: active.filter(c => c.status === 'paid').length,
      },
      monthLabel: format(now, 'LLLL yyyy', { locale: ru }),
    };
  }, [contracts]);

  const conversionPct =
    leadStats && leadStats.total > 0 ? Math.round((leadStats.converted / leadStats.total) * 100) : 0;

  const cardClass = cn(
    'rounded-2xl border p-5',
    isDarkMode ? 'bg-[#111111] border-[#232323]' : 'bg-white border-gray-200',
  );
  const labelClass = cn(
    'text-[11px] font-bold uppercase tracking-wider',
    isDarkMode ? 'text-[#8F9894]' : 'text-gray-500',
  );
  const valueClass = cn('mt-1 text-2xl font-bold', isDarkMode ? 'text-[#F4F1EA]' : 'text-gray-900');
  const subClass = cn('mt-0.5 text-xs', isDarkMode ? 'text-[#8F9894]' : 'text-gray-400');

  const Kpi = ({
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
        <Icon size={18} className={accent || (isDarkMode ? 'text-[#8F9894]' : 'text-gray-400')} />
      </div>
      <div className={valueClass}>{value}</div>
      {sub && <div className={subClass}>{sub}</div>}
    </div>
  );

  return (
    <div className="space-y-5">
      <div>
        <h2 className={cn('text-xl font-bold', isDarkMode ? 'text-[#F4F1EA]' : 'text-gray-900')}>Сводка</h2>
        <p className={subClass}>Ключевые показатели бутик-отеля на текущий момент</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Kpi
          icon={BedDouble}
          label="Загрузка сейчас"
          value={`${stats.occupied} / ${stats.totalRooms}`}
          sub={`${stats.occupancyPct}% номеров занято`}
          accent="text-[#F97316]"
        />
        <Kpi
          icon={FileText}
          label="Активные договоры"
          value={String(stats.activeCount)}
          sub={`Оплачено: ${stats.byStatus.paid} · частично: ${stats.byStatus.partial_paid} · ждут оплаты: ${stats.byStatus.signed_not_paid}`}
        />
        <Kpi
          icon={Wallet}
          label={`Выручка · ${stats.monthLabel}`}
          value={money(stats.revenueMonth)}
          sub={`Получено предоплат: ${money(stats.prepaidMonth)}`}
          accent="text-emerald-500"
        />
        <Kpi
          icon={AlertCircle}
          label="Долг к оплате"
          value={money(stats.debt)}
          sub="Остаток по активным договорам"
          accent="text-[#F3B2BF]"
        />
        <Kpi
          icon={Inbox}
          label="Заявки"
          value={leadStats ? String(leadStats.total) : '—'}
          sub={leadStats ? `Новых: ${leadStats.fresh}` : 'Загрузка…'}
          accent="text-[#2D9CDB]"
        />
        <Kpi
          icon={TrendingUp}
          label="Конверсия заявок"
          value={leadStats ? `${conversionPct}%` : '—'}
          sub={leadStats ? `В договор: ${leadStats.converted} из ${leadStats.total}` : 'Загрузка…'}
          accent="text-emerald-500"
        />
      </div>

      <div className={cn(cardClass, 'flex items-center gap-4')}>
        <CalendarCheck size={20} className={isDarkMode ? 'text-[#8F9894]' : 'text-gray-400'} />
        <div className="flex-1">
          <div className={labelClass}>Заполненность номеров сегодня</div>
          <div className={cn('mt-2 h-2.5 w-full overflow-hidden rounded-full', isDarkMode ? 'bg-[#232323]' : 'bg-gray-100')}>
            <div
              className="h-full rounded-full bg-[#F97316] transition-all"
              style={{ width: `${Math.min(100, stats.occupancyPct)}%` }}
            />
          </div>
        </div>
        <div className={cn('text-2xl font-bold', isDarkMode ? 'text-[#F4F1EA]' : 'text-gray-900')}>
          {stats.occupancyPct}%
        </div>
      </div>

      {clients.length === 0 && contracts.length === 0 && (
        <p className={subClass}>Пока нет данных — создайте первого гостя и договор, и показатели появятся здесь.</p>
      )}
    </div>
  );
}
