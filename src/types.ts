/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type View = 'chessboard' | 'leads' | 'clients' | 'contracts' | 'additional' | 'settings';

export type ManagerRole = 'admin' | 'manager';

export type ManagerPermission =
  | 'settings:all'
  | 'settings:general'
  | 'templates:manage'
  | 'email:manage'
  | 'backups:manage'
  | 'managers:manage'
  | 'clients:delete'
  | 'contracts:delete';

export interface Manager {
  id: string;
  name: string;
  login: string;
  role: ManagerRole;
  permissions: ManagerPermission[];
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface ManagerInput {
  id?: string;
  name: string;
  login: string;
  role: ManagerRole;
  permissions?: ManagerPermission[];
  isActive: boolean;
  password?: string;
}

export type ClientType = 'physical' | 'legal';

export interface PhysicalClient {
  id: string;
  type: 'physical';
  firstName: string;
  lastName: string;
  middleName?: string;
  birthDate?: string;
  phone: string;
  email?: string;
  passportSeries: string;
  passportNumber: string;
  passportIssuedBy: string;
  passportIssueDate: string;
  registrationAddress: string;
  additionalInfo?: string;
  isBlacklisted: boolean;
  createdAt: string;
}

export interface LegalClient {
  id: string;
  type: 'legal';
  organizationName: string;
  inn: string;
  kpp?: string;
  ogrn?: string;
  legalAddress: string;
  contactPerson: string;
  phone: string;
  email?: string;
  bankName?: string;
  bankAccount?: string;
  corrAccount?: string;
  bik?: string;
  additionalInfo?: string;
  isBlacklisted: boolean;
  createdAt: string;
}

export type Client = PhysicalClient | LegalClient;

export type BaseType = 'chunga-changa' | 'golubaya-bukhta';

export type ContractStatus = 
  | 'pre_booking' 
  | 'signed_not_paid' 
  | 'partial_paid' 
  | 'paid' 
  | 'cancelled';

export interface Booking {
  id: string;
  contractId: string;
  objectId: string; // e.g., "house-1", "cottage-2"
  baseType: BaseType;
  startTime: string; // ISO string
  endTime: string;   // ISO string
  type: 'main' | 'service'; // main object or additional service (bath/furako)
  price: number;
}

export interface Contract {
  id: string;
  number: string; // e.g., "ДГ221"
  clientId: string;
  baseType: BaseType;
  status: ContractStatus;
  totalAmount: number;
  prepayment: number;
  remainder: number;
  createdAt: string;
  dateSigned: string;
  nextReminderAt?: string;
  dismissedPaymentAlertAt?: string;
  dismissedPaymentAlertRemainder?: number;
  comment?: string;
  bookings: Booking[];
  guestsCount?: number;
}

export type TaskColor = 'none' | 'red' | 'amber' | 'green' | 'blue';

export interface TaskReminder {
  id: string;
  title: string;
  description?: string;
  remindAt: string;
  hasReminder?: boolean;
  color?: TaskColor;
  isDone: boolean;
  createdBy: string;
  createdAt: string;
  completedAt?: string;
  isArchived?: boolean;
  archivedAt?: string;
}

export type LeadStatus =
  | 'new'
  | 'in_progress'
  | 'client_created'
  | 'prebooking_created'
  | 'contract_created'
  | 'rejected'
  | 'duplicate';

export type LeadSyncStatus = 'local' | 'pulled' | 'failed';

export interface Lead {
  id: string;
  supabaseId?: string;
  source: string;
  status: LeadStatus;
  syncStatus: LeadSyncStatus;
  guestName?: string;
  phone: string;
  email?: string;
  desiredStartDate?: string;
  desiredEndDate?: string;
  desiredTime?: string;
  guestsCount?: number;
  objectType?: string;
  objectId?: string;
  message?: string;
  utmJson?: string;
  rawJson?: string;
  clientId?: string;
  contractId?: string;
  prebookingId?: string;
  managerNote?: string;
  createdAt: string;
  updatedAt: string;
  supabaseCreatedAt?: string;
  pulledToCrmAt?: string;
  convertedAt?: string;
  lastError?: string;
}

export interface LeadPrebookingPrefill {
  leadId: string;
  clientId: string;
  guestName?: string;
  phone?: string;
  email?: string;
  desiredStartDate?: string;
  desiredEndDate?: string;
  desiredTime?: string;
  guestsCount?: number;
  message?: string;
  baseType: BaseType;
  objectId?: string;
}

export interface LeadCreateInput {
  supabaseId?: string;
  source?: string;
  status?: LeadStatus;
  syncStatus?: LeadSyncStatus;
  guestName?: string;
  phone: string;
  email?: string;
  desiredStartDate?: string;
  desiredEndDate?: string;
  desiredTime?: string;
  guestsCount?: number;
  objectType?: string;
  objectId?: string;
  message?: string;
  utmJson?: string;
  rawJson?: string;
  clientId?: string;
  contractId?: string;
  prebookingId?: string;
  managerNote?: string;
  supabaseCreatedAt?: string;
  pulledToCrmAt?: string;
  convertedAt?: string;
  lastError?: string;
}

export type LeadUpdateInput = Partial<Omit<LeadCreateInput, 'phone'>> & {
  phone?: string;
  status?: LeadStatus;
  syncStatus?: LeadSyncStatus;
};

export interface ClientContractHistoryBooking {
  id: string;
  objectId: string;
  baseType: BaseType;
  startTime: string;
  endTime: string;
  type: Booking['type'];
  price: number;
}

export interface ClientContractHistoryItem {
  contractId: string;
  contractNumber: string;
  baseType: BaseType;
  status: ContractStatus;
  totalAmount: number;
  createdAt: string;
  dateSigned: string;
  primaryBooking?: ClientContractHistoryBooking;
  bookings: ClientContractHistoryBooking[];
}

export interface ClientContractHistorySummary {
  clientId: string;
  totalContracts: number;
  activeBookingCount: number;
  hasLoyaltyHint: boolean;
  items: ClientContractHistoryItem[];
}

export interface Settings {
  companyName: string;
  inn: string;
  address: string;
  phone: string;
  vatRate: number; // e.g., 0.05 for 5%
  emailForReports: string;
}

export interface Organization {
  id: string;
  exec_name: string;
  exec_director: string;
  exec_director_short: string;
  exec_inn: string;
  exec_kpp: string;
  exec_ogrn: string;
  exec_address: string;
  exec_post_address?: string;
  exec_phone: string;
  exec_bank: string;
  exec_rs: string;
  exec_bik: string;
  exec_ks: string;
  bank_inn?: string;
  bank_kpp?: string;
  property_address_cc: string;
  property_address_gb: string;
  exec_email?: string;
  exec_site?: string;
  admin_working_hours?: string;
  hotel_registry_number?: string;
  hotel_category?: string;
  hotel_approval_date?: string;
}

export interface TemplateMeta {
  id: string;
  uploadedAt: string;
  fileName: string;
  uploadedBy: string;
}

export interface PdfTemplateRecord<T = unknown> {
  id: string;
  template: T;
  updatedAt: string;
}

export interface ContractData {
  contractNumber: string;
  signDate: string;
  current_date?: string;
  dateIn: string;
  timeIn: string;
  dateOut: string;
  timeOut: string;
  nights: number;
  guests: number;
  cottageNumber: string;
  roomCategory?: string;
  base: 'golubaya-bukhta' | 'chunga-changa';
  totalRub: number;
  prepaymentRub: number;
  client: {
    fullName: string;
    dob: string;
    passport: string;
    passportDate: string;
    passportIssuedBy: string;
    address: string;
    phone: string;
    email: string;
    inn?: string;
    kpp?: string;
    ogrn?: string;
  };
  services?: {
    banya?: { timeFrom: string; timeTo: string };
    furako?: { timeFrom: string; timeTo: string };
  };
}

export interface ObjectDefinition {
  id: string;
  name: string;
  capacity?: number;
  category?: string;
  pricePerNight?: number;
  seaView?: boolean;
  baseType: BaseType;
  type: 'house' | 'cottage' | 'service';
}
