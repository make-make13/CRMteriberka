import { Client, ClientContractHistorySummary, Contract, Lead, LeadCreateInput, LeadStatus, LeadUpdateInput, Manager, ManagerInput, Organization, PdfTemplateRecord, Settings, TaskReminder, TemplateMeta } from '../types';

let authToken: string | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

async function apiRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...(options?.headers || {}),
    },
  });

  const text = await response.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      if (!response.ok) {
        throw new Error(text || `Ошибка запроса ${response.status}`);
      }
      throw new Error('Сервер вернул некорректный JSON');
    }
  }

  if (!response.ok) {
    const error = new Error(data?.error || `Ошибка запроса ${response.status}`);
    // Сохраняем полный ответ сервера для возможности извлечения структурированных данных
    (error as any).data = data;
    throw error;
  }

  return data as T;
}

export const authApi = {
  login: (login: string, password: string) => apiRequest<{ token: string; manager: Manager }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ login, password }),
  }),
  me: () => apiRequest<{ manager: Manager }>('/api/auth/me'),
  logout: () => apiRequest<{ success: true }>('/api/auth/logout', {
    method: 'POST',
    body: JSON.stringify({}),
  }),
};

export const managerApi = {
  list: () => apiRequest<Manager[]>('/api/managers'),
  create: (manager: ManagerInput) => apiRequest<Manager>('/api/managers', {
    method: 'POST',
    body: JSON.stringify(manager),
  }),
  update: (id: string, manager: ManagerInput) => apiRequest<Manager>(`/api/managers/${id}`, {
    method: 'PUT',
    body: JSON.stringify(manager),
  }),
  delete: (id: string) => apiRequest<{ success: true }>(`/api/managers/${id}`, {
    method: 'DELETE',
  }),
};

export const clientApi = {
  list: () => apiRequest<Client[]>('/api/clients'),
  history: (id: string) => apiRequest<ClientContractHistorySummary>(`/api/clients/${id}/history`),
  save: (client: Client) => apiRequest<Client>('/api/clients', {
    method: 'POST',
    body: JSON.stringify(client),
  }),
  delete: (id: string) => apiRequest<{ success: true }>(`/api/clients/${id}`, {
    method: 'DELETE',
  }),
};

export const contractApi = {
  list: () => apiRequest<Contract[]>('/api/contracts'),
  save: (contract: Contract) => apiRequest<Contract>('/api/contracts', {
    method: 'POST',
    body: JSON.stringify(contract),
  }),
  delete: (id: string) => apiRequest<{ success: true }>(`/api/contracts/${id}`, {
    method: 'DELETE',
  }),
};

export interface LeadListFilters {
  status?: LeadStatus | 'all';
  search?: string;
}

export interface LeadSyncResult {
  ok: true;
  fetched: number;
  created: number;
  skipped: number;
  failed: number;
  errors: string[];
}

export interface LeadCreateClientResult {
  ok: true;
  client: Client;
  lead: Lead;
}

function buildLeadQuery(filters?: LeadListFilters) {
  const params = new URLSearchParams();
  if (filters?.status && filters.status !== 'all') params.set('status', filters.status);
  if (filters?.search?.trim()) params.set('search', filters.search.trim());
  const query = params.toString();
  return query ? `/api/leads?${query}` : '/api/leads';
}

export const leadApi = {
  list: (filters?: LeadListFilters) => apiRequest<Lead[]>(buildLeadQuery(filters)),
  get: (id: string) => apiRequest<Lead>(`/api/leads/${id}`),
  sync: () => apiRequest<LeadSyncResult>('/api/leads/sync', {
    method: 'POST',
    body: JSON.stringify({}),
  }),
  create: (input: LeadCreateInput) => apiRequest<Lead>('/api/leads', {
    method: 'POST',
    body: JSON.stringify(input),
  }),
  update: (id: string, patch: LeadUpdateInput) => apiRequest<Lead>(`/api/leads/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  }),
  updateStatus: (id: string, status: LeadStatus) => apiRequest<Lead>(`/api/leads/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  }),
  createClient: (id: string) => apiRequest<LeadCreateClientResult>(`/api/leads/${id}/create-client`, {
    method: 'POST',
    body: JSON.stringify({}),
  }),
};

export const taskApi = {
  list: () => apiRequest<TaskReminder[]>('/api/tasks'),
  save: (task: TaskReminder) => apiRequest<TaskReminder>('/api/tasks', {
    method: 'POST',
    body: JSON.stringify(task),
  }),
  update: (id: string, task: TaskReminder) => apiRequest<TaskReminder>(`/api/tasks/${id}`, {
    method: 'PUT',
    body: JSON.stringify(task),
  }),
  delete: (id: string) => apiRequest<{ success: true }>(`/api/tasks/${id}`, {
    method: 'DELETE',
  }),
};

export const settingsApi = {
  get: () => apiRequest<Settings | null>('/api/settings'),
  save: (settings: Settings) => apiRequest<Settings>('/api/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  }),
  getById: <T = unknown>(id: string) => apiRequest<T | null>(`/api/settings/${id}`),
  saveById: <T extends object>(id: string, settings: T) => apiRequest<T>(`/api/settings/${id}`, {
    method: 'PUT',
    body: JSON.stringify(settings),
  }),
};

export const organizationApi = {
  list: () => apiRequest<Record<string, Organization>>('/api/organizations'),
  get: (id: string) => apiRequest<Organization | null>(`/api/organizations/${id}`),
  save: (id: string, organization: Organization) => apiRequest<Organization>(`/api/organizations/${id}`, {
    method: 'PUT',
    body: JSON.stringify(organization),
  }),
};

export const templateApi = {
  listMeta: () => apiRequest<Record<string, TemplateMeta>>('/api/templates-meta'),
};

export const pdfTemplateApi = {
  list: () => apiRequest<PdfTemplateRecord[]>('/api/pdf-templates'),
  get: <T = unknown>(id: string) => apiRequest<PdfTemplateRecord<T> | null>(`/api/pdf-templates/${id}`),
  save: <T = unknown>(id: string, template: T, meta?: Partial<TemplateMeta>) => apiRequest<PdfTemplateRecord<T>>(`/api/pdf-templates/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ template, meta }),
  }),
  delete: (id: string) => apiRequest<{ success: true }>(`/api/pdf-templates/${id}`, {
    method: 'DELETE',
  }),
};

export interface EmailSettings {
  senderEmail: string;
  senderName: string;
  defaultMessage: string;
}

export const emailSettingsApi = {
  get: () => apiRequest<Partial<EmailSettings>>('/api/email-settings'),
  save: (settings: EmailSettings) => apiRequest<Partial<EmailSettings>>('/api/email-settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  }),
};

/**
 * Экспериментальный API DOCX-генератора договора БМ.
 * Эндпоинт принимает contract.id (НЕ номер — кириллица в URL ломается),
 * mode = 'print' | 'signed', output = 'docx' | 'pdf'.
 * Возвращает Blob (PDF или DOCX) с правильным Content-Type.
 *
 * Параллельно действующему PDFMe — основная кнопка генерации не затрагивается.
 */
export const bmDocxApi = {
  /** Скачать DOCX/PDF через старый code-генератор (прежнее поведение). */
  async download(
    contractId: string,
    mode: 'print' | 'signed',
    output: 'docx' | 'pdf',
  ): Promise<Blob> {
    const url = `/api/bm-docx/contract/${encodeURIComponent(contractId)}?mode=${mode}&output=${output}`;
    const response = await fetch(url, {
      headers: {
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
    });
    if (!response.ok) {
      let message = `Ошибка запроса ${response.status}`;
      try {
        const data = await response.json();
        if (data?.error) message = data.error;
      } catch { /* not JSON */ }
      throw new Error(message);
    }
    return response.blob();
  },

  /**
   * Скачать PDF/DOCX договора БМ с указанием engine.
   * Возвращает blob + значение заголовка X-BM-DOCX-Engine
   * ('template' | 'code' | 'code-fallback').
   *
   * engine='template-fallback' — рекомендуется для основных кнопок UI:
   *   пробует активный DOCX-шаблон, при отсутствии/ошибке — резервный генератор.
   */
  async downloadBmContract(
    contractId: string,
    mode: 'print' | 'signed',
    output: 'docx' | 'pdf',
    engine: 'template' | 'code' | 'template-fallback',
  ): Promise<{ blob: Blob; engineUsed: string | null }> {
    const url = `/api/bm-docx/contract/${encodeURIComponent(contractId)}?mode=${mode}&output=${output}&engine=${engine}`;
    // 45 секунд — достаточно для холодного старта LibreOffice + конвертации.
    // При зависании LibreOffice fetch не отклонился бы никогда без этого таймаута.
    const signal = AbortSignal.timeout(45_000);
    let response: Response;
    try {
      response = await fetch(url, {
        signal,
        headers: {
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
      });
    } catch (err) {
      // AbortSignal.timeout выбрасывает DOMException { name: 'TimeoutError' }
      if (err instanceof DOMException && err.name === 'TimeoutError') {
        throw new Error('Генерация заняла слишком долго. Возможно, LibreOffice недоступен — повторите позже.');
      }
      throw err;
    }
    if (!response.ok) {
      let message = `Ошибка запроса ${response.status}`;
      try {
        const data = await response.json();
        if (data?.error) message = data.error;
      } catch { /* not JSON */ }
      throw new Error(message);
    }
    const blob = await response.blob();
    const engineUsed = response.headers.get('X-BM-DOCX-Engine');
    return { blob, engineUsed };
  },
};

// ---------------------------------------------------------------------------
// BM DOCX Template Storage API
// (visual template management — does NOT replace generateBmContractDocx())
// ---------------------------------------------------------------------------

export interface BmTemplateFileInfo {
  exists: boolean;
  sizeBytes: number;
  mtime: string;
}

export interface BmTemplateStatus {
  mode: 'print' | 'signed';
  active: BmTemplateFileInfo | null;
  draft: BmTemplateFileInfo | null;
  archive: Array<{ name: string; sizeBytes: number; mtime: string }>;
  requiredPlaceholders: string[];
}

export interface BmTemplateValidation {
  valid: boolean;
  errors: string[];
  foundPlaceholders: string[];
  missingPlaceholders: string[];
}

export interface BmTemplateUploadResult {
  ok: boolean;
  mode: string;
  sizeBytes: number;
  validation: BmTemplateValidation;
  message: string;
  error?: string;
}

export interface BmTemplateTestResult {
  ok: boolean;
  mode: string;
  which: 'draft' | 'active';
  contractNumber: string;
  pages: number;
  docxBytes: number;
  pdfBytes: number;
  generatedAt: string;
  error?: string;
}

export interface BmTemplateActivateResult {
  ok: boolean;
  mode: string;
  activatedPath: string;
  archivedPath: string | null;
}

/** Скачивает ресурс как Blob (с Bearer-токеном авторизации). */
async function apiRequestBlob(url: string, options?: RequestInit): Promise<Blob> {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...(options?.headers || {}),
    },
  });
  if (!response.ok) {
    let message = `Ошибка запроса ${response.status}`;
    try {
      const data = await response.json();
      if (data?.error) message = data.error;
    } catch { /* not JSON */ }
    throw new Error(message);
  }
  return response.blob();
}

export const bmDocxTemplateApi = {
  /** Статус шаблона: active/draft/archive. */
  getStatus(mode: 'print' | 'signed'): Promise<BmTemplateStatus> {
    return apiRequest(`/api/docx-templates/bm/${mode}/status`);
  },

  /** Скачать активный шаблон как Blob. */
  downloadActive(mode: 'print' | 'signed'): Promise<Blob> {
    return apiRequestBlob(`/api/docx-templates/bm/${mode}/download`);
  },

  /** Загрузить .docx как черновик (raw binary). */
  uploadDraft(mode: 'print' | 'signed', buffer: ArrayBuffer): Promise<BmTemplateUploadResult> {
    return apiRequest(`/api/docx-templates/bm/${mode}/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: buffer,
    });
  },

  /** Тест-генерация: JSON-отчёт (страницы, договор, байты). */
  testJson(mode: 'print' | 'signed'): Promise<BmTemplateTestResult> {
    return apiRequest(`/api/docx-templates/bm/${mode}/test?output=json`, { method: 'POST' });
  },

  /** Тест-генерация: PDF-файл как Blob. */
  testPdf(mode: 'print' | 'signed'): Promise<Blob> {
    return apiRequestBlob(`/api/docx-templates/bm/${mode}/test?output=pdf`, { method: 'POST' });
  },

  /** Активировать черновик → active, старый active → archive. */
  activate(mode: 'print' | 'signed'): Promise<BmTemplateActivateResult> {
    return apiRequest(`/api/docx-templates/bm/${mode}/activate`, { method: 'POST' });
  },
};

export const maintenanceApi = {
  createBackup: () => apiRequest<{ success: true; path: string }>('/api/backups', {
    method: 'POST',
    body: JSON.stringify({}),
  }),
};

export interface BackupSettings {
  enabled: boolean;
  remote1: string;
  remote2: string;
  cloudPath: string;
  localDir: string;
  retentionDaily: number;
  retentionWeekly: number;
  retentionMonthly: number;
}

export interface BackupRemoteResult {
  key: 'remote1' | 'remote2';
  remote: string;
  ok: boolean;
  message: string;
  uploadedAt?: string;
}

export interface BackupRunResult {
  success: boolean;
  mode: 'daily-cloud' | 'weekly-local' | 'shutdown';
  createdAt: string;
  archivePath?: string;
  archiveName?: string;
  archiveSize?: number;
  localArchiveDeleted?: boolean;
  localCopies: Array<{ kind: 'daily' | 'weekly' | 'monthly' | 'manual'; path: string; size: number }>;
  remotes: BackupRemoteResult[];
  errors: string[];
}

export interface BackupStatus {
  settings: BackupSettings;
  rclone: {
    available: boolean;
    version?: string;
    error?: string;
  };
  lastRun: BackupRunResult | null;
  lastSuccessfulCloudBackupAt?: string;
  lastSuccessfulLocalBackupAt?: string;
  todayCloudBackupDone: boolean;
  scheduledDir: string;
}

export const backupApi = {
  status: () => apiRequest<BackupStatus>('/api/backups/status'),
  getSettings: () => apiRequest<BackupSettings>('/api/backups/settings'),
  saveSettings: (settings: Partial<BackupSettings>) => apiRequest<BackupSettings>('/api/backups/settings', {
    method: 'PUT',
    body: JSON.stringify(settings),
  }),
  testRemotes: () => apiRequest<{ rclone: BackupStatus['rclone']; remotes: BackupRemoteResult[] }>('/api/backups/test-remotes', {
    method: 'POST',
    body: JSON.stringify({}),
  }),
  run: (mode: BackupRunResult['mode']) => apiRequest<BackupRunResult>('/api/backups/run', {
    method: 'POST',
    body: JSON.stringify({ mode }),
  }),
  openFolder: () => apiRequest<{ success: true; path: string }>('/api/backups/open-folder', {
    method: 'POST',
    body: JSON.stringify({}),
  }),
};
