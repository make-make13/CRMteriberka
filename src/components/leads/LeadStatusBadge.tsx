import { CheckCircle2, CircleDot, Clock3, FileText, UserCheck, XCircle } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { LeadStatus } from '../../types';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new:               'Новая',
  in_progress:       'В работе',
  client_created:    'Гость создан',   // гость создан из заявки → архив
  prebooking_created:'В работе',
  contract_created:  'Подтверждена',
  rejected:          'Отклонена',
  duplicate:         'Дубль',
};

const statusClass: Record<LeadStatus, string> = {
  new:                'bg-blue-500/10 text-blue-400',
  in_progress:        'bg-amber-500/10 text-amber-400',
  client_created:     'bg-teal-500/10 text-teal-400',   // отличается от contract_created
  prebooking_created: 'bg-sky-500/10 text-sky-400',
  contract_created:   'bg-green-500/10 text-green-500',
  rejected:           'bg-red-500/10 text-red-500',
  duplicate:          'bg-[#161616] text-[#8F9894]',
};

const statusIcon: Record<LeadStatus, typeof CircleDot> = {
  new:               CircleDot,
  in_progress:       Clock3,
  client_created:    UserCheck,     // иконка "человек с галкой"
  prebooking_created:CheckCircle2,
  contract_created:  FileText,
  rejected:          XCircle,
  duplicate:         CircleDot,
};

interface LeadStatusBadgeProps {
  status?: LeadStatus | string | null;
  className?: string;
}

export default function LeadStatusBadge({ status, className }: LeadStatusBadgeProps) {
  const knownStatus = status as LeadStatus;
  const Icon = statusIcon[knownStatus] || CircleDot;
  const classNameForStatus = statusClass[knownStatus] || 'bg-[#161616] text-[#8F9894]';
  const label = LEAD_STATUS_LABELS[knownStatus] || 'Неизвестный статус';

  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
      classNameForStatus,
      className
    )}>
      <Icon size={13} />
      {label}
    </span>
  );
}
