/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface BMRoom {
  id: string;
  name: string;
  category: string;
  active: boolean;
  includeInOccupancy: boolean;
}

/**
 * Номерной фонд гостиницы «Большая Медведица».
 * Соответствует 20 стандартным номерам (id с префиксом cc-),
 * которые реально используются в базе данных и на шахматке.
 */
export const BM_ROOMS: BMRoom[] = [
  { id: 'cc-1', name: '№1', category: 'Двухместный стандарт', active: true, includeInOccupancy: true },
  { id: 'cc-2', name: '№2', category: 'Джуниор сьют', active: true, includeInOccupancy: true },
  { id: 'cc-3', name: '№3', category: 'Джуниор сьют', active: true, includeInOccupancy: true },
  { id: 'cc-4', name: '№4', category: 'Двухместный стандарт', active: true, includeInOccupancy: true },
  { id: 'cc-5', name: '№5', category: 'Двухместный стандарт', active: true, includeInOccupancy: true },
  { id: 'cc-6', name: '№6', category: 'Джуниор сьют', active: true, includeInOccupancy: true },
  { id: 'cc-7', name: '№7', category: 'Одноместный стандарт', active: true, includeInOccupancy: true },
  { id: 'cc-8', name: '№8', category: 'Одноместный стандарт', active: true, includeInOccupancy: true },
  { id: 'cc-9', name: '№9', category: 'Двухместный стандарт', active: true, includeInOccupancy: true },
  { id: 'cc-10', name: '№10', category: 'Двухместный стандарт', active: true, includeInOccupancy: true },
  { id: 'cc-11', name: '№11', category: 'Двухместный стандарт', active: true, includeInOccupancy: true },
  { id: 'cc-12', name: '№12', category: 'Одноместный стандарт', active: true, includeInOccupancy: true },
  { id: 'cc-13', name: '№13', category: 'Одноместный стандарт', active: true, includeInOccupancy: true },
  { id: 'cc-14', name: '№14', category: 'Одноместный стандарт', active: true, includeInOccupancy: true },
  { id: 'cc-15', name: '№15', category: 'Двухместный стандарт', active: true, includeInOccupancy: true },
  { id: 'cc-16', name: '№16', category: 'Двухместный стандарт', active: true, includeInOccupancy: true },
  { id: 'cc-17', name: '№17', category: 'Джуниор сьют', active: true, includeInOccupancy: true },
  { id: 'cc-18', name: '№18', category: 'Джуниор сьют', active: true, includeInOccupancy: true },
  { id: 'cc-19', name: '№19', category: 'Двухместный стандарт', active: true, includeInOccupancy: true },
  { id: 'cc-20', name: '№20', category: 'Апартаменты', active: true, includeInOccupancy: true }
];

/**
 * Флаг полноты номерного фонда.
 * Если true: на дашборде пишется "X номеро-ночей занято из Y доступных".
 * Если false: пишется "X номеро-ночей занято" и пометка "Номерной фонд требует уточнения".
 */
export const IS_BM_ROOMS_COMPLETE = true;
