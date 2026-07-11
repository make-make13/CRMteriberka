import type { ObjectDefinition } from '../types';
import { CC_OBJECTS } from '../constants';

/**
 * Единый источник правды для переопределений каталога номеров (ЧЧ),
 * задаваемых в Настройки → Стоимость номеров: цена за сутки и вид на море.
 * Хранится в общей таблице settings (см. server/localDatabase.ts getSettings/saveSettings).
 */
export const ROOM_PRICES_SETTINGS_ID = 'room-prices';
export const ROOM_SEA_VIEW_SETTINGS_ID = 'room-sea-view';

/** Дефолтные цены номеров ЧЧ из constants.ts (fallback, если в настройках ничего не сохранено). */
export function getDefaultRoomPrices(): Record<string, number> {
  const result: Record<string, number> = {};
  CC_OBJECTS.forEach(obj => {
    result[obj.id] = obj.pricePerNight ?? 0;
  });
  return result;
}

/** Дефолтный признак «вид на море» из constants.ts. */
export function getDefaultRoomSeaView(): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  CC_OBJECTS.forEach(obj => {
    result[obj.id] = Boolean(obj.seaView);
  });
  return result;
}

/**
 * Применяет сохранённые в настройках цены и вид на море поверх каталога номеров ЧЧ.
 * Используется везде, где показывается цена/вид номера (шахматка, предбронь, договор),
 * чтобы изменения в настройках были видны сразу и одинаково во всём приложении.
 */
export function applyRoomOverrides(
  prices: Record<string, number>,
  seaViews: Record<string, boolean>,
): ObjectDefinition[] {
  return CC_OBJECTS.map(obj => ({
    ...obj,
    pricePerNight: prices[obj.id] ?? obj.pricePerNight,
    seaView: seaViews[obj.id] ?? obj.seaView,
  }));
}
