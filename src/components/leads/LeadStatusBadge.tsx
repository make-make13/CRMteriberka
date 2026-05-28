import { CheckCircle2, CircleDot, Clock3, FileText, UserCheck, XCircle } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { LeadStatus } from '../../types';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'Новая',
  in_progress: 'В работе',
  client_created: 'Гость создан',
  prebooking_created: 'Предбронь',
  contract_created: 'Договор',
  rejected: 'Отказ',
  duplicate: 'Дубль',
};

const statusClass: Record<LeadStatus, string> = {
  new: 'bg-sky-400/20 text-sky-300 border-sky-400/30',
  in_progress: 'bg-amber-400/20 text-amber-300 border-amber-400/30',
  client_created: 'bg-teal-400/20 text-teal-300 border-teal-400/30',
  prebooking_created: 'bg-[#FFE08A]/20 text-[#FFE08A] border-[#FFE08A]/35',
  contract_created: 'bg-[#8CAFBE]/20 text-[#8CAFBE] border-[#8CAFBE]/40',
  rejected: 'bg-[#F3B2BF]/20 text-[#F3B2BF] border-[#F3B2BF]/35',
  duplicate: 'bg-white/[0.08] text-[#B4CDD2]/70 border-white/10',
};

const statusIcon: Record<LeadStatus, typeof CircleDot> = {
  new: CircleDot,
  in_progress: Clock3,
  client_created: UserCheck,
  prebooking_created: CheckCircle2,
  contract_created: FileText,
  rejected: XCircle,
  duplicate: CircleDot,
};

interface LeadStatusBadgeProps {
  status?: LeadStatus | string | null;
  className?: string;
}

export default function LeadStatusBadge({ status, className }: LeadStatusBadgeProps) {
  const knownStatus = status as LeadStatus;
  const Icon = statusIcon[knownStatus] || CircleDot;
  const classNameForStatus = statusClass[knownStatus] || 'bg-gray-500/10 text-gray-400 border-gray-500/20';
  const label = LEAD_STATUS_LABELS[knownStatus] || 'Неизвестный статус';

  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold',
      classNameForStatus,
      className
    )}>
      <Icon size={13} />
      {label}
    </span>
  );
}
