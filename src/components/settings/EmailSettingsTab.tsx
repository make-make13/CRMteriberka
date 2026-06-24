import React, { useState, useEffect } from 'react';
import { Mail, Save, Send, Server } from 'lucide-react';
import { motion } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { emailSettingsApi } from '../../services/localApi';
import { getErrorMessage } from '../../utils/errors';
import { useToast } from '../../context/ToastContext';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const VK_MAIL_DEFAULTS = {
  senderEmail: 'medvedica.hotel@vk.com',
  senderName: 'Большая Медведица',
  host: 'smtp.mail.ru',
  port: 465,
  secure: true,
};

interface EmailSettings {
  senderEmail: string;
  appPassword: string;
  senderName: string;
  defaultMessage: string;
  host: string;
  port: number;
  secure: boolean;
}

interface EmailSettingsTabProps {
  isDarkMode: boolean;
}

export default function EmailSettingsTab({ isDarkMode }: EmailSettingsTabProps) {
  const { toast } = useToast();
  const [settings, setSettings] = useState<EmailSettings>({
    senderEmail: VK_MAIL_DEFAULTS.senderEmail,
    appPassword: '',
    senderName: VK_MAIL_DEFAULTS.senderName,
    defaultMessage: '',
    host: VK_MAIL_DEFAULTS.host,
    port: VK_MAIL_DEFAULTS.port,
    secure: VK_MAIL_DEFAULTS.secure,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      const saved = await emailSettingsApi.get();
      if (saved.senderEmail || saved.senderName || saved.defaultMessage || saved.host) {
        setSettings(prev => ({
          ...prev,
          ...saved,
          appPassword: '',
          host: saved.host || prev.host,
          port: Number(saved.port || prev.port),
          secure: typeof saved.secure === 'boolean' ? saved.secure : prev.secure,
        }));
      } else {
        // Set default settings if not exists
        const defaultSettings = {
          senderEmail: VK_MAIL_DEFAULTS.senderEmail,
          appPassword: '',
          senderName: VK_MAIL_DEFAULTS.senderName,
          defaultMessage: 'Спасибо, что обратились к нам',
          host: VK_MAIL_DEFAULTS.host,
          port: VK_MAIL_DEFAULTS.port,
          secure: VK_MAIL_DEFAULTS.secure,
        };
        setSettings(defaultSettings);
      }
    };
    fetchSettings();
  }, []);

  const handleTestConnection = async () => {
    setIsTesting(true);
    try {
      await emailSettingsApi.testSmtp({
        ...settings,
        senderEmail: settings.senderEmail.trim(),
        appPassword: settings.appPassword.trim(),
        host: settings.host.trim() || VK_MAIL_DEFAULTS.host,
        port: Number(settings.port) || VK_MAIL_DEFAULTS.port,
        secure: Boolean(settings.secure),
      });
      toast('SMTP авторизация успешна. Тестовое письмо не отправлялось.', 'success');
    } catch (error) {
      toast(getErrorMessage(error, 'Ошибка проверки SMTP'), 'error');
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const cleanedSettings = {
        ...settings,
        senderEmail: settings.senderEmail.trim(),
        appPassword: settings.appPassword.trim(),
        host: settings.host.trim() || VK_MAIL_DEFAULTS.host,
        port: Number(settings.port) || VK_MAIL_DEFAULTS.port,
        secure: Boolean(settings.secure),
      };
      const saved = await emailSettingsApi.save(cleanedSettings);
      setSettings(prev => ({
        ...prev,
        ...saved,
        appPassword: '',
        host: saved.host || cleanedSettings.host,
        port: Number(saved.port || cleanedSettings.port),
        secure: typeof saved.secure === 'boolean' ? saved.secure : cleanedSettings.secure,
      }));
      toast('Настройки SMTP сохранены', 'success');
    } catch (error) {
      console.error('Error saving SMTP settings:', error);
      toast(getErrorMessage(error, 'Ошибка при сохранении настроек'), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className={cn(
      "p-8 rounded-3xl border space-y-6 max-w-2xl mx-auto",
      isDarkMode ? "bg-[#111111] border-white/5" : "bg-white border-gray-200 shadow-sm"
    )}>
      <div className="flex items-center gap-3 border-b border-white/5 pb-4">
        <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-500">
          <Mail size={20} />
        </div>
        <h3 className="font-bold text-lg">Настройки Email (SMTP)</h3>
      </div>

      <div className={cn('rounded-2xl border p-4 text-xs leading-relaxed', isDarkMode ? 'border-white/10 bg-white/[0.03] text-gray-400' : 'border-gray-200 bg-gray-50 text-gray-600')}>
        Рекомендуемые настройки для Mail.ru / VK Mail: <span className="font-mono">smtp.mail.ru</span>, порт <span className="font-mono">465</span>, SSL/TLS. Логин — полный email. Используйте пароль внешнего приложения Mail/VK, не обычный пароль от почты. Пустое поле пароля при сохранении не меняет сохранённый пароль.
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Email отправителя</label>
          <input 
            value={settings.senderEmail}
            onChange={(e) => setSettings({...settings, senderEmail: e.target.value})}
            className={cn(
              "w-full px-4 py-2.5 rounded-xl text-sm outline-none border transition-all",
              isDarkMode ? "bg-white/5 border-white/10 focus:border-indigo-500" : "bg-gray-50 border-gray-200 focus:border-indigo-500"
            )}
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Пароль внешнего приложения</label>
          <input
            type="password"
            value={settings.appPassword}
            onChange={(e) => setSettings({ ...settings, appPassword: e.target.value })}
            placeholder="Оставьте пустым, чтобы не менять"
            className={cn(
              "w-full px-4 py-2.5 rounded-xl text-sm outline-none border transition-all",
              isDarkMode ? "bg-black/30 border-white/10 text-[#F4F1EA] placeholder:text-[#B4CDD2]/40 focus:border-[#D98E2B]/60" : "bg-white border-gray-200 focus:border-orange-400"
            )}
          />
        </div>
        <div className="grid gap-4 md:grid-cols-[1fr_120px_140px]">
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">SMTP host</label>
            <input
              value={settings.host}
              onChange={(e) => setSettings({ ...settings, host: e.target.value })}
              placeholder="smtp.mail.ru"
              className={cn(
                "w-full px-4 py-2.5 rounded-xl text-sm outline-none border transition-all",
                isDarkMode ? "bg-white/5 border-white/10 focus:border-indigo-500" : "bg-gray-50 border-gray-200 focus:border-indigo-500"
              )}
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Порт</label>
            <input
              type="number"
              value={settings.port}
              onChange={(e) => setSettings({ ...settings, port: Number(e.target.value) || 465 })}
              className={cn(
                "w-full px-4 py-2.5 rounded-xl text-sm outline-none border transition-all",
                isDarkMode ? "bg-white/5 border-white/10 focus:border-indigo-500" : "bg-gray-50 border-gray-200 focus:border-indigo-500"
              )}
            />
          </div>
          <label className="flex items-end gap-2 pb-3 text-sm font-bold text-gray-500">
            <input
              type="checkbox"
              checked={settings.secure}
              onChange={(e) => setSettings({ ...settings, secure: e.target.checked })}
              className="h-4 w-4 accent-indigo-500"
            />
            SSL/TLS
          </label>
        </div>
        <button
          type="button"
          onClick={() => setSettings(prev => ({
            ...prev,
            senderEmail: VK_MAIL_DEFAULTS.senderEmail,
            senderName: VK_MAIL_DEFAULTS.senderName,
            host: VK_MAIL_DEFAULTS.host,
            port: VK_MAIL_DEFAULTS.port,
            secure: VK_MAIL_DEFAULTS.secure,
          }))}
          className={cn(
            "inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all",
            isDarkMode ? "bg-white/5 text-white hover:bg-white/10 border border-white/10" : "bg-gray-100 text-black hover:bg-gray-200 border border-gray-200"
          )}
        >
          <Server size={15} />
          Mail.ru / VK Mail
        </button>
        <div className="space-y-2">
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Имя отправителя</label>
          <input 
            value={settings.senderName}
            onChange={(e) => setSettings({...settings, senderName: e.target.value})}
            className={cn(
              "w-full px-4 py-2.5 rounded-xl text-sm outline-none border transition-all",
              isDarkMode ? "bg-white/5 border-white/10 focus:border-indigo-500" : "bg-gray-50 border-gray-200 focus:border-indigo-500"
            )}
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Текст сообщения по умолчанию</label>
          <textarea 
            value={settings.defaultMessage}
            onChange={(e) => setSettings({...settings, defaultMessage: e.target.value})}
            className={cn(
              "w-full px-4 py-2.5 rounded-xl text-sm outline-none border transition-all h-32",
              isDarkMode ? "bg-white/5 border-white/10 focus:border-indigo-500" : "bg-gray-50 border-gray-200 focus:border-indigo-500"
            )}
          />
        </div>
      </div>

      <div className="flex justify-end gap-4 pt-4">
        <motion.button 
          onClick={handleTestConnection}
          disabled={isTesting}
          whileTap={{ scale: 0.95 }}
          className={cn(
            "flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50",
            isDarkMode ? "bg-white/5 text-white hover:bg-white/10 border border-white/10" : "bg-gray-100 text-black hover:bg-gray-200 border border-gray-200"
          )}
        >
          <Send size={18} />
          {isTesting ? 'Проверка...' : 'Проверить соединение'}
        </motion.button>
        <motion.button 
          onClick={handleSave}
          disabled={isSaving}
          whileTap={{ scale: 0.95 }}
          className={cn(
            "flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50",
            isDarkMode ? "bg-indigo-600 text-white hover:bg-indigo-700" : "bg-indigo-600 text-white hover:bg-indigo-700"
          )}
        >
          <Save size={18} />
          {isSaving ? 'Сохранение...' : 'Сохранить настройки'}
        </motion.button>
      </div>
    </section>
  );
}
