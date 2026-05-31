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
