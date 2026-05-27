# Chunga-Changa PDFMe Package Implementation Plan

## 2026-04-21 Layout Polish Update

- [x] Added a regression check that the first four package pages keep every schema inside safe page bounds.
- [x] Narrowed long contract and addendum text blocks to a consistent safe content column.
- [x] Shortened right-aligned date/email fields so their PDFMe designer boxes do not cross the right margin.
- [x] Rebalanced page 1 vertical spacing so section 2 no longer crowds clause 1.4.
- [x] Re-rendered `tmp/pdfs/cc-package-pdfme-smoke.pdf` and PNG previews for pages 1-4.
- [x] Tightened the page 1 gap between sections 2 and 3 after PDFMe designer review.
- [x] Reinterpreted safe bounds as PDFMe padding bounds (`x >= 20`, `x + width <= 195`) so fields stay out of the pink designer margins.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Превратить текущий PDFMe-договор Чунга-Чанга в единый пакет документов: договор + счёт + акт.

**Architecture:** Пакет использует stable id `cc_contract_pdfme`, но его шаблон расширяется до шести страниц. Первые четыре страницы остаются страницами договора/допсоглашения, а две последние подмешиваются из текущего `invoice_pdfme`, чтобы сохранить ручную верстку счёта и акта. Генерация из карточки договора выпускает один PDF-файл.

**Tech Stack:** React, TypeScript, PDFMe, SQLite, local REST API, tsx script tests.

---

### Task 1: Red test for package structure and visible multi-variable preview

**Files:**
- Modify: `F:/Kris/Иностранный рок/дианка/CRM-main/CRM-main/scripts/auditFixesTest.ts`

- [x] Добавить падающие проверки, что `cc_contract_pdfme` содержит 6 страниц.
- [x] Добавить падающие проверки, что страницы 5 и 6 содержат ключевые schema names счёта и акта.
- [x] Добавить падающую проверку, что `multiVariableText` в шаблоне ЧЧ содержит непустой preview content для `contract_number`.
- [x] Запустить `npm run test:audit-fixes` и подтвердить ожидаемое падение.

### Task 2: Собрать package template из договора ЧЧ и сохранённого invoice_pdfme

**Files:**
- Modify: `F:/Kris/Иностранный рок/дианка/CRM-main/CRM-main/src/utils/pdfmeTemplates.ts`
- Modify: `F:/Kris/Иностранный рок/дианка/CRM-main/CRM-main/src/utils/pdfmeTemplateIds.ts`

- [x] Обновить описание `cc_contract_pdfme` как пакетного шаблона.
- [x] Научить helper `mvt(...)` заполнять preview content тестовыми значениями.
- [x] Добавить helper сборки package template, который берёт 4 страницы договора ЧЧ и добавляет страницы счёта/акта.
- [x] Сохранить прежний `invoice_pdfme` без изменения схем его страниц.

### Task 3: Подмешивать пользовательский счёт/акт в пакет при загрузке и генерации

**Files:**
- Modify: `F:/Kris/Иностранный рок/дианка/CRM-main/CRM-main/src/utils/pdfmeDocumentGenerator.ts`
- Modify: `F:/Kris/Иностранный рок/дианка/CRM-main/CRM-main/src/components/settings/PdfmeTemplateEditorModal.tsx`

- [x] Добавить async-сборку package template на основе сохранённого `invoice_pdfme`, если он есть в SQLite.
- [x] Если `invoice_pdfme` отсутствует, использовать кодовый дефолт счёта/акта.
- [x] Генерацию `generatePdfmeContractBlob(...)` переключить на package template.
- [x] Редактор PDFMe для ЧЧ открыть как единый 6-страничный пакет.

### Task 4: Пересчитать заголовки счёта и акта под пакет ЧЧ

**Files:**
- Modify: `F:/Kris/Иностранный рок/дианка/CRM-main/CRM-main/src/utils/pdfmeDocumentGenerator.ts`
- Modify: `F:/Kris/Иностранный рок/дианка/CRM-main/CRM-main/src/utils/pdfmeTestData.ts`

- [x] Для package generation формировать `invoice_header` как `Счёт №ЧЧ{номер} ...`.
- [x] Для package generation формировать `act_header` как `Акт №ЧЧ{номер} ...`.
- [x] Оставить прочие invoice/act поля совместимыми с уже существующим шаблоном.

### Task 5: Обновить пользовательский маршрут генерации

**Files:**
- Modify: `F:/Kris/Иностранный рок/дианка/CRM-main/CRM-main/src/components/contracts/ContractModal.tsx`
- Modify: `F:/Kris/Иностранный рок/дианка/CRM-main/CRM-main/src/components/settings/SettingsView.tsx`

- [x] Переименовать пользовательское действие в `PDFMe: Пакет ЧЧ`.
- [x] Описание шаблона в настройках привести к пакетной модели.
- [x] Не ломать текущие legacy-ветки HTML-документов во время перехода.

### Task 6: Green run, smoke PDF and journal

**Files:**
- Modify: `F:/Kris/Иностранный рок/дианка/CRM-main/CRM-main/Plan.md`

- [x] Запустить `npm run test:audit-fixes`.
- [x] Запустить `npm run lint`.
- [x] Запустить `npm run build`.
- [x] Сгенерировать smoke PDF package template в `tmp/pdfs`.
- [x] Обновить `Plan.md` записью о пакетном PDFMe-документе ЧЧ.
