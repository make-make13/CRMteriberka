/**
 * Планировщик автоматической синхронизации заявок из Supabase.
 *
 * Принцип работы:
 *   - Один setInterval (timer). При каждом изменении настроек — clearInterval + новый.
 *   - isRunning-флаг: не запускает sync, пока предыдущий не завершился.
 *   - Все ошибки ловятся — сервер не падает.
 *   - Состояние (lastRunAt, lastError и т.д.) хранится в памяти — доступно через getAutoSyncStatus().
 */

import { syncSupabaseLeads } from './supabaseLeadSync';
import { localDb } from './localDatabase';

// ── Состояние ────────────────────────────────────────────────────────────────

export interface AutoSyncStatus {
  enabled: boolean;
  intervalMinutes: number;
  running: boolean;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  lastPulledCount: number | null;
}

const state = {
  running: false,
  lastRunAt: null as string | null,
  lastSuccessAt: null as string | null,
  lastErrorAt: null as string | null,
  lastError: null as string | null,
  lastPulledCount: null as number | null,
};

let timer: ReturnType<typeof setInterval> | null = null;

// ── Тик синхронизации ────────────────────────────────────────────────────────

async function runOneTick(): Promise<void> {
  if (state.running) {
    console.log('[autoSync] Предыдущая проверка ещё выполняется — пропускаем');
    return;
  }

  state.running = true;
  state.lastRunAt = new Date().toISOString();
  console.log('[autoSync] Запуск автоматической проверки заявок из Supabase...');

  try {
    const result = await syncSupabaseLeads();
    state.lastSuccessAt = new Date().toISOString();
    state.lastPulledCount = result.created;
    state.lastError = null;
    state.lastErrorAt = null;
    console.log(
      `[autoSync] Готово: получено=${result.fetched}, создано=${result.created}, пропущено=${result.skipped}, ошибок=${result.failed}`,
    );
  } catch (err) {
    state.lastErrorAt = new Date().toISOString();
    state.lastError = err instanceof Error ? err.message : String(err);
    // NOT_CONFIGURED — штатная ситуация, только предупреждение
    if (state.lastError.includes('не настроен')) {
      console.warn('[autoSync] Supabase не настроен, автосинхронизация пропущена');
    } else {
      console.error('[autoSync] Ошибка при синхронизации:', state.lastError);
    }
  } finally {
    state.running = false;
  }
}

// ── Управление планировщиком ─────────────────────────────────────────────────

function stopTimer(): void {
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
}

/**
 * Перезапускает планировщик с актуальными настройками из БД.
 * Вызывается:
 *   1. При старте сервера.
 *   2. При сохранении настроек интеграций (PUT /api/integration-settings).
 */
export function restartAutoSync(): void {
  stopTimer();

  let settings;
  try {
    settings = localDb.getIntegrationSettingsFull();
  } catch (err) {
    console.error('[autoSync] Не удалось прочитать настройки:', err);
    return;
  }

  if (!settings.supabaseAutoSyncEnabled) {
    console.log('[autoSync] Автосинхронизация отключена');
    return;
  }

  const intervalMinutes = Math.max(1, Number(settings.supabaseAutoSyncIntervalMinutes) || 5);
  const intervalMs = intervalMinutes * 60 * 1000;

  console.log(`[autoSync] Планировщик запущен, интервал: ${intervalMinutes} мин`);

  timer = setInterval(() => {
    runOneTick().catch((err) => {
      console.error('[autoSync] Неожиданная ошибка в тике:', err);
    });
  }, intervalMs);
}

/**
 * Возвращает текущий статус автосинхронизации.
 * Используется в GET /api/leads/auto-sync/status.
 */
export function getAutoSyncStatus(): AutoSyncStatus {
  let settings;
  try {
    settings = localDb.getIntegrationSettingsFull();
  } catch {
    settings = {};
  }

  return {
    enabled: Boolean(settings.supabaseAutoSyncEnabled),
    intervalMinutes: settings.supabaseAutoSyncIntervalMinutes || 5,
    running: state.running,
    lastRunAt: state.lastRunAt,
    lastSuccessAt: state.lastSuccessAt,
    lastErrorAt: state.lastErrorAt,
    lastError: state.lastError,
    lastPulledCount: state.lastPulledCount,
  };
}
