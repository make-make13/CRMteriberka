-- ============================================================
-- Supabase: таблица leads
-- Используется как входящий ящик заявок с сайта Большая Медведица.
-- Локальная CRM (SQLite) забирает заявки кнопкой "Проверить заявки"
-- и помечает их как обработанные (pulled_to_crm = true).
--
-- НЕ КЛАСТЬ в этот файл: service_role key, пароли, секреты.
-- ============================================================

-- Включить расширение uuid-ossp, если нужны UUID (опционально)
-- create extension if not exists "uuid-ossp";

create table if not exists leads (
  -- Идентификатор
  id            uuid primary key default gen_random_uuid(),

  -- Временны́е метки
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- Данные гостя
  guest_name    text,
  phone         text not null,
  email         text,

  -- Пожелания по проживанию
  desired_start_date  date,
  desired_end_date    date,
  desired_time        text,        -- например "14:00"
  guests_count        integer,
  object_type         text,        -- пожелание по номеру
  object_id           text,        -- конкретный объект (опционально)

  -- Сообщение
  message       text,

  -- Источник (значение для leadDisplay.SOURCE_LABELS)
  -- Примеры: 'bolshaya-medveditsa-landing', 'website', 'local'
  source        text not null default 'bolshaya-medveditsa-landing',

  -- Статус заявки на стороне Supabase (необязательно, CRM ставит свой)
  status        text not null default 'new',

  -- UTM и технические данные
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  utm_content   text,
  utm_term      text,
  page_url      text,
  referrer      text,
  user_agent    text,

  -- Поля синхронизации с CRM
  -- CRM читает строки где pulled_to_crm = false
  -- После загрузки CRM проставляет pulled_to_crm = true
  pulled_to_crm     boolean not null default false,
  pulled_to_crm_at  timestamptz,
  crm_lead_id       text,           -- id заявки в локальной SQLite CRM
  sync_error        text            -- текст ошибки при последней синхронизации
);

-- ============================================================
-- Индексы
-- ============================================================

-- Основной индекс для синхронизации: CRM выбирает WHERE pulled_to_crm = false
create index if not exists idx_leads_pulled_to_crm
  on leads (pulled_to_crm)
  where pulled_to_crm = false;

-- Сортировка и поиск по дате
create index if not exists idx_leads_created_at
  on leads (created_at desc);

-- Поиск по телефону (дедупликация, поиск)
create index if not exists idx_leads_phone
  on leads (phone);

-- ============================================================
-- RLS (Row Level Security)
-- Рекомендуется включить. Сайт использует anon key только для INSERT.
-- CRM использует service_role key на backend — обходит RLS.
-- ============================================================

-- Включить RLS
alter table leads enable row level security;

-- Политика: anon может только вставлять новые заявки (форма сайта)
create policy "anon can insert leads"
  on leads for insert
  to anon
  with check (true);

-- Политика: читать и обновлять может только service_role (CRM backend)
-- service_role по умолчанию обходит RLS — дополнительных политик не нужно.

-- ============================================================
-- Триггер: обновлять updated_at при каждом UPDATE
-- ============================================================

create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger leads_updated_at
  before update on leads
  for each row execute function update_updated_at();
