/**
 * Тонкая обёртка над существующим buildPdfmeContractInput.
 * НЕ дублирует логику склонений/дат/денежных строк — переиспользует то,
 * что уже отлажено в pdfmeDocumentGenerator.
 *
 * Маппит уже подготовленные поля в имена переменных DOCX-шаблона
 * (как в чек-листе пользователя: room_number, date_in, date_out и т.д.).
 */
import type { ContractData, Organization } from '../../types';
import { buildPdfmeContractInput } from '../pdfmeDocumentGenerator';

export interface BmDocxVariables {
  // Договор
  contract_number: string;
  contract_header: string;           // "ДОГОВОР №БМ-42"
  sign_date: string;                 // "29 мая 2026 г."
  contract_period: string;           // "в период с 29.05.2026 по 30.05.2026"
  // Клиент
  client_name: string;
  client_name_gen: string;
  client_name_dat: string;
  client_dob: string;
  client_passport_type: string;      // "Паспорт гражданина РФ" (дефолт, т.к. нет в ContractData)
  client_passport: string;
  client_passport_date: string;
  client_passport_by: string;
  client_passport_code: string;      // пусто, если нет данных
  client_address: string;
  client_phone: string;
  client_email: string;
  // Номер/проживание
  room_number: string;               // из cottage_number, без префикса №
  room_category: string;
  guests_label: string;              // "1 человек"
  date_in: string;                   // DD.MM.YYYY
  date_in_long: string;              // "29 мая 2026 г."
  time_in: string;
  date_out: string;
  date_out_long: string;
  time_out: string;
  nights_label: string;              // "1 сутки"
  // Деньги
  total: string;
  total_words: string;
  prepayment: string;
  prepayment_words: string;
  balance: string;
  balance_words: string;
  // Исполнитель
  exec_name: string;
  exec_director: string;
  exec_inn: string;
  exec_kpp: string;
  exec_ogrn: string;
  exec_address: string;
  exec_phone: string;
  exec_bank: string;
  exec_rs: string;
  exec_bik: string;
  exec_ks: string;
}

export function buildBmDocxVariables(
  contractData: ContractData,
  org: Partial<Organization>,
): BmDocxVariables {
  const c = buildPdfmeContractInput(contractData, org);

  return {
    contract_number: String(c.contract_number ?? ''),
    contract_header: String(c.contract_header ?? ''),
    sign_date: String(c.sign_date ?? ''),
    contract_period: String(c.contract_period ?? ''),

    client_name: String(c.client_name ?? ''),
    client_name_gen: String(c.client_name_gen ?? ''),
    client_name_dat: String(c.client_name_dat ?? ''),
    client_dob: String(c.client_dob ?? ''),
    client_passport_type: 'Паспорт гражданина РФ',
    client_passport: String(c.client_passport ?? ''),
    client_passport_date: String(c.client_passport_date ?? ''),
    client_passport_by: String(c.client_passport_by ?? ''),
    client_passport_code: '',
    client_address: String(c.client_address ?? ''),
    client_phone: String(c.client_phone ?? ''),
    client_email: String(c.client_email ?? ''),

    room_number: String(c.cottage_number ?? ''),
    room_category: String(c.room_category ?? ''),
    guests_label: String(c.guests_label ?? ''),
    date_in: String(c.date_in_short ?? ''),
    date_in_long: String(c.date_in ?? ''),
    time_in: String(c.time_in ?? ''),
    date_out: String(c.date_out_short ?? ''),
    date_out_long: String(c.date_out ?? ''),
    time_out: String(c.time_out ?? ''),
    nights_label: String(c.nights_label ?? ''),

    total: String(c.total ?? ''),
    total_words: String(c.total_words ?? ''),
    prepayment: String(c.prepayment ?? ''),
    prepayment_words: String(c.prepayment_words ?? ''),
    balance: String(c.balance ?? ''),
    balance_words: String(c.balance_words ?? ''),

    exec_name: String(c.exec_name ?? ''),
    exec_director: String(c.exec_director ?? ''),
    exec_inn: String(c.exec_inn ?? ''),
    exec_kpp: String(c.exec_kpp ?? ''),
    exec_ogrn: String(c.exec_ogrn ?? ''),
    exec_address: String(c.exec_address ?? ''),
    exec_phone: String(c.exec_phone ?? ''),
    exec_bank: String(c.exec_bank ?? ''),
    exec_rs: String(c.exec_rs ?? ''),
    exec_bik: String(c.exec_bik ?? ''),
    exec_ks: String(c.exec_ks ?? ''),
  };
}
