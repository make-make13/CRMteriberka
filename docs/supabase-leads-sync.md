# Синхронизация заявок: Supabase → CRM

## Архитектура

```
[Сайт Большая Медведица]
        │
        │  POST (anon key, только INSERT)
        ▼
[Supabase — таблица leads]
        │
        │  CRM сама забирает по запросу менеджера
        │  (service_role key — только на backend)
        ▼
[Локальная CRM — SQLite]
        │
        ▼
  Менеджер обрабатывает заявку
```

**Ключевой принцип:** Supabase — только входящий ящик. CRM не слушает вебхуки, не держит постоянное соединение. Синхронизация происходит по нажатию кнопки "Проверить заявки".

---

## Роли и ключи

| Ключ | Где используется | Права |
|---|---|---|
| `anon` (публичный) | Форма сайта (frontend) | только INSERT в `leads` |
| `service_role` (секретный) | Локальный сервер CRM (Node.js) | полный доступ |

**Важно:**
- `service_role` key **никогда** не попадает во frontend, в код сайта или в Git.
- Хранится только в `.env.local` на машине менеджера.
- `.env.local` добавлен в `.gitignore`.

---

## Настройка `.env.local`

```env
SUPABASE_URL=https://xxxxxxxxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
SUPABASE_LEADS_TABLE=leads
SUPABASE_LEAD_SYNC_LIMIT=50
```

Шаблон: `.env.example` (без секретов, хранится в Git).

---

## Как работает синхронизация

1. Менеджер нажимает кнопку **"Проверить заявки"** в разделе Заявки.
2. CRM делает `POST /api/leads/sync` на локальный сервер.
3. Сервер вызывает `syncSupabaseLeads()` (`server/supabaseLeadSync.ts`):
   - Загружает строки с `pulled_to_crm = false` из Supabase.
   - Для каждой строки создаёт локальную заявку в SQLite.
   - Защита от дублей: `supabase_id UNIQUE` — повторная синхронизация безопасна.
   - Помечает строку в Supabase: `pulled_to_crm = true`, `pulled_to_crm_at`, `crm_lead_id`.
4. Показывает менеджеру: "Загружено новых заявок: N".

---

## Схема таблицы Supabase

Файл: `supabase/leads_schema.sql`

Обязательные поля для синхронизации:

| Поле | Тип | Описание |
|---|---|---|
| `id` | uuid | первичный ключ |
| `phone` | text NOT NULL | телефон гостя (обязателен) |
| `pulled_to_crm` | boolean DEFAULT false | флаг: забрано ли в CRM |
| `pulled_to_crm_at` | timestamptz | когда забрано |
| `crm_lead_id` | text | id заявки в локальной CRM |
| `sync_error` | text | ошибка последней синхронизации |

Остальные поля (`guest_name`, `email`, `desired_start_date`, `message`, UTM и т.д.) — опциональны, но желательны.

---

## Настройка Supabase (первый раз)

1. Создать проект на [supabase.com](https://supabase.com).
2. В SQL Editor выполнить `supabase/leads_schema.sql`.
3. Скопировать `Project URL` и `service_role` key в `.env.local`.
4. Настроить форму сайта на INSERT в таблицу `leads` через `anon` key.

---

## Что НЕ нужно делать

- Не давать сайту `service_role` key — только `anon`.
- Не открывать порты CRM напрямую из интернета.
- Не хранить ключи в коде или в Git.
- Не включать realtime/вебхуки — pull-модель достаточна.
