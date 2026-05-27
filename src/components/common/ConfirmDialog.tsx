/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ConfirmDialogProps {
  isOpen: boolean;
  isDarkMode: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isLoading?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export default function ConfirmDialog({
  isOpen,
  isDarkMode,
  title,
  description,
  confirmLabel = 'Удалить',
  cancelLabel = 'Отмена',
  isLoading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isLoading) onCancel();
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            className={cn(
              'w-full max-w-md overflow-hidden rounded-3xl border shadow-2xl',
              isDarkMode
                ? 'border-white/10 bg-[#111111] text-white shadow-black/40'
                : 'border-gray-200 bg-white text-gray-950 shadow-gray-300/40'
            )}
            initial={{ opacity: 0, scale: 0.94, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            <div className="flex items-start justify-between gap-4 border-b border-white/5 p-6">
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-500/10 text-red-500">
                  <AlertTriangle size={22} />
                </div>
                <div>
                  <h3 id="confirm-dialog-title" className="text-lg font-bold">
                    {title}
                  </h3>
                  <p className={cn('mt-2 text-sm leading-6', isDarkMode ? 'text-gray-400' : 'text-gray-600')}>
                    {description}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onCancel}
                disabled={isLoading}
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all disabled:opacity-50',
                  isDarkMode ? 'text-gray-500 hover:bg-white/10 hover:text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-black'
                )}
                aria-label="Закрыть"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex items-center justify-end gap-3 p-5">
              <button
                type="button"
                onClick={onCancel}
                disabled={isLoading}
                className={cn(
                  'h-10 rounded-xl px-4 text-sm font-bold transition-all disabled:opacity-50',
                  isDarkMode ? 'bg-white/10 text-white hover:bg-white/15' : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                )}
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={isLoading}
                className="h-10 rounded-xl bg-red-500 px-5 text-sm font-bold text-white transition-all hover:bg-red-600 disabled:opacity-60"
              >
                {isLoading ? 'Удаляем...' : confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
