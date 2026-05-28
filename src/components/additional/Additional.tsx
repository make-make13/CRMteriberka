import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Archive, CalendarClock, CheckCircle2, Circle, Download, FileText, Loader2, MessageSquare, Palette, Plus, Printer, Trash2, X } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ru } from 'date-fns/locale';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import DocumentPreviewModal from '../common/DocumentPreviewModal';
import EmptyState from '../common/EmptyState';
import { useToast } from '../../context/ToastContext';
import { taskApi } from '../../services/localApi';
import type { TaskColor, TaskReminder } from '../../types';
import { getActiveVisibleTasks, getArchivedTasks, getCompletedVisibleTasks } from '../../utils/taskArchive';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface AdditionalProps {
  isDarkMode: boolean;
  tasks: TaskReminder[];
  setTasks: React.Dispatch<React.SetStateAction<TaskReminder[]>>;
  currentManagerName: string;
}

const TASK_COLORS: Array<{ id: TaskColor; label: string; className: string; ringClassName: string }> = [
  { id: 'none', label: 'Без цвета', className: 'bg-transparent', ringClassName: 'ring-gray-500/50' },
  { id: 'red', label: 'Важная', className: 'bg-rose-500', ringClassName: 'ring-rose-400' },
  { id: 'amber', label: 'Срочная', className: 'bg-amber-400', ringClassName: 'ring-amber-300' },
  { id: 'green', label: 'Обычная', className: 'bg-emerald-500', ringClassName: 'ring-emerald-400' },
  { id: 'blue', label: 'Инфо', className: 'bg-sky-500', ringClassName: 'ring-sky-400' },
];

const TASK_COLOR_ACCENTS: Record<TaskColor, string> = {
  none: '',
  red: 'border-l-rose-500/80 bg-rose-500/[0.045]',
  amber: 'border-l-amber-400/80 bg-amber-400/[0.04]',
  green: 'border-l-emerald-500/80 bg-emerald-500/[0.035]',
  blue: 'border-l-sky-500/80 bg-sky-500/[0.04]',
};

function createId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toDateTimeLocalValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function downloadStaticDocument(href: string, fileName: string) {
  const link = document.createElement('a');
  link.href = href;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export default function Additional({ isDarkMode, tasks, setTasks, currentManagerName }: AdditionalProps) {
  const { toast } = useToast();
  const [isReturnDocumentOpen, setIsReturnDocumentOpen] = useState(false);
  const [previewPdfBlob, setPreviewPdfBlob] = useState<Blob | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [remindAt, setRemindAt] = useState(() => toDateTimeLocalValue(new Date()));
  const [selectedColor, setSelectedColor] = useState<TaskColor>('none');
  const [isTimeOpen, setIsTimeOpen] = useState(false);
  const [isColorOpen, setIsColorOpen] = useState(false);
  const [isCommentOpen, setIsCommentOpen] = useState(false);
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const [isSavingTask, setIsSavingTask] = useState(false);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);

  const activeTasks = useMemo(
    () => getActiveVisibleTasks(tasks)
      .sort((a, b) => {
        if ((a.hasReminder !== false) !== (b.hasReminder !== false)) {
          return a.hasReminder === false ? 1 : -1;
        }
        const aDate = a.hasReminder === false ? a.createdAt : a.remindAt;
        const bDate = b.hasReminder === false ? b.createdAt : b.remindAt;
        return new Date(aDate).getTime() - new Date(bDate).getTime();
      }),
    [tasks],
  );

  const completedTasks = useMemo(
    () => getCompletedVisibleTasks(tasks),
    [tasks],
  );

  const archivedTasks = useMemo(
    () => getArchivedTasks(tasks),
    [tasks],
  );

  const handlePreviewReturnApplication = async () => {
    try {
      const response = await fetch('/documents/return-application.pdf');
      if (!response.ok) throw new Error('Бланк заявления на возврат не найден');
      setPreviewPdfBlob(await response.blob());
      setIsPreviewOpen(true);
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Ошибка при открытии бланка заявления', 'error');
    }
  };

  const saveTask = async (task: TaskReminder) => {
    const saved = await taskApi.save(task);
    setTasks(prev => {
      const exists = prev.some(item => item.id === saved.id);
      return exists ? prev.map(item => item.id === saved.id ? saved : item) : [saved, ...prev];
    });
    return saved;
  };

  const handleCreateTask = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedTitle = title.trim();
    if (!normalizedTitle) {
      toast('Введите задачу', 'error');
      return;
    }

    setIsSavingTask(true);
    try {
      await saveTask({
        id: createId(),
        title: normalizedTitle,
        description: description.trim() || undefined,
        remindAt: new Date(remindAt).toISOString(),
        hasReminder: isTimeOpen,
        color: selectedColor,
        isDone: false,
        createdBy: currentManagerName || 'Менеджер',
        createdAt: new Date().toISOString(),
      });
      setTitle('');
      setDescription('');
      setSelectedColor('none');
      setIsTimeOpen(false);
      setIsColorOpen(false);
      setIsCommentOpen(false);
      setRemindAt(toDateTimeLocalValue(new Date()));
      toast('Задача добавлена', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Ошибка при сохранении задачи', 'error');
    } finally {
      setIsSavingTask(false);
    }
  };

  const handleToggleTaskDone = async (task: TaskReminder) => {
    if (task.isArchived) return;
    setBusyTaskId(task.id);
    const nextIsDone = !task.isDone;
    try {
      await saveTask({
        ...task,
        isDone: nextIsDone,
        completedAt: nextIsDone ? new Date().toISOString() : undefined,
        isArchived: false,
        archivedAt: undefined,
      });
      toast(nextIsDone ? 'Задача выполнена' : 'Задача снова активна', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Ошибка при обновлении задачи', 'error');
    } finally {
      setBusyTaskId(null);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    setBusyTaskId(taskId);
    try {
      await taskApi.delete(taskId);
      setTasks(prev => prev.filter(task => task.id !== taskId));
      toast('Задача удалена', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Ошибка при удалении задачи', 'error');
    } finally {
      setBusyTaskId(null);
    }
  };

  const renderTask = (task: TaskReminder) => (
    <motion.div
      key={task.id}
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: task.isDone ? 0.68 : 1, y: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className={cn(
        'group grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 border-l-2 border-l-transparent px-4 py-3 transition-colors',
        TASK_COLOR_ACCENTS[task.color || 'none'],
        task.isDone
          ? (isDarkMode ? 'bg-white/[0.025]' : 'bg-gray-50/70')
          : (isDarkMode ? 'hover:bg-white/[0.035]' : 'hover:bg-gray-50')
      )}
    >
      <button
        type="button"
        onClick={() => handleToggleTaskDone(task)}
        disabled={task.isArchived || busyTaskId === task.id}
        aria-label={task.isDone ? 'Вернуть задачу в активные' : 'Выполнить задачу'}
        className={cn(
          'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-all disabled:cursor-default',
          task.isDone || task.isArchived
            ? 'text-green-500'
            : (isDarkMode ? 'text-white/35 hover:text-green-400' : 'text-gray-300 hover:text-green-600')
        )}
      >
        {busyTaskId === task.id ? (
          <Loader2 size={18} className="animate-spin" />
        ) : task.isDone ? (
          <CheckCircle2 size={20} />
        ) : (
          <Circle size={20} />
        )}
      </button>

      <div className="min-w-0">
        <div className="relative inline-block max-w-full">
          <h4 className={cn(
            'truncate text-sm font-semibold transition-colors',
            task.isDone ? 'text-gray-500' : (isDarkMode ? 'text-white' : 'text-gray-900')
          )}>
            {task.title}
          </h4>
          <motion.span
            aria-hidden="true"
            className={cn('absolute left-0 top-1/2 h-px -translate-y-1/2', isDarkMode ? 'bg-white/45' : 'bg-gray-500')}
            initial={false}
            animate={{ width: task.isDone ? '100%' : '0%' }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
          />
        </div>
        {task.description && (
          <p className={cn(
            'mt-1 text-sm leading-relaxed transition-colors',
            task.isDone ? 'text-gray-500/70' : 'text-gray-500'
          )}>
            {task.description}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium text-gray-500">
          <span className="inline-flex items-center gap-1">
            <CalendarClock size={12} />
            {task.hasReminder === false ? 'Без времени' : format(parseISO(task.remindAt), 'd MMMM, HH:mm', { locale: ru })}
          </span>
          <span>{task.createdBy}</span>
          {task.isArchived && task.archivedAt && (
            <span>В архиве с {format(parseISO(task.archivedAt), 'd MMMM, HH:mm', { locale: ru })}</span>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => handleDeleteTask(task.id)}
        disabled={busyTaskId === task.id}
        aria-label="Удалить задачу"
        className={cn(
          'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg opacity-60 transition-all hover:opacity-100 disabled:opacity-30',
          isDarkMode ? 'text-white/35 hover:bg-red-500/10 hover:text-red-300' : 'text-gray-400 hover:bg-red-50 hover:text-red-600',
        )}
      >
        <Trash2 size={14} />
      </button>
    </motion.div>
  );

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section className={cn(
        'min-w-0 overflow-hidden rounded-2xl border',
        isDarkMode ? 'bg-[#0d0d0d] border-white/5' : 'bg-white border-gray-200 shadow-sm',
      )}>
        <div className="flex items-center justify-between gap-4 border-b border-white/5 px-5 py-4">
          <div>
            <h2 className="text-xl font-bold">Задачи</h2>
            <p className="mt-1 text-sm text-gray-500">Общий список для менеджеров с напоминаниями по времени.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsArchiveOpen(true)}
              className={cn(
                'inline-flex h-8 items-center gap-2 rounded-xl border px-3 text-xs font-semibold transition-all',
                isDarkMode ? 'border-white/10 bg-white/5 text-gray-300 hover:bg-white/10' : 'border-gray-200 bg-gray-100 text-gray-600 hover:bg-gray-200'
              )}
            >
              <Archive size={14} />
              Архив {archivedTasks.length > 0 ? archivedTasks.length : ''}
            </button>
            <div className={cn(
              'hidden rounded-full px-3 py-1 text-xs font-semibold sm:block',
              isDarkMode ? 'bg-white/5 text-gray-400' : 'bg-gray-100 text-gray-500'
            )}>
              {activeTasks.length} активных
            </div>
          </div>
        </div>

        <div className="space-y-4 p-4">
        <form onSubmit={handleCreateTask} className={cn(
          'rounded-xl border p-4',
          isDarkMode ? 'border-white/5 bg-white/[0.015]' : 'border-gray-100 bg-gray-50/70',
        )}>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Что нужно сделать?"
            className={cn(
              'min-h-11 w-full rounded-xl border px-4 text-sm outline-none transition-all',
              isDarkMode ? 'bg-black/30 border-white/10 focus:border-[#D98E2B]/50' : 'bg-white border-gray-200 focus:border-orange-500',
            )}
          />

          <motion.div layout className="mt-3 flex flex-wrap items-center gap-2">
            <motion.button
              layout
              type="button"
              onClick={() => setIsTimeOpen(value => !value)}
              aria-label="Время"
              className={cn(
                'inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-4 text-xs font-semibold transition-all',
                isTimeOpen
                  ? (isDarkMode ? 'border-[#D98E2B]/40 bg-[#D98E2B]/15 text-[#F2B35B]' : 'border-orange-200 bg-orange-50 text-orange-700')
                  : (isDarkMode ? 'border-white/10 bg-black/20 text-gray-400 hover:bg-white/5' : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50')
              )}
            >
              <CalendarClock size={15} />
              Время
            </motion.button>
            {isTimeOpen && (
              <motion.input
                layout
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 180 }}
                value={remindAt}
                onChange={(event) => setRemindAt(event.target.value)}
                type="datetime-local"
                className={cn(
                  'h-10 rounded-xl border px-3 text-xs outline-none transition-all',
                  isDarkMode ? 'bg-black/30 border-white/10 focus:border-[#D98E2B]/50' : 'bg-white border-gray-200 focus:border-orange-500',
                )}
              />
            )}

            <motion.button
              layout
              type="button"
              onClick={() => setIsColorOpen(value => !value)}
              aria-label="Цвет"
              className={cn(
                'inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-4 text-xs font-semibold transition-all',
                isColorOpen
                  ? (isDarkMode ? 'border-white/20 bg-white/10 text-white' : 'border-gray-300 bg-gray-100 text-gray-800')
                  : (isDarkMode ? 'border-white/10 bg-black/20 text-gray-400 hover:bg-white/5' : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50')
              )}
            >
              <Palette size={15} />
              Цвет
            </motion.button>
            {isColorOpen && (
              <motion.div
                layout
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                className="flex items-center gap-1 overflow-hidden px-1"
              >
                {TASK_COLORS.map(color => (
                  <button
                    key={color.id}
                    type="button"
                    onClick={() => setSelectedColor(color.id)}
                    aria-label={color.label}
                    className={cn(
                      'flex h-6 w-6 items-center justify-center rounded-full transition-all hover:bg-white/5'
                    )}
                  >
                    <span className={cn(
                      'h-3.5 w-3.5 rounded-full border transition-all',
                      color.className,
                      color.id === 'none' ? (isDarkMode ? 'border-white/30' : 'border-gray-300') : 'border-transparent',
                      selectedColor === color.id && [
                        'ring-1 ring-offset-1',
                        color.ringClassName,
                        isDarkMode ? 'ring-offset-[#111111]' : 'ring-offset-white',
                      ]
                    )} />
                  </button>
                ))}
              </motion.div>
            )}

            <motion.button
              layout
              type="button"
              onClick={() => setIsCommentOpen(value => !value)}
              aria-label="Комментарий"
              className={cn(
                'inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-4 text-xs font-semibold transition-all',
                isCommentOpen
                  ? (isDarkMode ? 'border-sky-500/40 bg-sky-500/15 text-sky-300' : 'border-sky-200 bg-sky-50 text-sky-700')
                  : (isDarkMode ? 'border-white/10 bg-black/20 text-gray-400 hover:bg-white/5' : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-50')
              )}
            >
              <MessageSquare size={15} />
              Комментарий
            </motion.button>

            <motion.button
              layout
              type="submit"
              disabled={isSavingTask}
              aria-label="Добавить"
              className={cn(
                'inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-xs font-bold transition-all disabled:opacity-60',
                isDarkMode ? 'bg-[#D98E2B] text-[#1A1C1B] hover:bg-[#F2B35B]' : 'bg-orange-500 text-white hover:bg-orange-600',
              )}
            >
              {isSavingTask ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
              Добавить
            </motion.button>
          </motion.div>

          {isCommentOpen && (
            <motion.div
              layout
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Комментарий, если нужен"
                rows={2}
                className={cn(
                  'mt-3 w-full resize-none rounded-xl border px-4 py-3 text-sm outline-none transition-all',
                  isDarkMode ? 'bg-black/30 border-white/10 focus:border-[#D98E2B]/50' : 'bg-white border-gray-200 focus:border-orange-500',
                )}
              />
            </motion.div>
          )}
        </form>

        <div className={cn(
          'rounded-xl border p-4',
          isDarkMode ? 'border-white/5 bg-[#111111]' : 'border-gray-100 bg-white'
        )}>
          {activeTasks.length > 0 ? (
            <div className={cn(
              'overflow-hidden rounded-xl border',
              isDarkMode ? 'border-white/5 bg-[#0d0d0d]' : 'border-gray-100 bg-white'
            )}>
              {activeTasks.map(renderTask)}
            </div>
          ) : (
            <EmptyState
              isDarkMode={isDarkMode}
              icon={<CheckCircle2 size={30} />}
              title="Активных задач нет"
              description="Добавьте задачу, а если нужно напоминание - раскройте часы и задайте время."
            />
          )}

          {completedTasks.length > 0 && (
            <div className="mt-6">
              <div className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Выполненные
              </div>
              <div className={cn(
                'overflow-hidden rounded-xl border',
                isDarkMode ? 'border-white/5 bg-[#111111]' : 'border-gray-100 bg-white'
              )}>
                {completedTasks.map(renderTask)}
              </div>
            </div>
          )}
        </div>
        </div>
      </section>

      <aside className={cn(
        'w-full max-w-[340px] justify-self-center rounded-2xl border p-3 lg:justify-self-end',
        isDarkMode ? 'bg-[#0d0d0d] border-white/5' : 'bg-white border-gray-200 shadow-sm',
      )}>
        <div className="mb-2 flex items-center gap-2 px-1">
          <FileText size={16} className="text-gray-500" />
          <h3 className="text-sm font-bold">Доп документы</h3>
        </div>
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setIsReturnDocumentOpen(true)}
            className={cn(
              'flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition-all',
              isDarkMode ? 'border-white/5 bg-white/[0.025] hover:bg-white/[0.055]' : 'border-gray-100 bg-gray-50 hover:bg-gray-100'
            )}
          >
            <span className="flex min-w-0 items-center gap-2">
              <FileText size={16} className="shrink-0 text-[#D98E2B]" />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">Заявление на возврат</span>
            </span>
            <Plus size={15} className="shrink-0 text-gray-400" />
          </button>
        </div>
      </aside>

      {isReturnDocumentOpen && (
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/70 p-4">
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className={cn(
              'w-full max-w-sm rounded-2xl border p-4 shadow-2xl',
              isDarkMode ? 'border-white/10 bg-[#111111]' : 'border-gray-200 bg-white'
            )}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-bold">Заявление на возврат</h3>
                <p className="mt-1 text-sm text-gray-500">Выберите действие с бланком.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsReturnDocumentOpen(false)}
                aria-label="Закрыть"
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all',
                  isDarkMode ? 'bg-white/5 text-gray-300 hover:bg-white/10' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                )}
              >
                <X size={16} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsReturnDocumentOpen(false);
                  handlePreviewReturnApplication();
                }}
                className={cn(
                  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition-all',
                  isDarkMode ? 'bg-[#D98E2B] text-[#1A1C1B] hover:bg-[#F2B35B]' : 'bg-orange-500 text-white hover:bg-orange-600'
                )}
              >
                <Printer size={16} />
                Печать
              </button>
              <button
                type="button"
                onClick={() => {
                  downloadStaticDocument('/documents/return-application.docx', 'Бланк заявления на возврат.docx');
                  setIsReturnDocumentOpen(false);
                }}
                className={cn(
                  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition-all',
                  isDarkMode ? 'bg-white/5 text-white hover:bg-white/10' : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                )}
              >
                <Download size={16} />
                DOCX
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {isArchiveOpen && (
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-black/70 p-4">
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className={cn(
              'flex max-h-[78vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border shadow-2xl',
              isDarkMode ? 'border-white/10 bg-[#111111]' : 'border-gray-200 bg-white'
            )}
          >
            <div className="flex items-center justify-between gap-3 border-b border-white/5 p-4">
              <div className="min-w-0">
                <h3 className="font-bold">Архив задач</h3>
                <p className="mt-1 text-sm text-gray-500">Здесь остаются выполненные задачи после выхода из аккаунта.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsArchiveOpen(false)}
                aria-label="Закрыть архив"
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all',
                  isDarkMode ? 'bg-white/5 text-gray-300 hover:bg-white/10' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                )}
              >
                <X size={16} />
              </button>
            </div>

            <div className="overflow-y-auto p-4">
              {archivedTasks.length > 0 ? (
                <div className={cn(
                  'overflow-hidden rounded-xl border',
                  isDarkMode ? 'border-white/5 bg-[#0d0d0d]' : 'border-gray-100 bg-white'
                )}>
                  {archivedTasks.map(renderTask)}
                </div>
              ) : (
                <EmptyState
                  isDarkMode={isDarkMode}
                  icon={<Archive size={30} />}
                  title="Архив пуст"
                  description="Выполненные задачи попадут сюда после выхода из аккаунта."
                />
              )}
            </div>
          </motion.div>
        </div>
      )}

      <DocumentPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => {
          setIsPreviewOpen(false);
          setPreviewPdfBlob(null);
        }}
        pdfBlob={previewPdfBlob}
        fileName="Бланк_заявления_на_возврат"
        isDarkMode={isDarkMode}
        previewMode="print"
        showEmailAction={false}
      />
    </div>
  );
}
