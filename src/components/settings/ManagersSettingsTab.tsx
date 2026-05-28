import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Save, ShieldCheck, Trash2, UserCog } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { Manager, ManagerInput, ManagerRole } from '../../types';
import { managerApi } from '../../services/localApi';
import { getErrorMessage } from '../../utils/errors';
import ConfirmDialog from '../common/ConfirmDialog';
import { useToast } from '../../context/ToastContext';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ManagersSettingsTabProps {
  isDarkMode: boolean;
}

const emptyForm: ManagerInput = {
  name: '',
  login: '',
  role: 'manager',
  isActive: true,
  password: '',
};

export default function ManagersSettingsTab({ isDarkMode }: ManagersSettingsTabProps) {
  const { toast } = useToast();
  const [managers, setManagers] = useState<Manager[]>([]);
  const [form, setForm] = useState<ManagerInput>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [managerPendingDelete, setManagerPendingDelete] = useState<Manager | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadManagers = async () => {
    setManagers(await managerApi.list());
  };

  useEffect(() => {
    loadManagers().catch(error => toast(getErrorMessage(error, 'Не удалось загрузить менеджеров'), 'error'));
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyForm);
  };

  const startEdit = (manager: Manager) => {
    setEditingId(manager.id);
    setForm({
      id: manager.id,
      name: manager.name,
      login: manager.login,
      role: manager.role,
      permissions: manager.permissions,
      isActive: manager.isActive,
      password: '',
    });
  };

  const saveManager = async () => {
    setIsSaving(true);
    try {
      const payload = { ...form, password: form.password?.trim() || undefined };
      if (editingId) {
        await managerApi.update(editingId, payload);
      } else {
        await managerApi.create(payload);
      }
      await loadManagers();
      resetForm();
    } catch (error) {
      toast(getErrorMessage(error, 'Не удалось сохранить менеджера'), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const deleteManager = async (manager: Manager) => {
    setIsDeleting(true);
    try {
      await managerApi.delete(manager.id);
      await loadManagers();
      if (editingId === manager.id) resetForm();
      setManagerPendingDelete(null);
      toast('Менеджер удалён', 'success');
    } catch (error) {
      toast(getErrorMessage(error, 'Не удалось удалить менеджера'), 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const inputClass = cn(
    "w-full px-4 py-2.5 rounded-xl text-sm outline-none border transition-all",
    isDarkMode ? "bg-white/5 border-white/10 focus:border-[#D98E2B]" : "bg-gray-50 border-gray-200 focus:border-orange-500"
  );

  return (
    <>
    <div className="grid grid-cols-[1fr_360px] gap-6">
      <section className={cn(
        "rounded-3xl border overflow-hidden",
        isDarkMode ? "bg-[#111111] border-white/5" : "bg-white border-gray-200 shadow-sm"
      )}>
        <div className="p-6 border-b border-white/5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#D98E2B]/10 flex items-center justify-center text-[#D98E2B]">
            <UserCog size={20} />
          </div>
          <div>
            <h3 className="font-bold text-lg">Менеджеры</h3>
            <p className="text-xs text-gray-500">Доступы сотрудников CRM</p>
          </div>
        </div>
        <div className="divide-y divide-white/5">
          {managers.map(manager => (
            <div key={manager.id} className="p-5 flex items-center justify-between gap-4">
              <button type="button" onClick={() => startEdit(manager)} className="text-left flex-1">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center font-bold",
                    manager.role === 'admin' ? "bg-[#D98E2B]/20 text-[#F2B35B]" : "bg-[#8CAFBE]/15 text-[#8CAFBE]"
                  )}>
                    {manager.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-bold">{manager.name}</div>
                    <div className="text-xs text-gray-500">{manager.login} · {manager.role === 'admin' ? 'Администратор' : 'Менеджер'}</div>
                  </div>
                </div>
              </button>
              <span className={cn(
                "px-2 py-1 rounded-lg text-[10px] font-bold uppercase",
                manager.isActive ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
              )}>
                {manager.isActive ? 'Активен' : 'Выключен'}
              </span>
              <button
                type="button"
                onClick={() => setManagerPendingDelete(manager)}
                className={cn(
                  "h-9 w-9 rounded-xl flex items-center justify-center text-red-500 transition-all",
                  isDarkMode ? "bg-red-500/10 hover:bg-red-500/20" : "bg-red-50 hover:bg-red-100"
                )}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className={cn(
        "p-6 rounded-3xl border space-y-5",
        isDarkMode ? "bg-[#111111] border-white/5" : "bg-white border-gray-200 shadow-sm"
      )}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400">
            {editingId ? <ShieldCheck size={20} /> : <Plus size={20} />}
          </div>
          <h3 className="font-bold">{editingId ? 'Редактировать' : 'Новый менеджер'}</h3>
        </div>

        <div className="space-y-3">
          <input className={inputClass} placeholder="Имя" value={form.name} onChange={event => setForm(prev => ({ ...prev, name: event.target.value }))} />
          <input className={inputClass} placeholder="Логин" value={form.login} onChange={event => setForm(prev => ({ ...prev, login: event.target.value }))} />
          <input
            className={inputClass}
            placeholder={editingId ? 'Новый пароль, если нужно сменить' : 'Пароль'}
            type="password"
            value={form.password || ''}
            onChange={event => setForm(prev => ({ ...prev, password: event.target.value }))}
          />
          <select
            className={inputClass}
            value={form.role}
            onChange={event => setForm(prev => ({ ...prev, role: event.target.value as ManagerRole }))}
          >
            <option value="manager">Менеджер</option>
            <option value="admin">Администратор</option>
          </select>
          <label className="flex items-center gap-3 text-sm font-semibold text-gray-400">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={event => setForm(prev => ({ ...prev, isActive: event.target.checked }))}
            />
            Активен
          </label>
        </div>

        <div className="flex gap-2">
          <motion.button
            type="button"
            onClick={saveManager}
            disabled={isSaving}
            whileTap={{ scale: 0.95 }}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#D98E2B] text-sm font-bold text-[#1A1C1B] transition-all hover:bg-[#F2B35B] disabled:opacity-50"
          >
            <Save size={16} />
            Сохранить
          </motion.button>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className={cn("px-4 py-2.5 rounded-xl text-sm font-bold", isDarkMode ? "bg-white/5 hover:bg-white/10" : "bg-gray-100 hover:bg-gray-200")}
            >
              Новый
            </button>
          )}
        </div>
      </section>
    </div>
    <ConfirmDialog
      isOpen={Boolean(managerPendingDelete)}
      isDarkMode={isDarkMode}
      title="Удалить менеджера?"
      description={managerPendingDelete ? `Менеджер "${managerPendingDelete.name}" будет удалён из CRM.` : ''}
      confirmLabel="Удалить менеджера"
      isLoading={isDeleting}
      onCancel={() => {
        if (!isDeleting) setManagerPendingDelete(null);
      }}
      onConfirm={() => {
        if (managerPendingDelete) deleteManager(managerPendingDelete);
      }}
    />
    </>
  );
}
