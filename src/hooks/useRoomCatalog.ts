import { useEffect, useState } from 'react';
import type { ObjectDefinition } from '../types';
import { CC_OBJECTS } from '../constants';
import { settingsApi } from '../services/localApi';
import {
  ROOM_PRICES_SETTINGS_ID,
  ROOM_SEA_VIEW_SETTINGS_ID,
  getDefaultRoomPrices,
  getDefaultRoomSeaView,
  applyRoomOverrides,
} from '../utils/roomCatalog';

/**
 * Каталог номеров ЧЧ (CC_OBJECTS) с применёнными настройками из
 * Настройки → Стоимость номеров (цена за сутки, вид на море).
 * Пока настройки не загрузились (или недоступны) — отдаёт дефолт из constants.ts,
 * чтобы UI не мигал пустотой.
 */
export function useRoomCatalog(): { objects: ObjectDefinition[]; loading: boolean } {
  const [objects, setObjects] = useState<ObjectDefinition[]>(CC_OBJECTS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      settingsApi.getById<Record<string, number>>(ROOM_PRICES_SETTINGS_ID),
      settingsApi.getById<Record<string, boolean>>(ROOM_SEA_VIEW_SETTINGS_ID),
    ])
      .then(([savedPrices, savedSeaViews]) => {
        if (cancelled) return;
        const prices = { ...getDefaultRoomPrices(), ...(savedPrices || {}) };
        const seaViews = { ...getDefaultRoomSeaView(), ...(savedSeaViews || {}) };
        setObjects(applyRoomOverrides(prices, seaViews));
      })
      .catch(() => {
        // тихий fallback — остаётся дефолтный каталог из constants.ts
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { objects, loading };
}
