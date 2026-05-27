import type { ReactNode } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface EmptyStateProps {
  isDarkMode: boolean;
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}

export default function EmptyState({
  isDarkMode,
  icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex min-h-[260px] flex-col items-center justify-center gap-4 p-12 text-center">
      <div className={cn(
        "flex h-16 w-16 items-center justify-center rounded-2xl",
        isDarkMode ? "bg-white/5 text-gray-500" : "bg-gray-100 text-gray-500"
      )}>
        {icon}
      </div>
      <div>
        <h3 className="text-lg font-bold">{title}</h3>
        <p className={cn("mt-1 max-w-md text-sm leading-6", isDarkMode ? "text-gray-500" : "text-gray-500")}>
          {description}
        </p>
      </div>
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}
