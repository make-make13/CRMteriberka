import { getDefaultFont, getFallbackFontName, mm2pt } from '@pdfme/common';
import type { Font, PDFRenderProps, Schema, Template } from '@pdfme/common';
import { barcodes, image, line, multiVariableText, rectangle, signature, svg, table, text } from '@pdfme/schemas';
import { convertForPdfLayoutProps, hex2PrintingColor } from '@pdfme/schemas/utils';
import {
  PDFME_BANYA_CONTRACT_TEMPLATE_ID,
  PDFME_CC_CONTRACT_TEMPLATE_ID,
  PDFME_GB_CONTRACT_TEMPLATE_ID,
  PDFME_GIFT_CERTIFICATE_TEMPLATE_ID,
  PDFME_INVOICE_TEMPLATE_ID,
} from './pdfmeTemplateIds';

export {
  PDFME_BANYA_CONTRACT_TEMPLATE_ID,
  PDFME_CC_CONTRACT_TEMPLATE_ID,
  PDFME_GB_CONTRACT_TEMPLATE_ID,
  PDFME_GIFT_CERTIFICATE_TEMPLATE_ID,
  PDFME_INVOICE_TEMPLATE_ID,
};

type BoldVariableTextRun = { text: string; bold: boolean };

type BoldVariableTextSchema = Schema & {
  text?: string;
  variables?: string[];
  boldVariableFontName?: string;
};

export function buildBoldVariableTextRuns(textValue: string, variablesInput: unknown): BoldVariableTextRun[] {
  let variables: Record<string, string> = {};
  if (typeof variablesInput === 'string') {
    try {
      const parsed = JSON.parse(variablesInput || '{}');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        variables = parsed as Record<string, string>;
      }
    } catch {
      variables = {};
    }
  } else if (variablesInput && typeof variablesInput === 'object' && !Array.isArray(variablesInput)) {
    variables = variablesInput as Record<string, string>;
  }

  const runs: BoldVariableTextRun[] = [];
  const variablePattern = /\{([^{}]+)\}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  const pushRun = (textPart: string, bold: boolean) => {
    if (!textPart) return;
    const previous = runs[runs.length - 1];
    if (previous?.bold === bold) {
      previous.text += textPart;
      return;
    }
    runs.push({ text: textPart, bold });
  };

  while ((match = variablePattern.exec(textValue)) !== null) {
    pushRun(textValue.slice(lastIndex, match.index), false);
    pushRun(String(variables[match[1]] ?? ''), true);
    lastIndex = match.index + match[0].length;
  }
  pushRun(textValue.slice(lastIndex), false);

  return runs;
}

function splitBoldRunsIntoDrawableChunks(runs: BoldVariableTextRun[]) {
  const chunks: BoldVariableTextRun[] = [];
  for (const run of runs) {
    for (const part of run.text.split(/(\r\n|\r|\n|\s+)/g)) {
      if (!part) continue;
      if (part === '\r' || part === '\n' || part === '\r\n') {
        chunks.push({ text: '\n', bold: run.bold });
      } else {
        chunks.push({ text: part, bold: run.bold });
      }
    }
  }
  return chunks;
}

function normalizePdfmeFontData(data: Font[string]['data']) {
  return data instanceof Uint8Array
    ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
    : data;
}

async function fetchPdfmeFontData(data: Font[string]['data']) {
  if (typeof data === 'string' && data.startsWith('http')) {
    return fetch(data).then(response => response.arrayBuffer());
  }
  return normalizePdfmeFontData(data);
}

async function embedPdfmeFont(
  pdfDoc: PDFRenderProps<any>['pdfDoc'],
  font: Font,
  cache: Map<string | number, unknown>,
  fontName: string,
) {
  const fallbackName = getFallbackFontName(font);
  const resolvedFontName = font[fontName] ? fontName : fallbackName;
  const cacheKey = `crm-pdf-font-${resolvedFontName}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached as Awaited<ReturnType<typeof pdfDoc.embedFont>>;

  const fontDefinition = font[resolvedFontName] || font[fallbackName];
  const embedded = await pdfDoc.embedFont(await fetchPdfmeFontData(fontDefinition.data), {
    subset: fontDefinition.subset ?? true,
  });
  cache.set(cacheKey, embedded);
  return embedded;
}

function measureBoldRunsLine(
  lineRuns: BoldVariableTextRun[],
  regularFont: { widthOfTextAtSize: (text: string, size: number) => number },
  boldFont: { widthOfTextAtSize: (text: string, size: number) => number },
  fontSize: number,
  characterSpacing: number,
) {
  return lineRuns.reduce((sum, run) => {
    const spacing = Math.max(0, run.text.length - 1) * characterSpacing;
    return sum + (run.bold ? boldFont : regularFont).widthOfTextAtSize(run.text, fontSize) + spacing;
  }, 0);
}

function wrapBoldRuns(
  runs: BoldVariableTextRun[],
  regularFont: { widthOfTextAtSize: (text: string, size: number) => number },
  boldFont: { widthOfTextAtSize: (text: string, size: number) => number },
  fontSize: number,
  characterSpacing: number,
  width: number,
) {
  const lines: BoldVariableTextRun[][] = [[]];
  const pushToCurrentLine = (chunk: BoldVariableTextRun) => {
    const current = lines[lines.length - 1];
    const previous = current[current.length - 1];
    if (previous?.bold === chunk.bold) {
      previous.text += chunk.text;
      return;
    }
    current.push({ ...chunk });
  };

  for (const chunk of splitBoldRunsIntoDrawableChunks(runs)) {
    if (chunk.text === '\n') {
      lines.push([]);
      continue;
    }

    const isWhitespace = /^\s+$/.test(chunk.text);
    const current = lines[lines.length - 1];
    const currentWidth = measureBoldRunsLine(current, regularFont, boldFont, fontSize, characterSpacing);
    const chunkWidth = measureBoldRunsLine([chunk], regularFont, boldFont, fontSize, characterSpacing);
    if (current.length && !isWhitespace && currentWidth + chunkWidth > width) {
      lines.push([]);
    }
    if (!lines[lines.length - 1].length && isWhitespace) continue;
    pushToCurrentLine(chunk);
  }

  return lines.filter((lineRuns, index) => lineRuns.length || index === 0);
}

async function renderMultiVariableTextWithBoldVariables(arg: PDFRenderProps<BoldVariableTextSchema>) {
  const { value, pdfDoc, page, options, schema, _cache } = arg;
  const inputValue = value || (typeof schema.content === 'string' ? schema.content : '{}');
  const runs = buildBoldVariableTextRuns(schema.text || '', inputValue);
  if (!runs.length) return;

  const { font = getDefaultFont(), colorType } = options;
  const fontName = typeof schema.fontName === 'string' ? schema.fontName : getFallbackFontName(font);
  const boldFontName = typeof schema.boldVariableFontName === 'string' ? schema.boldVariableFontName : 'NotoSerifBold';
  const [regularFont, boldFont] = await Promise.all([
    embedPdfmeFont(pdfDoc, font, _cache, fontName),
    embedPdfmeFont(pdfDoc, font, _cache, boldFontName),
  ]);

  const pageHeight = page.getHeight();
  const { width, height, position: { x, y }, rotate, opacity } = convertForPdfLayoutProps({
    schema,
    pageHeight,
    applyRotateTranslate: false,
  });
  const fontSize = Number(schema.fontSize || 13);
  const lineHeight = Number(schema.lineHeight || 1);
  const characterSpacing = Number(schema.characterSpacing || 0);
  const color = hex2PrintingColor(typeof schema.fontColor === 'string' ? schema.fontColor : '#000000', colorType);
  const lines = wrapBoldRuns(runs, regularFont, boldFont, fontSize, characterSpacing, width);
  const firstLineHeight = regularFont.heightAtSize ? regularFont.heightAtSize(fontSize) : fontSize;
  const halfLineHeightAdjustment = lineHeight === 0 ? 0 : (lineHeight - 1) * fontSize / 2;
  const textHeight = firstLineHeight + (lines.length - 1) * lineHeight * fontSize;
  let yOffset = firstLineHeight + halfLineHeightAdjustment;
  if (schema.verticalAlignment === 'middle') {
    yOffset = Math.max(firstLineHeight, (height - textHeight) / 2 + firstLineHeight);
  } else if (schema.verticalAlignment === 'bottom') {
    yOffset = Math.max(firstLineHeight, height - textHeight + firstLineHeight);
  }

  const backgroundColor = typeof schema.backgroundColor === 'string' ? schema.backgroundColor : '';
  if (backgroundColor) {
    page.drawRectangle({
      x,
      y,
      width,
      height,
      rotate,
      color: hex2PrintingColor(backgroundColor, colorType),
      opacity,
    });
  }

  for (const [rowIndex, lineRuns] of lines.entries()) {
    const lineWidth = measureBoldRunsLine(lineRuns, regularFont, boldFont, fontSize, characterSpacing);
    let xLine = x;
    if (schema.alignment === 'center') xLine += (width - lineWidth) / 2;
    if (schema.alignment === 'right') xLine += width - lineWidth;
    const yLine = pageHeight - mm2pt(schema.position.y) - yOffset - (lineHeight * fontSize * rowIndex);

    for (const run of lineRuns) {
      if (!run.text) continue;
      const runFont = run.bold ? boldFont : regularFont;
      page.drawText(run.text, {
        x: xLine,
        y: yLine,
        rotate,
        size: fontSize,
        color,
        lineHeight: lineHeight * fontSize,
        font: runFont,
        opacity,
      });
      xLine += runFont.widthOfTextAtSize(run.text, fontSize) + Math.max(0, run.text.length - 1) * characterSpacing;
    }
  }
}

const boldVariableMultiVariableText = {
  ...multiVariableText,
  pdf: renderMultiVariableTextWithBoldVariables,
};

export const pdfmePlugins = {
  Text: text,
  'Multi-Variable Text': boldVariableMultiVariableText,
  Image: image,
  Signature: signature,
  SVG: svg,
  QR: barcodes.qrcode,
  Table: table,
  Line: line,
  Rectangle: rectangle,
};

export async function getPdfmeFont() {
  const fontData = await fetch('/fonts/NotoSerif-Regular.ttf').then(res => res.arrayBuffer());
  const boldFontData = await fetch('/fonts/NotoSerif-Bold.ttf')
    .then(res => (res.ok ? res.arrayBuffer() : fontData))
    .catch(() => fontData);
  const angryFontData = await fetch('/fonts/ANGRY.OTF')
    .then(res => (res.ok ? res.arrayBuffer() : fontData))
    .catch(() => fontData);

  return {
    NotoSerif: {
      data: fontData,
      fallback: true,
    },
    NotoSerifJP: {
      data: fontData,
    },
    NotoSerifBold: {
      data: boldFontData,
    },
    angry: {
      data: angryFontData,
      fallback: false,
    },
  };
}

function normalizeFontStyle(style: Record<string, unknown> | undefined) {
  if (!style) return style;
  const next = { ...style };
  if (next.fontWeight === 'bold') {
    next.fontName = 'NotoSerifBold';
    delete next.fontWeight;
  }
  if (next.fontName === 'NotoSerifJP') {
    next.fontName = 'NotoSerif';
  }
  return next;
}

function normalizeCellStyle(
  style: Record<string, unknown> | undefined,
  defaults: Record<string, unknown> = {},
) {
  const next = {
    ...defaults,
    ...(normalizeFontStyle(style) || {}),
  };

  const lineHeight = Number(next.lineHeight);
  if (!Number.isFinite(lineHeight) || lineHeight < 1) {
    next.lineHeight = 1.2;
  }

  const fontSize = Number(next.fontSize);
  if (!Number.isFinite(fontSize) || fontSize < 6) {
    next.fontSize = 9;
  }

  if (!next.padding || typeof next.padding !== 'object') {
    next.padding = { top: 2, right: 2, bottom: 2, left: 2 };
  }

  return next;
}

export function normalizePdfmeTemplateFonts(template: Template): Template {
  return {
    ...template,
    schemas: template.schemas.map(page => page.flatMap(schema => {
      const next = normalizeFontStyle(schema as Record<string, unknown>) as Record<string, unknown>;

      if (next.type === 'table') {
        return {
          ...next,
          headStyles: normalizeCellStyle(next.headStyles as Record<string, unknown>),
          bodyStyles: normalizeCellStyle(next.bodyStyles as Record<string, unknown>),
        } as any;
      }

      return next as any;
    })),
  };
}

type SchemaOptions = Record<string, unknown>;

const PDFME_PREVIEW_VALUES: Record<string, string> = {
  contract_number: '216067',
  sign_date: '06 апреля 2026 г.',
  sign_date_short: '06.04.2026',
  date_in_short: '25.04.2026',
  date_out_short: '25.04.2026',
  time_in: '17:00',
  time_out: '22:00',
  cottage_number: '3',
  guests: '15',
  client_name: 'Великая Виктория Алексеевна',
  prepayment: '7 200,00',
  prepayment_words: 'Семь тысяч двести рублей 00 копеек',
  total: '7 500,00',
  certificate_amount: '10 000',
  certificate_issue_date: '25.04.2026',
  certificate_number: '001',
  total_words: 'Семь тысяч пятьсот рублей 00 копеек',
};

function t(name: string, x: number, y: number, w: number, h: number, opts: SchemaOptions = {}) {
  return {
    name,
    type: 'text' as const,
    position: { x, y },
    width: w,
    height: h,
    fontName: 'NotoSerif',
    fontSize: 8.5,
    fontColor: '#000000',
    backgroundColor: '',
    alignment: 'left',
    verticalAlignment: 'top',
    lineHeight: 1.15,
    characterSpacing: 0,
    ...opts,
  };
}

function st(name: string, content: string, x: number, y: number, w: number, h: number, opts: SchemaOptions = {}) {
  return t(name, x, y, w, h, { content, readOnly: true, ...opts });
}

function r(name: string, x: number, y: number, w: number, h: number, opts: SchemaOptions = {}) {
  return {
    name,
    type: 'rectangle' as const,
    position: { x, y },
    width: w,
    height: h,
    borderWidth: 0.3,
    borderColor: '#000000',
    color: '',
    ...opts,
  };
}

function l(name: string, x: number, y: number, w: number, h: number, opts: SchemaOptions = {}) {
  return {
    name,
    type: 'line' as const,
    position: { x, y },
    width: w,
    height: h,
    color: '#000000',
    ...opts,
  };
}

function imageField(name: string, x: number, y: number, w: number, h: number, opts: SchemaOptions = {}) {
  return {
    name,
    type: 'image' as const,
    content: '',
    position: { x, y },
    width: w,
    height: h,
    rotate: 0,
    opacity: 1,
    ...opts,
  };
}

function mvt(
  name: string,
  textValue: string,
  variables: string[],
  x: number,
  y: number,
  w: number,
  h: number,
  opts: SchemaOptions = {},
) {
  const content = variables.reduce<Record<string, string>>((acc, variableName) => {
    acc[variableName] = PDFME_PREVIEW_VALUES[variableName] || '';
    return acc;
  }, {});

  return {
    ...t(name, x, y, w, h, opts),
    type: 'multiVariableText' as const,
    text: textValue,
    variables,
    boldVariableFontName: 'NotoSerifBold',
    content: JSON.stringify(content),
  };
}

function clonePage(page: Template['schemas'][number]) {
  return JSON.parse(JSON.stringify(page)) as Template['schemas'][number];
}

const PDFME_DOCUMENT_STAMP_SIZE = 40;
const PDFME_DOCUMENT_SIGNATURE_WIDTH = 34;
const PDFME_DOCUMENT_SIGNATURE_HEIGHT = 20;
const PDFME_DOCUMENT_STAMP_OPACITY = 1;

const PDFME_DOCUMENT_STAMP_FIELDS = new Set([
  'cc_company_stamp_image',
  'company_static_stamp',
  'act_company_static_stamp',
]);

const PDFME_DOCUMENT_SIGNATURE_FIELDS = new Set([
  'cc_executor_signature_image',
  'director_static_signature',
  'accountant_static_signature',
  'act_director_static_signature',
]);

const PDFME_DOCUMENT_SIGN_LINE_FIELDS = new Set([
  'cc_executor_sign_line',
  'cc_client_sign_line',
  'director_static_line',
  'accountant_static_line',
  'act_director_line',
  'act_customer_line',
]);

const PDFME_STANDARD_LAYOUT_OVERRIDES: Record<string, SchemaOptions> = {
  cc_executor_signature_image: { position: { x: 33.76, y: 211.88 } },
  cc_company_stamp_image: { position: { x: 54.01, y: 226.11 } },
  cc_executor_sign_line: { position: { x: 37, y: 225 } },
  cc_addendum_checkin_exec_line: { width: 30 },
  cc_addendum_checkout_exec_line: { width: 30 },
  cc_addendum_final_exec_line: { width: 30 },
  cc_addendum_final_client_line: { width: 30 },
  bank_static_box: { position: { x: 20, y: 18.5 } },
  bank_static_right_column: { position: { x: 140, y: 18.5 } },
  bank_static_right_value_column: { position: { x: 155, y: 18.5 } },
  bank_static_left_row_2: { position: { x: 20, y: 35.5 } },
  bank_static_left_inn_kpp: { position: { x: 69, y: 35.5 } },
  bank_static_left_row_3: { position: { x: 20, y: 42.5 } },
  bank_static_right_row_1: { position: { x: 140, y: 26.5 } },
  bank_static_right_row_2: { position: { x: 140, y: 39 } },
  bank_static_name: { position: { x: 21, y: 19.7 } },
  bank_static_label: { position: { x: 21, y: 28 } },
  bank_static_inn_label: { position: { x: 21, y: 36 } },
  bank_static_inn: { position: { x: 29, y: 36 } },
  bank_static_kpp_label: { position: { x: 69, y: 36 } },
  bank_static_kpp: { position: { x: 82, y: 36 } },
  bank_static_org: { position: { x: 21, y: 42.7 } },
  bank_static_recipient_label: { position: { x: 21, y: 47.5 } },
  bank_static_bik_label: { position: { x: 141, y: 19.7 } },
  bank_static_bik: { position: { x: 156, y: 19.7 } },
  bank_static_ks_label: { position: { x: 141, y: 27.5 } },
  bank_static_ks: { position: { x: 156, y: 27.5 } },
  bank_static_rs_label: { position: { x: 141, y: 40 } },
  bank_static_rs: { position: { x: 156, y: 40 } },
  invoice_header: { position: { x: 20, y: 53 } },
  supplier_static_label: { position: { x: 20, y: 61.5 } },
  supplier_static_text: { position: { x: 43, y: 61.5 } },
  buyer_static_label: { position: { x: 20, y: 73.3 } },
  client_name: { position: { x: 43, y: 73.3 } },
  service_table_top: { position: { x: 20, y: 80 } },
  service_table_header_bottom: { position: { x: 20, y: 86 } },
  service_table_bottom: { position: { x: 20, y: 95.5 } },
  service_table_v_0: { position: { x: 20, y: 80 } },
  service_table_v_1: { position: { x: 28, y: 80 } },
  service_table_v_2: { position: { x: 135, y: 80 } },
  service_table_v_3: { position: { x: 149, y: 80 } },
  service_table_v_4: { position: { x: 161, y: 80 } },
  service_table_v_5: { position: { x: 178, y: 80 } },
  service_table_v_6: { position: { x: 195, y: 80 } },
  service_head_no: { position: { x: 20.8, y: 81 } },
  service_head_name: { position: { x: 28.8, y: 81 } },
  service_head_qty: { position: { x: 135.8, y: 81 } },
  service_head_unit: { position: { x: 149.8, y: 81 } },
  service_head_price: { position: { x: 161.8, y: 81 } },
  service_head_total: { position: { x: 178.8, y: 81 } },
  service_row_no: { position: { x: 20.8, y: 87 } },
  service_row_name: { position: { x: 28.8, y: 87 } },
  service_row_qty: { position: { x: 135.8, y: 87 } },
  service_row_unit: { position: { x: 149.8, y: 87 } },
  service_row_price: { position: { x: 161.8, y: 87 } },
  service_row_total: { position: { x: 178.8, y: 87 } },
  total_label: { position: { x: 140, y: 97 } },
  service_total: { position: { x: 173, y: 97 } },
  vat_label: { position: { x: 127, y: 102 } },
  vat_amount: { position: { x: 173, y: 102 } },
  grand_total_label: { position: { x: 133, y: 107 } },
  total: { position: { x: 173, y: 107 } },
  qty_words: { position: { x: 20, y: 121 } },
  total_words_only: { position: { x: 20, y: 127 } },
  invoice_words_bottom_line: { position: { x: 20, y: 132 } },
  director_static_title: { position: { x: 20, y: 156.74 } },
  director_static_line: { position: { x: 64, y: 159 } },
  director_static_name: { position: { x: 96, y: 156.74 } },
  accountant_static_title: { position: { x: 122, y: 156.74 } },
  accountant_static_line: { position: { x: 148, y: 159 } },
  accountant_static_name: { position: { x: 176.5, y: 156.5 } },
  director_static_signature: { position: { x: 64.53, y: 145.48 } },
  accountant_static_signature: { position: { x: 147.92, y: 146.12 } },
  'bank_static_left_inn_kpp copy': { position: { x: 79, y: 35.5 } },
  'bank_static_left_inn_kpp copy 2': { position: { x: 28, y: 35.5 } },
  company_static_stamp: { position: { x: 79.1, y: 161.17 } },
  act_customer_label: { position: { x: 20, y: 30 } },
  act_client_name: { position: { x: 48, y: 30 } },
  act_service_table_top: { position: { x: 20, y: 38 } },
  act_service_table_header_bottom: { position: { x: 20, y: 44 } },
  act_service_table_bottom: { position: { x: 20, y: 53.5 } },
  act_service_table_v_0: { position: { x: 20, y: 38 } },
  act_service_table_v_1: { position: { x: 28, y: 38 } },
  act_service_table_v_2: { position: { x: 135, y: 38 } },
  act_service_table_v_3: { position: { x: 149, y: 38 } },
  act_service_table_v_4: { position: { x: 161, y: 38 } },
  act_service_table_v_5: { position: { x: 178, y: 38 } },
  act_service_table_v_6: { position: { x: 195, y: 38 } },
  act_service_head_no: { position: { x: 20.8, y: 39 } },
  act_service_head_name: { position: { x: 28.8, y: 39 } },
  act_service_head_qty: { position: { x: 135.8, y: 39 } },
  act_service_head_unit: { position: { x: 149.8, y: 39 } },
  act_service_head_price: { position: { x: 161.8, y: 39 } },
  act_service_head_total: { position: { x: 178.8, y: 39 } },
  act_service_row_no: { position: { x: 20.8, y: 45 } },
  act_service_row_name: { position: { x: 28.8, y: 45 } },
  act_service_row_qty: { position: { x: 135.8, y: 45 } },
  act_service_row_unit: { position: { x: 149.8, y: 45 } },
  act_service_row_price: { position: { x: 161.8, y: 45 } },
  act_service_row_total: { position: { x: 178.8, y: 45 } },
  act_total_label: { position: { x: 140, y: 57 } },
  act_service_total: { position: { x: 173, y: 57 } },
  act_vat_label: { position: { x: 140, y: 62 } },
  act_vat_amount: { position: { x: 173, y: 62 } },
  act_grand_total_label: { position: { x: 133, y: 67 } },
  act_total: { position: { x: 173, y: 67 } },
  act_qty_words: { position: { x: 20, y: 76 } },
  act_total_words_only: { position: { x: 20, y: 82 } },
  act_completion_text: { position: { x: 20, y: 88 } },
  act_executor_title: { position: { x: 20, y: 102 } },
  act_customer_title: { position: { x: 113, y: 102 } },
  act_executor_role: { position: { x: 20, y: 113 } },
  act_director_label: { position: { x: 20, y: 140 } },
  act_director_line: { position: { x: 53, y: 143 }, width: 30 },
  act_director_static_name: { position: { x: 84.11, y: 140.32 } },
  act_customer_line: { position: { x: 130.22, y: 142.95 }, width: 28 },
  act_client_name_short: { position: { x: 158.88, y: 138.02 }, width: 32.28, height: 5.03 },
  act_director_static_signature: { position: { x: 52.71, y: 129.47 } },
  act_company_static_stamp: { position: { x: 62.44, y: 143.29 } },
};

function applyStandardLayoutOverrides(page: Template['schemas'][number]) {
  return (page as Array<Record<string, unknown>>).map(schema => {
    const override = PDFME_STANDARD_LAYOUT_OVERRIDES[String(schema.name || '')];
    if (!override) return schema;
    const overridePosition = override.position as { x: number; y: number } | undefined;

    return {
      ...schema,
      ...override,
      position: overridePosition ? { ...overridePosition } : schema.position,
    };
  }) as Template['schemas'][number];
}

function normalizeDocumentSignatureImagesAndLayers(page: Template['schemas'][number]) {
  const regularSchemas: Array<Record<string, unknown>> = [];
  const signLineSchemas: Array<Record<string, unknown>> = [];
  const signatureSchemas: Array<Record<string, unknown>> = [];
  const stampSchemas: Array<Record<string, unknown>> = [];

  for (const schema of clonePage(page) as Array<Record<string, unknown>>) {
    const next = { ...schema };
    const name = String(next.name || '');

    if (PDFME_DOCUMENT_STAMP_FIELDS.has(name)) {
      next.width = PDFME_DOCUMENT_STAMP_SIZE;
      next.height = PDFME_DOCUMENT_STAMP_SIZE;
      next.opacity = PDFME_DOCUMENT_STAMP_OPACITY;
      stampSchemas.push(next);
      continue;
    }

    if (PDFME_DOCUMENT_SIGNATURE_FIELDS.has(name)) {
      next.width = PDFME_DOCUMENT_SIGNATURE_WIDTH;
      next.height = PDFME_DOCUMENT_SIGNATURE_HEIGHT;
      signatureSchemas.push(next);
      continue;
    }

    if (PDFME_DOCUMENT_SIGN_LINE_FIELDS.has(name)) {
      signLineSchemas.push(next);
      continue;
    }

    regularSchemas.push(next);
  }

  return [...regularSchemas, ...signLineSchemas, ...signatureSchemas, ...stampSchemas] as Template['schemas'][number];
}

function cloneTemplatePageWithSchema(template: Template, schemaName: string, fallbackIndex: number) {
  const page = template.schemas.find(item =>
    item.some(schema => String((schema as Record<string, unknown>).name) === schemaName)
  ) || template.schemas[fallbackIndex];

  if (!page) {
    return [] as unknown as Template['schemas'][number];
  }

  return clonePage(page);
}

const CC_CONTRACT_FONT_SIZE = 8;
const CC_CONTRACT_LINE_HEIGHT = 1.15;

const CC_LAYOUT_OVERRIDES: Record<string, SchemaOptions> = {
  cc_contract_header: { position: { x: 64, y: 10 }, height: 6.5 },
  cc_contract_subtitle: {
    position: { x: 55, y: 17.2 },
    width: 100,
    height: 10,
    fontSize: 7.3,
    lineHeight: 1.18,
    alignment: 'center',
  },
  cc_contract_city: { position: { x: 22, y: 31 } },
  sign_date: { position: { x: 153, y: 31 }, width: 40 },

  cc_client_intro: { position: { x: 22, y: 41 }, width: 170, height: 12, fontSize: 7.15, lineHeight: 1.08 },
  cc_section_1_title: { position: { x: 78, y: 61 } },
  cc_section_1_body: { position: { x: 22, y: 67 }, width: 170, height: 21, fontSize: 7.15, lineHeight: 1.08 },
  cc_section_2_title: { position: { x: 70, y: 96 } },
  cc_section_2_body: { position: { x: 22, y: 102 }, width: 170, height: 96, fontSize: 7.15, lineHeight: 1.08 },
  cc_section_3_title: { position: { x: 70, y: 208 } },
  cc_section_3_body: { position: { x: 22, y: 214 }, width: 170, height: 74, fontSize: 7.15, lineHeight: 1.08 },

  cc_section_3_tail: { position: { x: 22, y: 10 }, width: 170, height: 15, fontSize: 7.2, lineHeight: 1.06 },
  cc_section_4_title: { position: { x: 76, y: 33 } },
  cc_section_4_body: { position: { x: 22, y: 39 }, width: 170, height: 42, fontSize: 7.35, lineHeight: 1.26 },
  cc_section_5_title: { position: { x: 74, y: 91 } },
  cc_section_5_body: { position: { x: 22, y: 97 }, width: 170, height: 8, fontSize: 7.15, lineHeight: 1.03 },
  cc_section_6_title: { position: { x: 56, y: 115 }, width: 98 },
  cc_executor_party_title: { position: { x: 22, y: 123 }, width: 82, height: 12 },
  cc_executor_requisites: { position: { x: 22, y: 136 }, width: 82, height: 56, fontSize: 7.75, lineHeight: 1.08 },
  cc_client_party_title: {
    type: 'multiVariableText',
    text: 'Сторона-2\n{client_name}',
    variables: ['client_name'],
    boldVariableFontName: 'NotoSerifBold',
    content: JSON.stringify({ client_name: PDFME_PREVIEW_VALUES.client_name }),
    position: { x: 110, y: 123 },
    width: 82,
    height: 12,
    fontSize: 8.2,
    fontName: 'NotoSerifBold',
    lineHeight: 1.12,
    alignment: 'center',
  },
  cc_client_requisites: { position: { x: 110, y: 136 }, width: 82, height: 44, fontSize: 7.75, lineHeight: 1.12 },

  cc_addendum_city: { position: { x: 22, y: 25 } },
  cc_addendum_date: { position: { x: 153, y: 24 }, width: 40 },
  cc_addendum_intro: { position: { x: 22, y: 36 }, width: 170, height: 13, fontSize: 7.15, lineHeight: 1.05 },
  cc_addendum_section_1: { position: { x: 22, y: 56 }, width: 170, height: 14, fontSize: 7, lineHeight: 1.04 },
  cc_addendum_section_2: { position: { x: 22, y: 79 }, width: 170, height: 22, fontSize: 7, lineHeight: 1.04 },
  cc_addendum_section_3: { position: { x: 22, y: 112 }, width: 170, height: 28, fontSize: 6.95, lineHeight: 1.04 },
  cc_addendum_section_4: { position: { x: 22, y: 152 }, width: 170, height: 56, fontSize: 6.8, lineHeight: 1.03 },
  cc_addendum_checkin_title: { position: { x: 24, y: 216 } },
  cc_addendum_checkin_exec_sign: { position: { x: 53, y: 226 } },
  cc_addendum_checkin_client_sign: { position: { x: 131, y: 226 } },
  cc_addendum_checkin_exec_line: { position: { x: 24, y: 230 } },
  cc_addendum_checkin_client_line: { position: { x: 100, y: 230 } },
  cc_addendum_checkout_title: { position: { x: 24, y: 238 } },
  cc_addendum_checkout_exec_sign: { position: { x: 53, y: 247 } },
  cc_addendum_checkout_client_sign: { position: { x: 131, y: 247 } },
  cc_addendum_checkout_exec_line: { position: { x: 24, y: 251 } },
  cc_addendum_checkout_client_line: { position: { x: 100, y: 251 } },
  cc_addendum_checkout_date: { position: { x: 170, y: 258 } },

  cc_addendum_section_6_body: { position: { x: 22, y: 14 }, width: 170, height: 20, fontSize: 7.15, lineHeight: 1.05 },
  cc_addendum_final_signatures_title: { position: { x: 24, y: 42 } },
  cc_addendum_final_exec_label: { position: { x: 24, y: 54 } },
  cc_addendum_final_client_label: { position: { x: 112, y: 54 } },
  cc_addendum_final_exec_sign: { position: { x: 54.26, y: 65.26 } },
  cc_addendum_final_client_sign: { position: { x: 143, y: 65 } },
  cc_addendum_final_exec_line: { position: { x: 24, y: 69 } },
  cc_addendum_final_client_line: { position: { x: 112, y: 69 } },
  cc_addendum_final_date: { position: { x: 170, y: 82 } },
};

const CC_AUTO_WRAP_FIELDS = new Set([
  'cc_client_intro',
  'cc_section_1_body',
  'cc_section_2_body',
  'cc_section_3_body',
  'cc_section_3_tail',
  'cc_section_4_body',
  'cc_section_5_body',
  'cc_addendum_intro',
  'cc_addendum_section_1',
  'cc_addendum_section_2',
  'cc_addendum_section_3',
  'cc_addendum_section_4',
  'cc_addendum_section_6_body',
]);

function collapseManualLineBreaks(value: unknown) {
  if (typeof value !== 'string') return value;

  return value
    .replace(/\n(?=\d+\.\d+\.)/g, '[[CLAUSE_BREAK]]')
    .replace(/\n(?=-\s)/g, '[[CLAUSE_BREAK]]')
    .replace(/\n+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/\[\[CLAUSE_BREAK\]\]/g, '\n')
    .trim();
}

function extractTemplateVariables(value: string) {
  return [...value.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
}

const CC_OLD_SUBTITLE_FIELDS = new Set(['cc_contract_subheader', 'cc_contract_period']);
const CC_OLD_SECTION_1_FIELDS = new Set(['cc_section_1_1', 'cc_section_1_2', 'cc_section_1_3', 'cc_total_clause']);
const CC_OLD_CLIENT_PARTY_FIELDS = new Set(['cc_client_party_title', 'cc_client_name_full_page2']);
const CC_OLD_CLIENT_REQUISITES_FIELDS = new Set([
  'cc_client_birth_label',
  'client_dob',
  'cc_client_passport_label',
  'client_passport',
  'cc_client_passport_by_label',
  'client_passport_by',
  'cc_client_phone_label',
  'client_phone',
  'cc_client_email_label',
  'client_email',
]);
const CC_SECTION_1_BODY_VARIABLES = [
  'cottage_number',
  'time_in',
  'date_in_short',
  'time_out',
  'date_out_short',
  'prepayment',
  'prepayment_words',
  'total',
  'total_words',
];
const CC_CLIENT_REQUISITES_VARIABLES = [
  'client_dob',
  'client_passport',
  'client_passport_by',
  'client_phone',
  'client_email',
];
const CC_SECTION_3_BODY_TEXT = [
  '3.1. В целях обеспечения надлежащего порядка Сторона-1 вправе осуществлять видеоконтроль территории.',
  '3.2. Сторона-1 обязана передать коттедж (помещение) и имущество Стороне-2 в состоянии, пригодном для использования по назначению.',
  '3.3. Заезд в коттедж может быть осуществлен не ранее, чем за 20 минут до времени, указанного в договоре.',
  '3.4. Сторона-1 обязана обеспечить надлежащее санитарное состояние помещений, предоставленных в пользование. Сторона-1 имеет право осуществлять проверку использования Стороной-2 эксплуатируемого помещения.',
  '3.5. Сторона-2 несет материальную ответственность за нанесение ущерба коттеджу и имуществу Стороны-1 в коттедже и на прилегающей территории.',
  '3.6. Сторона-2 обязуется не превышать допустимое количество своих гостей в коттедже ({guests} человек). В случае превышения количества гостей за каждого дополнительного гостя Стороной-2 вносится плата - 100 (сто) рублей в час.',
  '3.7. В целях сохранения микроклимата и экологии курение в коттедже и других помещениях Базы отдыха запрещено. За курение взыскивается штраф в размере 5 000 (пять тысяч) рублей, а также следует выселение из коттеджа.',
  '3.8. Нахождение на территории базы отдыха с домашними животными категорически запрещено - взыскивается штраф в размере 5 000 (пять тысяч) рублей.',
  '3.9. Стороне-2 и её гостям запрещено разводить огонь, запускать пиротехнику вне специально оборудованных мест, пользоваться хлопушками, конфетти в коттедже и на территории (штраф - 5 000 (пять тысяч) рублей). Запрещено выносить из коттеджа на улицу имущество Стороны-1 (мебель, оборудование, технику).',
  '3.10. В случае порчи имущества Стороны-1 Сторона-2 обязана возместить причиненный ущерб в полном объеме. Сторона-1 не несет ответственность за действия Стороны-2, связанные с нарушением действующего законодательства РФ.',
  '3.11. Сторона-1 освобождается от материальной ответственности за материальный и моральный вред, причиненный Стороне-2, возникший в результате событий и обстоятельств, находящихся вне компетенции Стороны-1, в том числе: аварийное отключение электроэнергии, водоснабжения.',
].join('\n');
const CC_SECTION_3_TAIL_TEXT = [
  '3.12. Сторона-2 обязана соблюдать процедуру заселения в коттедж, которая заключается в предоставлении следующих документов:',
  '- паспорта лица, оформившего договор,',
  '- договора размещения в коттедже с личной подписью Стороны-2.',
  '3.13. За 10 минут до окончания времени действия договора Сторона-2 передает в целости и сохранности вверенное ей имущество Стороны-1.',
].join('\n');

function schemaName(schema: Record<string, unknown>) {
  return String(schema.name || '');
}

function schemaTemplateText(schema: Record<string, unknown> | undefined) {
  if (!schema) return '';
  if (typeof schema.text === 'string') return schema.text.trim();
  if (typeof schema.content === 'string' && !schema.content.trim().startsWith('{')) {
    return schema.content.trim();
  }
  return '';
}

function schemaVariables(schema: Record<string, unknown> | undefined) {
  return Array.isArray(schema?.variables)
    ? schema.variables.filter((variable): variable is string => typeof variable === 'string')
    : [];
}

function uniqueVariables(variables: string[], fallback: string[]) {
  const seen = new Set<string>();
  const ordered = variables.filter(variable => {
    if (seen.has(variable)) return false;
    seen.add(variable);
    return true;
  });

  if (!ordered.length) return fallback;

  return fallback.filter(variable => ordered.includes(variable)).concat(
    ordered.filter(variable => !fallback.includes(variable)),
  );
}

function migrateChungaChangaContractPage(page: Template['schemas'][number]) {
  const cloned = clonePage(page).map(schema => ({ ...(schema as Record<string, unknown>) }));
  const byName = new Map(cloned.map(schema => [schemaName(schema), schema]));
  const hasSubtitle = byName.has('cc_contract_subtitle');
  const hasSection1Body = byName.has('cc_section_1_body');
  const hasClientRequisites = byName.has('cc_client_requisites');
  const shouldCreateClientParty = byName.has('cc_client_name_full_page2');
  const shouldCreateSubtitle = !hasSubtitle && Array.from(CC_OLD_SUBTITLE_FIELDS).some(name => byName.has(name));
  const shouldCreateSection1Body = !hasSection1Body && Array.from(CC_OLD_SECTION_1_FIELDS).some(name => byName.has(name));
  const shouldCreateClientRequisites = !hasClientRequisites && Array.from(CC_OLD_CLIENT_REQUISITES_FIELDS).some(name => byName.has(name));
  const subtitleParts = ['cc_contract_subheader', 'cc_contract_period']
    .map(name => schemaTemplateText(byName.get(name)))
    .filter(Boolean);
  const section1Parts = ['cc_section_1_1', 'cc_section_1_2', 'cc_section_1_3', 'cc_total_clause']
    .map(name => schemaTemplateText(byName.get(name)))
    .filter(Boolean);
  const section1Variables = uniqueVariables(
    Array.from(CC_OLD_SECTION_1_FIELDS).flatMap(name => schemaVariables(byName.get(name))),
    CC_SECTION_1_BODY_VARIABLES,
  );
  const migrated: Array<Record<string, unknown>> = [];
  let insertedSubtitle = false;
  let insertedSection1Body = false;
  let insertedClientParty = false;
  let insertedClientRequisites = false;

  for (const schema of cloned) {
    const name = schemaName(schema);

    if (CC_OLD_SUBTITLE_FIELDS.has(name)) {
      if (shouldCreateSubtitle && !insertedSubtitle) {
        migrated.push(mvt(
          'cc_contract_subtitle',
          subtitleParts.join('\n'),
          uniqueVariables(schemaVariables(byName.get('cc_contract_period')), ['date_in_short', 'date_out_short']),
          55,
          17.2,
          100,
          10,
          { fontSize: 7.3, lineHeight: 1.18, alignment: 'center' },
        ));
        insertedSubtitle = true;
      }
      continue;
    }

    if (CC_OLD_SECTION_1_FIELDS.has(name)) {
      if (shouldCreateSection1Body && !insertedSection1Body) {
        migrated.push(mvt(
          'cc_section_1_body',
          section1Parts.join('\n'),
          section1Variables,
          22,
          61,
          170,
          29,
          { fontSize: 7.15, lineHeight: 1.08 },
        ));
        insertedSection1Body = true;
      }
      continue;
    }

    if (shouldCreateClientParty && CC_OLD_CLIENT_PARTY_FIELDS.has(name)) {
      if (!insertedClientParty) {
        migrated.push(mvt(
          'cc_client_party_title',
          'Сторона-2\n{client_name}',
          ['client_name'],
          110,
          154,
          85,
          12,
          { fontSize: 8.2, fontName: 'NotoSerifBold', lineHeight: 1.12, alignment: 'center' },
        ));
        insertedClientParty = true;
      }
      continue;
    }

    if (CC_OLD_CLIENT_REQUISITES_FIELDS.has(name)) {
      if (shouldCreateClientRequisites && !insertedClientRequisites) {
        migrated.push(mvt(
          'cc_client_requisites',
          'Дата рождения: {client_dob}\nПаспорт: {client_passport}\nВыдан: {client_passport_by}\nТелефон: {client_phone}\nЭлектронная почта: {client_email}',
          CC_CLIENT_REQUISITES_VARIABLES,
          112,
          175,
          78,
          24,
          { fontSize: 7.1, lineHeight: 1.05 },
        ));
        insertedClientRequisites = true;
      }
      continue;
    }

    migrated.push(schema);
  }

  return migrated as Template['schemas'][number];
}

function normalizeChungaChangaContractPage(page: Template['schemas'][number]) {
  const normalized = migrateChungaChangaContractPage(page).map(schema => {
    const next = { ...(schema as Record<string, unknown>) };
    const name = String(next.name || '');
    const layoutOverride = CC_LAYOUT_OVERRIDES[name];
    if (layoutOverride) {
      Object.assign(next, layoutOverride);
    }

    if (CC_AUTO_WRAP_FIELDS.has(name)) {
      next.text = collapseManualLineBreaks(next.text);
      next.content = collapseManualLineBreaks(next.content);
    }

    if (name === 'cc_section_3_body') {
      next.text = CC_SECTION_3_BODY_TEXT;
      next.variables = ['guests'];
    }

    if (name === 'cc_section_3_tail') {
      next.content = CC_SECTION_3_TAIL_TEXT;
    }

    if (next.type === 'text' || next.type === 'multiVariableText') {
      next.fontSize = CC_CONTRACT_FONT_SIZE;
      next.lineHeight = CC_CONTRACT_LINE_HEIGHT;
    }

    if (next.type === 'multiVariableText' && typeof next.text === 'string') {
      next.text = next.text.replace(/№(?!ЧЧ)\{contract_number\}/g, '№ЧЧ{contract_number}');
    }

    if (next.type === 'text' && !next.readOnly && typeof next.content !== 'string') {
      next.fontName = 'NotoSerifBold';
    }

    if (next.type === 'multiVariableText' && Array.isArray(next.variables)) {
      if ((next.variables as unknown[]).length > 0) {
        next.boldVariableFontName = 'NotoSerifBold';
      }
      const content = (next.variables as unknown[]).reduce<Record<string, string>>((acc, variableName) => {
        if (typeof variableName === 'string') {
          acc[variableName] = PDFME_PREVIEW_VALUES[variableName] || '';
        }
        return acc;
      }, {});
      next.content = JSON.stringify(content);
    }

    return next as any;
  });

  return normalizeDocumentSignatureImagesAndLayers(normalized as Template['schemas'][number]);
}

const GB_STRING_REPLACEMENTS: Array<[RegExp, string]> = [
  [/№ЧЧ/g, '№ГБ'],
  [/ЧЧ\{contract_number\}/g, 'ГБ{contract_number}'],
  [/Чунга-Чанга/g, 'Голубая бухта'],
  [/в„–Р§Р§/g, 'в„–Р“Р‘'],
  [/Р§Р§\{contract_number\}/g, 'Р“Р‘{contract_number}'],
  [/Р§СѓРЅРіР°-Р§Р°РЅРіР°/g, 'Р“РѕР»СѓР±Р°СЏ Р‘СѓС…С‚Р°'],
];

function transformCcStringToGb(value: string) {
  return GB_STRING_REPLACEMENTS.reduce((current, [pattern, replacement]) => {
    return current.replace(pattern, replacement);
  }, value);
}

function transformCcSchemaToGb(schema: Record<string, unknown>) {
  const next = { ...schema };
  if (typeof next.text === 'string') {
    next.text = transformCcStringToGb(next.text);
  }
  if (
    typeof next.content === 'string'
    && !(next.type === 'multiVariableText' && next.content.trim().startsWith('{'))
  ) {
    next.content = transformCcStringToGb(next.content);
  }
  return next as Template['schemas'][number][number];
}

const GB_SECTION_1_BODY_TEXT =
  '1.1. Сторона-1 предоставляет Стороне-2 услуги по временному размещению в коттедже(-ах) с имуществом, находящимся в нём(них), с условием возможности использования вспомогательных помещений, мест для парковки автомобилей, беседки.\n'
  + '1.2. Коттедж(-и) {cottage_number} расположен(-ы) по адресу: Мурманская область, 36-й км Верхнетуломской дороги, Загородный Отель "Голубая Бухта".\n'
  + '1.3. Размещение в коттедже(-ах) предоставляется на период с {time_in}. {date_in_short} по {time_out}. {date_out_short}. Период размещения составляет: {nights_label}. В стоимость размещения входит аренда постельного белья, полотенец и посуды.\n'
  + '1.4. Предоплата составляет: {prepayment} руб. ({prepayment_words}). Общая стоимость размещения составляет: {total} руб. ({total_words})';

const GB_SECTION_3_BODY_TEXT =
  '3.1. Сторона-1 обязана передать коттедж(-и) (помещение) и имущество Стороне-2 в состоянии, пригодном для использования по назначению.\n'
  + '3.2. Сторона-1 обязана обеспечить надлежащее санитарное состояние помещений, предоставленных в пользование. Сторона-1 имеет право осуществлять проверку использования Стороной-2 эксплуатируемого помещения.\n'
  + '3.3. Сторона-2 несет материальную ответственность за нанесение ущерба коттеджу(-ам) и имуществу Стороны-1 в коттедже(-ах), беседке и на прилегающей территории.\n'
  + '3.4. Сторона-1 устанавливает время заезда не ранее 17.00 часов и время выезда не позднее 14.00 часов (вне зависимости от времени заселения).\n'
  + '3.5. Сторона-2 обязуется не превышать допустимое количество своих гостей в коттедже (10 человек). В случае превышения количества гостей за каждого дополнительного гостя Стороной-2 вносится плата – 1000 (тысяча) рублей в сутки.\n'
  + '3.6. В целях сохранения микроклимата и экологии курение в коттеджах запрещено. За курение взыскивается штраф в размере 5 000 (пять тысяч) рублей, а также следует выселение из коттеджа.\n'
  + '3.7. Нахождение с домашними животными на территории Загородного Отеля категорически запрещено – взыскивается штраф в размере 5 000 (пять тысяч) рублей.\n'
  + '3.8. Стороне-2 и её гостям запрещено разводить огонь, запускать пиротехнику вне специально оборудованных мест, пользоваться хлопушками, конфетти в коттедже(-ах) и на территории (штраф – 5 000 (пять тысяч) рублей). Запрещено выносить из коттеджа(-ей) на улицу имущество Стороны-1 (мебель, оборудование, технику). Сторона-2 обязана: соблюдать правила проживания в коттеджах, сохранять окружающую среду и нести ответственность за нарушение в области экологического права, соблюдать правила личной безопасности.\n'
  + '3.9. В случае порчи имущества Стороны-1, Сторона-2 обязана возместить причиненный ущерб в полном объеме. Сторона-1 не несет ответственность за действия Стороны-2, связанные с нарушением действующего законодательства РФ. Сторона-2 непосредственно несет материальную ответственность в случае нанесения ущерба иным организациям и физическим лицам.\n'
  + '3.10. Сторона-1 освобождается от материальной ответственности за материальный и моральный вред, причиненный Стороне-2, возникший в результате событий и обстоятельств, находящихся вне компетенции Стороны-1, в том числе: аварийное отключение электроэнергии.\n'
  + '3.11. Сторона-2 обязана соблюдать процедуру заселения в коттедж, которая заключается в предоставлении следующих документов: - паспорт лиц, размещающихся в коттедже(-ах), - правил проживания в коттедже(-ах) с личной подписью Стороны-2.\n'
  + '3.12. По окончании пребывания Сторона-2 обязана сдать ключи от коттеджа(-ей).';

const GB_SECTION_3_TAIL_TEXT =
  '';

const GB_SECTION_3_BODY_TEXT_SPLIT =
  '3.1. Сторона-1 обязана передать коттедж(-и) (помещение) и имущество Стороне-2 в состоянии, пригодном для использования по назначению.\n'
  + '3.2. Сторона-1 обязана обеспечить надлежащее санитарное состояние помещений, предоставленных в пользование. Сторона-1 имеет право осуществлять проверку использования Стороной-2 эксплуатируемого помещения.\n'
  + '3.3. Сторона-2 несет материальную ответственность за нанесение ущерба коттеджу(-ам) и имуществу Стороны-1 в коттедже(-ах), беседке и на прилегающей территории.\n'
  + '3.4. Сторона-1 устанавливает время заезда не ранее 17.00 часов и время выезда не позднее 14.00 часов (вне зависимости от времени заселения).\n'
  + '3.5. Сторона-2 обязуется не превышать допустимое количество своих гостей в коттедже (10 человек). В случае превышения количества гостей за каждого дополнительного гостя Стороной-2 вносится плата – 1000 (тысяча) рублей в сутки.\n'
  + '3.6. В целях сохранения микроклимата и экологии курение в коттеджах запрещено. За курение взыскивается штраф в размере 5 000 (пять тысяч) рублей, а также следует выселение из коттеджа.\n'
  + '3.7. Нахождение с домашними животными на территории Загородного Отеля  категорически запрещено – взыскивается штраф в размере 5 000 (пять тысяч) рублей.\n'
  + '3.8. Стороне-2 и её гостям запрещено разводить огонь, запускать пиротехнику вне специально оборудованных мест, пользоваться хлопушками, конфетти в коттедже(-ах) и на территории (штраф – 5 000 (пять тысяч) рублей). Запрещено выносить из коттеджа(-ей) на улицу имущество Стороны-1 (мебель, оборудование, технику). Сторона-2 обязана: соблюдать правила проживания в коттеджах, сохранять окружающую среду и нести ответственность за нарушение в области экологического права, соблюдать правила личной безопасности.\n'
  + '3.9. В случае порчи имущества Стороны-1, Сторона-2 обязана возместить причиненный ущерб в полном объеме. Сторона-1 не несет ответственность за действия Стороны-2, связанные с нарушением действующего законодательства РФ. Сторона-2 непосредственно несет материальную ответственность в случае нанесения ущерба иным организациям и физическим лицам.';

const GB_SECTION_3_TAIL_TEXT_SPLIT =
  '3.10. Сторона-1 освобождается от материальной ответственности за материальный и моральный вред, причиненный Стороне-2, возникший в результате событий и обстоятельств, находящихся вне компетенции Стороны-1, в том числе: аварийное отключение электроэнергии.\n'
  + '3.11. Сторона-2 обязана соблюдать процедуру заселения в коттедж, которая заключается в предоставлении следующих документов:\n'
  + '- паспорт лиц, размещающихся в коттедже(-ах),\n'
  + '- правил проживания в коттедже(-ах) с личной подписью Стороны-2.\n'
  + '3.12. По окончании пребывания Сторона-2 обязана сдать ключи от коттеджа(-ей).';

const GB_CLIENT_REQUISITES_TEXT =
  'Дата рождения: {client_dob}\n'
  + 'Паспорт: {client_passport}\n'
  + 'Выдан: {client_passport_date}\n'
  + 'Кем: {client_passport_by}\n'
  + 'Электронная почта: {client_email}\n'
  + 'Телефон: {client_phone}';

const GB_TEXT_OVERRIDES: Record<string, string> = {
  cc_contract_header: 'ДОГОВОР №ГБ{contract_number}',
  cc_contract_subtitle: 'оказания услуг по размещению\nв период с {date_in_short} по {date_out_short}',
  cc_section_1_body: GB_SECTION_1_BODY_TEXT,
  cc_section_3_body: GB_SECTION_3_BODY_TEXT_SPLIT,
  cc_section_3_tail: GB_SECTION_3_TAIL_TEXT_SPLIT,
  cc_executor_requisites: 'ИНН      5105013870\nКПП      510501001\nОГРН    1215100000158\nЮридический адрес: 184433, Мурманская область,\nПеченгский район, г. Заполярный, ул. Ленина, д.1А,\nпомещение 34\nПочтовый адрес: 183038, г. Мурманск, пер. Терский, д. 3\nЭлектронная почта: gb_docs@mail.ru\nТел: бух. 994411\nМУРМАНСКОЕ ОТДЕЛЕНИЕ №8627 ПАО СБЕРБАНК Г.\nМУРМАНСК\nР/счет    4070 2810 9417 1000 0190\nБИК        044 705 615\nК/счет    30101810300000000615',
  cc_client_requisites: GB_CLIENT_REQUISITES_TEXT,
};

const GB_LAYOUT_OVERRIDES: Record<string, { position?: { x: number; y: number }; height?: number }> = {
  cc_section_3_tail: { position: { x: 22, y: 8 }, height: 34 },
  cc_section_4_title: { position: { x: 76, y: 46 } },
  cc_section_4_body: { position: { x: 22, y: 52 } },
  cc_section_5_title: { position: { x: 74, y: 102 } },
  cc_section_5_body: { position: { x: 22, y: 108 } },
  cc_section_6_title: { position: { x: 56, y: 122 } },
  cc_executor_party_title: { position: { x: 22, y: 130 } },
  cc_client_party_title: { position: { x: 110, y: 130 } },
  cc_executor_requisites: { position: { x: 22, y: 143 } },
  cc_client_requisites: { position: { x: 110, y: 143 } },
};

function normalizeGolubayaBukhtaContractPage(page: Template['schemas'][number]) {
  const normalizedCcPage = normalizeChungaChangaContractPage(page) as Array<Record<string, unknown>>;
  const transformed: Array<Record<string, unknown>> = normalizedCcPage.map(schema => {
    const next = transformCcSchemaToGb(schema) as Record<string, unknown>;
    const name = String(next.name || '');
    const overrideText = GB_TEXT_OVERRIDES[name];

    if (overrideText) {
      if (name === 'cc_section_3_body' || name === 'cc_section_3_tail') {
        next.type = 'text';
        next.content = overrideText;
        next.readOnly = true;
        delete next.text;
        delete next.variables;
        delete next.boldVariableFontName;
      } else if (next.type === 'multiVariableText') {
        next.text = overrideText;
        next.variables = extractTemplateVariables(overrideText);
      } else {
        next.content = overrideText;
      }
    }

    if (name === 'cc_client_requisites' && next.type === 'multiVariableText') {
      next.variables = ['client_dob', 'client_passport', 'client_passport_date', 'client_passport_by', 'client_email', 'client_phone'];
    }

    const layoutOverride = GB_LAYOUT_OVERRIDES[name];
    if (layoutOverride) {
      Object.assign(next, layoutOverride);
    }

    return next as Record<string, unknown>;
  });

  const pageSchemaNames = new Set(
    transformed.map(schema => String((schema as Record<string, unknown>).name || '')),
  );
  const isSecondContractPage = pageSchemaNames.has('cc_section_4_title') && pageSchemaNames.has('cc_section_4_body');
  if (isSecondContractPage && !pageSchemaNames.has('cc_section_3_tail')) {
    transformed.unshift(st(
      'cc_section_3_tail',
      GB_SECTION_3_TAIL_TEXT_SPLIT,
      22,
      8,
      170,
      34,
      { fontSize: 7.15, lineHeight: 1.08 },
    ) as Record<string, unknown>);
  }

  return normalizeDocumentSignatureImagesAndLayers(transformed as Template['schemas'][number]);
}

const BANYA_SECTION_1_BODY_TEXT =
  '1.1. Сторона-1 предоставляет Стороне-2 услуги по временному размещению в банном комплексе с имуществом,\n'
  + 'находящимся в нём(них), с условием возможности использования вспомогательных помещений, мест для парковки\n'
  + 'автомобилей, беседки.\n'
  + '1.2. Банный комплекс расположен по адресу: Мурманская область, 36-й км Верхнетуломской дороги, Загородный Отель\n'
  + '"Голубая Бухта".\n'
  + '1.3. Размещение в банном комплексе предоставляется {date_in_short}. Период размещения составляет: с {time_in} по {time_out}.\n'
  + '1.4. Предоплата составляет: {prepayment} руб. ({prepayment_words}). Общая стоимость размещения составляет: {total} руб.\n'
  + '({total_words})';

const BANYA_SECTION_2_BODY_TEXT =
  '2.1. Сторона-1 направляет на электронную почту Стороны-2, указанную в разделе 6. Адреса и реквизиты сторон\n'
  + 'настоящего договора, для подписания сканированную копию договора, подписанную со своей стороны и счет на оплату.\n'
  + 'Сторона-2, в случае согласия с условиями настоящего договора, подписывает его и отправляет на электронную почту\n'
  + 'Стороны-1, указанную в разделе 6. Адреса и реквизиты сторон, сканированную копию настоящего договора.\n'
  + 'Стороны признают юридическую силу электронных документов и переписки равным бумажным документам,\n'
  + 'направленным по адресам, указанным в разделе 6. Адреса и реквизиты сторон.\n'
  + '2.2. Оплата размещения по п.1.4. производится Стороной-2 в течение 3-х дней после выставления счета на условиях 50%\n'
  + 'предоплаты. Оплата производится путём перечисления денежных средств на расчетный счет, указанный в настоящем\n'
  + 'договоре, либо внесением денежных средств в кассу.\n'
  + '2.3. Оплата счета подтверждает согласие Стороны-2 с условиями настоящего договора.\n'
  + '2.4. После оплаты Сторона-2 обязана в течение суток после перевода денежных средств переправить Стороне-1 по факсу\n'
  + 'или электронной почте платежное поручение с отметкой банка.\n'
  + '2.5. Оставшаяся сумма 0 руб. (рублей 00 копеек) оплачивается в день заезда наличными денежными средствами в\n'
  + 'кассу, либо по терминалу.\n'
  + '2.6. Сторона-1 в течение двух суток после поступления денежных средств на свой счет отправляет в адрес Стороны-2\n'
  + 'подтверждение бронирования размещения.\n'
  + '2.7. Несвоевременная или неполная оплата Стороной-2 выставленных счетов или иных платежей снимает с Стороны-1\n'
  + 'всю ответственность, связанную с исполнением обязательств по настоящему договору, и Сторона-1 вправе отказать\n'
  + 'Стороне-2 в предоставлении размещения по настоящему договору.\n'
  + '2.8. При изменении или аннуляции бронирования по данному договору Сторона-1 удерживает оплаченную стоимость\n'
  + 'размещения Стороной-2. При несвоевременном заезде или досрочном выезде разница в стоимости размещения\n'
  + 'Стороне-2 не возвращается.\n'
  + '2.9. При досрочном расторжении договора размещения по инициативе Стороны-2 в срок до 2-х недель до даты\n'
  + 'размещения Сторона-1 производит 100 % (сто процентов) возврат уплаченных по договору денежных средств.\n'
  + '2.10. При досрочном расторжении договора размещения по инициативе Стороны-2 в срок от 2 недель до 1 недели до даты\n'
  + 'размещения Сторона-1 производит возврат уплаченных по договору денежных средств в размере 50 % (пятьдесят процентов)\n'
  + 'от суммы внесенного задатка.\n'
  + '2.11. При досрочном расторжении договора размещения по инициативе Стороны-2 в срок менее 1-й недели до даты\n'
  + 'размещения Сторона-1 удерживает 100 % (сто процентов) внесенной суммы предоплаты.\n'
  + '2.12. Сторона-2 не вправе передавать помещение банного комплекса третьим лицам без «согласия Стороны-1».';

const BANYA_SECTION_3_BODY_TEXT_SPLIT =
  '3.1. Сторона-1 обязана передать помещение и имущество Стороне-2 в состоянии, пригодном для использования по\n'
  + 'назначению.\n'
  + '3.2. Сторона-1 обязана обеспечить надлежащее санитарное состояние помещений, предоставленных в пользование.\n'
  + 'Сторона-1 имеет право осуществлять проверку использования Стороной-2 эксплуатируемого помещения.\n'
  + '3.3. Сторона-2 несет материальную ответственность за нанесение ущерба помещению банного комплекса и имуществу\n'
  + 'Стороны-1 в помещении банного комплекса, беседке и на прилегающей территории.\n'
  + '3.4. Сторона-2 обязуется не превышать допустимое количество своих гостей в банном комплексе (10 человек). В случае\n'
  + 'превышения количества гостей, за каждого дополнительного гостя Стороной-2 вносится плата - 1000 (тысяча) рублей.\n'
  + '3.5. В целях сохранения микроклимата и экологии курение в банном комплексе запрещено. За курение взыскивается\n'
  + 'штраф в размере 5 000 (пять тысяч) рублей, а также следует выселение из банного комплекса.\n'
  + '3.6. Нахождение домашних животных на территории базы отдыха категорически запрещено - взыскивается штраф в\n'
  + 'размере 5 000 (пять тысяч) рублей.';

const BANYA_SECTION_3_TAIL_TEXT_SPLIT =
  '3.7. Стороне-2 и её гостям запрещено разводить огонь, запускать пиротехнику вне специально оборудованных мест,\n'
  + 'пользоваться хлопушками, конфетти в помещении банного комплекса и на территории (штраф - 5 000 (пять тысяч)\n'
  + 'рублей). Запрещено выносить из помещения банного комплекса на улицу имущество Стороны-1 (мебель, оборудование, технику).\n'
  + 'Сторона-2 обязана: соблюдать правила посещения банного комплекса, сохранять окружающую среду и нести\n'
  + 'ответственность за нарушение в области экологического права, соблюдать правила личной безопасности.\n'
  + '3.8. В случае порчи имущества Стороны-1, Сторона-2 обязана возместить причиненный ущерб в полном объеме.\n'
  + 'Сторона-1 не несет ответственность за действия Стороны-2, связанные с нарушением действующего законодательства\n'
  + 'РФ. Сторона-2 непосредственно несет материальную ответственность в случае нанесения ущерба иным организациям и\n'
  + 'физическим лицам.\n'
  + '3.9. Сторона-1 освобождается от материальной ответственности за материальный и моральный вред, причиненный\n'
  + 'Стороне-2, возникший в результате событий и обстоятельств, находящихся вне компетенции Стороны-1, в том числе:\n'
  + 'аварийное отключение электроэнергии.\n'
  + '3.10. Сторона-2 обязана соблюдать процедуру заселения в банный комплекс, которая заключается в предоставлении\n'
  + 'следующих документов:\n'
  + '- паспорт лиц, размещающихся в коттедже(-ах),\n'
  + '- правил аренды банного комплекса с личной подписью Стороны-2.\n'
  + '3.11. По окончании пребывания, Сторона-2 обязана сдать помещение администратору.';

const BANYA_SECTION_4_BODY_TEXT =
  '4.1. Сторона-1 обязуется, согласно п.2, при поступлении денег за размещение, забронировать банный комплекс за\n'
  + 'Стороной-2 на указанный в настоящем договоре срок.\n'
  + '4.2. В случае неисполнения или ненадлежащего исполнения обязательств, предусмотренных настоящим Договором,\n'
  + 'стороны несут ответственность в соответствии с действующим законодательством Российской Федерации.\n'
  + '4.3. Сторона-2 несет материальную ответственность за ущерб, причиненный Стороне-1, самой Стороной-2 или её\n'
  + 'гостями в полном объеме, в соответствии с Прейскурантом, либо составленным актом об ущербе.\n'
  + '4.4. Стороны обязуются прилагать все усилия с целью достижения согласия по возможным спорным вопросам путем\n'
  + 'переговоров. При невозможности достижения такого согласия возникшие вопросы подлежат рассмотрению в суде по\n'
  + 'месту нахождения ООО «Таргетинг».\n'
  + '4.5. Стороны не несут ответственности за неисполнение или ненадлежащее исполнение обязательств по Договору, если\n'
  + 'таковое стало следствием действия непреодолимой силы, то есть чрезвычайных и непредотвратимых при данных\n'
  + 'условиях обстоятельств (стихийные бедствия, катастрофы, аварии, военные действия, санкции государственных и иных\n'
  + 'компетентных органов, и т.п.). В этом случае, сторона, подвергшаяся действию таковых сил, должна немедленно\n'
  + 'уведомить контрагента о факте наступления и предположительных сроках действия указанных событий.';

const BANYA_SECTION_5_BODY_TEXT =
  '5.1. Настоящий договор действует с момента подписания {sign_date}. Окончание срока действия договора не\n'
  + 'освобождает стороны от обязательств по взаимным расчетам по договору.';

const BANYA_EXECUTOR_REQUISITES_TEXT =
  'ИНН      5105013870\n'
  + 'КПП      510501001\n'
  + 'ОГРН    1215100000158\n'
  + 'Юр. адрес 184433, Мурманская область, Печенгский район, г.\n'
  + 'Заполярный, ул. Ленина, д.1А, помещение 34\n'
  + 'Почтовый адрес: 183038, г. Мурманск, пер. Терский, д. 3\n'
  + 'Электронная почта: GBmanager@yandex.ru\n'
  + 'Тел: бух. 994411\n'
  + 'МУРМАНСКОЕ ОТДЕЛЕНИЕ №8627 ПАО СБЕРБАНК Г.\n'
  + 'МУРМАНСК\n'
  + 'Р/счет   40702810941710000190\n'
  + 'БИК        044705615\n'
  + 'К/счет    30101810300000000615';

const BANYA_CLIENT_REQUISITES_TEXT =
  'Дата рождения: {client_dob}\n'
  + 'Паспорт: {client_passport}\n'
  + 'Выдан: {client_passport_date}\n'
  + 'Кем: {client_passport_by}\n'
  + 'Электронная почта: {client_email}\n'
  + 'Телефон: {client_phone}';

const BANYA_TEXT_OVERRIDES: Record<string, string> = {
  cc_contract_header: 'ДОГОВОР №БК{contract_number}',
  cc_contract_subtitle: 'оказания услуг по размещению\nв банном комплексе {date_in_short}',
  cc_section_1_body: BANYA_SECTION_1_BODY_TEXT,
  cc_section_2_body: BANYA_SECTION_2_BODY_TEXT,
  cc_section_3_body: BANYA_SECTION_3_BODY_TEXT_SPLIT,
  cc_section_3_tail: BANYA_SECTION_3_TAIL_TEXT_SPLIT,
  cc_section_4_body: BANYA_SECTION_4_BODY_TEXT,
  cc_section_5_body: BANYA_SECTION_5_BODY_TEXT,
  cc_executor_requisites: BANYA_EXECUTOR_REQUISITES_TEXT,
  cc_client_requisites: BANYA_CLIENT_REQUISITES_TEXT,
};

function transformSchemaToBanya(schema: Record<string, unknown>) {
  const next = { ...schema };
  const name = String(next.name || '');
  const overrideText = BANYA_TEXT_OVERRIDES[name];

  if (overrideText) {
    if (name === 'cc_section_3_body' || name === 'cc_section_3_tail' || name === 'cc_executor_requisites') {
      next.type = 'text';
      next.content = overrideText;
      next.readOnly = true;
      delete next.text;
      delete next.variables;
      delete next.boldVariableFontName;
    } else if (next.type === 'multiVariableText') {
      next.text = overrideText;
      next.variables = extractTemplateVariables(overrideText);
    } else {
      next.content = overrideText;
    }
  }

  if (name === 'cc_contract_header' && next.type === 'multiVariableText') {
    next.variables = ['contract_number'];
  }

  if (name === 'cc_contract_subtitle' && next.type === 'multiVariableText') {
    next.variables = ['date_in_short'];
  }

  if (name === 'cc_section_1_body' && next.type === 'multiVariableText') {
    next.variables = ['date_in_short', 'time_in', 'time_out', 'prepayment', 'prepayment_words', 'total', 'total_words'];
  }

  if (name === 'cc_client_requisites' && next.type === 'multiVariableText') {
    next.variables = ['client_dob', 'client_passport', 'client_passport_date', 'client_passport_by', 'client_email', 'client_phone'];
  }

  return next as Template['schemas'][number][number];
}

function transformPageToBanya(page: Template['schemas'][number]) {
  return normalizeDocumentSignatureImagesAndLayers(
    clonePage(page).map(schema => transformSchemaToBanya(schema as Record<string, unknown>)) as Template['schemas'][number],
  );
}

const INVOICE_LEFT = 20;
const INVOICE_RIGHT = 195;
const INVOICE_WIDTH = INVOICE_RIGHT - INVOICE_LEFT;
const BANK_TOP = 26.5;
const BANK_HEIGHT = 32.5;
const BANK_RIGHT_X = INVOICE_RIGHT - 55;
const BANK_VALUE_X = INVOICE_RIGHT - 40;
const SERVICE_TABLE_TOP = 101;
const SERVICE_TABLE_HEADER_HEIGHT = 6;
const SERVICE_TABLE_ROW_HEIGHT = 9.5;
const SERVICE_TABLE_WIDTH = INVOICE_WIDTH;
const SERVICE_COLUMNS = [8, 107, 14, 12, 17, 17];
const ACT_SERVICE_TABLE_TOP = 45;
const TOTAL_VALUE_WIDTH = 22;
const TOTAL_VALUE_X = INVOICE_RIGHT - TOTAL_VALUE_WIDTH;

function totalLabelX(width: number) {
  return TOTAL_VALUE_X - width - 2;
}

const STATIC_WARNING =
  'Внимание! Оплата данного счета означает согласие с условиями поставки товара. Уведомление об оплате\n' +
  'обязательно, в противном случае не гарантируется наличие товара на складе. Товар отпускается по факту\n' +
  'прихода денег на р/с Поставщика, самовывозом, при наличии доверенности и паспорта.';

const STATIC_SUPPLIER =
  'ООО "Золото Арктики" ИНН 5105013870, КПП 510501001\n' +
  '184630, Россия, Мурманская область, Печенгский район, г. Заполярный, ул. Ленина, д.1А,\n' +
  'помещение 34\n' +
  'тел.: 88152 99441, факс: 88152 994414';

function createBankBoxSchemas() {
  const x = INVOICE_LEFT;
  const y = BANK_TOP;
  const w = INVOICE_WIDTH;
  const rightW = x + w - BANK_RIGHT_X;
  const valueW = x + w - BANK_VALUE_X;

  return [
    r('bank_static_box', x, y, w, BANK_HEIGHT),
    l('bank_static_right_column', BANK_RIGHT_X, y, 0.1, BANK_HEIGHT),
    l('bank_static_right_value_column', BANK_VALUE_X, y, 0.1, BANK_HEIGHT),
    l('bank_static_left_row_2', x, y + 17, BANK_RIGHT_X - x, 0.1),
    l('bank_static_left_inn_kpp', x + 49, y + 17, 0.1, 7),
    l('bank_static_left_inn_kpp copy', x + 59, y + 17, 0.1, 7),
    l('bank_static_left_inn_kpp copy 2', x + 8, y + 17, 0.1, 7),
    l('bank_static_left_row_3', x, y + 24, BANK_RIGHT_X - x, 0.1),
    l('bank_static_right_row_1', BANK_RIGHT_X, y + 8, rightW, 0.1),
    l('bank_static_right_row_2', BANK_RIGHT_X, y + 20.5, rightW, 0.1),

    st('bank_static_name', 'ОТДЕЛЕНИЕ №8627 СБЕРБАНКА РОССИИ Г. МУРМАНСК', x + 1, y + 1.2, BANK_RIGHT_X - x - 2, 5.5, {
      fontSize: 7.8,
      fontName: 'NotoSerifBold',
      verticalAlignment: 'middle',
    }),
    st('bank_static_label', 'Банк получателя', x + 1, y + 9.5, BANK_RIGHT_X - x - 2, 6, {
      fontSize: 7.4,
      verticalAlignment: 'middle',
    }),
    st('bank_static_inn_label', 'ИНН', x + 1, y + 17.5, 8, 5.5, { fontSize: 7.4, verticalAlignment: 'middle' }),
    st('bank_static_inn', '5105013870', x + 9, y + 17.5, 38, 5.5, { fontSize: 7.4, verticalAlignment: 'middle' }),
    st('bank_static_kpp_label', 'КПП', x + 49, y + 17.5, 10, 5.5, {
      fontSize: 7.4,
      alignment: 'center',
      verticalAlignment: 'middle',
    }),
    st('bank_static_kpp', '510501001', x + 62, y + 17.5, 44, 5.5, { fontSize: 7.4, verticalAlignment: 'middle' }),
    st('bank_static_org', 'ООО "Золото Арктики"', x + 1, y + 24.2, BANK_RIGHT_X - x - 2, 4.5, {
      fontSize: 7.4,
      verticalAlignment: 'middle',
    }),
    st('bank_static_recipient_label', 'Получатель', x + 1, y + 29, BANK_RIGHT_X - x - 2, 3.2, {
      fontSize: 7.4,
      verticalAlignment: 'middle',
    }),

    st('bank_static_bik_label', 'БИК', BANK_RIGHT_X + 1, y + 1.2, BANK_VALUE_X - BANK_RIGHT_X - 2, 5.5, {
      fontSize: 7.4,
      alignment: 'center',
      verticalAlignment: 'middle',
    }),
    st('bank_static_bik', '044705615', BANK_VALUE_X + 1, y + 1.2, valueW - 2, 5.5, {
      fontSize: 7.4,
      verticalAlignment: 'middle',
    }),
    st('bank_static_ks_label', 'Сч. №', BANK_RIGHT_X + 1, y + 9, BANK_VALUE_X - BANK_RIGHT_X - 2, 10, {
      fontSize: 7.4,
      verticalAlignment: 'middle',
      alignment: 'center',
    }),
    st('bank_static_ks', '30101810300000000615', BANK_VALUE_X + 1, y + 9, valueW - 2, 10, {
      fontSize: 7.4,
      verticalAlignment: 'middle',
    }),
    st('bank_static_rs_label', 'Сч. №', BANK_RIGHT_X + 1, y + 21.5, BANK_VALUE_X - BANK_RIGHT_X - 2, 9.5, {
      fontSize: 7.4,
      verticalAlignment: 'middle',
      alignment: 'center',
    }),
    st('bank_static_rs', '40702810941710000190', BANK_VALUE_X + 1, y + 21.5, valueW - 2, 9.5, {
      fontSize: 7.4,
      verticalAlignment: 'middle',
    }),
  ];
}

function createServiceTableSchemas() {
  const x = [INVOICE_LEFT];
  for (const width of SERVICE_COLUMNS) {
    x.push(x[x.length - 1] + width);
  }

  const yTop = SERVICE_TABLE_TOP;
  const yHeaderBottom = yTop + SERVICE_TABLE_HEADER_HEIGHT;
  const yBottom = yHeaderBottom + SERVICE_TABLE_ROW_HEIGHT;
  const totalHeight = SERVICE_TABLE_HEADER_HEIGHT + SERVICE_TABLE_ROW_HEIGHT;

  const headerText = (name: string, content: string, col: number) => st(
    name,
    content,
    x[col] + 0.8,
    yTop + 1,
    SERVICE_COLUMNS[col] - 1.6,
    4.6,
    {
      fontName: 'NotoSerifBold',
      fontSize: 7.2,
      alignment: 'center',
      verticalAlignment: 'middle',
      lineHeight: 1.05,
    },
  );

  const rowText = (name: string, col: number, opts: SchemaOptions = {}) => t(
    name,
    x[col] + 0.8,
    yHeaderBottom + 1,
    SERVICE_COLUMNS[col] - 1.6,
    SERVICE_TABLE_ROW_HEIGHT - 1,
    {
      fontSize: 6.6,
      lineHeight: 1.05,
      verticalAlignment: 'top',
      ...opts,
    },
  );

  return [
    l('service_table_top', x[0], yTop, SERVICE_TABLE_WIDTH, 0.1),
    l('service_table_header_bottom', x[0], yHeaderBottom, SERVICE_TABLE_WIDTH, 0.1),
    l('service_table_bottom', x[0], yBottom, SERVICE_TABLE_WIDTH, 0.1),
    ...x.map((lineX, index) => l(`service_table_v_${index}`, lineX, yTop, 0.1, totalHeight)),

    headerText('service_head_no', '№', 0),
    headerText('service_head_name', 'Товары (работы, услуги)', 1),
    headerText('service_head_qty', 'Кол-во', 2),
    headerText('service_head_unit', 'Ед.', 3),
    headerText('service_head_price', 'Цена', 4),
    headerText('service_head_total', 'Сумма', 5),

    rowText('service_row_no', 0, { alignment: 'center' }),
    rowText('service_row_name', 1, { alignment: 'left' }),
    rowText('service_row_qty', 2, { alignment: 'center' }),
    rowText('service_row_unit', 3, { alignment: 'center' }),
    rowText('service_row_price', 4, { alignment: 'center' }),
    rowText('service_row_total', 5, { alignment: 'center' }),
  ];
}

function createActServiceTableSchemas() {
  const x = [INVOICE_LEFT];
  for (const width of SERVICE_COLUMNS) {
    x.push(x[x.length - 1] + width);
  }

  const yTop = ACT_SERVICE_TABLE_TOP;
  const yHeaderBottom = yTop + SERVICE_TABLE_HEADER_HEIGHT;
  const yBottom = yHeaderBottom + SERVICE_TABLE_ROW_HEIGHT;
  const totalHeight = SERVICE_TABLE_HEADER_HEIGHT + SERVICE_TABLE_ROW_HEIGHT;

  const headerText = (name: string, content: string, col: number) => st(
    name,
    content,
    x[col] + 0.8,
    yTop + 1,
    SERVICE_COLUMNS[col] - 1.6,
    4.6,
    {
      fontName: 'NotoSerifBold',
      fontSize: 7.2,
      alignment: 'center',
      verticalAlignment: 'middle',
      lineHeight: 1.05,
    },
  );

  const rowText = (name: string, col: number, opts: SchemaOptions = {}) => t(
    name,
    x[col] + 0.8,
    yHeaderBottom + 1,
    SERVICE_COLUMNS[col] - 1.6,
    SERVICE_TABLE_ROW_HEIGHT - 1,
    {
      fontSize: 6.6,
      lineHeight: 1.05,
      verticalAlignment: 'top',
      ...opts,
    },
  );

  return [
    l('act_service_table_top', x[0], yTop, SERVICE_TABLE_WIDTH, 0.1),
    l('act_service_table_header_bottom', x[0], yHeaderBottom, SERVICE_TABLE_WIDTH, 0.1),
    l('act_service_table_bottom', x[0], yBottom, SERVICE_TABLE_WIDTH, 0.1),
    ...x.map((lineX, index) => l(`act_service_table_v_${index}`, lineX, yTop, 0.1, totalHeight)),

    headerText('act_service_head_no', '№', 0),
    headerText('act_service_head_name', 'Наименование работ, услуг', 1),
    headerText('act_service_head_qty', 'Кол-во', 2),
    headerText('act_service_head_unit', 'Ед.', 3),
    headerText('act_service_head_price', 'Цена', 4),
    headerText('act_service_head_total', 'Сумма', 5),

    rowText('act_service_row_no', 0, { alignment: 'center' }),
    rowText('act_service_row_name', 1, { alignment: 'left' }),
    rowText('act_service_row_qty', 2, { alignment: 'center' }),
    rowText('act_service_row_unit', 3, { alignment: 'center' }),
    rowText('act_service_row_price', 4, { alignment: 'center' }),
    rowText('act_service_row_total', 5, { alignment: 'center' }),
  ];
}

function createActPageSchemas() {
  return [
    t('act_header', INVOICE_LEFT, 14, INVOICE_WIDTH, 8, {
      fontSize: 11,
      fontName: 'NotoSerifBold',
      alignment: 'left',
      verticalAlignment: 'middle',
    }),
    l('act_header_line', INVOICE_LEFT, 22, INVOICE_WIDTH, 0.1),
    st('act_executor_label', 'Исполнитель:', INVOICE_LEFT, 25, 24, 5, { fontSize: 7.6 }),
    st('act_executor_static_name', 'ООО "Золото Арктики"', INVOICE_LEFT + 28, 25, INVOICE_WIDTH - 28, 5, {
      fontSize: 7.8,
      fontName: 'NotoSerifBold',
    }),
    st('act_customer_label', 'Заказчик:', INVOICE_LEFT, 35, 24, 5, { fontSize: 7.6 }),
    t('act_client_name', INVOICE_LEFT + 28, 35, INVOICE_WIDTH - 28, 5, {
      fontSize: 7.8,
      fontName: 'NotoSerifBold',
    }),

    ...createActServiceTableSchemas(),

    st('act_total_label', 'Итог:', totalLabelX(31), 64, 31, 5, {
      fontSize: 7.4,
      alignment: 'right',
    }),
    t('act_service_total', TOTAL_VALUE_X, 64, TOTAL_VALUE_WIDTH, 5, {
      fontSize: 7.4,
      alignment: 'right',
    }),

    st('act_vat_label', 'НДС 5%:', totalLabelX(31), 71, 31, 5, {
      fontSize: 7.4,
      alignment: 'right',
    }),
    t('act_vat_amount', TOTAL_VALUE_X, 71, TOTAL_VALUE_WIDTH, 5, {
      fontSize: 7.4,
      fontName: 'NotoSerifBold',
      alignment: 'right',
    }),

    st('act_grand_total_label', 'Всего к оплате:', totalLabelX(38), 78, 38, 5, {
      fontSize: 7.4,
      alignment: 'right',
    }),
    t('act_total', TOTAL_VALUE_X, 78, TOTAL_VALUE_WIDTH, 5, {
      fontSize: 7.4,
      alignment: 'right',
    }),

    t('act_qty_words', INVOICE_LEFT, 91, INVOICE_WIDTH, 5, {
      fontSize: 7.5,
    }),
    t('act_total_words_only', INVOICE_LEFT, 99, INVOICE_WIDTH, 5, {
      fontSize: 7.5,
    }),

    st(
      'act_completion_text',
      'Вышеперечисленные услуги выполнены полностью и в срок. Заказчик претензий по объему, качеству и срокам\n' +
        'оказания услуг не имеет.',
      INVOICE_LEFT,
      113,
      INVOICE_WIDTH,
      12,
      {
        fontSize: 8,
        lineHeight: 1.15,
      },
    ),

    st('act_executor_title', 'ИСПОЛНИТЕЛЬ', INVOICE_LEFT, 132, 82, 6, {
      fontSize: 9,
      fontName: 'NotoSerifBold',
      alignment: 'center',
    }),
    st('act_customer_title', 'ЗАКАЗЧИК', 113, 132, 82, 6, {
      fontSize: 9,
      fontName: 'NotoSerifBold',
      alignment: 'center',
    }),
    st('act_executor_role', 'Генеральный директор ООО "Золото Арктики"', INVOICE_LEFT, 143, 82, 5, {
      fontSize: 7.7,
    }),
    st('act_director_label', 'Генеральный\nдиректор', INVOICE_LEFT, 222, 45, 9, {
      fontSize: 7.4,
      lineHeight: 1.05,
    }),
    l('act_director_line', 68, 226, 50, 0.1),
    st('act_director_static_name', '/Е. А. Сташ/', 121, 222, 35, 5, {
      fontSize: 7.4,
    }),
    l('act_customer_line', 125, 226, 32, 0.1),
    t('act_client_name_short', 160, 222, 35, 5, {
      fontSize: 7.4,
      fontName: 'NotoSerifBold',
    }),
    imageField('act_director_static_signature', 72, 211, 38, 22),
    imageField('act_company_static_stamp', 91, 203, 38, 38, { opacity: 0.68 }),
  ];
}

export function hasInvoiceActPage(template: Template) {
  return template.schemas.some(page => page.some(schema => String((schema as Record<string, unknown>).name) === 'act_header'));
}

export function ensureInvoiceActPage(template: Template): Template {
  const normalizedSchemas = (template.schemas || []).map(page => normalizeDocumentSignatureImagesAndLayers(page));

  if (hasInvoiceActPage(template)) {
    return {
      ...template,
      schemas: normalizedSchemas,
    };
  }

  return {
    ...template,
    schemas: [
      ...normalizedSchemas,
      normalizeDocumentSignatureImagesAndLayers(applyStandardLayoutOverrides(createActPageSchemas())),
    ],
  };
}

export function createDefaultInvoicePdfmeTemplate(): Template {
  return {
    basePdf: { width: 210, height: 297, padding: [5, 15, 5, 20] },
    schemas: [normalizeDocumentSignatureImagesAndLayers(applyStandardLayoutOverrides([
      st('warning_static_text', STATIC_WARNING, INVOICE_LEFT, 8, INVOICE_WIDTH, 15, {
        fontSize: 7.3,
        alignment: 'center',
        lineHeight: 1.12,
      }),

      ...createBankBoxSchemas(),

      t('invoice_header', INVOICE_LEFT, 63, INVOICE_WIDTH, 8, {
        fontSize: 10.4,
        lineHeight: 1,
      }),

      st('supplier_static_label', 'Поставщик:', INVOICE_LEFT, 74.5, 18, 5, { fontSize: 7.5 }),
      st('supplier_static_text', STATIC_SUPPLIER, INVOICE_LEFT + 23, 74.5, INVOICE_WIDTH - 23, 17, {
        fontSize: 7.2,
        lineHeight: 1.05,
      }),

      st('buyer_static_label', 'Покупатель:', INVOICE_LEFT, 94.3, 21, 5, { fontSize: 7.5 }),
      t('client_name', INVOICE_LEFT + 23, 94.3, INVOICE_WIDTH - 23, 5, {
        fontSize: 7.8,
        fontName: 'NotoSerifBold',
      }),

      ...createServiceTableSchemas(),

      st('total_label', 'Итог:', totalLabelX(31), 118, 31, 5, {
        fontSize: 7.4,
        alignment: 'right',
      }),
      t('service_total', TOTAL_VALUE_X, 118, TOTAL_VALUE_WIDTH, 5, {
        fontSize: 7.4,
        alignment: 'right',
      }),

      st('vat_label', 'С учетом (НДС) 5%:', totalLabelX(44), 125, 44, 5, {
        fontSize: 7.4,
        alignment: 'right',
      }),
      t('vat_amount', TOTAL_VALUE_X, 125, TOTAL_VALUE_WIDTH, 5, {
        fontSize: 7.4,
        fontName: 'NotoSerifBold',
        alignment: 'right',
      }),

      st('grand_total_label', 'Всего к оплате:', totalLabelX(38), 132, 38, 5, {
        fontSize: 7.4,
        alignment: 'right',
      }),
      t('total', TOTAL_VALUE_X, 132, TOTAL_VALUE_WIDTH, 5, {
        fontSize: 7.4,
        fontName: 'NotoSerifBold',
        alignment: 'right',
      }),

      t('qty_words', INVOICE_LEFT, 145, INVOICE_WIDTH, 5, {
        fontSize: 7.4,
      }),
      t('total_words_only', INVOICE_LEFT, 151, INVOICE_WIDTH, 5, {
        fontSize: 7.4,
        fontName: 'NotoSerifBold',
      }),

      l('invoice_words_bottom_line', INVOICE_LEFT, 158, INVOICE_WIDTH, 0.1),

      st('director_static_title', 'Генеральный\nдиректор', INVOICE_LEFT, 191, 45, 9, {
        fontSize: 7.2,
        lineHeight: 1.05,
      }),
      l('director_static_line', 64, 194, 30, 0.1),
      st('director_static_name', '/Е. А. Сташ/', 96, 191, 30, 5, {
        fontSize: 7.2,
      }),

      st('accountant_static_title', 'Бухгалтер', 122, 191, 24, 5, {
        fontSize: 7.2,
      }),
      l('accountant_static_line', 148, 194, 28, 0.1),
      st('accountant_static_name', '/Е. А. Сташ/', 176.5, 191, 18.5, 5, {
        fontSize: 7.2,
      }),

      imageField('company_static_stamp', 151.33, 191.4, 34, 34, { opacity: 0.68 }),
      imageField('director_static_signature', 57.65, 178.41, 34, 20),
      imageField('accountant_static_signature', 142, 178.79, 34, 20),
    ])), normalizeDocumentSignatureImagesAndLayers(applyStandardLayoutOverrides(createActPageSchemas()))],
  };
}

function createCcContractPage1Schemas() {
  return [
    mvt('cc_contract_header', 'ДОГОВОР №ЧЧ{contract_number}', ['contract_number'], 64, 8, 82, 7, {
      fontName: 'NotoSerifBold',
      fontSize: 9.8,
      alignment: 'center',
      verticalAlignment: 'middle',
    }),
    mvt('cc_contract_subtitle', 'оказания услуг по размещению\nв период с {date_in_short} по {date_out_short}', ['date_in_short', 'date_out_short'], 55, 17.2, 100, 10, {
      fontSize: 7.3,
      lineHeight: 1.18,
      alignment: 'center',
    }),
    st('cc_contract_city', 'г. Мурманск', 18, 32, 30, 5, { fontSize: 7.9 }),
    t('sign_date', 155, 31, 40, 6, {
      fontSize: 7.9,
      alignment: 'right',
      fontName: 'NotoSerifBold',
    }),

    mvt(
      'cc_client_intro',
      'ООО «ЗОЛОТО АРКТИКИ» в лице генерального директора Сташ Екатерины Александровны, действующее на\nосновании Устава, далее именуемое «Сторона-1», с одной стороны, и {client_name}, далее\nименуемый(-ая) «Сторона-2», с другой стороны, заключили настоящий договор о нижеследующем:',
      ['client_name'],
      18,
      45,
      177,
      13,
      { fontSize: 7.6, lineHeight: 1.12 },
    ),

    st('cc_section_1_title', '1. Предмет договора', 78, 59, 54, 5, {
      fontSize: 9,
      fontName: 'NotoSerifBold',
      alignment: 'center',
    }),
    mvt(
      'cc_section_1_body',
      '1.1. Сторона-1 предоставляет Стороне-2 услуги по временному размещению в коттедже № {cottage_number} с имуществом, находящимся в нём, с условием возможности использования вспомогательных помещений, мест для парковки автомобилей.\n'
        + '1.2. Коттедж расположен по адресу: г. Мурманск, ул. Маяковского, д. 8, база отдыха "Чунга-Чанга".\n'
        + '1.3. Размещение в коттедже(-ах) предоставляется на период с {time_in}. {date_in_short} по {time_out}. {date_out_short}\n'
        + '1.4. Предоплата составляет: {prepayment} руб. ({prepayment_words}). Общая стоимость размещения составляет: {total} руб. ({total_words})',
      CC_SECTION_1_BODY_VARIABLES,
      22,
      61,
      170,
      29,
      { fontSize: 7.15, lineHeight: 1.08 },
    ),

    st('cc_section_2_title', '2. Порядок оплаты и аннуляции', 70, 99, 70, 5, {
      fontSize: 9,
      fontName: 'NotoSerifBold',
      alignment: 'center',
    }),
    st(
      'cc_section_2_body',
      '2.1. Сторона-1 направляет на электронную почту Стороны-2, указанную в разделе 6. Адреса и реквизиты сторон\nнастоящего договора, для подписания сканированную копию договора, подписанную со своей стороны и счет на оплату.\nСторона-2, в случае согласия с условиями настоящего договора, подписывает его и отправляет на электронную почту\nСтороны-1, указанную в разделе 6. Адреса и реквизиты сторон сканированную копию настоящего договора.\nСтороны признают юридическую силу электронных документов и переписки равным бумажным документам,\nнаправленным по адресам, указанным в разделе 6. Адреса и реквизиты сторон.\n2.2. Оплата размещения по п.1.4. производится Стороной-2 в течение одних суток после выставления счета на условиях\nвнесения предоплаты не менее, чем за 3 часа пользования коттеджем при почасовом размещении, либо предоплаты в\nразмере не менее 50% от стоимости коттеджа при посуточном размещении. Оплата производится путём перечисления\nденежных средств на расчетный счет, указанный в настоящем договоре, либо внесением денежных средств в кассу.\n2.3. Оплата счета подтверждает согласие Стороны-2 с условиями настоящего договора.\n2.4. После оплаты Сторона-2 обязана в течение суток после перевода денежных средств переправить Стороне-1 по\nэлектронной почте платежное поручение с отметкой банка.\n2.5. Оставшаяся сумма оплачивается в день заезда наличными денежными средствами в кассу, либо по терминалу.\n2.6. Сторона-1 в течение двух суток после поступления денежных средств на свой счет отправляет в адрес Стороны-2\nподтверждение бронирования размещения.\n2.7. Несвоевременная или неполная оплата Стороной-2 выставленных счетов или иных платежей снимает с Стороны-1\nвсю ответственность, связанную с исполнением обязательств по настоящему договору, и Сторона-1 вправе отказать\nСтороне-2 в предоставлении размещения по настоящему договору.\n2.8. При изменении или аннуляции бронирования по данному договору Сторона-1 удерживает оплаченную стоимость\nразмещения Стороной-2. При несвоевременном заезде или досрочном выезде разница в стоимости размещения\nСтороне-2 не возвращается.\n2.9. При досрочном расторжении договора размещения по инициативе Стороны-2 в срок до 2-х недель до даты\nразмещения Сторона-1 производит 100 % (сто процентов) возврат уплаченных по договору денежных средств.\n2.10. При досрочном расторжении договора размещения по инициативе Стороны-2 в срок от 2-х до 1-й недели до даты\nразмещения Сторона-1 производит возврат уплаченных по договору денежных средств в размере 50 % (пятьдесят\nпроцентов) от суммы внесенного задатка.\n2.11. При досрочном расторжении договора размещения по инициативе Стороны-2 в срок менее 1-й недели до даты\nразмещения Сторона-1 удерживает 100 % (сто процентов) внесенной суммы предоплаты.\n2.12. Сторона-2 не вправе передавать коттедж третьим лицам без «согласия Стороны-1».',
      18,
      105,
      177,
      64,
      { fontSize: 7.15, lineHeight: 1.08 },
    ),

    st('cc_section_3_title', '3. Права и обязанности сторон', 72, 252, 68, 5, {
      fontSize: 9,
      fontName: 'NotoSerifBold',
      alignment: 'center',
    }),
    mvt(
      'cc_section_3_body',
      '3.1. В целях обеспечения надлежащего порядка Сторона-1 вправе осуществлять видеоконтроль территории.\n3.2. Сторона-1 обязана передать коттедж (помещение) и имущество Стороне-2 в состоянии, пригодном для\nиспользования по назначению.\n3.3. Заезд в коттедж может быть осуществлен не ранее, чем за 20 минут до времени, указанного в договоре.\n3.4. Сторона-1 обязана обеспечить надлежащее санитарное состояние помещений, предоставленных в пользование.\nСторона-1 имеет право осуществлять проверку использования Стороной-2 эксплуатируемого помещения.\n3.5. Сторона-2 несет материальную ответственность за нанесение ущерба коттеджу и имуществу Стороны-1 в коттедже и\nна прилегающей территории.\n3.6. Сторона-2 обязуется не превышать допустимое количество своих гостей в коттедже ({guests} человек). В случае\nпревышения количества гостей за каждого дополнительного гостя Стороной-2 вносится плата – 100 (сто) рублей в час.\n3.7. В целях сохранения микроклимата и экологии курение в коттедже и других помещениях Базы отдыха запрещено. За\nкурение взыскивается штраф в размере 5 000 (пять тысяч) рублей, а также следует выселение из коттеджа.\n3.8. Нахождение на территории базы отдыха с домашними животными категорически запрещено – взыскивается штраф в\nразмере 5 000 (пять тысяч) рублей.',
      ['guests'],
      18,
      258,
      177,
      31,
      { fontSize: 7.15, lineHeight: 1.08 },
    ),
  ];
}

function createCcContractPage2Schemas() {
  return [
    st(
      'cc_section_3_tail',
      '3.9. Стороне-2 и её гостям запрещено разводить огонь, запускать пиротехнику вне специально оборудованных мест,\nпользоваться хлопушками, конфетти в коттедже и на территории (штраф – 5 000 (пять тысяч) рублей).\nЗапрещено выносить из коттеджа на улицу имущество Стороны-1 (мебель, оборудование, технику). Сторона-2 обязана:\nсоблюдать правила пребывания в коттедже, в частности, выносить мусор в уличный бак по окончании отдыха, сохранять\nокружающую среду и нести ответственность за нарушение в области экологического права, соблюдать правила личной\nбезопасности.\n3.10. В случае порчи имущества Стороны-1 Сторона-2 обязана возместить причиненный ущерб в полном объеме.\nСторона-1 не несет ответственность за действия Стороны-2, связанные с нарушением действующего законодательства\nРФ. Сторона-2 непосредственно несет материальную ответственность в случае нанесения ущерба иным организациям и\nфизическим лицам.\n3.11. Сторона-1 освобождается от материальной ответственности за материальный и моральный вред, причиненный\nСтороне-2, возникший в результате событий и обстоятельств, находящихся вне компетенции Стороны-1, в том числе:\nаварийное отключение электроэнергии, водоснабжения.\n3.12. Сторона-2 обязана соблюдать процедуру заселения в коттедж, которая заключается в предоставлении следующих\nдокументов:\n- паспорта лица, оформившего договор,\n- договора размещения в коттедже с личной подписью Стороны-2.\n3.13. За 10 минут до окончания времени действия договора Сторона-2 передает в целости и сохранности вверенное ей\nимущество Стороны-1.',
      18,
      8,
      177,
      67,
      { fontSize: 7.15, lineHeight: 1.08 },
    ),
    st('cc_section_4_title', '4. Ответственность сторон', 76, 76, 60, 5, {
      fontSize: 9,
      fontName: 'NotoSerifBold',
      alignment: 'center',
    }),
    st(
      'cc_section_4_body',
      '4.1. Сторона-1 обязуется, согласно п.2, при поступлении денег за размещение, забронировать коттедж за Стороной-2 на\nуказанный в настоящем договоре срок.\n4.2. В случае неисполнения или ненадлежащего исполнения обязательств, предусмотренных настоящим Договором,\nстороны несут ответственность в соответствии с действующим законодательством Российской Федерации.\n4.3. Сторона-2 несет материальную ответственность за ущерб, причиненный Стороне-1, самой Стороной-2 или её\nгостями в полном объеме, в соответствии с составленным актом об ущербе.\n4.4. Стороны обязуются прилагать все усилия с целью достижения согласия по возможным спорным вопросам путем\nпереговоров. При невозможности достижения такого согласия возникшие вопросы подлежат рассмотрению в суде по\nместу нахождения ООО «Золото Арктики».\n4.5. Стороны не несут ответственности за неисполнение или ненадлежащее исполнение обязательств по Договору, если\nтаковое стало следствием действия непреодолимой силы, то есть чрезвычайных и непредотвратимых при данных\nусловиях обстоятельств (стихийные бедствия, катастрофы, аварии, военные действия, санкции государственных и иных\nкомпетентных органов, и т.п.). В этом случае сторона, подвергшаяся действию таковых сил, должна немедленно\nуведомить контрагента о факте наступления и предположительных сроках действия указанных событий.',
      18,
      82,
      177,
      48,
      { fontSize: 7.15, lineHeight: 1.08 },
    ),
    st('cc_section_5_title', '5. Срок действия договора', 74, 132, 64, 5, {
      fontSize: 9,
      fontName: 'NotoSerifBold',
      alignment: 'center',
    }),
    mvt(
      'cc_section_5_body',
      '5.1. Настоящий договор действует с момента подписания {sign_date_short}. Окончание срока действия договора не\nосвобождает стороны от обязательств по взаимным расчетам по договору.',
      ['sign_date_short'],
      18,
      138,
      177,
      8,
      { fontSize: 7.4, lineHeight: 1.08 },
    ),
    st('cc_section_6_title', '6. Адреса и реквизиты сторон', 72, 154, 68, 5, {
      fontSize: 9,
      fontName: 'NotoSerifBold',
      alignment: 'center',
    }),

    st('cc_executor_party_title', 'Сторона-1\nООО «ЗОЛОТО АРКТИКИ»', 40, 162, 40, 8, {
      fontSize: 8.2,
      alignment: 'center',
      fontName: 'NotoSerifBold',
      lineHeight: 1.08,
    }),
    st('cc_executor_requisites', 'ИНН      5105013870\nКПП      510501001\nОГРН    1215100000158\nЮридический адрес: 184433, Мурманская область,\nПеченгский район, г. Заполярный, ул. Ленина, д.1А,\nпомещение 34\nПочтовый адрес: 183038, г. Мурманск, пер. Терский, д. 3\nЭлектронная почта: Chunga-manager@yandex.ru\nТел: бух. 994411\nМУРМАНСКОЕ ОТДЕЛЕНИЕ №8627 ПАО СБЕРБАНК Г.\nМУРМАНСК\nР/счет    4070 2810 9417 1000 0190\nБИК        044 705 615\nК/счет    30101810300000000615', 18, 175, 78, 66, {
      fontSize: 7.15,
      lineHeight: 1.08,
    }),
    mvt('cc_client_party_title', 'Сторона-2\n{client_name}', ['client_name'], 110, 154, 85, 12, {
      fontSize: 8.2,
      fontName: 'NotoSerifBold',
      lineHeight: 1.12,
      alignment: 'center',
    }),
    mvt(
      'cc_client_requisites',
      'Дата рождения: {client_dob}\nПаспорт: {client_passport}\nВыдан: {client_passport_by}\nТелефон: {client_phone}\nЭлектронная почта: {client_email}',
      CC_CLIENT_REQUISITES_VARIABLES,
      112,
      175,
      78,
      24,
      { fontSize: 7.1, lineHeight: 1.05 },
    ),

    imageField('cc_executor_signature_image', 29, 205, 34, 20),
    imageField('cc_company_stamp_image', 22, 197, 44, 44, { opacity: 0.68 }),
    l('cc_executor_sign_line', 44, 224, 37, 0.1),
    st('cc_executor_sign_name', '/Е. А. Сташ/', 74, 220, 24, 5, { fontSize: 7.8 }),
    l('cc_client_sign_line', 115, 224, 37, 0.1),
    t('cc_client_sign_name', 155, 220, 32, 5, {
      fontSize: 7.8,
      fontName: 'NotoSerifBold',
    }),
  ];
}

function createCcAddendumPage3Schemas() {
  return [
    st('cc_addendum_header', 'ДОПОЛНИТЕЛЬНОЕ СОГЛАШЕНИЕ', 58, 8, 94, 6, {
      fontSize: 10.2,
      fontName: 'NotoSerifBold',
      alignment: 'center',
    }),
    mvt('cc_addendum_reference', 'к Договору оказания услуг по размещению №ЧЧ{contract_number} от {sign_date}', ['contract_number', 'sign_date'], 46, 14, 120, 5, {
      fontSize: 7.9,
      alignment: 'center',
    }),
    st('cc_addendum_city', 'г. Мурманск', 18, 25, 30, 5, { fontSize: 7.9 }),
    t('cc_addendum_date', 155, 24, 40, 6, {
      fontSize: 7.9,
      alignment: 'right',
      fontName: 'NotoSerifBold',
    }),
    mvt(
      'cc_addendum_intro',
      'ООО «Золото Арктики» (База отдыха «Чунга-Чанга») в лице Администратора, действующего на основании должностных\nинструкций, далее именуемое «Сторона 1», с одной стороны, и {client_name} далее именуемый(ая)\n«Сторона 2», с другой стороны, заключили настоящее Дополнительное соглашение (далее — Соглашение) о\nнижеследующем.',
      ['client_name'],
      18,
      36,
      177,
      13,
      { fontSize: 7.5, lineHeight: 1.1 },
    ),
    st('cc_addendum_section_1_title', '1. Предмет Соглашения', 76, 50, 58, 5, {
      fontSize: 9,
      fontName: 'NotoSerifBold',
      alignment: 'center',
    }),
    mvt(
      'cc_addendum_section_1',
      '1.1. Настоящее Соглашение регулирует порядок приёма передачи коттеджа и находящегося в нём имущества при заселении\nи при выезде, порядок передачи и возврата антивандального залога, а также порядок фиксации и урегулирования\nвыявленных повреждений имущества.\n1.2. Положения настоящего Соглашения являются неотъемлемой частью Договора №ЧЧ{contract_number} от {sign_date}.',
      ['contract_number', 'sign_date'],
      18,
      56,
      177,
      14,
      { fontSize: 7.3, lineHeight: 1.08 },
    ),
    st('cc_addendum_section_2_title', '2. Антивандальный залог', 74, 73, 62, 5, {
      fontSize: 9,
      fontName: 'NotoSerifBold',
      alignment: 'center',
    }),
    st('cc_addendum_section_2', '2.1. Сумма антивандального залога составляет 5 000 (пять тысяч) рублей наличными.\n2.2. Передача антивандального залога производится при заселении в коттедж; факт передачи и факт возврата залога\nподтверждаются подписями Сторон в соответствующих разделах настоящего Соглашения; отдельной расписки о\nполучении/возврате залога не оформляется.\n2.3. Залог служит для обеспечения сохранности имущества коттеджа и соблюдения правил проживания, предусмотренных\nосновным Договором.', 18, 79, 177, 22, {
      fontSize: 7.3,
      lineHeight: 1.08,
    }),
    st('cc_addendum_section_3_title', '3. Приём передача при заселении', 70, 106, 70, 5, {
      fontSize: 9,
      fontName: 'NotoSerifBold',
      alignment: 'center',
    }),
    st('cc_addendum_section_3', '3.1. Сторона 2 передала Стороне 1 антивандальный залог в размере 5 000 руб. наличными; получение залога подтверждается\nподписями Сторон в настоящем разделе.\n3.2. Сторона 1 передала, а Сторона 2 приняла во временное пользование коттедж и имущество по прилагаемой\nописи/прейскуранту. Совместный осмотр произведён; на момент приёма Сторона 2 претензий к состоянию коттеджа и\nимущества не имеет.\n3.3. Сторона 2 подтверждает, что ознакомлена с прейскурантом на возмещение ущерба и несёт материальную\nответственность согласно Договору и настоящему Соглашению.\n3.4. При выявлении дефектов при осмотре составляется Акт о недостатках/повреждениях.', 18, 112, 177, 28, {
      fontSize: 7.25,
      lineHeight: 1.08,
    }),
    st('cc_addendum_section_4_title', '4. Порядок осмотра коттеджа и действий сторон при выезде', 52, 146, 106, 5, {
      fontSize: 8.5,
      fontName: 'NotoSerifBold',
      alignment: 'center',
    }),
    st('cc_addendum_section_4', '4.1. За 10 (десять) минут до окончания срока аренды Сторона 2 обязана пригласить Администратора для совместного\nосмотра коттеджа и имущества.\n4.2. При совместном осмотре Администратор:\n4.2.1. проверяет состояние коттеджа и имущества по описи;\n4.2.2. при отсутствии повреждений возвращает Антивандальный залог Стороне 2;\n4.2.3. при выявлении повреждений составляет Акт о повреждениях, в котором указываются описание повреждений, сумма\nудержания и итоговый расчёт; неиспользованный остаток залога возвращается Стороне 2.\n4.3. В случае если Сторона 2 покидает коттедж без личной передачи и без участия Администратора, ответственность за\nсохранность имущества полностью возлагается на Сторону 2.\n4.4. Если осмотр производится без участия Стороны 2, Администратор вправе самостоятельно составить Акт о\nповреждениях и произвести фото и/или видео фиксацию выявленных нарушений.\n4.5. Фото и/или видео материалы, а также Акт о повреждениях признаются сторонами достаточными доказательствами для\nудержания средств из залога и для иных действий, предусмотренных Договором и настоящим Соглашением.\n4.6. Администратор направляет Стороне 2 копию Акта о повреждениях с расчётом удержаний по каналу связи, указанному в\nДоговоре, в течение 48 (сорока восьми) часов с момента фиксации; отправка SMS на номер, указанный в Договоре,\nсчитается надлежащим уведомлением.', 18, 152, 177, 68, {
      fontSize: 7.1,
      lineHeight: 1.07,
    }),
    st('cc_addendum_checkin_title', 'Подпись при заселении', 24, 238, 50, 5, { fontSize: 8 }),
    l('cc_addendum_checkin_exec_line', 24, 252, 28, 0.1),
    st('cc_addendum_checkin_exec_sign', '/Е. А. Сташ/', 53, 248, 22, 5, { fontSize: 7.8 }),
    l('cc_addendum_checkin_client_line', 100, 252, 30, 0.1),
    t('cc_addendum_checkin_client_sign', 131, 248, 28, 5, {
      fontSize: 7.8,
      fontName: 'NotoSerifBold',
    }),
    st('cc_addendum_checkout_title', 'Подпись при выезде', 24, 260, 50, 5, { fontSize: 8 }),
    l('cc_addendum_checkout_exec_line', 24, 273, 28, 0.1),
    st('cc_addendum_checkout_exec_sign', '/Е. А. Сташ/', 53, 269, 22, 5, { fontSize: 7.8 }),
    l('cc_addendum_checkout_client_line', 100, 273, 30, 0.1),
    t('cc_addendum_checkout_client_sign', 131, 269, 28, 5, {
      fontSize: 7.8,
      fontName: 'NotoSerifBold',
    }),
    t('cc_addendum_checkout_date', 170, 280, 20, 5, {
      fontSize: 8.2,
      fontName: 'NotoSerifBold',
      alignment: 'right',
    }),
  ];
}

function createCcAddendumPage4Schemas() {
  return [
    st('cc_addendum_section_6_title', '6. Заключительные положения', 74, 8, 62, 5, {
      fontSize: 9,
      fontName: 'NotoSerifBold',
      alignment: 'center',
    }),
    mvt(
      'cc_addendum_section_6_body',
      '6.1. Подписи Сторон в настоящем Соглашении подтверждают: факт передачи и получения антивандального залога, факт\nприёма передачи коттеджа и имущества при заселении, и факт возврата залога либо основание удержания при выезде.\n6.2. Во всём остальном применяется порядок, установленный Договором №ЧЧ{contract_number} от {sign_date}, и действующим\nзаконодательством РФ.\n6.3. Споры, вытекающие из настоящего Соглашения, разрешаются в порядке, предусмотренном Договором и действующим\nзаконодательством РФ.',
      ['contract_number', 'sign_date'],
      18,
      14,
      177,
      20,
      { fontSize: 7.55, lineHeight: 1.1 },
    ),
    st('cc_addendum_final_signatures_title', 'Подписи сторон', 24, 48, 36, 5, {
      fontSize: 8.8,
      fontName: 'NotoSerifBold',
    }),
    st('cc_addendum_final_exec_label', 'ООО «Золото Арктики»:', 24, 62, 48, 5, {
      fontSize: 8.4,
      fontName: 'NotoSerifBold',
    }),
    l('cc_addendum_final_exec_line', 24, 77, 18, 0.1),
    st('cc_addendum_final_exec_sign', '/Сташ Е.А./', 43, 73, 24, 5, { fontSize: 8 }),
    t('cc_addendum_final_client_label', 112, 62, 60, 5, {
      fontSize: 8.4,
      fontName: 'NotoSerifBold',
    }),
    l('cc_addendum_final_client_line', 112, 77, 24, 0.1),
    t('cc_addendum_final_client_sign', 137, 73, 30, 5, {
      fontSize: 8,
      fontName: 'NotoSerifBold',
    }),
    t('cc_addendum_final_date', 170, 96, 20, 5, {
      fontSize: 8.4,
      fontName: 'NotoSerifBold',
      alignment: 'right',
    }),
  ];
}

export function createDefaultGiftCertificatePdfmeTemplate(): Template {
  return {
    basePdf: { width: 297, height: 148.5, padding: [0, 0, 0, 0] },
    schemas: [[
      imageField('gift_certificate_background', 0, 0, 297, 148.5, {
        readOnly: true,
        required: false,
      }),
      t('certificate_amount', 52.95, 49.35, 167.22, 39.69, {
        content: '5000',
        fontName: 'angry',
        fontSize: 112,
        fontColor: '#ffffff',
        alignment: 'left',
        verticalAlignment: 'top',
      }),
      t('certificate_issue_date', 140, 98.47, 52.12, 10.05, {
        content: PDFME_PREVIEW_VALUES.certificate_issue_date,
        fontName: 'angry',
        fontSize: 15,
        fontColor: '#3f4147',
        alignment: 'center',
        verticalAlignment: 'middle',
      }),
      t('certificate_number', 104.76, 111.2, 53.97, 9.52, {
        content: PDFME_PREVIEW_VALUES.certificate_number,
        fontName: 'angry',
        fontSize: 16,
        fontColor: '#3f4147',
        alignment: 'center',
        verticalAlignment: 'middle',
      }),
    ]],
  };
}

function createDefaultChungaChangaContractOnlyPdfmeTemplate(): Template {
  return {
    basePdf: { width: 210, height: 297, padding: [5, 15, 5, 20] },
    schemas: [
      applyStandardLayoutOverrides(createCcContractPage1Schemas()),
      applyStandardLayoutOverrides(createCcContractPage2Schemas()),
      applyStandardLayoutOverrides(createCcAddendumPage3Schemas()),
      applyStandardLayoutOverrides(createCcAddendumPage4Schemas()),
    ],
  };
}

export function createChungaChangaPackagePdfmeTemplate(
  contractTemplate: Template = createDefaultChungaChangaContractOnlyPdfmeTemplate(),
  invoiceActTemplate: Template = createDefaultInvoicePdfmeTemplate(),
): Template {
  const invoiceAct = ensureInvoiceActPage(invoiceActTemplate);
  const contractPages = (contractTemplate.schemas || [])
    .slice(0, 4)
    .map(page => normalizeChungaChangaContractPage(page));

  while (contractPages.length < 4) {
    const fallback = createDefaultChungaChangaContractOnlyPdfmeTemplate().schemas[contractPages.length];
    contractPages.push(normalizeChungaChangaContractPage(fallback));
  }

  return {
    basePdf: { width: 210, height: 297, padding: [5, 15, 5, 20] },
    schemas: [
      ...contractPages,
      normalizeDocumentSignatureImagesAndLayers(cloneTemplatePageWithSchema(invoiceAct, 'invoice_header', 0)),
      normalizeDocumentSignatureImagesAndLayers(cloneTemplatePageWithSchema(invoiceAct, 'act_header', 1)),
    ],
  };
}

export function hasChungaChangaPackagePages(template: Template) {
  return Boolean(
    template.schemas?.[4]?.some(schema => String((schema as Record<string, unknown>).name) === 'invoice_header')
    && template.schemas?.[5]?.some(schema => String((schema as Record<string, unknown>).name) === 'act_header')
  );
}

export function ensureChungaChangaPackagePdfmeTemplate(
  template: Template,
  invoiceActTemplate: Template = createDefaultInvoicePdfmeTemplate(),
): Template {
  if (!hasChungaChangaPackagePages(template)) {
    return createChungaChangaPackagePdfmeTemplate(template, invoiceActTemplate);
  }

  return {
    ...template,
    basePdf: { width: 210, height: 297, padding: [5, 15, 5, 20] },
    schemas: [
      ...template.schemas.slice(0, 4).map(page => normalizeChungaChangaContractPage(page)),
      ...template.schemas.slice(4).map(page => normalizeDocumentSignatureImagesAndLayers(page)),
    ],
  };
}

export function createGolubayaBukhtaPackagePdfmeTemplate(
  contractTemplate: Template = createDefaultChungaChangaContractOnlyPdfmeTemplate(),
  invoiceActTemplate: Template = createDefaultInvoicePdfmeTemplate(),
): Template {
  const invoiceAct = ensureInvoiceActPage(invoiceActTemplate);
  const contractPages = (contractTemplate.schemas || [])
    .slice(0, 2)
    .map(page => normalizeGolubayaBukhtaContractPage(page));

  while (contractPages.length < 2) {
    const fallback = createDefaultChungaChangaContractOnlyPdfmeTemplate().schemas[contractPages.length];
    contractPages.push(normalizeGolubayaBukhtaContractPage(fallback));
  }

  return {
    basePdf: { width: 210, height: 297, padding: [5, 15, 5, 20] },
    schemas: [
      ...contractPages,
      normalizeGolubayaBukhtaContractPage(cloneTemplatePageWithSchema(invoiceAct, 'invoice_header', 0)),
      normalizeGolubayaBukhtaContractPage(cloneTemplatePageWithSchema(invoiceAct, 'act_header', 1)),
    ],
  };
}

export function hasGolubayaBukhtaPackagePages(template: Template) {
  return Boolean(
    template.schemas?.[2]?.some(schema => String((schema as Record<string, unknown>).name) === 'invoice_header')
    && template.schemas?.[3]?.some(schema => String((schema as Record<string, unknown>).name) === 'act_header')
  );
}

export function ensureGolubayaBukhtaPackagePdfmeTemplate(
  template: Template,
  invoiceActTemplate: Template = createDefaultInvoicePdfmeTemplate(),
): Template {
  if (!hasGolubayaBukhtaPackagePages(template)) {
    return createGolubayaBukhtaPackagePdfmeTemplate(template, invoiceActTemplate);
  }

  const findPageBySchema = (schemaNameToFind: string) => {
    const index = template.schemas.findIndex(page => page.some(schema => String((schema as Record<string, unknown>).name) === schemaNameToFind));
    return index >= 0 ? template.schemas[index] : null;
  };

  const savedInvoicePage = findPageBySchema('invoice_header');
  const savedActPage = findPageBySchema('act_header');
  const fallbackInvoiceAct = ensureInvoiceActPage(invoiceActTemplate);

  return {
    ...template,
    basePdf: { width: 210, height: 297, padding: [5, 15, 5, 20] },
    schemas: [
      ...template.schemas.slice(0, 2).map(page => normalizeGolubayaBukhtaContractPage(page)),
      normalizeGolubayaBukhtaContractPage(
        savedInvoicePage || cloneTemplatePageWithSchema(fallbackInvoiceAct, 'invoice_header', 0),
      ),
      normalizeGolubayaBukhtaContractPage(
        savedActPage || cloneTemplatePageWithSchema(fallbackInvoiceAct, 'act_header', 1),
      ),
    ],
  };
}

export function createDefaultChungaChangaContractPdfmeTemplate(): Template {
  return createChungaChangaPackagePdfmeTemplate();
}

export function createDefaultGolubayaBukhtaContractPdfmeTemplate(): Template {
  return createGolubayaBukhtaPackagePdfmeTemplate();
}

export function createBanyaPackagePdfmeTemplate(
  contractTemplate: Template = createGolubayaBukhtaPackagePdfmeTemplate(),
  invoiceActTemplate: Template = contractTemplate,
): Template {
  const fallbackTemplate = createGolubayaBukhtaPackagePdfmeTemplate();
  const contractPages = (contractTemplate.schemas || [])
    .slice(0, 2)
    .map(page => transformPageToBanya(page));

  while (contractPages.length < 2) {
    const fallback = fallbackTemplate.schemas[contractPages.length];
    contractPages.push(transformPageToBanya(fallback));
  }

  return {
    basePdf: { width: 210, height: 297, padding: [5, 15, 5, 20] },
    schemas: [
      ...contractPages,
      normalizeDocumentSignatureImagesAndLayers(cloneTemplatePageWithSchema(invoiceActTemplate, 'invoice_header', 0)),
      normalizeDocumentSignatureImagesAndLayers(cloneTemplatePageWithSchema(invoiceActTemplate, 'act_header', 1)),
    ],
  };
}

export function createDefaultBanyaContractPdfmeTemplate(): Template {
  const gbPackageTemplate = createGolubayaBukhtaPackagePdfmeTemplate();
  return createBanyaPackagePdfmeTemplate(gbPackageTemplate, gbPackageTemplate);
}
