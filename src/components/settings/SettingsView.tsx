/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, useState, useEffect } from 'react';
import { Save, Building2, FileText, Percent, Phone, MapPin, Check, Copy, ChevronDown, ChevronUp, Edit3, Database, Trash2, Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { motion } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Settings, Organization, TemplateMeta } from '../../types';
import EmailSettingsTab from './EmailSettingsTab';
import BackupSettingsTab from './BackupSettingsTab';
import ManagersSettingsTab from './ManagersSettingsTab';
import BmDocxTemplatesTab from './BmDocxTemplatesTab';
import IntegrationsSettingsTab from './IntegrationsSettingsTab';
import SystemStatusTab from './SystemStatusTab';
import RoomPricesCard from './RoomPricesCard';
import { TEMPLATE_VARIABLES } from '../../utils/templateVariables';
import { getErrorMessage } from '../../utils/errors';
import { PDFME_TEMPLATE_DEFINITIONS, type PdfmeTemplateDefinition } from '../../utils/pdfmeTemplateIds';
import { useToast } from '../../context/ToastContext';
import { maintenanceApi, organizationApi, settingsApi, templateApi, pdfTemplateApi } from '../../services/localApi';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface SettingsViewProps {
  isDarkMode: boolean;
  settings: Settings;
  setSettings: React.Dispatch<React.SetStateAction<Settings>>;
  canManageTemplates?: boolean;
  canManageEmail?: boolean;
  canManageBackups?: boolean;
  canManageManagers?: boolean;
}

type SettingsTab = 'general' | 'integrations' | 'system' | 'templates' | 'email' | 'backups' | 'managers';

const importPdfmeTemplateEditorModal = () => import('./PdfmeTemplateEditorModal');
let pdfmeTemplateEditorModalPreload: ReturnType<typeof importPdfmeTemplateEditorModal> | null = null;

function preloadPdfmeTemplateEditorModal() {
  pdfmeTemplateEditorModalPreload ??= importPdfmeTemplateEditorModal();
  return pdfmeTemplateEditorModalPreload;
}

const PdfmeTemplateEditorModal = React.lazy(preloadPdfmeTemplateEditorModal);

function PdfmeEditorLoadingFallback({ isDarkMode }: { isDarkMode: boolean }) {
  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        className={cn(
          'w-[360px] rounded-3xl border p-7 text-center shadow-2xl',
          isDarkMode ? 'border-white/10 bg-[#111111]' : 'border-gray-200 bg-white'
        )}
      >
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#8CAFBE]/15 text-[#B4CDD2]">
          <Loader2 size={24} className="animate-spin" />
        </div>
        <div className={cn('text-lg font-bold', isDarkMode ? 'text-white' : 'text-gray-950')}>
          Загружаем PDFMe-редактор...
        </div>
        <p className={cn('mt-2 text-sm leading-relaxed', isDarkMode ? 'text-slate-400' : 'text-slate-600')}>
          Подготавливаем дизайнер шаблона. Обычно это нужно только при первом открытии.
        </p>
      </motion.div>
    </div>
  );
}

const DEFAULT_COMPANY_DETAILS: Organization = {
  id: 'company_details',
  exec_name: 'Общество с ограниченной ответственностью «Золото Арктики»',
  exec_director: 'Сташ Екатерина Александровна',
  exec_director_short: 'Сташ Е.А.',
  exec_inn: '5105013870',
  exec_kpp: '510501001',
  exec_ogrn: '1215100000158',
  exec_address: '184433, Мурманская область, Печенгский район, г. Заполярный, ул. Ленина, д. 1А, помещение 34',
  exec_post_address: '',
  exec_phone: '+7 (931) 802-21-51',
  exec_bank: 'МУРМАНСКОЕ ОТДЕЛЕНИЕ N8627 ПАО СБЕРБАНК',
  exec_rs: '40702810941710000190',
  exec_bik: '044705615',
  exec_ks: '30101810300000000615',
  bank_inn: '7707083893',
  bank_kpp: '519002001',
  property_address_cc: 'Мурманская обл., Кольский р-н, с. Териберка, ул. 1-я Пятилетка, д. 1',
  property_address_gb: '',
  exec_email: 'medvedica.hotel@vk.com',
  exec_site: 'medvedica-hotel.ru',
  admin_working_hours: 'Круглосуточно',
  hotel_registry_number: 'C512026024350',
  hotel_category: 'без звезд',
  hotel_approval_date: '',
};

const normalizeCompanyDetails = (organization?: Organization): Organization => ({
  ...DEFAULT_COMPANY_DETAILS,
  ...(organization || {}),
  exec_name: 'Общество с ограниченной ответственностью «Золото Арктики»',
  exec_inn: '5105013870',
  exec_kpp: '510501001',
  exec_ogrn: '1215100000158',
  exec_address: '184433, Мурманская область, Печенгский район, г. Заполярный, ул. Ленина, д. 1А, помещение 34',
  exec_phone: '+7 (931) 802-21-51',
  property_address_cc: 'Мурманская обл., Кольский р-н, с. Териберка, ул. 1-я Пятилетка, д. 1',
  property_address_gb: '',
  exec_email: 'medvedica.hotel@vk.com',
  exec_site: 'medvedica-hotel.ru',
  admin_working_hours: 'Круглосуточно',
  hotel_registry_number: 'C512026024350',
  hotel_category: 'без звезд',
  hotel_approval_date: organization?.hotel_approval_date || '',
});

export default function SettingsView({
  isDarkMode,
  settings,
  setSettings,
  canManageTemplates = false,
  canManageEmail = false,
  canManageBackups = false,
  canManageManagers = false,
}: SettingsViewProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [organizations, setOrganizations] = useState<Record<string, Organization>>({});
  const [templatesMeta, setTemplatesMeta] = useState<Record<string, TemplateMeta>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [showVariables, setShowVariables] = useState(false);
  const [copiedVar, setCopiedVar] = useState<string | null>(null);
  const [editingPdfmeTemplate, setEditingPdfmeTemplate] = useState<PdfmeTemplateDefinition | null>(null);

  const { register: registerGeneral, handleSubmit: handleSubmitGeneral, formState: { isDirty: isGeneralDirty } } = useForm({
    defaultValues: settings
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [orgsData, metaData] = await Promise.all([
          organizationApi.list(),
          templateApi.listMeta(),
        ]);
        setOrganizations({
          ...orgsData,
          company_details: normalizeCompanyDetails(orgsData.company_details),
        });
        setTemplatesMeta(metaData);
      } catch (error) {
        console.error('Local settings load error:', error);
        toast('Ошибка при загрузке локальных настроек', 'error');
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    const allowed =
      activeTab === 'general' ||
      activeTab === 'integrations' ||
      activeTab === 'system' ||
      (activeTab === 'templates' && canManageTemplates) ||
      (activeTab === 'email' && canManageEmail) ||
      (activeTab === 'backups' && canManageBackups) ||
      (activeTab === 'managers' && canManageManagers);
    if (!allowed) setActiveTab('general');
  }, [activeTab, canManageBackups, canManageEmail, canManageManagers, canManageTemplates]);

  useEffect(() => {
    if (activeTab === 'templates' && canManageTemplates) {
      void preloadPdfmeTemplateEditorModal();
    }
  }, [activeTab, canManageTemplates]);

  const onSaveGeneral = async (data: Settings) => {
    const saved = await settingsApi.save(data);
    setSettings(saved);
    toast('Настройки сохранены');
  };

  const onSaveOrg = async (data: Organization, baseId: string) => {
    setIsSaving(true);
    try {
      const payload = baseId === 'company_details' ? normalizeCompanyDetails(data) : { ...data, id: baseId };
      const saved = await organizationApi.save(baseId, { ...payload, id: baseId });
      setOrganizations(prev => ({ ...prev, [baseId]: saved }));
      toast('Реквизиты организации сохранены');
    } catch (error) {
      console.error('Local organization save error:', error);
      toast(getErrorMessage(error, 'Ошибка при сохранении реквизитов'), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateBackup = async () => {
    try {
      const result = await maintenanceApi.createBackup();
      toast(`Резервная копия создана: ${result.path}`);
    } catch (error) {
      toast(getErrorMessage(error, 'Ошибка при создании резервной копии'), 'error');
    }
  };

  const copyToClipboard = (text: string) => {
    const varText = `{${text}}`;
    navigator.clipboard.writeText(varText);
    setCopiedVar(text);
    setTimeout(() => setCopiedVar(null), 2000);
  };

  const handleDeletePdfTemplate = async (id: string, title: string) => {
    if (!window.confirm(`Вы уверены, что хотите удалить настроенный шаблон "${title}"? Он будет возвращен к базовому виду.`)) {
      return;
    }
    try {
      await pdfTemplateApi.delete(id);
      const metaData = await templateApi.listMeta();
      setTemplatesMeta(metaData);
      toast(`Шаблон "${title}" сброшен`);
    } catch (error) {
      toast(getErrorMessage(error, 'Ошибка при удалении шаблона'), 'error');
    }
  };

  const VARIABLES = TEMPLATE_VARIABLES;

  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-6">
      {/* Строка 1: заголовок + кнопка сохранения */}
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-2xl font-bold">Настройки</h2>
        {activeTab === 'general' && (
          <motion.button
            onClick={handleSubmitGeneral(onSaveGeneral)}
            disabled={!isGeneralDirty}
            whileTap={{ scale: 0.95 }}
            className={cn(
              "shrink-0 flex items-center gap-1.5 whitespace-nowrap px-3.5 py-2 rounded-lg text-xs font-bold transition-all disabled:opacity-50",
              isDarkMode ? "bg-[#D98E2B] text-[#1A1C1B] hover:bg-[#F2B35B]" : "bg-orange-500 text-white hover:bg-orange-600"
            )}
          >
            <Save size={15} />
            Сохранить изменения
          </motion.button>
        )}
      </div>

      {/* Строка 2: вкладки */}
      <div className="flex flex-wrap gap-1 p-1 bg-black/20 rounded-xl self-start">
        <motion.button
          onClick={() => setActiveTab('general')}
          whileTap={{ scale: 0.95 }}
          className={cn(
            "whitespace-nowrap px-4 py-2 rounded-lg text-sm font-bold transition-all",
            activeTab === 'general'
              ? (isDarkMode ? "bg-[#6E6964]/30 text-[#F4F1EA] ring-1 ring-[#B4CDD2]/20" : "bg-white text-black shadow-sm")
              : "text-gray-500 hover:text-gray-300"
          )}
        >
          Общие
        </motion.button>
        <motion.button
          onClick={() => setActiveTab('integrations')}
          whileTap={{ scale: 0.95 }}
          className={cn(
            "whitespace-nowrap px-4 py-2 rounded-lg text-sm font-bold transition-all",
            activeTab === 'integrations'
              ? (isDarkMode ? "bg-[#6E6964]/30 text-[#F4F1EA] ring-1 ring-[#B4CDD2]/20" : "bg-white text-black shadow-sm")
              : "text-gray-500 hover:text-gray-300"
          )}
        >
          Интеграции
        </motion.button>
        <motion.button
          onClick={() => setActiveTab('system')}
          whileTap={{ scale: 0.95 }}
          className={cn(
            "whitespace-nowrap px-4 py-2 rounded-lg text-sm font-bold transition-all",
            activeTab === 'system'
              ? (isDarkMode ? "bg-[#6E6964]/30 text-[#F4F1EA] ring-1 ring-[#B4CDD2]/20" : "bg-white text-black shadow-sm")
              : "text-gray-500 hover:text-gray-300"
          )}
        >
          Система
        </motion.button>
        {canManageTemplates && (
          <motion.button
            onClick={() => setActiveTab('templates')}
            whileTap={{ scale: 0.95 }}
            className={cn(
              "whitespace-nowrap px-4 py-2 rounded-lg text-sm font-bold transition-all",
              activeTab === 'templates'
                ? (isDarkMode ? "bg-[#6E6964]/30 text-[#F4F1EA] ring-1 ring-[#B4CDD2]/20" : "bg-white text-black shadow-sm")
                : "text-gray-500 hover:text-gray-300"
            )}
          >
            Шаблоны документов
          </motion.button>
        )}
        {canManageEmail && (
          <motion.button
            onClick={() => setActiveTab('email')}
            whileTap={{ scale: 0.95 }}
            className={cn(
              "whitespace-nowrap px-4 py-2 rounded-lg text-sm font-bold transition-all",
              activeTab === 'email'
                ? (isDarkMode ? "bg-[#6E6964]/30 text-[#F4F1EA] ring-1 ring-[#B4CDD2]/20" : "bg-white text-black shadow-sm")
                : "text-gray-500 hover:text-gray-300"
            )}
          >
            Email
          </motion.button>
        )}
        {canManageBackups && (
          <motion.button
            onClick={() => setActiveTab('backups')}
            whileTap={{ scale: 0.95 }}
            className={cn(
              "whitespace-nowrap px-4 py-2 rounded-lg text-sm font-bold transition-all",
              activeTab === 'backups'
                ? (isDarkMode ? "bg-[#6E6964]/30 text-[#F4F1EA] ring-1 ring-[#B4CDD2]/20" : "bg-white text-black shadow-sm")
                : "text-gray-500 hover:text-gray-300"
            )}
          >
            Резервные копии
          </motion.button>
        )}
        {canManageManagers && (
          <motion.button
            onClick={() => setActiveTab('managers')}
            whileTap={{ scale: 0.95 }}
            className={cn(
              "whitespace-nowrap px-4 py-2 rounded-lg text-sm font-bold transition-all",
              activeTab === 'managers'
                ? (isDarkMode ? "bg-[#6E6964]/30 text-[#F4F1EA] ring-1 ring-[#B4CDD2]/20" : "bg-white text-black shadow-sm")
                : "text-gray-500 hover:text-gray-300"
            )}
          >
            Менеджеры
          </motion.button>
        )}
      </div>

      {activeTab === 'general' ? (
        <div className="space-y-8">
        <div className="grid grid-cols-2 gap-8">
          {/* Company Info */}
          <section className={cn(
            "p-8 rounded-3xl border space-y-6",
            isDarkMode ? "bg-[#111111] border-white/5" : "bg-white border-gray-200 shadow-sm"
          )}>
            <div className="flex items-center gap-3 border-b border-white/5 pb-4">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500">
                <Building2 size={20} />
              </div>
              <h3 className="font-bold text-lg">Общие настройки</h3>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Название системы</label>
                <input 
                  {...registerGeneral('companyName')}
                  className={cn(
                    "w-full px-4 py-2.5 rounded-xl text-sm outline-none border transition-all",
                    isDarkMode ? "bg-white/5 border-white/10 focus:border-[#8CAFBE]" : "bg-gray-50 border-gray-200 focus:border-orange-500"
                  )}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Email для отчетов</label>
                <input 
                  {...registerGeneral('emailForReports')}
                  className={cn(
                    "w-full px-4 py-2.5 rounded-xl text-sm outline-none border transition-all",
                    isDarkMode ? "bg-white/5 border-white/10 focus:border-[#8CAFBE]" : "bg-gray-50 border-gray-200 focus:border-orange-500"
                  )}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">Телефон поддержки</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
                  <input 
                    {...registerGeneral('phone')}
                    className={cn(
                      "w-full pl-10 pr-4 py-2.5 rounded-xl text-sm outline-none border transition-all",
                      isDarkMode ? "bg-white/5 border-white/10 focus:border-[#8CAFBE]" : "bg-gray-50 border-gray-200 focus:border-orange-500"
                    )}
                  />
                </div>
              </div>
            </div>
          </section>

          <div className="space-y-8">
            {/* Taxes Settings */}
            <section className={cn(
              "p-8 rounded-3xl border space-y-6",
              isDarkMode ? "bg-[#111111] border-white/5" : "bg-white border-gray-200 shadow-sm"
            )}>
              <div className="flex items-center gap-3 border-b border-white/5 pb-4">
                <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center text-green-500">
                  <Percent size={20} />
                </div>
                <h3 className="font-bold text-lg">Налоги и сборы</h3>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wider">НДС (%)</label>
                <div className="relative">
                  <input 
                    type="number"
                    step="0.01"
                    {...registerGeneral('vatRate')}
                    className={cn(
                      "w-full px-4 py-2.5 rounded-xl text-sm outline-none border transition-all",
                      isDarkMode ? "bg-white/5 border-white/10 focus:border-[#8CAFBE]" : "bg-gray-50 border-gray-200 focus:border-orange-500"
                    )}
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">%</span>
                </div>
                <p className="text-[10px] text-gray-500 mt-1">Используется при генерации документов (например, 0.05 = 5%)</p>
              </div>
            </section>
            {canManageBackups && (
            <section className={cn(
              "p-8 rounded-3xl border space-y-6",
              isDarkMode ? "bg-[#111111] border-white/5" : "bg-white border-gray-200 shadow-sm"
            )}>
              <div className="flex items-center gap-3 border-b border-white/5 pb-4">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-500">
                  <Database size={20} />
                </div>
                <h3 className="font-bold text-lg">Локальные данные</h3>
              </div>
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={handleCreateBackup}
                  className={cn(
                    "flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all",
                    isDarkMode ? "bg-white/5 hover:bg-white/10 text-white" : "bg-gray-100 hover:bg-gray-200 text-black"
                  )}
                >
                  <Database size={18} />
                  Создать резервную копию
                </button>
              </div>
              <p className="text-[10px] text-gray-500">
                Резервные копии сохраняются в папку data/backups.
              </p>
            </section>
            )}
          </div>
        </div>

        {/* Стоимость номеров — полная ширина */}
        <RoomPricesCard isDarkMode={isDarkMode} />
        </div>
      ) : activeTab === 'templates' ? (
        <div className="space-y-8">
          {/* Unified Organization Details */}
          <div className="max-w-3xl mx-auto">
            <OrgSettingsForm 
              baseId="company_details"
              isDarkMode={isDarkMode}
              initialData={normalizeCompanyDetails(organizations['company_details'])}
              onSave={(data) => onSaveOrg(data, 'company_details')}
            />
          </div>

          <section className="space-y-6">
            <div>
              <h3 className="text-xl font-bold">PDFMe шаблоны документов</h3>
              <p className="text-xs text-gray-500 mt-1">
                Точные PDF-макеты для пакетных документов: договор, счет и акт в одном файле.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-6">
              {PDFME_TEMPLATE_DEFINITIONS.map((definition) => {
                const meta = templatesMeta[definition.id];
                return (
                  <div key={definition.id} className={cn(
                "p-6 rounded-3xl border flex flex-col gap-4",
                isDarkMode ? "bg-[#111111] border-white/5" : "bg-white border-gray-200 shadow-sm"
              )}>
                <div className="flex items-start justify-between">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                    <FileText size={20} />
                  </div>
                  {meta ? (
                    <span className="px-2 py-1 rounded-md text-[10px] font-bold uppercase bg-green-500/10 text-green-500">Настроен</span>
                  ) : (
                    <span className="px-2 py-1 rounded-md text-[10px] font-bold uppercase bg-blue-500/10 text-blue-500">Базовый</span>
                  )}
                </div>

                <div>
                  <h4 className="font-bold text-sm leading-tight">{definition.title}</h4>
                  <p className="text-[10px] text-gray-500 mt-1">{definition.description}</p>
                  {meta && (
                    <p className="text-[10px] text-gray-500 mt-1">
                      Обновлен: {new Date(meta.uploadedAt).toLocaleDateString('ru-RU')}
                    </p>
                  )}
                </div>

                <div className="flex gap-2 mt-auto">
                  <motion.button
                    onClick={() => setEditingPdfmeTemplate(definition)}
                    whileTap={{ scale: 0.95 }}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-[10px] font-bold uppercase cursor-pointer transition-all",
                      isDarkMode ? "bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300" : "bg-emerald-50 hover:bg-emerald-100 text-emerald-700"
                    )}
                  >
                    <Edit3 size={14} />
                    Редактор
                  </motion.button>
                  {meta && (
                    <motion.button
                      title="Удалить пользовательский шаблон"
                      onClick={() => handleDeletePdfTemplate(definition.id, definition.title)}
                      whileTap={{ scale: 0.95 }}
                      className={cn(
                        "flex items-center justify-center p-2 rounded-xl text-red-500 transition-all",
                        isDarkMode ? "bg-red-500/10 hover:bg-red-500/20" : "bg-red-50 hover:bg-red-100"
                      )}
                    >
                      <Trash2 size={16} />
                    </motion.button>
                  )}
                </div>
              </div>
                );
              })}
            </div>
          </section>

          {/* BM DOCX Template Storage */}
          <BmDocxTemplatesTab isDarkMode={isDarkMode} />

          {/* Variables Reference */}
          <section className={cn(
            "rounded-3xl border overflow-hidden",
            isDarkMode ? "bg-[#111111] border-white/5" : "bg-white border-gray-200"
          )}>
            <button 
              onClick={() => setShowVariables(!showVariables)}
              className="w-full p-6 flex items-center justify-between hover:bg-white/5 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-500">
                  <Copy size={20} />
                </div>
                <h3 className="font-bold text-lg">Переменные для шаблонов</h3>
              </div>
              {showVariables ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </button>
            
            {showVariables && (
              <div className="p-6 pt-0 space-y-8">
                {Object.entries(VARIABLES).map(([group, vars]) => (
                  <div key={group} className="space-y-4">
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest border-b border-white/5 pb-2">{group}</h4>
                    <div className="grid grid-cols-2 gap-4">
                      {vars.map(v => (
                        <div 
                          key={v.name} 
                          onClick={() => copyToClipboard(v.name)}
                          className={cn(
                            "flex items-start gap-3 p-2 rounded-xl border border-transparent transition-all cursor-pointer group",
                            isDarkMode ? "hover:bg-white/5 hover:border-white/10" : "hover:bg-gray-50 hover:border-gray-200"
                          )}
                        >
                          <div className={cn(
                            "shrink-0 px-2 py-1 rounded-md text-[10px] font-mono transition-all flex items-center gap-1.5",
                            copiedVar === v.name
                              ? "bg-green-500/20 text-green-500"
                              : (isDarkMode ? "bg-white/5 text-[#B4CDD2]" : "bg-gray-100 text-orange-600")
                          )}>
                            {`{${v.name}}`}
                            {copiedVar === v.name && <Check size={10} />}
                          </div>
                          <div className="text-[11px] text-gray-500 pt-1 leading-tight">
                            {v.desc}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

        </div>
      ) : activeTab === 'integrations' ? (
        <IntegrationsSettingsTab isDarkMode={isDarkMode} />
      ) : activeTab === 'system' ? (
        <SystemStatusTab isDarkMode={isDarkMode} />
      ) : activeTab === 'email' ? (
        <EmailSettingsTab isDarkMode={isDarkMode} />
      ) : activeTab === 'backups' ? (
        <BackupSettingsTab isDarkMode={isDarkMode} />
      ) : (
        <ManagersSettingsTab isDarkMode={isDarkMode} />
      )}

      {editingPdfmeTemplate && (
        <Suspense fallback={<PdfmeEditorLoadingFallback isDarkMode={isDarkMode} />}>
          <PdfmeTemplateEditorModal
            isDarkMode={isDarkMode}
            templateId={editingPdfmeTemplate.id}
            templateTitle={editingPdfmeTemplate.title}
            templateFileName={editingPdfmeTemplate.fileName}
            onClose={() => {
              setEditingPdfmeTemplate(null);
              templateApi.listMeta().then(metaData => {
                setTemplatesMeta(metaData);
              });
            }}
            onSaved={() => {
              templateApi.listMeta().then(metaData => {
                setTemplatesMeta(metaData);
              });
            }}
          />
        </Suspense>
      )}
    </div>
  );
}

interface OrgSettingsFormProps {
  key?: string;
  baseId: string;
  isDarkMode: boolean;
  initialData?: Organization;
  onSave: (data: Organization) => Promise<void>;
}

function OrgSettingsForm({ baseId, isDarkMode, initialData, onSave }: OrgSettingsFormProps) {
  const { register, handleSubmit, reset } = useForm<Organization>({
    defaultValues: initialData
  });

  useEffect(() => {
    if (initialData) reset(initialData);
  }, [initialData, reset]);

  return (
    <section className={cn(
      "p-8 rounded-3xl border space-y-6",
      isDarkMode ? "bg-[#111111] border-white/5" : "bg-white border-gray-200 shadow-sm"
    )}>
      <div className="flex items-center justify-between border-b border-white/5 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#8CAFBE]/10 text-[#B4CDD2] flex items-center justify-center">
            <Building2 size={20} />
          </div>
          <h3 className="font-bold text-lg">Карточка компании</h3>
        </div>
        <motion.button 
          onClick={handleSubmit(onSave)}
          whileTap={{ scale: 0.95 }}
          className={cn(
            "px-4 py-1.5 rounded-lg text-xs font-bold uppercase transition-all",
            isDarkMode ? "bg-white/10 hover:bg-white/20 text-white" : "bg-gray-100 hover:bg-gray-200 text-black"
          )}
        >
          Сохранить
        </motion.button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-gray-500 uppercase">Исполнитель</label>
          <input {...register('exec_name')} className={cn("w-full px-3 py-2 rounded-xl text-xs outline-none border", isDarkMode ? "bg-white/5 border-white/10" : "bg-gray-50 border-gray-200")} />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-gray-500 uppercase">Директор</label>
          <input {...register('exec_director')} className={cn("w-full px-3 py-2 rounded-xl text-xs outline-none border", isDarkMode ? "bg-white/5 border-white/10" : "bg-gray-50 border-gray-200")} />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-gray-500 uppercase">Директор (инициалы)</label>
          <input {...register('exec_director_short')} className={cn("w-full px-3 py-2 rounded-xl text-xs outline-none border", isDarkMode ? "bg-white/5 border-white/10" : "bg-gray-50 border-gray-200")} />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-gray-500 uppercase">ИНН</label>
          <input {...register('exec_inn')} className={cn("w-full px-3 py-2 rounded-xl text-xs outline-none border", isDarkMode ? "bg-white/5 border-white/10" : "bg-gray-50 border-gray-200")} />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-gray-500 uppercase">КПП</label>
          <input {...register('exec_kpp')} className={cn("w-full px-3 py-2 rounded-xl text-xs outline-none border", isDarkMode ? "bg-white/5 border-white/10" : "bg-gray-50 border-gray-200")} />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-gray-500 uppercase">ОГРН</label>
          <input {...register('exec_ogrn')} className={cn("w-full px-3 py-2 rounded-xl text-xs outline-none border", isDarkMode ? "bg-white/5 border-white/10" : "bg-gray-50 border-gray-200")} />
        </div>
        <div className="col-span-2 space-y-1">
          <label className="text-[10px] font-bold text-gray-500 uppercase">Юридический адрес</label>
          <input {...register('exec_address')} className={cn("w-full px-3 py-2 rounded-xl text-xs outline-none border", isDarkMode ? "bg-white/5 border-white/10" : "bg-gray-50 border-gray-200")} />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-gray-500 uppercase">Телефон</label>
          <input {...register('exec_phone')} className={cn("w-full px-3 py-2 rounded-xl text-xs outline-none border", isDarkMode ? "bg-white/5 border-white/10" : "bg-gray-50 border-gray-200")} />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-gray-500 uppercase">E-mail</label>
          <input {...register('exec_email')} className={cn("w-full px-3 py-2 rounded-xl text-xs outline-none border", isDarkMode ? "bg-white/5 border-white/10" : "bg-gray-50 border-gray-200")} />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-gray-500 uppercase">Сайт</label>
          <input {...register('exec_site')} className={cn("w-full px-3 py-2 rounded-xl text-xs outline-none border", isDarkMode ? "bg-white/5 border-white/10" : "bg-gray-50 border-gray-200")} />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-gray-500 uppercase">Режим работы администратора</label>
          <input {...register('admin_working_hours')} className={cn("w-full px-3 py-2 rounded-xl text-xs outline-none border", isDarkMode ? "bg-white/5 border-white/10" : "bg-gray-50 border-gray-200")} />
        </div>
        <div className="col-span-2 space-y-1">
          <label className="text-[10px] font-bold text-gray-500 uppercase">Фактический адрес бутик-отеля</label>
          <input {...register('property_address_cc')} className={cn("w-full px-3 py-2 rounded-xl text-xs outline-none border", isDarkMode ? "bg-white/5 border-white/10" : "bg-gray-50 border-gray-200")} />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-gray-500 uppercase">Уникальный номер реестровой записи</label>
          <input {...register('hotel_registry_number')} className={cn("w-full px-3 py-2 rounded-xl text-xs outline-none border", isDarkMode ? "bg-white/5 border-white/10" : "bg-gray-50 border-gray-200")} />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-gray-500 uppercase">Категория бутик-отеля</label>
          <input {...register('hotel_category')} className={cn("w-full px-3 py-2 rounded-xl text-xs outline-none border", isDarkMode ? "bg-white/5 border-white/10" : "bg-gray-50 border-gray-200")} />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-gray-500 uppercase">Дата утверждения</label>
          <input {...register('hotel_approval_date')} className={cn("w-full px-3 py-2 rounded-xl text-xs outline-none border", isDarkMode ? "bg-white/5 border-white/10" : "bg-gray-50 border-gray-200")} />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-gray-500 uppercase">Банк</label>
          <input {...register('exec_bank')} className={cn("w-full px-3 py-2 rounded-xl text-xs outline-none border", isDarkMode ? "bg-white/5 border-white/10" : "bg-gray-50 border-gray-200")} />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-gray-500 uppercase">ИНН Банка</label>
          <input {...register('bank_inn')} className={cn("w-full px-3 py-2 rounded-xl text-xs outline-none border", isDarkMode ? "bg-white/5 border-white/10" : "bg-gray-50 border-gray-200")} />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-gray-500 uppercase">КПП Банка</label>
          <input {...register('bank_kpp')} className={cn("w-full px-3 py-2 rounded-xl text-xs outline-none border", isDarkMode ? "bg-white/5 border-white/10" : "bg-gray-50 border-gray-200")} />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-gray-500 uppercase">Расч. счет</label>
          <input {...register('exec_rs')} className={cn("w-full px-3 py-2 rounded-xl text-xs outline-none border", isDarkMode ? "bg-white/5 border-white/10" : "bg-gray-50 border-gray-200")} />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-gray-500 uppercase">БИК</label>
          <input {...register('exec_bik')} className={cn("w-full px-3 py-2 rounded-xl text-xs outline-none border", isDarkMode ? "bg-white/5 border-white/10" : "bg-gray-50 border-gray-200")} />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-gray-500 uppercase">Корр. счет</label>
          <input {...register('exec_ks')} className={cn("w-full px-3 py-2 rounded-xl text-xs outline-none border", isDarkMode ? "bg-white/5 border-white/10" : "bg-gray-50 border-gray-200")} />
        </div>
      </div>
    </section>
  );
}
