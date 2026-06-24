/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { convert as convertNumberToWords } from 'number-to-words-ru';

/**
 * Formats a number to Russian currency string in words
 * e.g., 300000 -> "Триста тысяч рублей 00 копеек"
 */
export function formatCurrencyToWords(amount: number): string {
  const words = convertNumberToWords(amount, {
    currency: 'rub',
    convertNumberToWords: {
      integer: true,
      fractional: true,
    },
    showCurrency: {
      integer: true,
      fractional: true,
    },
  });

  return words.charAt(0).toUpperCase() + words.slice(1);
}
