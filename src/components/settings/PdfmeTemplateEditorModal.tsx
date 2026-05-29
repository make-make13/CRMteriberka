import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Template } from '@pdfme/common';
import { Designer } from '@pdfme/ui';
import { X, Save, RotateCcw, Loader2, Eye, ChevronLeft, ChevronRight, Undo2, AlignLeft, Bookmark } from 'lucide-react';
import toast from 'react-hot-toast';
import { pdfTemplateApi } from '../../services/localApi';
import {
  createBanyaPackagePdfmeTemplate,
  createChungaChangaPackagePdfmeTemplate,
  createDefaultChungaChangaContractPdfmeTemplate,
  createDefaultGiftCertificatePdfmeTemplate,
  createDefaultGolubayaBukhtaContractPdfmeTemplate,
  createDefaultInvoicePdfmeTemplate,
  createGolubayaBukhtaPackagePdfmeTemplate,
  ensureInvoiceActPage,
  pdfmePlugins,
  getPdfmeFont,
  normalizePdfmeTemplateFonts,
} from '../../utils/pdfmeTemplates';
import {
  PDFME_BANYA_CONTRACT_TEMPLATE_ID,
  PDFME_CC_CONTRACT_TEMPLATE_ID,
  PDFME_GB_CONTRACT_TEMPLATE_ID,
  PDFME_GIFT_CERTIFICATE_TEMPLATE_ID,
  PDFME_INVOICE_TEMPLATE_ID,
  type PdfmeTemplateId,
} from '../../utils/pdfmeTemplateIds';
import { dictRu } from '../../utils/pdfmeI18n';
import { getPdfmePreviewData, pdfmeTestData } from '../../utils/pdfmeTestData';
import { TEMPLATE_VARIABLES } from '../../utils/templateVariables';
import { createPdfmeVariableFieldName, getPdfmeSchemaValueKey } from '../../utils/pdfmeFieldNames';
import { hydratePdfmeStaticAssetsInTemplate } from '../../utils/pdfmeStaticAssets';

// Variable groups

const VARIABLE_GROUPS = [
  {
    icon: '📄', title: 'Договор',
    vars: ['contract_number', 'sign_date', 'sign_date_short', 'date_in', 'date_in_short',
      'date_out', 'date_out_short', 'time_in', 'time_out', 'nights', 'guests', 'cottage_number'],
  },
  {
    icon: '👤', title: 'Гость',
    vars: ['client_name', 'client_name_gen', 'client_name_dat', 'client_name_short',
      'client_dob', 'client_passport', 'client_passport_date', 'client_passport_by',
      'client_address', 'client_phone', 'client_email', 'client_inn', 'client_kpp'],
  },
  {
    icon: '💰', title: 'Финансы',
    vars: ['total', 'total_words', 'total_words_only', 'total_no_vat',
      'prepayment', 'prepayment_words', 'balance', 'balance_words',
      'vat_rate', 'vat_amount'],
  },
  {
    icon: '🏢', title: 'Исполнитель',
    vars: ['exec_name', 'exec_director', 'exec_director_short', 'exec_director_short2',
      'exec_inn', 'exec_kpp', 'exec_ogrn', 'exec_rs', 'exec_bik', 'exec_ks',
      'exec_bank', 'exec_address', 'exec_phone'],
  },
  {
    icon: '📋', title: 'Счёт / Акт',
    vars: ['invoice_number', 'doc_date', 'invoice_header', 'supplier_text',
      'service_name', 'service_qty', 'service_unit', 'service_price', 'service_total',
      'qty_words', 'act_header', 'act_client_name', 'act_client_name_short', 'act_service_row_name',
      'act_service_row_qty', 'act_service_row_unit', 'act_service_row_price', 'act_service_row_total',
      'act_service_total', 'act_vat_amount', 'act_total', 'act_qty_words', 'act_total_words_only'],
  },
];

// Build variable description lookup from TEMPLATE_VARIABLES
// (populated lazily below — defined at module level so it never re-computes)
const VAR_DESC: Record<string, string> = {};
{
  for (const entries of Object.values(TEMPLATE_VARIABLES)) {
    for (const { name, desc } of entries) {
      // Don't overwrite — keep the first occurrence (more specific wins in the order above)
      if (!VAR_DESC[name]) VAR_DESC[name] = desc;
    }
  }
}
// Type helpers

type AnySchema = Record<string, any>;
type DesignerEditableElement = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLElement;

interface DesignerFocusSnapshot {
  path: number[];
  labelText: string;
  tagName: string;
  className: string;
  name: string;
  placeholder: string;
  ariaLabel: string;
  value: string;
  selectionStart: number | null;
  selectionEnd: number | null;
  left: number;
  top: number;
  createdAt: number;
}

const DESIGNER_EDITABLE_SELECTOR = 'input, textarea, select, [contenteditable="true"]';

// Build preview inputs

function buildMultiVariableValue(schema: AnySchema, values: Record<string, string>) {
  const variables = Array.isArray(schema.variables) ? schema.variables : [];
  const variableValues = variables.reduce<Record<string, string>>((acc, variableName) => {
    acc[variableName] = values[variableName] ?? `[${variableName}]`;
    return acc;
  }, {});

  return JSON.stringify(variableValues);
}

function getSchemaDefaultContent(schema: AnySchema) {
  return typeof schema.content === 'string' ? schema.content : '';
}

function buildPreviewInputs(template: Template, values: Record<string, string> = pdfmeTestData): Record<string, string>[] {
  const schemas = (template.schemas ?? []).flat() as AnySchema[];
  const input: Record<string, string> = {};
  for (const s of schemas) {
    if (s.readOnly) continue;
    if (s.type === 'table') {
      input[s.name] = JSON.stringify([[
        '1',
        values.service_name,
        values.service_qty,
        values.service_unit,
        values.service_price,
        values.service_total,
      ]]);
    } else if (s.type === 'multiVariableText') {
      input[s.name] = buildMultiVariableValue(s, values);
    } else if (['image', 'signature', 'svg'].includes(s.type)) {
      input[s.name] = getSchemaDefaultContent(s);
    } else if (['qrcode', 'pdf417'].includes(s.type)) {
      input[s.name] = getSchemaDefaultContent(s) || 'https://pdfme.com/';
    } else {
      const valueKey = getPdfmeSchemaValueKey(s);
      input[s.name] = values[valueKey] ?? `[${valueKey || s.name}]`;
    }
  }
  return [input];
}

function getAllSchemas(template: Template): AnySchema[] {
  return ((template.schemas ?? []) as AnySchema[][]).flat();
}

function getDesignerPageIndex(designer: Designer, template: Template) {
  const pages = Math.max(1, template.schemas?.length || 1);
  const cursor = Number(designer.getPageCursor?.() ?? 0);
  return Math.min(Math.max(Number.isFinite(cursor) ? cursor : 0, 0), pages - 1);
}

function getNextComponentId(template: Template, prefix: string) {
  const schemas = getAllSchemas(template);
  let index = 1;
  while (schemas.some(schema => String(schema.name || '').startsWith(`${prefix}_${index}_`))) {
    index += 1;
  }
  return `${prefix}_${index}`;
}

function textField(name: string, x: number, y: number, width: number, height: number, opts: AnySchema = {}): AnySchema {
  return {
    name,
    type: 'text',
    position: { x, y },
    width,
    height,
    fontName: 'NotoSerif',
    fontSize: 8,
    fontColor: '#000000',
    backgroundColor: '',
    alignment: 'left',
    verticalAlignment: 'top',
    lineHeight: 1.2,
    characterSpacing: 0,
    ...opts,
  };
}

function staticText(name: string, content: string, x: number, y: number, width: number, height: number, opts: AnySchema = {}) {
  return textField(name, x, y, width, height, { content, readOnly: true, ...opts });
}

function multiTextField(
  name: string,
  textValue: string,
  variables: string[],
  x: number,
  y: number,
  width: number,
  height: number,
  opts: AnySchema = {},
): AnySchema {
  const content = variables.reduce<Record<string, string>>((acc, variableName) => {
    acc[variableName] = pdfmeTestData[variableName] ?? '';
    return acc;
  }, {});

  return {
    ...textField(name, x, y, width, height, opts),
    type: 'multiVariableText',
    text: textValue,
    variables,
    content: JSON.stringify(content),
    readOnly: false,
  };
}

function lineField(name: string, x: number, y: number, width: number, height = 0.1, opts: AnySchema = {}): AnySchema {
  return {
    name,
    type: 'line',
    position: { x, y },
    width,
    height,
    color: '#000000',
    ...opts,
  };
}

function rectangleField(name: string, x: number, y: number, width: number, height: number, opts: AnySchema = {}): AnySchema {
  return {
    name,
    type: 'rectangle',
    position: { x, y },
    width,
    height,
    borderWidth: 0.3,
    borderColor: '#000000',
    color: '',
    ...opts,
  };
}

function imageField(name: string, x: number, y: number, width: number, height: number, opts: AnySchema = {}): AnySchema {
  return {
    name,
    type: 'image',
    content: '',
    position: { x, y },
    width,
    height,
    rotate: 0,
    opacity: 1,
    ...opts,
  };
}

function createRequisitesSignatureBlock(template: Template, x = 10, y = 214) {
  const id = getNextComponentId(template, 'reqsig');
  const mark = { componentId: id, componentName: 'Реквизиты и подписи' };

  return [
    rectangleField(`${id}_box`, x, y, 190, 56, { ...mark, borderColor: '#777777' }),
    staticText(`${id}_title`, 'Реквизиты и подписи', x + 2, y + 2, 70, 5, {
      ...mark,
      fontName: 'NotoSerifBold',
      fontSize: 8,
    }),
    multiTextField(
      `${id}_requisites`,
      'Исполнитель: {exec_name}\nИНН {exec_inn}, КПП {exec_kpp}\nАдрес: {exec_address}\nБанк: {exec_bank}\nр/с {exec_rs}, БИК {exec_bik}, к/с {exec_ks}',
      ['exec_name', 'exec_inn', 'exec_kpp', 'exec_address', 'exec_bank', 'exec_rs', 'exec_bik', 'exec_ks'],
      x + 2,
      y + 9,
      118,
      26,
      { ...mark, fontSize: 7, lineHeight: 1.15 },
    ),
    staticText(`${id}_director_label`, 'Генеральный директор', x + 2, y + 41, 35, 5, { ...mark, fontSize: 7 }),
    lineField(`${id}_director_line`, x + 39, y + 45, 34, 0.1, mark),
    multiTextField(`${id}_director_name`, '/{exec_director_short}/', ['exec_director_short'], x + 75, y + 40.5, 30, 5, {
      ...mark,
      fontSize: 7,
    }),
    staticText(`${id}_accountant_label`, 'Бухгалтер', x + 108, y + 41, 20, 5, { ...mark, fontSize: 7 }),
    lineField(`${id}_accountant_line`, x + 130, y + 45, 30, 0.1, mark),
    multiTextField(`${id}_accountant_name`, '/{exec_director_short}/', ['exec_director_short'], x + 162, y + 40.5, 25, 5, {
      ...mark,
      fontSize: 7,
    }),
    rectangleField(`${id}_stamp_box`, x + 132, y + 9, 36, 27, { ...mark, borderColor: '#b7b7b7' }),
    staticText(`${id}_stamp_label`, 'место печати', x + 137, y + 19, 26, 5, {
      ...mark,
      fontSize: 6,
      fontColor: '#777777',
      alignment: 'center',
    }),
    imageField(`${id}_stamp_image`, x + 132, y + 9, 36, 27, mark),
  ];
}

function normalizeLabelText(value: string | null | undefined) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function getDesignerEditableElement(target: EventTarget | null): DesignerEditableElement | null {
  if (!(target instanceof Element)) return null;
  const editable = target.closest(DESIGNER_EDITABLE_SELECTOR) as DesignerEditableElement | null;
  if (!editable) return null;
  if (editable instanceof HTMLInputElement && editable.type === 'hidden') return null;
  return editable;
}

function isEditableDesignerElement(element: Element | null) {
  return getDesignerEditableElement(element) !== null;
}

function getDesignerEditableValue(element: DesignerEditableElement) {
  if (
    element instanceof HTMLInputElement
    || element instanceof HTMLTextAreaElement
    || element instanceof HTMLSelectElement
  ) {
    return element.value;
  }
  return element.textContent || '';
}

function getDesignerEditableSelection(element: DesignerEditableElement) {
  if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
    return { selectionStart: null, selectionEnd: null };
  }
  try {
    return {
      selectionStart: element.selectionStart,
      selectionEnd: element.selectionEnd,
    };
  } catch {
    return { selectionStart: null, selectionEnd: null };
  }
}

function restoreDesignerEditableSelection(element: DesignerEditableElement, snapshot: DesignerFocusSnapshot) {
  if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) return;
  if (snapshot.selectionStart === null || snapshot.selectionEnd === null) return;
  try {
    const max = getDesignerEditableValue(element).length;
    element.setSelectionRange(
      Math.min(snapshot.selectionStart, max),
      Math.min(snapshot.selectionEnd, max),
    );
  } catch {
    // Some input types do not support setSelectionRange.
  }
}

function getDesignerElementPath(root: Element, element: Element) {
  const path: number[] = [];
  let current: Element | null = element;
  while (current && current !== root) {
    const parent = current.parentElement;
    if (!parent) return [];
    path.unshift(Array.prototype.indexOf.call(parent.children, current));
    current = parent;
  }
  return path;
}

function getDesignerElementByPath(root: Element, path: number[]) {
  let current: Element | null = root;
  for (const index of path) {
    current = current?.children[index] ?? null;
    if (!current) return null;
  }
  return current;
}

function getDesignerEditableLabel(element: Element) {
  const formItem = element.closest('.ant-form-item');
  const label = formItem?.querySelector('.ant-form-item-label label, label');
  return normalizeLabelText(
    label?.textContent
      || element.getAttribute('aria-label')
      || element.getAttribute('placeholder')
      || '',
  );
}

function getDesignerEditableClassName(element: Element) {
  return typeof element.className === 'string' ? element.className : '';
}

function createDesignerFocusSnapshot(root: Element, element: DesignerEditableElement): DesignerFocusSnapshot {
  const rect = element.getBoundingClientRect();
  const selection = getDesignerEditableSelection(element);
  return {
    path: getDesignerElementPath(root, element),
    labelText: getDesignerEditableLabel(element),
    tagName: element.tagName,
    className: getDesignerEditableClassName(element),
    name: element.getAttribute('name') || '',
    placeholder: element.getAttribute('placeholder') || '',
    ariaLabel: element.getAttribute('aria-label') || '',
    value: getDesignerEditableValue(element),
    selectionStart: selection.selectionStart,
    selectionEnd: selection.selectionEnd,
    left: rect.left,
    top: rect.top,
    createdAt: Date.now(),
  };
}

function isDesignerEditableDisabled(element: DesignerEditableElement) {
  return 'disabled' in element && Boolean((element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).disabled);
}

function isDesignerEditableVisible(element: DesignerEditableElement) {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const style = window.getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

function getDesignerEditableElements(root: Element) {
  const seen = new Set<DesignerEditableElement>();
  const elements: DesignerEditableElement[] = [];
  for (const candidate of Array.from(root.querySelectorAll(DESIGNER_EDITABLE_SELECTOR))) {
    const editable = getDesignerEditableElement(candidate);
    if (!editable || seen.has(editable)) continue;
    if (isDesignerEditableDisabled(editable) || !isDesignerEditableVisible(editable)) continue;
    seen.add(editable);
    elements.push(editable);
  }
  return elements;
}

function findDesignerFocusTarget(root: Element, snapshot: DesignerFocusSnapshot) {
  const pathElement = getDesignerElementByPath(root, snapshot.path);
  const pathEditable = pathElement
    ? getDesignerEditableElement(pathElement) || getDesignerEditableElement(pathElement.querySelector(DESIGNER_EDITABLE_SELECTOR))
    : null;
  if (pathEditable && !isDesignerEditableDisabled(pathEditable) && isDesignerEditableVisible(pathEditable)) {
    return pathEditable;
  }

  const elements = getDesignerEditableElements(root);
  const matchingName = elements.filter(element => (
    snapshot.name && element.getAttribute('name') === snapshot.name
  ));
  const matchingLabel = elements.filter(element => (
    snapshot.labelText && getDesignerEditableLabel(element) === snapshot.labelText
  ));
  const pool = matchingName.length ? matchingName : matchingLabel.length ? matchingLabel : elements;

  return pool
    .filter(element => element.tagName === snapshot.tagName || !snapshot.tagName)
    .sort((left, right) => {
      const leftRect = left.getBoundingClientRect();
      const rightRect = right.getBoundingClientRect();
      const leftDistance = Math.abs(leftRect.left - snapshot.left) + Math.abs(leftRect.top - snapshot.top);
      const rightDistance = Math.abs(rightRect.left - snapshot.left) + Math.abs(rightRect.top - snapshot.top);
      const leftClassBonus = getDesignerEditableClassName(left) === snapshot.className ? -100 : 0;
      const rightClassBonus = getDesignerEditableClassName(right) === snapshot.className ? -100 : 0;
      return (leftDistance + leftClassBonus) - (rightDistance + rightClassBonus);
    })[0] ?? null;
}

function restoreDesignerFocus(root: Element, snapshot: DesignerFocusSnapshot | null) {
  if (!snapshot || Date.now() - snapshot.createdAt > 2000) return;
  if (root.contains(document.activeElement) && isEditableDesignerElement(document.activeElement)) return;

  const target = findDesignerFocusTarget(root, snapshot);
  if (!target) return;

  target.focus({ preventScroll: true });
  restoreDesignerEditableSelection(target, snapshot);
}

// Props

interface Props {
  isDarkMode: boolean;
  templateId?: PdfmeTemplateId;
  templateTitle?: string;
  templateFileName?: string;
  onClose: () => void;
  onSaved?: () => void;
}

async function loadInvoiceTemplateForPackage(): Promise<Template> {
  const saved = await pdfTemplateApi.get<Template>(PDFME_INVOICE_TEMPLATE_ID);
  if (saved?.template?.schemas) {
    return ensureInvoiceActPage(normalizePdfmeTemplateFonts(saved.template));
  }
  return createDefaultInvoicePdfmeTemplate();
}

async function createDefaultTemplateForId(templateId: PdfmeTemplateId): Promise<Template> {
  switch (templateId) {
    case PDFME_CC_CONTRACT_TEMPLATE_ID: {
      const invoiceTemplate = await loadInvoiceTemplateForPackage();
      return createChungaChangaPackagePdfmeTemplate(createDefaultChungaChangaContractPdfmeTemplate(), invoiceTemplate);
    }
    case PDFME_BANYA_CONTRACT_TEMPLATE_ID: {
      const gbSaved = await pdfTemplateApi.get<Template>(PDFME_GB_CONTRACT_TEMPLATE_ID);
      const gbSourceTemplate = gbSaved?.template?.schemas
        ? gbSaved.template
        : createGolubayaBukhtaPackagePdfmeTemplate(createDefaultGolubayaBukhtaContractPdfmeTemplate(), await loadInvoiceTemplateForPackage());
      return createBanyaPackagePdfmeTemplate(gbSourceTemplate, gbSourceTemplate);
    }
    case PDFME_GB_CONTRACT_TEMPLATE_ID: {
      const invoiceTemplate = await loadInvoiceTemplateForPackage();
      return createGolubayaBukhtaPackagePdfmeTemplate(createDefaultGolubayaBukhtaContractPdfmeTemplate(), invoiceTemplate);
    }
    case PDFME_GIFT_CERTIFICATE_TEMPLATE_ID:
      return createDefaultGiftCertificatePdfmeTemplate();
    case PDFME_INVOICE_TEMPLATE_ID:
      return createDefaultInvoicePdfmeTemplate();
    default:
      return createDefaultInvoicePdfmeTemplate();
  }
}

// Component

export default function PdfmeTemplateEditorModal({
  templateId = PDFME_INVOICE_TEMPLATE_ID,
  templateTitle = 'PDFMe / Счет',
  templateFileName = 'PDFMe счет',
  onClose,
  onSaved,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const designerRef  = useRef<Designer | null>(null);

  const isLockedStandardTemplate =
    templateId === PDFME_CC_CONTRACT_TEMPLATE_ID ||
    templateId === PDFME_GB_CONTRACT_TEMPLATE_ID ||
    templateId === PDFME_BANYA_CONTRACT_TEMPLATE_ID;

  // Internal refs (don't need re-render on change)
  const historyRef     = useRef<Template[]>([]);
  const lastTplRef     = useRef<Template | null>(null);  // template before last change
  const latestTplRef   = useRef<Template | null>(null);
  const skipHistoryRef = useRef(false);                  // flag: skip 1 history entry (for undo)
  const dirtyRef       = useRef(false);
  const canUndoRef     = useRef(false);
  const statusTimerRef = useRef<number | null>(null);
  const chromeFlushTimerRef = useRef<number | null>(null);
  const designerFocusSnapshotRef = useRef<DesignerFocusSnapshot | null>(null);
  const designerFocusFrameRef = useRef<number | null>(null);
  const designerFocusTimerRef = useRef<number | null>(null);

  const [template,     setTemplate]     = useState<Template | null>(null);
  const [isLoading,    setIsLoading]    = useState(true);
  const [isSaving,     setIsSaving]     = useState(false);
  const [isSavingAsStandard, setIsSavingAsStandard] = useState(false);
  const [isDirty,      setIsDirty]      = useState(false);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [canUndo,      setCanUndo]      = useState(false);
  const [currentPage,  setCurrentPage]  = useState(0);

  // Left panel
  const [panelOpen,       setPanelOpen]       = useState(true);
  const [panelTab,        setPanelTab]        = useState<'vars' | 'fields' | 'blocks'>('vars');
  const [showDescs,       setShowDescs]       = useState(true);   // show descriptions in vars tab
  const [openGroups,      setOpenGroups]      = useState<Record<string, boolean>>(
    Object.fromEntries(VARIABLE_GROUPS.map(g => [g.title, true]))
  );

  // Derived: panel width depends on mode
  const panelWidth = useMemo(() => showDescs ? 300 : 200, [showDescs]);

  // Status bar
  const [fieldCount, setFieldCount] = useState(0);
  const [statusMsg,  setStatusMsg]  = useState('');

  // Field list (for "Fields" tab)
  const [fieldList, setFieldList] = useState<AnySchema[]>([]);

  const markDesignerDirty = useCallback(() => {
    if (dirtyRef.current) return;
    dirtyRef.current = true;
    setIsDirty(true);
  }, []);

  const setDesignerDirty = useCallback((next: boolean) => {
    dirtyRef.current = next;
    setIsDirty(next);
  }, []);

  const setDesignerCanUndo = useCallback((next: boolean) => {
    canUndoRef.current = next;
    setCanUndo(next);
  }, []);

  const flushDesignerChromeState = useCallback(() => {
    setIsDirty(prev => (prev === dirtyRef.current ? prev : dirtyRef.current));
    setCanUndo(prev => (prev === canUndoRef.current ? prev : canUndoRef.current));
  }, []);

  const showStatusMsg = useCallback((message: string) => {
    if (statusTimerRef.current !== null) {
      window.clearTimeout(statusTimerRef.current);
    }
    setStatusMsg(message);
    statusTimerRef.current = window.setTimeout(() => {
      setStatusMsg('');
      statusTimerRef.current = null;
    }, 3000);
  }, []);

  const getCurrentTemplate = useCallback(() => {
    return (designerRef.current?.getTemplate() as Template | undefined) ?? latestTplRef.current;
  }, []);

  const rememberDesignerFocus = useCallback((target: EventTarget | null) => {
    const root = containerRef.current;
    const editable = getDesignerEditableElement(target);
    if (!root || !editable || !root.contains(editable)) return false;
    designerFocusSnapshotRef.current = createDesignerFocusSnapshot(root, editable);
    return true;
  }, []);

  const restoreRememberedDesignerFocus = useCallback(() => {
    const root = containerRef.current;
    if (!root) return;
    restoreDesignerFocus(root, designerFocusSnapshotRef.current);
  }, []);

  const scheduleDesignerFocusRestore = useCallback(() => {
    if (!designerFocusSnapshotRef.current) return;
    if (designerFocusFrameRef.current !== null) {
      window.cancelAnimationFrame(designerFocusFrameRef.current);
    }
    if (designerFocusTimerRef.current !== null) {
      window.clearTimeout(designerFocusTimerRef.current);
    }

    designerFocusFrameRef.current = window.requestAnimationFrame(() => {
      designerFocusFrameRef.current = null;
      restoreRememberedDesignerFocus();
      designerFocusTimerRef.current = window.setTimeout(() => {
        designerFocusTimerRef.current = null;
        restoreRememberedDesignerFocus();
      }, 32);
    });
  }, [restoreRememberedDesignerFocus]);

 // Load template
  useEffect(() => {
    let active = true;
    setIsLoading(true);
    (async () => {
      try {
        const saved = await pdfTemplateApi.get<Template>(templateId);
        if (!active) return;
        const tpl = await (async () => {
          if (templateId === PDFME_CC_CONTRACT_TEMPLATE_ID) {
            if (saved?.template?.schemas) {
              return saved.template;
            }

            return createDefaultTemplateForId(templateId);
          }

          if (templateId === PDFME_GB_CONTRACT_TEMPLATE_ID) {
            if (saved?.template?.schemas) {
              return saved.template;
            }

            return createDefaultTemplateForId(templateId);
          }

          if (templateId === PDFME_BANYA_CONTRACT_TEMPLATE_ID) {
            if (saved?.template?.schemas) {
              return saved.template;
            }

            return createDefaultTemplateForId(templateId);
          }

          return saved?.template?.schemas
            ? ensureInvoiceActPage(normalizePdfmeTemplateFonts(saved.template))
            : createDefaultTemplateForId(templateId);
        })();
        const hydrated = await hydratePdfmeStaticAssetsInTemplate(tpl);
        latestTplRef.current = hydrated;
        lastTplRef.current = hydrated;
        historyRef.current = [];
        setDesignerDirty(false);
        setDesignerCanUndo(false);
        setTemplate(hydrated);
      } catch {
        if (!active) return;
        const hydrated = await hydratePdfmeStaticAssetsInTemplate(await createDefaultTemplateForId(templateId));
        latestTplRef.current = hydrated;
        lastTplRef.current = hydrated;
        historyRef.current = [];
        setDesignerDirty(false);
        setDesignerCanUndo(false);
        setTemplate(hydrated);
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => { active = false; };
  }, [setDesignerCanUndo, setDesignerDirty, templateId]);

  useEffect(() => {
    return () => {
      if (statusTimerRef.current !== null) {
        window.clearTimeout(statusTimerRef.current);
      }
      if (chromeFlushTimerRef.current !== null) {
        window.clearTimeout(chromeFlushTimerRef.current);
      }
      if (designerFocusFrameRef.current !== null) {
        window.cancelAnimationFrame(designerFocusFrameRef.current);
      }
      if (designerFocusTimerRef.current !== null) {
        window.clearTimeout(designerFocusTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const handleDocumentPointerDown = (event: PointerEvent) => {
      const root = containerRef.current;
      if (!root || !(event.target instanceof Node)) return;
      if (!root.contains(event.target)) {
        designerFocusSnapshotRef.current = null;
      }
    };

    document.addEventListener('pointerdown', handleDocumentPointerDown, true);
    return () => {
      document.removeEventListener('pointerdown', handleDocumentPointerDown, true);
    };
  }, []);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    const handleFocusOut = () => {
      if (chromeFlushTimerRef.current !== null) {
        window.clearTimeout(chromeFlushTimerRef.current);
      }
      chromeFlushTimerRef.current = window.setTimeout(() => {
        chromeFlushTimerRef.current = null;
        if (root.contains(document.activeElement) && isEditableDesignerElement(document.activeElement)) return;
        flushDesignerChromeState();
      }, 0);
    };

    root.addEventListener('focusout', handleFocusOut, true);
    return () => {
      root.removeEventListener('focusout', handleFocusOut, true);
      if (chromeFlushTimerRef.current !== null) {
        window.clearTimeout(chromeFlushTimerRef.current);
        chromeFlushTimerRef.current = null;
      }
    };
  }, [flushDesignerChromeState]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!rememberDesignerFocus(event.target)) {
        designerFocusSnapshotRef.current = null;
      }
    };

    const handleFocusIn = (event: FocusEvent) => {
      rememberDesignerFocus(event.target);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!getDesignerEditableElement(event.target)) return;
      if (event.key === 'Tab' || event.key === 'Enter' || event.key === 'Escape') {
        designerFocusSnapshotRef.current = null;
        return;
      }
      rememberDesignerFocus(event.target);
    };

    const handleEditableChange = (event: Event) => {
      if (rememberDesignerFocus(event.target)) {
        scheduleDesignerFocusRestore();
      }
    };

    const observer = new MutationObserver(() => {
      scheduleDesignerFocusRestore();
    });

    root.addEventListener('pointerdown', handlePointerDown, true);
    root.addEventListener('focusin', handleFocusIn, true);
    root.addEventListener('keydown', handleKeyDown, true);
    root.addEventListener('input', handleEditableChange, true);
    root.addEventListener('change', handleEditableChange, true);
    observer.observe(root, { childList: true, subtree: true });

    return () => {
      root.removeEventListener('pointerdown', handlePointerDown, true);
      root.removeEventListener('focusin', handleFocusIn, true);
      root.removeEventListener('keydown', handleKeyDown, true);
      root.removeEventListener('input', handleEditableChange, true);
      root.removeEventListener('change', handleEditableChange, true);
      observer.disconnect();
      if (designerFocusFrameRef.current !== null) {
        window.cancelAnimationFrame(designerFocusFrameRef.current);
        designerFocusFrameRef.current = null;
      }
      if (designerFocusTimerRef.current !== null) {
        window.clearTimeout(designerFocusTimerRef.current);
        designerFocusTimerRef.current = null;
      }
    };
  }, [rememberDesignerFocus, scheduleDesignerFocusRestore]);

 // Refresh stats
  const refreshStats = useCallback((tpl: Template) => {
    const schemas = getAllSchemas(tpl);
    setFieldCount(schemas.length);
    setFieldList([...schemas]);
  }, []);

 // Init / reinit designer when template state changes
  useEffect(() => {
    if (!template || !containerRef.current) return;
    let active = true;
    let designer: Designer | null = null;

    (async () => {
      const font = await getPdfmeFont();
      if (!active || !containerRef.current) return;

      designer = new Designer({
        domContainer: containerRef.current,
        template,
        plugins: pdfmePlugins,
        options: {
          font,
          lang: 'en',
          labels: dictRu,
          maxZoom: 400,
          zoomLevel: 1,
          sidebarOpen: true,
          theme: { token: { colorPrimary: '#f97316' } },
        },
      });
      designerRef.current = designer;
      latestTplRef.current = template;
      lastTplRef.current   = template;
      historyRef.current   = [];
      setDesignerCanUndo(false);
      setCurrentPage(0);
      skipHistoryRef.current = false;

      designer.onChangeTemplate((newTpl: Template) => {
        latestTplRef.current = newTpl;
        if (!skipHistoryRef.current && lastTplRef.current) {
          historyRef.current = [...historyRef.current.slice(-30), lastTplRef.current];
          canUndoRef.current = true;
        }
        skipHistoryRef.current = false;
        lastTplRef.current = newTpl;
        dirtyRef.current = true;
      });

      designer.onPageChange(({ currentPage: nextPage, totalPages }) => {
        const pageIndex = Math.min(Math.max(Number(nextPage) || 0, 0), Math.max(1, totalPages) - 1);
        setCurrentPage(pageIndex);
      });

      refreshStats(template);
    })();

    return () => {
      active = false;
      designer?.destroy();
    };
  }, [refreshStats, setDesignerCanUndo, template]);

 // Refresh field list when switching to fields tab
  useEffect(() => {
    if (panelTab === 'fields' && designerRef.current) {
      refreshStats(designerRef.current.getTemplate());
    }
  }, [panelTab, refreshStats]);

 // Save
  const handleSave = useCallback(async () => {
    const tpl = getCurrentTemplate();
    if (!tpl) return;
    setIsSaving(true);
    try {
      const templateToPersist = templateId === PDFME_CC_CONTRACT_TEMPLATE_ID || templateId === PDFME_GB_CONTRACT_TEMPLATE_ID || templateId === PDFME_BANYA_CONTRACT_TEMPLATE_ID
        ? (tpl as Template)
        : normalizePdfmeTemplateFonts(tpl as Template);
      await pdfTemplateApi.save(templateId, templateToPersist, {
        id: templateId,
        uploadedAt: new Date().toISOString(),
        fileName: templateFileName,
        uploadedBy: 'pdfme-designer',
      });
      latestTplRef.current = templateToPersist;
      lastTplRef.current = templateToPersist;
      setDesignerDirty(false);
      onSaved?.();
      toast.success('Шаблон сохранён');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setIsSaving(false);
    }
  }, [getCurrentTemplate, onSaved, setDesignerDirty, templateFileName, templateId]);

  // Save as standard/baseline point
  const handleSaveAsStandard = useCallback(async () => {
    const tpl = getCurrentTemplate();
    if (!tpl) return;
    setIsSavingAsStandard(true);
    try {
      const templateToPersist = templateId === PDFME_CC_CONTRACT_TEMPLATE_ID || templateId === PDFME_GB_CONTRACT_TEMPLATE_ID || templateId === PDFME_BANYA_CONTRACT_TEMPLATE_ID
        ? (tpl as Template)
        : normalizePdfmeTemplateFonts(tpl as Template);

      // Save as active template
      await pdfTemplateApi.save(templateId, templateToPersist, {
        id: templateId,
        uploadedAt: new Date().toISOString(),
        fileName: templateFileName,
        uploadedBy: 'pdfme-designer',
      });

      // Save backup copy
      const backupId = `${templateId}_backup`;
      await pdfTemplateApi.save(backupId, templateToPersist, {
        id: backupId,
        uploadedAt: new Date().toISOString(),
        fileName: `${templateFileName} (Резервная копия)`,
        uploadedBy: 'pdfme-designer-backup',
      });

      latestTplRef.current = templateToPersist;
      lastTplRef.current = templateToPersist;
      setDesignerDirty(false);
      onSaved?.();
      toast.success('Шаблон сохранен как стандартный (установлена точка восстановления)');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setIsSavingAsStandard(false);
    }
  }, [getCurrentTemplate, onSaved, setDesignerDirty, templateFileName, templateId]);

  const handleClose = useCallback(() => {
    if (dirtyRef.current && !confirm('Закрыть редактор без сохранения изменений?')) return;
    onClose();
  }, [onClose]);

 // Reset
  const handleReset = useCallback(async () => {
    try {
      const backupId = `${templateId}_backup`;
      const savedBackup = await pdfTemplateApi.get<Template>(backupId);

      let targetTemplate: Template | null = null;

      if (savedBackup?.template?.schemas) {
        if (confirm('Сбросить шаблон к вашей сохраненной стандартной версии? (ОК - к вашей сохраненной, Отмена - к заводскому макету из кода)')) {
          targetTemplate = savedBackup.template;
        } else if (confirm('Сбросить к первоначальному заводскому макету из кода?')) {
          targetTemplate = await createDefaultTemplateForId(templateId);
        } else {
          return;
        }
      } else {
        if (!confirm('Сбросить шаблон к стандартной версии из кода? Текущие несохранённые изменения будут потеряны.')) return;
        targetTemplate = await createDefaultTemplateForId(templateId);
      }

      historyRef.current = [];
      setDesignerCanUndo(false);

      const next = await hydratePdfmeStaticAssetsInTemplate(targetTemplate);
      latestTplRef.current = next;
      lastTplRef.current = next;
      setTemplate(next); // triggers Designer re-init
      markDesignerDirty();
      toast.success('Шаблон успешно сброшен');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка сброса');
    }
  }, [templateId, setDesignerCanUndo, markDesignerDirty]);

 // Undo
  const handleUndo = useCallback(() => {
    const h = historyRef.current;
    if (!h.length || !designerRef.current) return;
    const prev = h[h.length - 1];
    historyRef.current = h.slice(0, -1);
    setDesignerCanUndo(h.length > 1);
    skipHistoryRef.current = true;       // don't save this restore to history
    lastTplRef.current = prev;           // set so next real change saves correctly
    latestTplRef.current = prev;
    (designerRef.current as any).updateTemplate(prev);
    markDesignerDirty();
    refreshStats(prev);
  }, [markDesignerDirty, refreshStats, setDesignerCanUndo]);

 // Preview PDF
  const handlePreview = useCallback(async () => {
    const tpl = getCurrentTemplate();
    if (!tpl) return;
    setIsPreviewing(true);
    try {
      const { generate } = await import('@pdfme/generator');
      const font   = await getPdfmeFont();
      const inputs = buildPreviewInputs(tpl, getPdfmePreviewData(templateId));
      const pdfBytes = await generate({ template: normalizePdfmeTemplateFonts(tpl as Template), inputs, options: { font }, plugins: pdfmePlugins });
      const blob = new Blob([new Uint8Array(pdfBytes)], { type: 'application/pdf' });
      const url  = URL.createObjectURL(blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : 'Ошибка при генерации предпросмотра');
    } finally {
      setIsPreviewing(false);
    }
  }, [getCurrentTemplate]);

 // Add variable field
  const handleAddVariable = useCallback((varName: string) => {
    const designer = designerRef.current;
    if (!designer) { toast.error('Редактор ещё загружается'); return; }

    const tpl = designer.getTemplate() as Template;
    const pageIndex = getDesignerPageIndex(designer, tpl);
    const fieldName = createPdfmeVariableFieldName(getAllSchemas(tpl), varName);
    const newField: AnySchema = {
      name:               fieldName,
      crmVariable:        varName,
      type:               'text',
      position:           { x: 40, y: 130 },
      width:              80,
      height:             8,
      fontName:           'NotoSerif',
      fontSize:           9,
      fontColor:          '#000000',
      backgroundColor:    '',
      alignment:          'left',
      verticalAlignment:  'top',
      lineHeight:         1.2,
      characterSpacing:   0,
    };

    const pages = ((tpl.schemas ?? []) as AnySchema[][]).map(page => [...page]);
    if (!pages[pageIndex]) pages[pageIndex] = [];
    pages[pageIndex] = [...pages[pageIndex], newField];

    const updated = {
      ...tpl,
      schemas: pages,
    };

    latestTplRef.current = updated as Template;
    (designer as any).updateTemplate(updated);
    markDesignerDirty();
    refreshStats(updated as Template);
    showStatusMsg(`Добавлено: ${varName} на страницу ${pageIndex + 1}`);
  }, [markDesignerDirty, refreshStats, showStatusMsg]);

 // Add reusable component block
  const handleAddRequisitesBlock = useCallback(() => {
    const designer = designerRef.current;
    if (!designer) { toast.error('Редактор ещё загружается'); return; }

    const tpl = designer.getTemplate() as Template;
    const pageIndex = getDesignerPageIndex(designer, tpl);
    const pages = ((tpl.schemas ?? []) as AnySchema[][]).map(page => [...page]);
    if (!pages[pageIndex]) pages[pageIndex] = [];

    const block = createRequisitesSignatureBlock(tpl);
    pages[pageIndex] = [...pages[pageIndex], ...block];

    const updated = {
      ...tpl,
      schemas: pages,
    };

    latestTplRef.current = updated as Template;
    (designer as any).updateTemplate(updated);
    markDesignerDirty();
    refreshStats(updated as Template);
    showStatusMsg(`Добавлен блок реквизитов на страницу ${pageIndex + 1}`);
  }, [markDesignerDirty, refreshStats, showStatusMsg]);

 // Delete field
  const handleDeleteField = useCallback((fieldName: string) => {
    const designer = designerRef.current;
    if (!designer) return;
    const tpl = designer.getTemplate() as Template;
    const updated = {
      ...tpl,
      schemas: ((tpl.schemas ?? []) as AnySchema[][])
        .map(page => page.filter((s: AnySchema) => s.name !== fieldName)),
    };
    latestTplRef.current = updated as Template;
    (designer as any).updateTemplate(updated);
    markDesignerDirty();
    refreshStats(updated as Template);
  }, [markDesignerDirty, refreshStats]);

 // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const key = e.key.toLowerCase();
      const isTypingTarget = tag === 'INPUT' || tag === 'TEXTAREA' || Boolean(target?.isContentEditable);
      if ((e.ctrlKey || e.metaKey) && key === 's') { e.preventDefault(); handleSave(); return; }
      if (isTypingTarget) return;
      if ((e.ctrlKey || e.metaKey) && key === 'z') { e.preventDefault(); handleUndo(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSave, handleUndo]);

 // Toggle variable group
  const toggleGroup = (title: string) =>
    setOpenGroups(prev => ({ ...prev, [title]: !prev[title] }));

 // Render
  return (
    <div className="fixed inset-0 z-[250] flex flex-col" style={{ background: '#1c1c1c', color: '#f0f0f0' }}>

      {/* Header */}
      <header
        className="shrink-0 flex items-center justify-between px-4 gap-2"
        style={{ height: 52, background: '#111', borderBottom: '1px solid #303030' }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-bold text-sm text-white whitespace-nowrap">{templateTitle}</span>
          <span className="text-xs text-gray-500 whitespace-nowrap">
            {fieldCount} полей
            {isDirty && <span className="ml-2 text-orange-400">• несохранённые изменения</span>}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Undo */}
          <button
            onClick={handleUndo}
            disabled={!canUndo}
            title="Отменить (Ctrl+Z)"
            className="flex items-center gap-1 px-2 py-1.5 rounded text-xs text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <Undo2 size={13} />
            <span className="hidden sm:inline">Отмена</span>
          </button>

          {/* Panel toggle */}
          <button
            onClick={() => setPanelOpen(v => !v)}
            title={panelOpen ? 'Скрыть панель' : 'Показать панель'}
            className="flex items-center gap-1 px-2 py-1.5 rounded text-xs text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            {panelOpen ? <ChevronLeft size={13} /> : <ChevronRight size={13} />}
            <span className="hidden sm:inline">Панель</span>
          </button>

          {/* Preview */}
          <button
            onClick={handlePreview}
            disabled={isPreviewing || isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {isPreviewing
              ? <Loader2 size={13} className="animate-spin" />
              : <Eye size={13} />
            }
            Предпросмотр
          </button>

          {/* Reset */}
          <button
            onClick={handleReset}
            disabled={isSaving || isSavingAsStandard || isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs bg-white/8 hover:bg-white/15 disabled:opacity-40 transition-colors"
          >
            <RotateCcw size={13} />
            Сбросить
          </button>

          {/* Make template */}
          <button
            onClick={handleSaveAsStandard}
            disabled={isSaving || isSavingAsStandard || isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 transition-colors"
          >
            {isSavingAsStandard
              ? <Loader2 size={13} className="animate-spin" />
              : <Bookmark size={13} />
            }
            Сделать шаблоном
          </button>

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={isSaving || isSavingAsStandard || isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-orange-500 hover:bg-orange-400 disabled:opacity-40 transition-colors"
          >
            {isSaving
              ? <Loader2 size={13} className="animate-spin" />
              : <Save size={13} />
            }
            Сохранить
          </button>

          {/* Close */}
          <button
            onClick={handleClose}
            title="Закрыть"
            className="p-1.5 rounded text-gray-500 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
      </header>

      {/* Main row */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left panel */}
        {panelOpen && (
          <aside
            className="shrink-0 flex flex-col"
            style={{
              width: panelWidth,
              background: '#1a1a1a',
              borderRight: '1px solid #303030',
              transition: 'width 0.18s ease',
            }}
          >
            {/* Tabs */}
            <div className="flex shrink-0" style={{ background: '#141414', borderBottom: '1px solid #2a2a2a' }}>
              {(['vars', 'blocks', 'fields'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setPanelTab(tab)}
                  className="flex-1 py-2 text-xs font-medium transition-colors"
                  style={{
                    color:        panelTab === tab ? '#fff' : '#666',
                    borderBottom: panelTab === tab ? '2px solid #f97316' : '2px solid transparent',
                  }}
                >
                  {tab === 'vars' ? '+ Переменные' : tab === 'blocks' ? 'Блоки' : 'Поля'}
                </button>
              ))}
            </div>

            {/* Variables tab */}
            {panelTab === 'vars' && (
              <div className="flex-1 overflow-y-auto flex flex-col">

                {/* Toolbar: hint + desc toggle */}
                <div
                  className="shrink-0 flex items-center justify-between px-3 py-1"
                  style={{ background: '#141414', borderBottom: '1px solid #222' }}
                >
                  <span style={{ fontSize: 10, color: '#555' }}>Клик — добавить поле на страницу</span>
                  <button
                    onClick={() => setShowDescs(v => !v)}
                    title={showDescs ? 'Скрыть пояснения' : 'Показать пояснения'}
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors"
                    style={{
                      fontSize: 10,
                      color: showDescs ? '#f97316' : '#555',
                      background: showDescs ? 'rgba(249,115,22,0.1)' : 'transparent',
                    }}
                  >
                    <AlignLeft size={11} />
                    {showDescs ? 'Кратко' : 'Подробно'}
                  </button>
                </div>

                {/* Groups */}
                {VARIABLE_GROUPS.map(group => (
                  <div key={group.title}>
                    {/* Group header */}
                    <button
                      onClick={() => toggleGroup(group.title)}
                      className="w-full flex items-center gap-1.5 px-3 py-1.5 text-left text-xs font-semibold text-gray-300 hover:bg-white/5 transition-colors"
                      style={{ borderTop: '1px solid #242424' }}
                    >
                      <span style={{ fontSize: 12 }}>{group.icon}</span>
                      <span>{group.title}</span>
                      <span className="ml-auto text-gray-600" style={{ fontSize: 9 }}>
                        {openGroups[group.title] ? 'v' : '>'}
                      </span>
                    </button>

                    {/* Variables */}
                    {openGroups[group.title] && (
                      <div className="pb-1">
                        {group.vars.map(v => (
                          <button
                            key={v}
                            onClick={() => handleAddVariable(v)}
                            className="w-full text-left px-4 py-1 hover:bg-orange-500/8 transition-colors group"
                            style={{ borderBottom: '1px solid #1e1e1e' }}
                          >
                            {/* Variable name */}
                            <div
                              className="text-gray-400 group-hover:text-orange-300 transition-colors truncate font-mono"
                              style={{ fontSize: 11 }}
                            >
                              {v}
                            </div>

                            {/* Description — shown in detailed mode */}
                            {showDescs && VAR_DESC[v] && (
                              <div
                                className="text-gray-600 group-hover:text-gray-500 transition-colors mt-0.5"
                                style={{ fontSize: 9.5, lineHeight: 1.3 }}
                              >
                                {VAR_DESC[v]}
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Blocks tab */}
            {panelTab === 'blocks' && (
              <div className="flex-1 overflow-y-auto p-3 space-y-3">
                <div className="text-gray-500 text-xs leading-relaxed">
                  Готовые блоки вставляются на текущую страницу как набор связанных объектов.
                  Их можно двигать и редактировать в Designer, а переменные внутри заполняются из CRM.
                </div>

                <button
                  onClick={handleAddRequisitesBlock}
                  className="w-full rounded border border-white/10 bg-white/[0.04] p-3 text-left hover:border-orange-500/50 hover:bg-orange-500/10 transition-colors"
                >
                  <div className="text-sm font-semibold text-gray-100">Реквизиты + подписи + печать</div>
                  <div className="mt-1 text-xs text-gray-500 leading-relaxed">
                    Контейнер с реквизитами исполнителя, строками директора/бухгалтера и местом под печать или штамп.
                  </div>
                  <div className="mt-2 text-[10px] text-orange-300/80">
                    Использует Multi-Variable Text и Image
                  </div>
                </button>

                <div className="rounded border border-white/10 bg-black/20 p-3 text-xs text-gray-500 leading-relaxed">
                  Важно: у PDFMe нет полноценной Word-группы с автоматическим переносом.
                  Блок сохраняет общий `componentId`, но при переносе на другую страницу его нужно двигать как набор объектов.
                </div>
              </div>
            )}

            {/* Fields tab */}
            {panelTab === 'fields' && (
              <div className="flex-1 overflow-y-auto">
                <div
                  className="px-3 py-1.5 text-gray-600"
                  style={{ fontSize: 10, background: '#141414', borderBottom: '1px solid #222' }}
                >
                  {fieldList.length} полей · X — удалить
                </div>

                {fieldList.map((field, idx) => (
                  <div
                    key={`${field.name}-${idx}`}
                    className="flex items-center px-2 py-0.5 gap-1.5 hover:bg-white/4 group"
                    style={{ fontSize: 11 }}
                  >
                    {/* Type icon */}
                    <span className="text-gray-700 shrink-0 w-3.5 text-center" style={{ fontSize: 10 }}>
                      {field.type === 'table'     ? '#' :
                       field.type === 'line'      ? '-' :
                       field.type === 'rectangle' ? '[]' :
                       field.type === 'image'     ? 'I' :
                       field.type === 'signature' ? 'S' :
                       field.type === 'qrcode'    ? 'Q' :
                       field.type === 'multiVariableText' ? 'M' : 'T'}
                    </span>

                    <span className="flex-1 truncate text-gray-400" title={field.name}>
                      {field.name}
                    </span>

                    <span className="text-gray-700 shrink-0 tabular-nums" style={{ fontSize: 9 }}>
                      {Math.round(field.position?.x ?? 0)},{Math.round(field.position?.y ?? 0)}
                    </span>

                    {!field.readOnly && (
                      <button
                        onClick={() => handleDeleteField(field.name)}
                        className="shrink-0 opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-400 w-4 text-center leading-none transition-opacity"
                        title={`Удалить поле «${field.name}»`}
                      >
                        X
                      </button>
                    )}
                  </div>
                ))}

                {fieldList.length === 0 && (
                  <div className="px-3 py-4 text-gray-700 text-xs text-center">
                    Полей нет
                  </div>
                )}
              </div>
            )}
          </aside>
        )}

        {/* Designer canvas */}
        <div className="relative flex-1 overflow-hidden">
          {isLoading && (
            <div
              className="absolute inset-0 z-10 flex items-center justify-center"
              style={{ background: '#e8e8e8' }}
            >
              <Loader2 size={32} className="animate-spin text-orange-500" />
            </div>
          )}
          <div ref={containerRef} className="h-full w-full" style={{ background: '#e8e8e8' }} />
        </div>
      </div>

      {/* Status bar */}
      <div
        className="shrink-0 flex items-center gap-4 px-4 tabular-nums"
        style={{ height: 26, background: '#111', borderTop: '1px solid #2a2a2a', fontSize: 11, color: '#555' }}
      >
        <span>
          Полей: <span style={{ color: '#888' }}>{fieldCount}</span>
        </span>
        <span>
          Страница: <span style={{ color: '#888' }}>{currentPage + 1}</span>
        </span>
        {statusMsg && <span style={{ color: '#f97316' }}>{statusMsg}</span>}
        <span className="ml-auto" style={{ color: '#3a3a3a' }}>
          Ctrl+S — сохранить · Ctrl+Z — отменить
        </span>
      </div>
    </div>
  );
}

