import Petrovich from 'petrovich';

// --- Склонение ФИО ---
// Принимает "Иванов Иван Иванович", возвращает { gen, dat }
// Определяет пол автоматически по отчеству (оканчивается на "вич"/"ич" → мужской)
export function inflectFIO(fullName: string): { gen: string; dat: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return { gen: fullName, dat: fullName };

  const [last, first, middle] = parts;

  // Определяем пол по отчеству
  const gender = middle
    ? (middle.endsWith('вич') || middle.endsWith('ич') ? 'male' : 'female')
    : 'male';

  try {
    const person = {
      gender: gender as 'male' | 'female' | 'androgynous',
      last,
      first,
      ...(middle ? { middle } : {}),
    };

    const genResult = Petrovich(person, 'genitive');
    const datResult = Petrovich(person, 'dative');

    const genName = [
      genResult.last,
      genResult.first,
      genResult.middle,
    ].filter(Boolean).join(' ');

    const datName = [
      datResult.last,
      datResult.first,
      datResult.middle,
    ].filter(Boolean).join(' ');

    return { gen: genName, dat: datName };
  } catch (error) {
    console.error('Petrovich inflection error:', error);
    // Если библиотека не смогла склонить — возвращаем как есть
    return { gen: fullName, dat: fullName };
  }
}

// --- Инициалы: "Иванов Иван Иванович" → "И.И. Иванов" ---
export function makeShortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return fullName;
  const [last, first, middle] = parts;
  const initials = [first?.[0], middle?.[0]].filter(Boolean).map(l => l + '.').join('');
  return `${initials} ${last}`;
}

// --- Число прописью (базовая логика) ---
function numberToWords(n: number): string {
  if (n === 0) return 'ноль';

  const ones = ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
  const onesFem = ['', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
  const teens = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать',
    'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
  const tens = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят',
    'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
  const hundreds = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот',
    'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'];

  function chunk(num: number, feminine: boolean): string {
    const words: string[] = [];
    const h = Math.floor(num / 100);
    const t = Math.floor((num % 100) / 10);
    const o = num % 10;
    if (h) words.push(hundreds[h]);
    if (t === 1) {
      words.push(teens[o]);
    } else {
      if (t) words.push(tens[t]);
      if (o) words.push(feminine ? onesFem[o] : ones[o]);
    }
    return words.join(' ');
  }

  function thousands(num: number): string {
    if (num === 0) return '';
    const c = chunk(num, true);
    const last = num % 100;
    const o = num % 10;
    let suffix: string;
    if (last >= 11 && last <= 19) suffix = 'тысяч';
    else if (o === 1) suffix = 'тысяча';
    else if (o >= 2 && o <= 4) suffix = 'тысячи';
    else suffix = 'тысяч';
    return c ? `${c} ${suffix}` : '';
  }

  function millions(num: number): string {
    if (num === 0) return '';
    const c = chunk(num, false);
    const last = num % 100;
    const o = num % 10;
    let suffix: string;
    if (last >= 11 && last <= 19) suffix = 'миллионов';
    else if (o === 1) suffix = 'миллион';
    else if (o >= 2 && o <= 4) suffix = 'миллиона';
    else suffix = 'миллионов';
    return c ? `${c} ${suffix}` : '';
  }

  const mil = Math.floor(n / 1_000_000);
  const tho = Math.floor((n % 1_000_000) / 1_000);
  const rem = n % 1_000;

  return [millions(mil), thousands(tho), chunk(rem, false)].filter(Boolean).join(' ');
}

// --- Число прописью с рублями ---
export function rubles(n: number): string {
  const rubleSuffix = (() => {
    const last = n % 100;
    const o = n % 10;
    if (last >= 11 && last <= 19) return 'рублей';
    if (o === 1) return 'рубль';
    if (o >= 2 && o <= 4) return 'рубля';
    return 'рублей';
  })();

  return `${numberToWords(n)} ${rubleSuffix} 00 копеек`;
}

// --- Число прописью (ТОЛЬКО СЛОВА, без "рублей") ---
export function rublesOnly(n: number): string {
  return numberToWords(n);
}

// --- Дата словами: "18.02.2026" или "2026-02-18" → "18 февраля 2026 г." ---
export function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const months = ['января','февраля','марта','апреля','мая','июня',
    'июля','августа','сентября','октября','ноября','декабря'];
  
  let d, m, y;
  if (dateStr.includes('.')) {
    [d, m, y] = dateStr.split('.');
  } else if (dateStr.includes('-')) {
    [y, m, d] = dateStr.split('-');
  } else {
    return dateStr;
  }
  
  return `${parseInt(d)} ${months[parseInt(m) - 1]} ${y} г.`;
}

// --- Дата числовая: "2026-03-21" или "21.03.2026" → "21.03.2026" ---
export function formatDateNumeric(dateStr: string): string {
  if (!dateStr) return '';
  let d, m, y;
  if (dateStr.includes('.')) {
    const parts = dateStr.split('.');
    if (parts.length !== 3) return dateStr;
    [d, m, y] = parts;
  } else if (dateStr.includes('-')) {
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    [y, m, d] = parts;
  } else {
    return dateStr;
  }
  return `${d.padStart(2, '0')}.${m.padStart(2, '0')}.${y}`;
}
