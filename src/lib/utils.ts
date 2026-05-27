/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { convert as convertNumberToWords } from 'number-to-words-ru';
import { Client, Contract, Settings } from '../types';

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
  
  // Capitalize first letter
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Shortens full name to initials
 * e.g., "Иванов Иван Иванович" -> "Иванов И.И."
 */
export function getInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return fullName;
  
  const lastName = parts[0];
  const firstNameInitial = parts[1].charAt(0).toUpperCase();
  const middleNameInitial = parts[2] ? parts[2].charAt(0).toUpperCase() : '';
  
  return `${lastName} ${firstNameInitial}.${middleNameInitial ? middleNameInitial + '.' : ''}`;
}

/**
 * Calculates VAT amount from total
 */
export function calculateVAT(total: number, rate: number): number {
  return total * rate;
}

/**
 * Generates HTML for the contract document
 */
export function generateContractHTML(contract: Contract, client: Client, settings: Settings): string {
  const clientName = client.type === 'physical' 
    ? `${client.lastName} ${client.firstName} ${client.middleName || ''}`
    : client.organizationName;
  
  const clientInitials = client.type === 'physical' ? getInitials(clientName) : clientName;
  const totalWords = formatCurrencyToWords(contract.totalAmount);
  const vatAmount = calculateVAT(contract.totalAmount, settings.vatRate);

  return `
    <div style="font-family: 'Times New Roman', serif; padding: 40px; color: black; line-height: 1.5; font-size: 12pt;">
      <h1 style="text-align: center; font-size: 16pt;">ДОГОВОР № ${contract.number}</h1>
      <p style="text-align: center;">аренды объекта недвижимости</p>
      
      <div style="display: flex; justify-content: space-between; margin-top: 20px;">
        <span>г. Москва</span>
        <span>${new Date(contract.dateSigned).toLocaleDateString('ru-RU')}</span>
      </div>

      <p style="margin-top: 30px;">
        ${settings.companyName}, именуемое в дальнейшем "Арендодатель", в лице представителя, действующего на основании Устава, с одной стороны, 
        и ${clientName}, именуемый(ая) в дальнейшем "Арендатор", с другой стороны, заключили настоящий договор о нижеследующем:
      </p>

      <h3>1. ПРЕДМЕТ ДОГОВОРА</h3>
      <p>
        1.1. Арендодатель предоставляет Арендатору во временное пользование объект недвижимости: 
        ${contract.baseType === 'chunga-changa' ? 'База отдыха "Чунга-Чанга"' : 'База отдыха "Голубая Бухта"'}.
      </p>

      <h3>2. СТОИМОСТЬ И ПОРЯДОК РАСЧЕТОВ</h3>
      <p>
        2.1. Общая стоимость аренды составляет ${contract.totalAmount.toLocaleString()} (${totalWords}).
      </p>
      <p>
        2.2. В стоимость включен НДС (${(settings.vatRate * 100).toFixed(0)}%) в размере ${vatAmount.toLocaleString()} руб.
      </p>
      <p>
        2.3. Арендатор вносит предоплату в размере ${contract.prepayment.toLocaleString()} руб. в момент подписания договора.
      </p>
      <p>
        2.4. Оставшаяся сумма в размере ${contract.remainder.toLocaleString()} руб. оплачивается Арендатором при заезде.
      </p>

      <div style="margin-top: 50px; display: flex; justify-content: space-between;">
        <div style="width: 45%;">
          <p><strong>АРЕНДОДАТЕЛЬ:</strong></p>
          <p>${settings.companyName}</p>
          <p>ИНН: ${settings.inn}</p>
          <p>Адрес: ${settings.address}</p>
          <p style="margin-top: 40px;">________________ / (подпись)</p>
        </div>
        <div style="width: 45%;">
          <p><strong>АРЕНДАТОР:</strong></p>
          <p>${clientName}</p>
          ${client.type === 'physical' ? `<p>Паспорт: ${client.passportSeries} ${client.passportNumber}</p>` : `<p>ИНН: ${client.inn}</p>`}
          <p>Телефон: ${client.phone}</p>
          <p style="margin-top: 40px;">________________ / ${clientInitials}</p>
        </div>
      </div>
    </div>
  `;
}
