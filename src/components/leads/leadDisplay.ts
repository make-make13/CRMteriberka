import type { Lead, LeadStatus } from '../../types';

type LeadLike = Partial<Lead> & {
  supabase_id?: unknown;
};

export const UNKNOWN_TEXT = 'Не указано';

export const SOURCE_LABELS: Record<string, string> = {
  // Сайт Большой Медведицы — основной источник заявок из Supabase
  'bolshaya-medveditsa-landing': 'Сайт БМ',
  'bolshaya-medveditsa':         'Сайт БМ',
  'bm-landing':                  'Сайт БМ',
  'bm':                          'Сайт БМ',
  'сайт':                        'Сайт',
  'website':                     'Сайт',
  // Локально созданные заявки
  local:       'Локально',
  'локально':  'Локально',
  // Технические/тестовые источники
  'api-smoke': 'API (тест)',
  'api smoke': 'API (тест)',
  api:         'API',
  // ИИ-консьерж — внешний backend на домашнем сервере
  // Заявки попадают в CRM через Supabase (pull-синхронизация)
  telegram_ai: 'ИИ / Telegram',
  vk_ai:       'ИИ / VK',
  webchat_ai:  'ИИ / Сайт-чат',
};

/** Источники, порождённые внешним ИИ-консьержем */
const AI_SOURCES = new Set(['telegram_ai', 'vk_ai', 'webchat_ai']);

/** true если заявка пришла от ИИ-консьержа */
export function isAiSource(source: unknown): boolean {
  return typeof source === 'string' && AI_SOURCES.has(source.trim().toLowerCase());
}

/** Человекочитаемое название канала ИИ */
export const CHANNEL_LABELS: Record<string, string> = {
  telegram:  'Telegram',
  vk:        'ВКонтакте',
  webchat:   'Сайт-чат',
  'web-form': 'Форма сайта',
  widget:    'Виджет',
};

export function cleanText(value: unknown, fallback = UNKNOWN_TEXT) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || fallback;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return fallback;
}

export function formatLeadSource(source: unknown) {
  if (typeof source !== 'string') return 'Другое';
  return SOURCE_LABELS[source.trim().toLowerCase()] || 'Другое';
}

export function hasSupabaseId(lead: LeadLike | null | undefined) {
  const supabaseId = lead?.supabaseId ?? lead?.supabase_id;
  return typeof supabaseId === 'string' && supabaseId.trim().length > 0;
}

export function getLeadOriginLabel(lead: LeadLike | null | undefined) {
  return hasSupabaseId(lead) ? 'Синхронизирована из Supabase' : 'Локальная заявка';
}

export function normalizeLeadStatus(status: unknown): LeadStatus {
  if (
    status === 'new'
    || status === 'confirmed'
    || status === 'in_progress'
    || status === 'client_created'
    || status === 'prebooking_created'
    || status === 'contract_created'
    || status === 'rejected'
    || status === 'duplicate'
  ) {
    return status;
  }

  return 'new';
}

export function formatDateValue(value: unknown, fallback = 'Не указаны') {
  return cleanText(value, fallback);
}

export function parseJsonSafe(value: unknown): unknown {
  if (value == null || value === '') return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return null;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function summarizeJsonValue(value: unknown) {
  const parsed = parseJsonSafe(value);
  if (!parsed || typeof parsed !== 'object') return '';

  if (Array.isArray(parsed)) {
    return parsed.length ? `${parsed.length} знач.` : '';
  }

  return Object.keys(parsed).length ? Object.keys(parsed).join(', ') : '';
}
