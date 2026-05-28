import React, { useState, useEffect } from 'react';
import { Mail, Save, Send, AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { emailSettingsApi } from '../../services/localApi';
import { getErrorMessage } from '../../utils/errors';
import { useToast } from '../../context/ToastContext';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const TEST_PDF_BASE64 = 'JVBERi0xLjEKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCAyMDAgMjAwXSA+PgplbmRvYmoKeHJlZgowIDQKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDA5IDAwMDAwIG4gCjAwMDAwMDAwNTggMDAwMDAgbiAKMDAwMDAwMDExNSAwMDAwMCBuIAp0cmFpbGVyCjw8IC9TaXplIDQgL1Jvb3QgMSAwIFIgPj4Kc3RhcnR4cmVmCjE5OQolJUVPRgo=';

interface EmailSettings {
  senderEmail: string;
  appPassword: string;
  senderName: string;
  defaultMessage: string;
}

interface EmailSettingsTabProps {
  isDarkMode: boolean;
}

export default function EmailSettingsTab({ isDarkMode }: EmailSettingsTabProps) {
  const { toast } = useToast();
  const [settings, setSettings] = useState<EmailSettings>({
    senderEmail: '',
    appPassword: '',
    senderName: '',
    defaultMessage: ''
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [showYandexHint, setShowYandexHint] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      const saved = await emailSettingsApi.get();
      if (saved.senderEmail || saved.senderName || saved.defaultMessage) {
        setSettings(prev => ({ ...prev, ...saved, appPassword: '' }));
      } else {
        // Set default settings if not exists
        const defaultSettings = {
          senderEmail: '',
          appPassword: '',
          senderName: 'Большая Медведица',
          defaultMessage: 'Спасибо, что обратились к нам'
        };
        setSettings(defaultSettings);
      }
    };
    fetchSettings();
  }, []);

  const handleTestConnection = async () => {
    setIsTesting(true);
    setShowYandexHint(false);
    try {
      const response = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toEmail: settings.senderEmail.trim(),
          subject: 'Тестовое письмо',
          htmlBody: '<p>Это тестовое письмо для проверки настроек SMTP.</p>',
          attachmentBase64: TEST_PDF_BASE64,
          attachmentName: 'test.pdf',
          senderName: settings.senderName
        }),
      });

      const result = await response.json();
      if (response.ok) {
        toast('Соединение успешно установлено. Тестовое письмо отправлено.', 'success');
      } else {
        if (result.error && result.error.includes('535 5.7.8')) {
          setShowYandexHint(true);
        }
        throw new Error(result.error || 'Ошибка при проверке');
      }
    } catch (error: any) {
      if (!showYandexHint) toast(`Ошибка: ${error.message}`, 'error');
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
      };
      const saved = await emailSettingsApi.save(cleanedSettings);
      setSettings(prev => ({ ...prev, ...saved, appPassword: '' }));
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

      {showYandexHint && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 space-y-3">
          <div className="flex items-center gap-2 text-red-500 font-bold text-sm">
            <AlertCircle size={18} />
            Яндекс блокирует доступ (Ошибка 535 5.7.8)
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">
            Ваш логин и пароль верны, но Яндекс запрещает отправку писем через сторонние программы.
          </p>
          <div className="space-y-2">
            <p className="text-[10px] font-bold text-gray-500 uppercase">Как исправить:</p>
            <ol className="text-xs text-gray-300 space-y-1 list-decimal pl-4">
              <li>Зайдите в почту <span className="text-indigo-400 font-mono">{settings.senderEmail || 'ваш email'}</span></li>
              <li>Нажмите <strong>Настройки</strong> (шестеренка) → <strong>Все настройки</strong></li>
              <li>Выберите <strong>Почтовые программы</strong></li>
              <li>Включите галочку <strong>«С сервера smtp.yandex.ru по протоколу SMTP»</strong></li>
              <li>Нажмите <strong>Сохранить изменения</strong></li>
            </ol>
          </div>
          <p className="text-[10px] text-gray-500 italic">
            После этого нажмите кнопку "Проверить соединение" еще раз.
          </p>
        </div>
      )}

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
          <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Пароль приложения (Yandex)</label>
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
