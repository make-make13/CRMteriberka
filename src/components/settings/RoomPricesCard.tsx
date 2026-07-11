/**
 * Карточка «Стоимость номеров» в настройках.
 * Хранит цены в /api/settings/room-prices и вид на море в /api/settings/room-sea-view.
 * Формат цен: { 'cc-1': 27000, 'cc-2': 35000, ... }
 * Формат вида на море: { 'cc-1': true, 'cc-2': false, ... }
 */
import React, { useEffect, useState } from 'react';
import { BedDouble, Save, Loader2, Waves } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { CC_OBJECTS } from '../../constants';
import { settingsApi } from '../../services/localApi';
import { useToast } from '../../context/ToastContext';
import {
  ROOM_PRICES_SETTINGS_ID,
  ROOM_SEA_VIEW_SETTINGS_ID,
  getDefaultRoomPrices,
  getDefaultRoomSeaView,
} from '../../utils/roomCatalog';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export { ROOM_PRICES_SETTINGS_ID, getDefaultRoomPrices };

interface RoomPricesCardProps {
  isDarkMode: boolean;
}

export default function RoomPricesCard({ isDarkMode }: RoomPricesCardProps) {
  const { toast } = useToast();
  const [prices, setPrices] = useState<Record<string, number>>(getDefaultRoomPrices);
  const [seaViews, setSeaViews] = useState<Record<string, boolean>>(getDefaultRoomSeaView);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      settingsApi.getById<Record<string, number>>(ROOM_PRICES_SETTINGS_ID),
      settingsApi.getById<Record<string, boolean>>(ROOM_SEA_VIEW_SETTINGS_ID),
    ]).then(([savedPrices, savedSeaViews]) => {
      // Мёрджим сохранённое поверх дефолтных (на случай, если добавили новые номера)
      setPrices({ ...getDefaultRoomPrices(), ...(savedPrices || {}) });
      setSeaViews({ ...getDefaultRoomSeaView(), ...(savedSeaViews || {}) });
    }).finally(() => setLoading(false));
  }, []);

  const handleChange = (id: string, value: string) => {
    const num = parseInt(value, 10);
    setPrices(prev => ({ ...prev, [id]: isNaN(num) ? 0 : num }));
  };

  const handleSeaViewToggle = (id: string) => {
    setSeaViews(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await Promise.all([
        settingsApi.saveById(ROOM_PRICES_SETTINGS_ID, prices),
        settingsApi.saveById(ROOM_SEA_VIEW_SETTINGS_ID, seaViews),
      ]);
      toast('Стоимость и вид номеров сохранены', 'success');
    } catch {
      toast('Не удалось сохранить стоимость номеров', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={cn(
      'p-8 rounded-3xl border space-y-6',
      isDarkMode ? 'bg-[#111111] border-white/5' : 'bg-white border-gray-200 shadow-sm',
    )}>
      {/* Заголовок */}
      <div className="flex items-center gap-3 border-b border-white/5 pb-4">
        <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-500">
          <BedDouble size={20} />
        </div>
        <div>
          <h3 className="font-bold text-lg">Стоимость номеров</h3>
          <p className={cn('text-[11px] mt-0.5', isDarkMode ? 'text-gray-500' : 'text-gray-400')}>
            Цена за сутки и вид на море используются в шахматке, предброни и автоподстановке стоимости в договоре.
          </p>
        </div>
      </div>

      {/* Таблица номеров */}
      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 size={20} className="animate-spin text-gray-400" />
        </div>
      ) : (
        <div className="space-y-2">
          {CC_OBJECTS.map(obj => (
            <div key={obj.id} className={cn(
              'flex items-center gap-4 rounded-xl px-4 py-2.5',
              isDarkMode ? 'bg-white/[0.03]' : 'bg-gray-50',
            )}>
              {/* Название */}
              <div className="w-10 font-bold text-sm">{obj.name}</div>
              {/* Категория */}
              <div className={cn('flex-1 text-xs truncate', isDarkMode ? 'text-gray-400' : 'text-gray-500')}>
                {obj.category}
              </div>
              {/* Переключатель вида на море */}
              <label className={cn(
                'flex items-center gap-2 text-xs font-medium cursor-pointer select-none whitespace-nowrap',
                seaViews[obj.id]
                  ? 'text-[#2D9CDB]'
                  : (isDarkMode ? 'text-gray-500' : 'text-gray-400'),
              )}>
                <input
                  type="checkbox"
                  checked={Boolean(seaViews[obj.id])}
                  onChange={() => handleSeaViewToggle(obj.id)}
                  className="w-4 h-4 rounded accent-[#2D9CDB] cursor-pointer"
                />
                <Waves size={14} />
                Вид на море
              </label>
              {/* Поле цены */}
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  step={500}
                  value={prices[obj.id] ?? 0}
                  onChange={e => handleChange(obj.id, e.target.value)}
                  className={cn(
                    'w-28 px-3 py-1.5 rounded-lg text-sm text-right outline-none border transition-all',
                    isDarkMode
                      ? 'bg-white/5 border-white/10 focus:border-orange-500 text-white'
                      : 'bg-white border-gray-200 focus:border-orange-500 text-gray-900',
                  )}
                />
                <span className={cn(
                  'text-xs font-medium whitespace-nowrap',
                  isDarkMode ? 'text-gray-500' : 'text-gray-400',
                )}>₽/сут</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Кнопка сохранения */}
      <button
        type="button"
        onClick={handleSave}
        disabled={saving || loading}
        className={cn(
          'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all disabled:opacity-50',
          isDarkMode
            ? 'bg-[#D98E2B] text-[#1A1C1B] hover:bg-[#F2B35B]'
            : 'bg-orange-500 text-white hover:bg-orange-600',
        )}
      >
        {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
        Сохранить
      </button>
    </section>
  );
}
