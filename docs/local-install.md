# Локальная установка CRM «Большая Медведица»

CRM работает как локальная программа на компьютере менеджера или на сервере гостиницы.

---

## Что нужно для работы

### 1. Node.js

- Версия: **18 или новее**
- Скачать: [nodejs.org](https://nodejs.org/)

После установки проверить:
```
node -v
npm -v
```

### 2. LibreOffice

Нужен для конвертации договоров из DOCX в PDF прямо в CRM.

- Скачать: [libreoffice.org/download](https://www.libreoffice.org/download/download/)
- Установить в стандартный путь — CRM найдёт его автоматически:
  ```
  C:\Program Files\LibreOffice\
  ```

После установки LibreOffice **перезапустите CRM**.

#### Нестандартный путь установки

Если LibreOffice установлен в другую папку — укажите путь в `.env.local`:
```env
LIBREOFFICE_PATH=C:\МойПуть\LibreOffice\program\soffice.exe
```

#### Как CRM ищет LibreOffice

1. Переменная `LIBREOFFICE_PATH` из `.env.local`
2. `C:\Program Files\LibreOffice\program\soffice.exe`
3. `C:\Program Files (x86)\LibreOffice\program\soffice.exe`
4. `soffice.exe` в системном PATH

Если LibreOffice не найден — при попытке сохранить договор в PDF появится ошибка:
> «LibreOffice не найден. Установите LibreOffice или укажите путь к soffice.exe.»

---

## Первый запуск

### 1. Скопировать файл настроек

```
cp .env.example .env.local
```

Открыть `.env.local` и заполнить:

```env
# Supabase (для синхронизации заявок с сайта):
SUPABASE_URL=https://xxxxxxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...

# SMTP (для отправки документов по email):
SMTP_HOST=smtp.yandex.ru
SMTP_PORT=465
SMTP_USER=manager@example.com
SMTP_PASSWORD=...

# LibreOffice (если не в стандартном пути):
LIBREOFFICE_PATH=
```

### 2. Установить зависимости

```
npm install
```

### 3. Запустить CRM

```
npm run dev
```

Открыть в браузере: `http://localhost:5173`

---

## Архитектура локальной CRM

```
[Сайт БМ] → [Supabase (входящий ящик)] ← забирает CRM кнопкой "Проверить заявки"
                                                    │
                                              [SQLite: crm.sqlite]
                                                    │
                                         CRM генерирует договоры DOCX/PDF
                                         через LibreOffice локально
```

- **Основная база**: `data/crm.sqlite` — вся информация хранится локально
- **Supabase**: только входящий ящик заявок, не хранит данные гостей
- **LibreOffice**: конвертация DOCX→PDF происходит на машине менеджера, без облака
- **Интернет**: нужен только для синхронизации заявок из Supabase

---

## Резервное копирование

Вся важная информация в одном файле:
```
data/crm.sqlite
```

Копируйте этот файл для резервного копирования. Автоматические резервные копии
хранятся в `data/backups/`.

---

## Будущий установщик

В планах — простой установщик для Windows (`setup.exe` или `install.bat`), который:
- ✅ Проверит наличие Node.js
- ✅ Проверит наличие LibreOffice
- ✅ При необходимости предложит установить LibreOffice одной кнопкой
- ✅ Создаст `.env.local` через мастер настройки
- ✅ Создаст ярлык на рабочем столе

Пока установщика нет — следуйте шагам выше вручную.
