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
  new: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  in_progress: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  client_created: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  prebooking_created: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  contract_created: 'bg-green-500/10 text-green-400 border-green-500/20',
  rejected: 'bg-red-500/10 text-red-400 border-red-500/20',
  duplicate: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
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
