/**
 * Карточка «Стоимость номеров» в настройках.
 * Хранит цены в /api/settings/room-prices (settingsApi.saveById).
 * Формат: { 'cc-1': 27000, 'cc-2': 35000, ... }
 */
import React, { useEffect, useState } from 'react';
import { BedDouble, Save, Loader2 } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { CC_OBJECTS } from '../../constants';
import { settingsApi } from '../../services/localApi';
import { useToast } from '../../context/ToastContext';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const ROOM_PRICES_SETTINGS_ID = 'room-prices';

/** Возвращает дефолтные цены из CC_OBJECTS (используется как fallback). */
export function getDefaultRoomPrices(): Record<string, number> {
  const result: Record<string, number> = {};
  CC_OBJECTS.forEach(obj => {
    result[obj.id] = obj.pricePerNight ?? 0;
  });
  return result;
}

interface RoomPricesCardProps {
  isDarkMode: boolean;
}

export default function RoomPricesCard({ isDarkMode }: RoomPricesCardProps) {
  const { toast } = useToast();
  const [prices, setPrices] = useState<Record<string, number>>(getDefaultRoomPrices);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    settingsApi.getById<Record<string, number>>(ROOM_PRICES_SETTINGS_ID).then(saved => {
      if (saved && typeof saved === 'object') {
        // Мёрджим сохранённые поверх дефолтных (на случай, если добавили новые номера)
        setPrices({ ...getDefaultRoomPrices(), ...saved });
      }
    }).finally(() => setLoading(false));
  }, []);

  const handleChange = (id: string, value: string) => {
    const num = parseInt(value, 10);
    setPrices(prev => ({ ...prev, [id]: isNaN(num) ? 0 : num }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await settingsApi.saveById(ROOM_PRICES_SETTINGS_ID, prices);
      toast('Стоимость номеров сохранена', 'success');
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
            Цена за сутки используется для автоподстановки стоимости проживания в договоре.
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
                {obj.category}{obj.seaView ? ' · вид на море' : ''}
              </div>
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
