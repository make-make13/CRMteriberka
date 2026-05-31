/**
 * DOCX → PDF через LibreOffice headless (libreoffice-convert).
 *
 * Требует установленный LibreOffice. Путь к soffice подбирается в порядке:
 *  1. env LIBREOFFICE_PATH — прямой путь к soffice.exe или к директории program\
 *  2. Стандартные пути Windows:
 *       C:\Program Files\LibreOffice\program\soffice.exe
 *       C:\Program Files (x86)\LibreOffice\program\soffice.exe
 *  3. soffice / soffice.exe в системном PATH
 *
 * Если LibreOffice не найден — выбрасывает понятную ошибку на русском.
 *
 * Скачать LibreOffice: https://www.libreoffice.org/download/download/
 */
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { execFile } from 'child_process';
import libreofficeConvert from 'libreoffice-convert';

// libreoffice-convert использует callback-based API.
const convertAsync = promisify(libreofficeConvert.convert) as (
  input: Buffer,
  outputFormat: string,
  filter: string | undefined,
) => Promise<Buffer>;

// ── Поиск soffice ──────────────────────────────────────────────────────────

const WINDOWS_STANDARD_PATHS = [
  'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
  'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
];

const LIBREOFFICE_NOT_FOUND_MESSAGE =
  'LibreOffice не найден. Установите LibreOffice (https://www.libreoffice.org) ' +
  'или укажите путь к soffice.exe в переменной LIBREOFFICE_PATH в файле .env.local.';

/**
 * Разворачивает LIBREOFFICE_PATH: принимает путь к exe или к директории.
 * Возвращает путь к soffice.exe или null.
 */
function resolveEnvPath(envValue: string): string | null {
  const trimmed = envValue.trim();
  if (!trimmed) return null;

  // Прямой путь к exe
  if (trimmed.toLowerCase().endsWith('.exe') || trimmed.toLowerCase().endsWith('soffice')) {
    return fs.existsSync(trimmed) ? trimmed : null;
  }

  // Путь к директории — ищем soffice.exe внутри
  const candidates = [
    path.join(trimmed, 'soffice.exe'),
    path.join(trimmed, 'program', 'soffice.exe'),
    path.join(trimmed, 'soffice'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Находит путь к soffice. Кэширует результат в памяти процесса.
 * Бросает понятную ошибку если LibreOffice не установлен.
 */
let _cachedSofficePath: string | null | undefined = undefined;

export function findSofficePath(): string {
  if (_cachedSofficePath !== undefined) {
    if (_cachedSofficePath === null) throw new Error(LIBREOFFICE_NOT_FOUND_MESSAGE);
    return _cachedSofficePath;
  }

  // 1. LIBREOFFICE_PATH из .env.local
  const envPath = process.env.LIBREOFFICE_PATH;
  if (envPath) {
    const resolved = resolveEnvPath(envPath);
    if (resolved) {
      _cachedSofficePath = resolved;
      return resolved;
    }
    // Переменная задана, но путь не существует — предупреждаем и ищем дальше
    console.warn(`[docxToPdf] LIBREOFFICE_PATH="${envPath}" не существует. Ищем в стандартных путях.`);
  }

  // 2. Стандартные пути Windows
  for (const candidate of WINDOWS_STANDARD_PATHS) {
    if (fs.existsSync(candidate)) {
      _cachedSofficePath = candidate;
      return candidate;
    }
  }

  // 3. soffice в системном PATH — пробуем через execFile
  // (синхронная проверка через which невозможна без shellSync, поэтому
  //  при нахождении в PATH libreoffice-convert сработает сам; здесь только
  //  помечаем как «не найден явно» и пробуем всё равно)
  // Если convert упадёт — ошибка libreoffice-convert содержит
  // "spawn soffice ENOENT" → оборачиваем ниже в docxToPdf.

  _cachedSofficePath = null;
  return 'soffice'; // попробуем найти в PATH
}

/** Сбросить кэш пути (для тестов или после изменения env). */
export function resetSofficePathCache(): void {
  _cachedSofficePath = undefined;
}

/** Возвращает человекочитаемую подсказку о текущем пути к soffice. */
export function getSofficePathHint(): string {
  const envPath = process.env.LIBREOFFICE_PATH?.trim();
  if (envPath) return `LIBREOFFICE_PATH=${envPath}`;

  for (const candidate of WINDOWS_STANDARD_PATHS) {
    if (fs.existsSync(candidate)) return candidate;
  }

  return 'auto (PATH)';
}

// ── Конвертация ────────────────────────────────────────────────────────────

/**
 * Устанавливает SOFFICE_BINARY_PATH так, чтобы libreoffice-convert
 * нашёл нужный бинарник. Возвращает функцию восстановления.
 */
function patchSofficePath(sofficePath: string): () => void {
  if (sofficePath === 'soffice') return () => {}; // PATH — не трогаем

  const exePath = sofficePath.endsWith('.exe') || sofficePath.includes('soffice')
    ? sofficePath
    : sofficePath;

  // libreoffice-convert v1 ищет через `which`/`where` + PATH.
  // Добавляем директорию soffice.exe в PATH чтобы `which soffice.exe` нашёл его.
  const dir = path.dirname(exePath);
  const prev = process.env.PATH || '';
  if (!prev.includes(dir)) {
    process.env.PATH = `${dir}${path.delimiter}${prev}`;
  }

  return () => {
    process.env.PATH = prev;
  };
}

/**
 * Конвертирует DOCX-буфер в PDF через LibreOffice headless.
 * Бросает понятную русскоязычную ошибку, если LibreOffice не найден.
 */
export async function docxToPdf(docxBuffer: Buffer): Promise<Buffer> {
  const sofficePath = findSofficePath();
  const restore = patchSofficePath(sofficePath);

  try {
    return await convertAsync(docxBuffer, '.pdf', undefined);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // ENOENT/spawn error → LibreOffice не найден в PATH
    if (message.includes('ENOENT') || message.includes('spawn') || message.includes('not found')) {
      throw new Error(LIBREOFFICE_NOT_FOUND_MESSAGE);
    }
    throw err;
  } finally {
    restore();
  }
}
