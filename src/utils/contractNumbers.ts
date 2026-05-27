import type { BaseType } from '../types';

export type ContractNumberCategory = 'cc' | 'gb' | 'bath' | 'furako';

const CONTRACT_NUMBER_PREFIX: Record<ContractNumberCategory, string> = {
  cc: 'ЧЧ',
  gb: 'ГБ',
  bath: 'Б',
  furako: 'Ф',
};

export function getContractNumberPrefix(category: ContractNumberCategory) {
  return CONTRACT_NUMBER_PREFIX[category];
}

export function extractContractNumberSequence(value: string) {
  const str = String(value || '').trim();
  // Игнорировать номера предброни, начинающиеся с "ПБ-"
  if (str.startsWith('ПБ-')) return null;
  const match = str.match(/(\d+)\s*$/);
  if (!match) return null;
  const sequence = Number(match[1]);
  return Number.isFinite(sequence) ? sequence : null;
}

export function formatContractNumber(category: ContractNumberCategory, sequence: number) {
  return `${getContractNumberPrefix(category)}${sequence}`;
}

export function getNextContractNumberValue(existingNumbers: string[], category: ContractNumberCategory) {
  const sequences = existingNumbers
    .map(extractContractNumberSequence)
    .filter((value): value is number => value !== null);

  const nextSequence = sequences.length ? Math.max(...sequences) + 1 : 1;
  return formatContractNumber(category, nextSequence);
}

interface ResolveContractNumberCategoryOptions {
  baseType: BaseType;
  hasMainBooking?: boolean;
  hasBath?: boolean;
  hasFurako?: boolean;
  prefilledObjectId?: string | null;
}

export function resolveContractNumberCategory({
  baseType,
  hasMainBooking = false,
  hasBath = false,
  hasFurako = false,
  prefilledObjectId,
}: ResolveContractNumberCategoryOptions): ContractNumberCategory {
  if (baseType === 'chunga-changa') return 'cc';
  if (hasMainBooking) return 'gb';
  if (hasBath || prefilledObjectId === 'gb-bath') return 'bath';
  if (hasFurako || prefilledObjectId === 'gb-furako') return 'furako';
  return 'gb';
}
