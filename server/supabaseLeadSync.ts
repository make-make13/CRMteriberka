import { localDb, type SupabaseLeadRow } from './localDatabase';
import { asErrorMessage } from './errorUtils';

/**
 * Supabase конфиг берётся в порядке приоритета:
 *  1. Настройки интеграций из SQLite (раздел «Интеграции» в CRM)
 *  2. Переменные окружения из .env.local (fallback для dev-режима)
 */
function getSupabaseConfig() {
  const stored = localDb.getIntegrationSettingsFull();
  return {
    url:            stored.supabaseUrl          || process.env.SUPABASE_URL,
    serviceRoleKey: stored.supabaseServiceKey   || process.env.SUPABASE_SERVICE_ROLE_KEY,
    table:          stored.supabaseTable        || process.env.SUPABASE_LEADS_TABLE || 'leads',
    limit:          stored.supabaseSyncLimit    || Number(process.env.SUPABASE_LEAD_SYNC_LIMIT || 50) || 50,
  };
}

export interface SupabaseLeadSyncResult {
  ok: true;
  fetched: number;
  created: number;
  skipped: number;
  failed: number;
  errors: string[];
}

const NOT_CONFIGURED_MESSAGE =
  'Supabase не настроен. Укажите URL и Service Role Key в Настройки → Интеграции, ' +
  'или добавьте SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY в .env.local';

function requireConfig() {
  const raw = getSupabaseConfig();
  const url = String(raw.url || '').trim().replace(/\/+$/, '');
  const serviceRoleKey = String(raw.serviceRoleKey || '').trim();
  const table = String(raw.table || 'leads').trim();
  const limit = Math.max(1, Math.min(500, Number(raw.limit) || 50));

  if (!url || !serviceRoleKey) {
    throw new Error(NOT_CONFIGURED_MESSAGE);
  }

  if (!/^[a-zA-Z0-9_]+$/.test(table)) {
    throw new Error('Некорректное имя таблицы Supabase для заявок');
  }

  return { url, serviceRoleKey, table, limit };
}

/** Проверить подключение к Supabase (не требует наличия строк) */
export async function testSupabaseConnection(): Promise<{ ok: true; rowCount: number } | { ok: false; error: string }> {
  try {
    const config = requireConfig();
    const response = await fetch(
      `${config.url}/rest/v1/${config.table}?limit=1&select=id`,
      {
        method: 'GET',
        headers: {
          apikey: config.serviceRoleKey,
          authorization: `Bearer ${config.serviceRoleKey}`,
        },
      },
    );
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return { ok: false, error: `HTTP ${response.status}: ${text.slice(0, 200)}` };
    }
    const rows = await response.json() as unknown[];
    return { ok: true, rowCount: Array.isArray(rows) ? rows.length : 0 };
  } catch (err) {
    return { ok: false, error: asErrorMessage(err) };
  }
}

function buildRestUrl(baseUrl: string, table: string, query: Record<string, string>) {
  const params = new URLSearchParams(query);
  return `${baseUrl}/rest/v1/${table}?${params.toString()}`;
}

function buildHeaders(serviceRoleKey: string) {
  return {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
    'content-type': 'application/json',
  };
}

async function fetchPendingRows(config: ReturnType<typeof requireConfig>) {
  const response = await fetch(buildRestUrl(config.url, config.table, {
    select: '*',
    pulled_to_crm: 'eq.false',
    order: 'created_at.asc',
    limit: String(config.limit),
  }), {
    method: 'GET',
    headers: buildHeaders(config.serviceRoleKey),
  });

  if (!response.ok) {
    throw new Error(`Supabase вернул ошибку при загрузке заявок: ${response.status}`);
  }

  return await response.json() as SupabaseLeadRow[];
}

async function patchSupabaseLead(
  config: ReturnType<typeof requireConfig>,
  supabaseId: string,
  patch: Record<string, unknown>,
) {
  const response = await fetch(buildRestUrl(config.url, config.table, { id: `eq.${supabaseId}` }), {
    method: 'PATCH',
    headers: {
      ...buildHeaders(config.serviceRoleKey),
      prefer: 'return=minimal',
    },
    body: JSON.stringify(patch),
  });

  if (!response.ok) {
    throw new Error(`Supabase вернул ошибку при обновлении заявки ${supabaseId}: ${response.status}`);
  }
}

export async function syncSupabaseLeads(): Promise<SupabaseLeadSyncResult> {
  const config = requireConfig();
  const rows = await fetchPendingRows(config);
  const result: SupabaseLeadSyncResult = {
    ok: true,
    fetched: rows.length,
    created: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  for (const row of rows) {
    const supabaseId = String(row.id || '').trim();
    if (!supabaseId) {
      result.failed += 1;
      result.errors.push('Supabase заявка без id пропущена');
      continue;
    }

    try {
      const alreadyLocal = Boolean(localDb.getLeadBySupabaseId(supabaseId));
      const localLead = localDb.createLeadFromSupabase(row);
      if (alreadyLocal) {
        result.skipped += 1;
      } else {
        result.created += 1;
      }
      await patchSupabaseLead(config, supabaseId, {
        pulled_to_crm: true,
        pulled_to_crm_at: new Date().toISOString(),
        crm_lead_id: localLead.id,
        sync_error: null,
      });
    } catch (error) {
      result.failed += 1;
      const message = asErrorMessage(error);
      result.errors.push(message);
      await patchSupabaseLead(config, supabaseId, {
        sync_error: message,
      });
    }
  }

  return result;
}
