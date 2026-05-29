# UI Style Guide — Большая Медведица CRM

**Last Updated**: 2026-05-29  
**Branch**: `feature/chessboard-restyle`  
**Dark Mode Only**: All specifications below apply exclusively to `isDarkMode === true`

---

## 1. Общий принцип (Design Philosophy)

Компактный, enterprise-grade dark CRM с высокой информационной плотностью. Элементы расположены плотно, без излишних панелей и отступов. Дизайн ориентирован на быстрое восприятие и работу оператора.

**Запрещено в будущем:**
- Создавать большие, ненужные панели-обёртки вокруг контента
- Применять Dribbble-стиль (яркие акценты везде, градиенты, тени)
- Конкурировать цветами фильтров с основным CTA (оранжевый/amber зарезервирован ТОЛЬКО для кнопок действий)
- Расширять таблицы без причины; сохранять компактность

---

## 2. Цветовые токены (Color Tokens)

### Фон и слои интерфейса (Background Layers)

| Роль | Hex | RGB | Использование |
|------|-----|-----|---|
| **Page Background** | `#050505` | rgb(5, 5, 5) | Основной фон приложения (App.tsx `bg-[#050505]`) |
| **Surface / Table** | `#111111` | rgb(17, 17, 17) | Фон таблиц, вложенных областей (Leads, Clients, Contracts) |
| **Input / Header Layer** | `#161616` | rgb(22, 22, 22) | Фон инпутов, заголовков таблиц, неактивные фильтры |
| **Border / Divider** | `#232323` | rgb(35, 35, 35) | Border между элементами (таблицы, модали) |
| **Secondary Border** | `#262626` | rgb(38, 38, 38) | Альтернативный border для старых компонентов (Additional) |

### Текст (Text Colors)

| Роль | Hex | RGB | Использование |
|------|-----|-----|---|
| **Primary Text** | `#F4F1EA` | rgb(244, 241, 234) | Основной текст (заголовки, основной контент) |
| **Secondary Text** | `#8F9894` | rgb(143, 152, 148) | Вторичный текст (подписи, хинты, disabled статус) |
| **Muted Text** (старое) | `#8B8B8B` | rgb(139, 139, 139) | Legacy значение (Contracts, Additional) — вытесняется на `#8F9894` |

### Интерактивные элементы (Interactive Colors)

#### Primary CTA Button (Основная кнопка действия)

| Состояние | Hex | RGB | Использование |
|-----------|-----|-----|---|
| **Background** | `#F59E0B` | rgb(245, 158, 11) | Заполненные кнопки: "Новая заявка", "Добавить гостя", "Новый договор", active фильтры |
| **Text** | `#050505` | rgb(5, 5, 5) | Текст на кнопке (чёрный, обратный контраст) |
| **Hover** | `#D97706` | rgb(217, 119, 6) | На :hover (темнее, более коричневый) |
| **Focus/Shadow** | `rgba(245, 158, 11, 0.3)` | — | Shadow для active фильтров: `shadow-[0_0_15px_rgba(245,158,11,0.3)]` |

**Правило**: Amber #F59E0B используется ТОЛЬКО для:
- Основных кнопок действия (CTA)
- Active состояния фильтров

Secondary и inactive кнопки НИКОГДА не используют этот цвет.

#### Input Focus Border

| Состояние | Hex | RGB | Использование |
|-----------|-----|-----|---|
| **Focus Border** | `#F97316` | rgb(249, 115, 22) | Border на фокусе инпутов (более оранжевый, чем amber) |
| **Opacity** | 60% | — | `focus:border-[#F97316]/60` — полусквозной для мягкости |

**Примечание**: `#F97316` — это tailwind `orange-500`, более красноватый чем `#F59E0B` (amber). Используется ТОЛЬКО для фокуса инпутов, НЕ для кнопок.

### Статусы и семантика (Status Colors)

#### Lead / Status Badges

| Статус | Background | Text | Hex Background |
|--------|------------|------|---|
| **Новая** | blue-500/10 | blue-400 | — |
| **В работе** | amber-500/10 | amber-400 | — |
| **Гость создан** | green-500/10 | green-500 | — |
| **Предбронь** | sky-500/10 | sky-400 | — |
| **Договор** | green-500/10 | green-500 | — |
| **Отказ** | red-500/10 | red-500 | — |
| **Дубль** (Neutral) | `#161616` | `#8F9894` | `#161616` |

**Паттерн**: Все статусы используют `rounded-full px-2.5 py-1 font-semibold` без border.

#### Contract Status Badges (Contracts.tsx)

| Статус | Background | Text |
|--------|------------|------|
| **Paid / Closed** | green-500/10 | green-500 |
| **Cancelled** | red-500/10 | red-500 |
| **Signed Not Paid** | orange-500/10 | orange-400 |
| **Pre-booking** (default) | blue-500/10 | blue-500 |

#### Booking Status (Chessboard)

| Статус | Background | Text |
|--------|------------|------|
| **Забронирован** | `#F97316` | white | 
| **Предбронь** | `#2D9CDB` | white |

**Примечание**: На Chessboard используются solid цвета (#F97316, #2D9CDB) с white текстом для visibility в таблице. Это исключение из общего паттерна badge.

### Вспомогательные цвета (Accent / Icon Colors)

| Роль | Hex | RGB | Использование |
|------|-----|-----|---|
| **Icon / Teal** | `#8CAFBE` | rgb(140, 175, 190) | Sea wave icon, login button |
| **Delete / Danger** | `#FF5555` или `red-500` | — | Trash icon, delete button (legacy: `#F3B2BF` — DEPRECATED) |

---

## 3. Слои интерфейса (Interface Layers)

### Иерархия глубины (Z-depth)

1. **Page Layer** (`#050505`) — базовый фон всего приложения
2. **Surface Layer** (`#111111`) — таблицы, контейнеры контента
3. **Elevated Layer** (`#161616`) — инпуты, заголовки, неактивные фильтры
4. **Interactive Layer** — hover/focus состояния (немного светлее: `#1A1A1A`, `#232323`)

### Применение слоёв по экранам

- **Chessboard (Шахматка)**: Page → Surface (таблица) → Elevated (заголовок)
- **Leads (Заявки)**: Page → Surface (таблица) → Elevated (фильтры, инпут)
- **Clients (Гости)**: Page → Surface (таблица) → Elevated (фильтры, инпут)
- **Contracts (Договоры)**: Page → Surface (таблица) → Elevated (фильтры)
- **Additional (Дополнительно)**: Page → Surface (карточки) → Elevated (инпуты)

---

## 4. Кнопки (Buttons)

### Primary CTA (Основная кнопка действия)

```css
/* Заполненная, amber */
background-color: #F59E0B;
color: #050505;
border: none;
border-radius: 8px;
padding: 10px 16px;
font-weight: 700;
font-size: 14px;

/* Hover */
background-color: #D97706;

/* Примеры */
"Новая заявка" (Leads.tsx)
"Добавить гостя" (Clients.tsx)
"Новый договор" (Contracts.tsx)
```

**CSS класс**: `"bg-[#F59E0B] text-[#050505] hover:bg-[#D97706]"`

**Где применяется**: 
- Header CTA кнопки в каждом экране
- EmptyState CTA
- Active фильтр (с shadow)

### Secondary Button (Нейтральная кнопка)

```css
background-color: #161616;
color: #F4F1EA;
border: 1px solid #232323;
border-radius: 8px;
padding: 10px 16px;
font-weight: 600;
font-size: 14px;

/* Hover */
background-color: #232323;
```

**CSS класс**: `"bg-[#161616] text-[#F4F1EA] hover:bg-[#232323]" `

**Где применяется**:
- Неактивные фильтры
- "Открыть" кнопки в таблицах
- Secondary действия (Cancel, Close)

### Danger / Delete Button

```css
background-color: transparent;
color: #FF5555 (или red-500);
border: none;
border-radius: 8px;
padding: 8px;
font-weight: 600;

/* Hover */
background-color: rgba(255, 85, 85, 0.1);
```

**CSS класс**: `"bg-red-500/10 text-red-500 hover:bg-red-500/20"`

**Где применяется**:
- Trash (delete) icon button в таблицах Clients
- Reject button в Lead modal

### Неактивный / Disabled Button

```css
opacity: 0.5;
cursor: not-allowed;
/* остальные стили как у активной версии */
```

---

## 5. Таблицы (Tables)

### Структура

```css
/* Контейнер таблицы */
background-color: #111111;
border: 1px solid #232323;
border-radius: 12px;
overflow: hidden;

/* Заголовок (TH) */
background-color: #161616;
color: #8F9894;
border-bottom: 1px solid #232323;
padding: 12px 20px;
font-weight: 700;
font-size: 12px;
text-transform: uppercase;
letter-spacing: 0.5px;

/* Ячейка строки (TD) */
color: #F4F1EA;
padding: 14px 20px;
border-bottom: 1px solid #232323;
font-size: 14px;

/* Последняя строка */
border-bottom: none;

/* Hover строка */
background-color: #161616;
```

### Высота строк и отступы

- **Header row**: `py-2.5` (10px vertical padding)
- **Data rows**: `py-3` или `py-3.5` (12-14px vertical padding) — для компактности CRM
- **Column padding**: `px-5` (20px horizontal)

### Текстовые стили в таблице

| Элемент | Font Size | Weight | Color |
|---------|-----------|--------|-------|
| **Заголовок** | 12px | 700 | `#8F9894` |
| **Основной текст** | 14px | 400 | `#F4F1EA` |
| **Вторичный текст** | 12px | 400 | `#8F9894` |
| **Подчеркнутый** | 14px | 700 | `#F4F1EA` |

### Примеры из кода

```javascript
// Leads.tsx
<th className="border-b border-[#232323] px-5 py-3">Дата</th>
<td className="border-b border-[#232323] px-5 py-3">...</td>

// Clients.tsx
<th className="px-4 py-2.5 border-b border-[#232323]">Имя / Организация</th>

// Hover эффект
<tr className={cn(
  isDarkMode ? "hover:bg-[#161616]" : "hover:bg-gray-50"
)}>
```

---

## 6. Фильтры и вкладки (Filters & Tabs)

### Active Filter (Активный фильтр)

```css
background-color: #F59E0B;
color: #050505;
border: none;
border-radius: 6px;
padding: 8px 12px;
font-size: 13px;
font-weight: 600;

/* Glow effect */
box-shadow: 0 0 15px rgba(245, 158, 11, 0.3);
```

**CSS класс**: `"bg-[#F59E0B] text-[#050505] shadow-[0_0_15px_rgba(245,158,11,0.3)]"`

**Где применяется**: Leads, Clients, Contracts фильтры (только активный)

### Inactive Filter (Неактивный фильтр)

```css
background-color: #161616;
color: #8F9894;
border: 1px solid #232323;
border-radius: 6px;
padding: 8px 12px;
font-size: 13px;
font-weight: 600;

/* Hover */
background-color: #1A1A1A;
color: #F4F1EA;
```

**CSS класс**: `"bg-[#161616] border border-[#232323] text-[#8F9894] hover:bg-[#1A1A1A] hover:text-[#F4F1EA]"`

**Правило**: Inactive фильтры НИКОГДА не используют orange/amber. Это зарезервировано ТОЛЬКО для активного фильтра и CTA кнопок.

### Search Input (рядом с фильтрами)

```css
background-color: #161616;
border: 1px solid #232323;
color: #F4F1EA;
padding: 10px 12px 10px 36px; /* place for icon */
border-radius: 8px;
font-size: 13px;

/* Icon */
color: #8F9894;

/* Placeholder */
color: rgba(143, 152, 148, 0.6);

/* Focus */
border-color: rgba(249, 115, 22, 0.6); /* F97316 at 60% */
```

**CSS класс**: `"bg-[#161616] border-[#232323] text-[#F4F1EA] placeholder:text-[#8F9894]/60 focus:border-[#F59E0B]/60"`

---

## 7. Шахматка (Chessboard) — специальные правила

### Фон таблицы

```css
background-color: #111111;
border: 1px solid #232323;
```

### Заголовок дня

```css
background-color: #161616;
color: #F4F1EA;
font-size: 12px;
font-weight: 700;
text-transform: uppercase;
border: 1px solid #232323;
padding: 12px;
```

### Ячейка номера комнаты

```css
background-color: #111111;
color: #F4F1EA;
font-size: 14px;
font-weight: 700;
padding: 16px;
border-right: 1px solid #232323;
```

### Статус бронирования на ячейке

| Статус | Background | Text | Padding |
|--------|------------|------|---------|
| **Забронирован** | `#F97316` | white | 8px 12px |
| **Предбронь** | `#2D9CDB` | white | 8px 12px |
| **Свободен** | none (no highlight) | — | — |

**Правило**: "Свободен" статус НЕ выделяется никак (no colored pill). Это пустая ячейка.

### Легенда (Legend)

Упрощенная, без обёртки:
```css
display: flex;
gap: 16px;
font-size: 12px;
color: #8F9894;

/* Dot */
width: 10px;
height: 10px;
border-radius: 50%;
```

**Цвета в легенде**:
- Забронирован: `#F97316` (оранжевый)
- Предбронь: `#2D9CDB` (голубой)
- (Свободен удалён из легенды)

### Иконка "Вид на море" (Sea icon)

```css
color: #8CAFBE;
size: 18px;
stroke-width: 2.5;
```

### Цена внизу ячейки комнаты

```css
color: #F97316;
font-size: 12px;
font-weight: 700;
```

---

## 8. Типография (Typography)

### Размеры шрифтов по назначению

| Элемент | Size | Weight | Usage |
|---------|------|--------|-------|
| **App Header / Logo** | 16px | 700 | "Большая Медведица" в навигации |
| **Screen Title** | 20px | 700 | "Заявки", "Гости", "Договоры" |
| **Table Header** | 12px | 700 | Заголовки столбцов (uppercase) |
| **Table Cell Primary** | 14px | 700 | Основной текст в ячейке |
| **Table Cell Secondary** | 12px | 400 | Дополнительный текст в ячейке |
| **Button / Filter** | 14px | 600 | Текст на кнопках |
| **Badge / Status** | 12px | 600 | Status pills |
| **Small Text / Caption** | 12px | 400 | Подписи, hints |
| **Input Placeholder** | 14px | 400 | На инпутах |
| **Help Text** | 11px | 400 | Очень мелкие подписи |

### Font Stack

```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
            'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
            sans-serif;
```

### Line Height

- **Заголовки**: 1.2 (120%)
- **Основной текст**: 1.5 (150%)
- **Таблицы**: 1.4 (140%)

---

## 9. Инпуты и формы (Inputs & Forms)

### Text Input (Стандартный)

```css
background-color: #161616;
border: 1px solid #232323;
color: #F4F1EA;
border-radius: 8px;
padding: 10px 12px;
font-size: 14px;

/* Placeholder */
color: rgba(143, 152, 148, 0.6);

/* Focus */
border-color: rgba(249, 115, 22, 0.6);
outline: none;
```

**CSS класс**: `"bg-[#161616] border-[#232323] text-[#F4F1EA] placeholder:text-[#8F9894]/60 focus:border-[#F97316]/60"`

### Select / Combobox

```css
/* Аналогично input, но со стрелкой */
appearance: none;
background-image: url('data:image/svg+xml,...');
padding-right: 36px;
```

### Checkbox / Radio

```css
accent-color: #F59E0B; /* для checked состояния */
```

### Disabled Input

```css
opacity: 0.6;
cursor: not-allowed;
```

---

## 10. Модали и панели (Modals & Panels)

### Modal Container

```css
background-color: #111111;
border: 1px solid rgba(255, 255, 255, 0.1);
border-radius: 12px;
box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
```

### Modal Header

```css
border-bottom: 1px solid #3D423E; /* или #232323 */
padding: 24px;
display: flex;
align-items: center;
justify-content: space-between;
```

### Modal Content

```css
padding: 24px;
```

### Modal Footer

```css
border-top: 1px solid #3D423E;
padding: 24px;
display: flex;
justify-content: flex-end;
gap: 12px;
```

---

## 11. Навигация (Navigation)

### Header

```css
background-color: rgba(5, 5, 5, 0.95); /* #050505 с 95% opacity */
border-bottom: 1px solid #232323;
height: 64px;
display: flex;
align-items: center;
padding: 0 24px;
```

### Nav Button / Tab (Active)

```css
background-color: #232323;
color: #F4F1EA;
border-radius: 8px;
padding: 8px 16px;
font-size: 14px;
font-weight: 700;
ring: 1px ring rgba(255, 255, 255, 0.1); /* subtle outline */
```

### Nav Button / Tab (Inactive)

```css
background-color: transparent;
color: #8F9894;
border-radius: 8px;
padding: 8px 16px;
font-size: 14px;
font-weight: 700;

/* Hover */
background-color: #161616;
color: #F4F1EA;
```

---

## 12. Запрещённое в будущем (Forbidden Patterns)

### ❌ **Do NOT**

1. **Создавать большие панели-обёртки** вокруг контента без причины
   - ❌ `<div className="rounded-2xl border p-4 bg-[#0A0A0A]">` вокруг всей таблицы
   - ✅ Таблица и фильтры должны быть свободными, без лишней обёртки

2. **Смешивать amber (#F59E0B) с другими контекстами**
   - ❌ Использовать amber для неактивных фильтров, secondary кнопок, иконок
   - ✅ Amber ТОЛЬКО для primary CTA и active фильтра

3. **Применять orange (#F97316) на кнопках или фильтрах**
   - ❌ CTA кнопка в orange #F97316
   - ✅ Orange ТОЛЬКО для focus border на инпутах

4. **Удалять статус "Свободен" из legend без согласования** (он уже удалён сейчас, это документирует текущее состояние)
   - ❌ Снова добавлять Свободен в legend или выделять его цветом

5. **Менять row height таблиц без причины**
   - ✅ Стандарт: `py-3` для данных, `py-2.5` для headers

6. **Использовать bright accents везде** (Dribbble-стиль)
   - ❌ Светлые, яркие цвета на каждом элементе
   - ✅ Цвета только для целевых элементов (CTA, status, danger)

7. **Изменять цвет текста без документирования** — используйте ТОЛЬКО `#F4F1EA` (primary) и `#8F9894` (secondary)
   - ❌ Оттенки серого, как `#B4CDD2`, `#6E6964` (old palette) — они deprecated

8. **Расширять таблицу без причины** или добавлять горизонтальный скролл
   - ✅ Сохранять компактность, текст может быть truncated если нужно

9. **Применять shadow к элементам без причины**
   - ✅ Shadow ТОЛЬКО на modal/popup контексте и для focus states (input, button)

10. **Менять border radius без согласования**
    - ✅ Стандарт: `rounded-8` (8px) для кнопок, `rounded-12` (12px) для контейнеров, `rounded-full` для badges

---

## 13. Примеры по экранам (Screen-Specific Examples)

### Шахматка (Chessboard)

```
Page bg: #050505
↓
Table bg: #111111 + border-[#232323]
↓
Header row: bg-[#161616] + text-[#8F9894]
↓
Data rows: text-[#F4F1EA]
↓
Booking pill: bg-[#F97316] text-white (OR bg-[#2D9CDB] for pre-booking)
↓
Legend: flex gap-4, dots are colored, text is #8F9894
↓
Filters: amber for active, neutral #161616 for inactive
```

### Заявки (Leads)

```
Page bg: #050505
↓
"Новая заявка" CTA: bg-[#F59E0B] text-[#050505] hover:bg-[#D97706]
↓
Search: bg-[#161616] border-[#232323] focus:border-[#F97316]/60
↓
Filters: 
  - "Все" (active): bg-[#F59E0B] + glow
  - Others (inactive): bg-[#161616] border-[#232323]
↓
Table header: bg-[#161616] text-[#8F9894]
↓
Table rows: text-[#F4F1EA], hover:bg-[#161616]
↓
Status badges (pills): 
  - Новая: blue-500/10
  - В работе: amber-500/10
  - Гость создан: green-500/10
  - Договор: green-500/10
  - Отказ: red-500/10
  - Дубль: bg-[#161616] text-[#8F9894]
```

### Гости (Clients)

```
Page bg: #050505
↓
"Добавить гостя" CTA: bg-[#F59E0B] text-[#050505] hover:bg-[#D97706]
↓
Search: bg-[#161616] border-[#232323]
↓
Filters: active amber, inactive neutral
↓
Table:
  - Header: bg-[#161616] text-[#8F9894]
  - Rows: text-[#F4F1EA], hover:bg-[#161616]
  - Delete button: h-9 w-9 bg-red-500/10 text-red-500 hover:bg-red-500/20
↓
Status badges: 
  - Активен: green-500/10 text-green-500
  - Чёрный список: red-500/10 text-red-500
```

### Договоры (Contracts)

```
Page bg: #050505
↓
"Новый договор" CTA: bg-[#F59E0B] text-[#050505] hover:bg-[#D97706]
↓
Search / Date filters: bg-[#161616] border-[#232323]
↓
Status filter (active): bg-[#F59E0B] with shadow-[0_0_15px_rgba(245,158,11,0.3)]
↓
Table:
  - Header: bg-[#161616] text-[#8F9894]
  - Rows: text-[#F4F1EA], hover:bg-[#1A1A1A]
↓
Contract status badges:
  - Paid / Closed: green-500/10
  - Cancelled: red-500/10
  - Signed Not Paid: orange-500/10
  - Pre-booking (default): blue-500/10
↓
Action buttons:
  - "На печать": bg-[#161616] text-[#F4F1EA] hover:bg-[#232323]
  - "На отправку": bg-orange-500/10 text-orange-400 hover:bg-orange-500/20
```

---

## 14. Переход от старой палитры (Legacy → Current)

### Deprecated Colors (больше НЕ используются)

| Old Color | Old Hex | New Replacement | New Hex |
|-----------|---------|-----------------|---------|
| Old Gold | `#D98E2B` | Amber (CTA) | `#F59E0B` |
| Old Teal | `#2D9CDB` | (Chessboard only, kept for pre-booking) | `#2D9CDB` |
| Light Teal (text) | `#B4CDD2` | Secondary text | `#8F9894` |
| Gray (text) | `#6E6964` | Secondary text | `#8F9894` |
| Dark Gray (text) | `#8B8B8B` | Secondary text | `#8F9894` |
| Pale Pink (ban icon) | `#F3B2BF` | Danger red | `red-500` |
| Old page bg | `#0A0A0A` | Page bg | `#050505` |
| Old border | `#262626` | Border | `#232323` |

**Migration Rule**: Если вы видите старые цвета в коде, замените их на новые согласно таблице выше.

---

## 15. Проверка соответствия (Compliance Checklist)

При добавлении нового элемента, проверьте:

- [ ] Фон выбран из слоёв (page, surface, elevated)?
- [ ] Текст использует ТОЛЬКО #F4F1EA или #8F9894?
- [ ] CTA кнопка в amber (#F59E0B) БЕЗ border?
- [ ] Inactive фильтры в #161616 БЕЗ amber?
- [ ] Таблица использует #232323 для borders?
- [ ] Input focus border в #F97316/60?
- [ ] Status badge в patten: bg-{color}/10 text-{color} без border?
- [ ] Row hover в #161616 или немного светлее?
- [ ] Никаких больших ненужных панелей?
- [ ] Нет смешивания old palette цветов?

---

## 16. Контакты и обновления

**Документ создан**: 2026-05-29  
**Branch**: `feature/chessboard-restyle`  
**Commits included**: 
- d02bb6d (chessboard restyle)
- 42618dd (compact dark palette)
- d265917 (badges/buttons)
- 1ed2077 (amber CTA)
- 030b5d0 (ban icon red)
- cd80b75 (full Leads restyle)

**Последнее обновление**: 2026-05-29 — документирование фактической дизайн-системы из рабочего кода и live interface inspection.

При изменении стилей ВСЕГДА обновляйте этот документ. Это ИСТОЧНИК ИСТИНЫ для всех будущих работ с UI.
