import dotenv from 'dotenv';
import express from 'express';
// vite импортируется условно внутри startServer() — только в dev-режиме.
// Top-level import запрещён: в CJS-бандле он превращается в require('vite')
// в начале файла, до проверки NODE_ENV, и рушит packaged Electron app.
// type-only import нужен IDE для типов — erase at runtime.
import type { createServer as createViteServerType } from 'vite';
import path from 'node:path';
import fs from 'node:fs';
import nodemailer from 'nodemailer';
import { fileURLToPath } from 'node:url';
import { BookingConflictError, localDb, localPaths, maskIntegrationSettings } from './server/localDatabase';
import { backupService } from './server/backupService';
import { authService } from './server/authService';
import { syncSupabaseLeads, testSupabaseConnection } from './server/supabaseLeadSync';
import { restartAutoSync, getAutoSyncStatus } from './server/autoSyncScheduler';
import { findSofficePath, setLibreOfficePath, resetSofficePathCache } from './src/utils/docx/docxToPdf';
import { buildClientContractHistory } from './src/utils/clientHistory';
import { validate, clientSchema, contractSchema, ValidationError } from './server/validation';
import { registerBmDocxRoutes } from './server/bmDocxRouter';
import { registerBmDocxTemplateRoutes } from './server/bmDocxTemplateRouter';
import { asErrorMessage } from './server/errorUtils';
import type { Client } from './src/types';

dotenv.config({ path: '.env.local' });
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Версия приложения из package.json — единственный источник правды.
 *  В tsx (__dirname = корень проекта) и в CJS-бандле tsup (__dirname = dist-server/)
 *  ищем package.json в текущей или родительской директории.
 */
const APP_VERSION: string = (() => {
  const candidates = [
    path.join(__dirname, 'package.json'),
    path.join(__dirname, '..', 'package.json'),
  ];
  for (const p of candidates) {
    try {
      const raw = fs.readFileSync(p, 'utf-8');
      const v = (JSON.parse(raw) as { version?: string }).version;
      if (v) return v;
    } catch { /* continue */ }
  }
  return '0.0.0';
})();

function asErrorResponse(error: unknown) {
  if (error instanceof BookingConflictError) {
    return {
      error: error.message,
      conflict: {
        contractId: error.conflictContractId,
        status: error.conflictStatus,
        number: error.conflictNumber
      }
    };
  }
  return { error: asErrorMessage(error) };
}

/**
 * Выполняет читающий обработчик и отдаёт результат как JSON.
 * При ошибке возвращает JSON { error } со статусом 500 вместо HTML-страницы
 * дефолтного обработчика Express — важно для GET-роутов списков без try/catch.
 */
function sendJsonResult(res: express.Response, produce: () => unknown) {
  try {
    res.json(produce());
  } catch (error) {
    res.status(500).json({ error: asErrorMessage(error) });
  }
}

function asEmailErrorMessage(error: unknown) {
  const message = asErrorMessage(error);
  if (message.includes('ECONNREFUSED')) {
    return 'Не удалось подключиться к SMTP-серверу. Проверьте host, port, интернет, антивирус, фаервол или роутер.';
  }
  if (message.includes('ETIMEDOUT')) {
    return 'SMTP-сервер не ответил вовремя. Проверьте интернет-соединение и доступность указанного SMTP host/port.';
  }
  if (message.includes('EAUTH') || message.includes('Invalid login')) {
    return 'SMTP-сервер отклонил логин или пароль. Проверьте email отправителя и пароль для внешнего приложения.';
  }
  return message;
}

function getBearerToken(req: express.Request) {
  const header = req.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(String(header));
  return match?.[1] || null;
}

const requireAuth: express.RequestHandler = (req, res, next) => {
  const manager = authService.getByToken(getBearerToken(req));
  if (!manager) {
    res.status(401).json({ error: 'Требуется авторизация' });
    return;
  }
  (req as express.Request & { manager?: unknown }).manager = manager;
  next();
};

const requireAdmin: express.RequestHandler = (req, res, next) => {
  const manager = authService.getByToken(getBearerToken(req));
  try {
    authService.requireAdmin(manager);
    (req as express.Request & { manager?: unknown }).manager = manager;
    next();
  } catch (error) {
    res.status(manager ? 403 : 401).json({ error: asErrorMessage(error) });
  }
};

function getRequestManager(req: express.Request) {
  return (req as express.Request & { manager?: ReturnType<typeof authService.getByToken> }).manager || null;
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function cleanString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function getSmtpConfig(body: any = {}) {
  const storedSettings = localDb.getEmailSettings<any>() || {};
  const senderEmail = body.senderEmail || storedSettings.senderEmail || process.env.SMTP_USER || 'medvedica.hotel@vk.com';
  const appPassword = body.appPassword || storedSettings.appPassword || process.env.SMTP_PASSWORD;
  const senderName = body.senderName || storedSettings.senderName || process.env.SMTP_FROM_NAME || 'Большая Медведица';
  const host = body.host || storedSettings.host || process.env.SMTP_HOST || 'smtp.mail.ru';
  const port = Number(body.port || storedSettings.port || process.env.SMTP_PORT || 465);
  const rawSecure = body.secure ?? storedSettings.secure ?? process.env.SMTP_SECURE ?? true;
  const secure = typeof rawSecure === 'boolean' ? rawSecure : String(rawSecure) !== 'false';

  return {
    senderEmail: String(senderEmail || '').trim(),
    appPassword: String(appPassword || '').trim(),
    senderName: String(senderName || '').trim(),
    host,
    port,
    secure,
  };
}

function createSmtpTransporter(smtpConfig: ReturnType<typeof getSmtpConfig>) {
  return nodemailer.createTransport({
    host: smtpConfig.host,
    port: smtpConfig.port,
    secure: smtpConfig.secure,
    auth: {
      user: smtpConfig.senderEmail,
      pass: smtpConfig.appPassword,
    },
  });
}

/** Применить LibreOffice-путь из настроек CRM при старте */
function applyStoredLibreOfficePath() {
  const stored = localDb.getIntegrationSettingsFull();
  if (stored.libreOfficePath?.trim()) {
    setLibreOfficePath(stored.libreOfficePath.trim());
  }
}

async function startServer() {
  // Применяем хранимый путь до первого запроса
  applyStoredLibreOfficePath();
  const app = express();
  const PORT = Number(process.env.PORT || 3002);

  app.use(express.json({ limit: '50mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  /** Информация о версии и окружении. Не требует авторизации. */
  app.get('/api/app-info', (_req, res) => {
    res.json({
      version: APP_VERSION,
      mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
      dataDir: localPaths.dataDir,
      dbPath:  localPaths.dbPath,
    });
  });

  // Экспериментальный DOCX-генератор договора БМ.
  // Параллельно действующему PDFMe — основная кнопка генерации не меняется.
  // Маршруты: GET /api/bm-docx/contract/:contractId{?mode,output}, /info.
  registerBmDocxRoutes(app, requireAuth);

  // Хранилище визуальных DOCX-шаблонов договора БМ (template POC).
  // Маршруты: /api/docx-templates/bm/:mode/{status,download,upload,test,activate}.
  // UI-кнопка и endpoint /api/bm-docx/* не затронуты.
  registerBmDocxTemplateRoutes(app, requireAuth);

  // ── Integration Settings ──────────────────────────────────────────────────
  // GET  — маскированные настройки (секреты не раскрываются)
  // PUT  — сохранить; пустой секрет = оставить прежнее
  // POST /test-supabase        — проверить подключение Supabase
  // POST /detect-libreoffice   — автопоиск soffice.exe
  // POST /test-libreoffice     — проверить LibreOffice
  // POST /test-ai-backend      — проверить AI backend URL

  app.get('/api/integration-settings', requireAuth, (_req, res) => {
    sendJsonResult(res, () => maskIntegrationSettings(localDb.getIntegrationSettingsFull()));
  });

  app.put('/api/integration-settings', requireAdmin, (req, res) => {
    try {
      const masked = localDb.saveIntegrationSettings(req.body || {});
      // Обновляем LibreOffice override без перезапуска
      const full = localDb.getIntegrationSettingsFull();
      setLibreOfficePath(full.libreOfficePath);
      // Перезапускаем планировщик с обновлёнными настройками автосинхронизации
      restartAutoSync();
      res.json(masked);
    } catch (error) {
      res.status(400).json({ error: asErrorMessage(error) });
    }
  });

  app.post('/api/integration-settings/test-supabase', requireAuth, async (_req, res) => {
    try {
      const result = await testSupabaseConnection();
      res.json(result);
    } catch (error) {
      res.json({ ok: false, error: asErrorMessage(error) });
    }
  });

  app.post('/api/integration-settings/detect-libreoffice', requireAuth, (_req, res) => {
    try {
      resetSofficePathCache();
      const full = localDb.getIntegrationSettingsFull();
      // Временно убираем override чтобы автопоиск сработал
      setLibreOfficePath(undefined);
      let detected = '';
      try {
        detected = findSofficePath();
      } catch { /* не найден */ }
      // Восстанавливаем сохранённый путь
      setLibreOfficePath(full.libreOfficePath);
      res.json({ detected });
    } catch (error) {
      res.json({ detected: '', error: asErrorMessage(error) });
    }
  });

  app.post('/api/integration-settings/test-libreoffice', requireAuth, async (_req, res) => {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execFileAsync = promisify(execFile);
    try {
      const sofficePath = (() => {
        try { return findSofficePath(); } catch { return null; }
      })();
      if (!sofficePath || sofficePath === 'soffice') {
        // Проверяем soffice в PATH
        await execFileAsync('soffice', ['--version'], { timeout: 8000 });
        res.json({ ok: true, path: 'soffice (PATH)', version: '' });
        return;
      }
      const { stdout } = await execFileAsync(sofficePath, ['--version'], { timeout: 8000 });
      res.json({ ok: true, path: sofficePath, version: stdout.trim() });
    } catch (error) {
      res.json({ ok: false, error: asErrorMessage(error) });
    }
  });

  app.post('/api/integration-settings/test-ai-backend', requireAuth, async (_req, res) => {
    const full = localDb.getIntegrationSettingsFull();
    const url = full.aiBackendUrl?.trim();
    if (!url) {
      res.json({ ok: false, status: 'not_configured', error: 'URL не задан' });
      return;
    }
    try {
      const pingUrl = url.replace(/\/+$/, '') + '/health';
      const response = await fetch(pingUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
        headers: full.aiBackendKey ? { Authorization: `Bearer ${full.aiBackendKey}` } : {},
      });
      res.json({ ok: response.ok, status: response.ok ? 'online' : 'error', httpStatus: response.status });
    } catch (error) {
      const msg = asErrorMessage(error);
      const isTimeout = msg.includes('TimeoutError') || msg.includes('ETIMEDOUT') || msg.includes('ECONNREFUSED');
      res.json({ ok: false, status: 'offline', error: isTimeout ? 'Сервер недоступен' : msg });
    }
  });

  app.post('/api/auth/login', (req, res) => {
    try {
      res.json(authService.login(req.body?.login, req.body?.password));
    } catch (error) {
      res.status(401).json({ error: asErrorMessage(error) });
    }
  });

  app.get('/api/auth/me', requireAuth, (req, res) => {
    res.json({ manager: getRequestManager(req) });
  });

  app.post('/api/auth/logout', (req, res) => {
    res.json(authService.logout(getBearerToken(req)));
  });

  app.get('/api/managers', requireAdmin, (req, res) => {
    try {
      res.json(authService.listManagers(getRequestManager(req)));
    } catch (error) {
      res.status(403).json({ error: asErrorMessage(error) });
    }
  });

  app.post('/api/managers', requireAdmin, (req, res) => {
    try {
      res.json(authService.createManager(getRequestManager(req), req.body));
    } catch (error) {
      res.status(400).json({ error: asErrorMessage(error) });
    }
  });

  app.put('/api/managers/:id', requireAdmin, (req, res) => {
    try {
      res.json(authService.updateManager(getRequestManager(req), req.params.id, req.body));
    } catch (error) {
      res.status(400).json({ error: asErrorMessage(error) });
    }
  });

  app.delete('/api/managers/:id', requireAdmin, (req, res) => {
    try {
      res.json(authService.deleteManager(getRequestManager(req), req.params.id));
    } catch (error) {
      res.status(400).json({ error: asErrorMessage(error) });
    }
  });

  app.get('/api/clients', requireAuth, (_req, res) => {
    sendJsonResult(res, () => localDb.listClients());
  });

  app.post('/api/clients', requireAuth, (req, res) => {
    try {
      const data = validate(clientSchema, req.body);
      res.json(localDb.saveClient(data));
    } catch (error) {
      if (error instanceof ValidationError) return res.status(400).json({ error: asErrorMessage(error) });
      res.status(500).json({ error: asErrorMessage(error) });
    }
  });

  app.put('/api/clients/:id', requireAuth, (req, res) => {
    try {
      const data = validate(clientSchema, { ...req.body, id: req.params.id });
      res.json(localDb.saveClient(data));
    } catch (error) {
      if (error instanceof ValidationError) return res.status(400).json({ error: asErrorMessage(error) });
      res.status(500).json({ error: asErrorMessage(error) });
    }
  });

  app.delete('/api/clients/:id', requireAdmin, (req, res) => {
    const id = req.params.id;
    const linked = (localDb.listContractsByClient(id) as unknown[]);
    if (linked.length > 0) {
      res.status(409).json({
        error: `Нельзя удалить гостя: найдено договоров/предброней — ${linked.length}. Сначала удалите или отмените все связанные договоры.`,
      });
      return;
    }
    localDb.deleteClient(id);
    res.json({ success: true });
  });

  app.get('/api/clients/:id/history', requireAuth, (req, res) => {
    sendJsonResult(res, () => buildClientContractHistory(localDb.listContractsByClient(req.params.id) as any, req.params.id));
  });

  app.get('/api/contracts', requireAuth, (_req, res) => {
    sendJsonResult(res, () => localDb.listContracts());
  });

  app.post('/api/contracts', requireAuth, (req, res) => {
    try {
      const data = validate(contractSchema, req.body);
      res.json(localDb.saveContract(data));
    } catch (error) {
      if (error instanceof ValidationError) return res.status(400).json({ error: asErrorMessage(error) });
      const status = error instanceof BookingConflictError ? 409 : 500;
      res.status(status).json(asErrorResponse(error));
    }
  });

  app.put('/api/contracts/:id', requireAuth, (req, res) => {
    try {
      const data = validate(contractSchema, { ...req.body, id: req.params.id });
      res.json(localDb.saveContract(data));
    } catch (error) {
      if (error instanceof ValidationError) return res.status(400).json({ error: asErrorMessage(error) });
      const status = error instanceof BookingConflictError ? 409 : 500;
      res.status(status).json(asErrorResponse(error));
    }
  });

  app.delete('/api/contracts/:id', requireAuth, (req, res) => {
    try {
      const id = req.params.id;
      const target = (localDb.listContracts() as Array<{ id: string; status?: string }>)
        .find(c => c.id === id);
      // Предбронь может удалить любой авторизованный (менеджер или админ).
      // Полноценный договор удаляет только админ.
      if (target && target.status !== 'pre_booking') {
        authService.requireAdmin(getRequestManager(req));
      }
      localDb.deleteContract(id);
      res.json({ success: true });
    } catch (error) {
      res.status(403).json({ error: asErrorMessage(error) });
    }
  });

  app.get('/api/leads', requireAuth, (req, res) => {
    sendJsonResult(res, () => localDb.getLeads({
      status: typeof req.query.status === 'string' ? req.query.status as any : undefined,
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
    }));
  });

  app.get('/api/leads/:id', requireAuth, (req, res) => {
    const lead = localDb.getLeadById(req.params.id);
    if (!lead) {
      res.status(404).json({ error: 'Заявка не найдена' });
      return;
    }
    res.json(lead);
  });

  app.post('/api/leads', requireAuth, (req, res) => {
    try {
      res.json(localDb.createLead(req.body));
    } catch (error) {
      res.status(400).json({ error: asErrorMessage(error) });
    }
  });

  app.post('/api/leads/sync', requireAuth, async (_req, res) => {
    try {
      res.json(await syncSupabaseLeads());
    } catch (error) {
      res.status(400).json({ error: asErrorMessage(error) });
    }
  });

  app.get('/api/leads/auto-sync/status', requireAuth, (_req, res) => {
    res.json(getAutoSyncStatus());
  });

  app.post('/api/leads/:id/create-client', requireAuth, (req, res) => {
    try {
      const lead = localDb.getLeadById(req.params.id);
      if (!lead) {
        res.status(404).json({ error: 'Заявка не найдена' });
        return;
      }

      if (lead.clientId) {
        const existingClient = localDb.getClientById<Client>(lead.clientId);
        if (!existingClient) {
          res.status(409).json({ error: 'Заявка уже связана с гостем, но гость не найден' });
          return;
        }

        res.json({ ok: true, client: existingClient, lead });
        return;
      }

      const phone = cleanString(lead.phone);
      if (!phone) {
        res.status(400).json({ error: 'Для создания гостя нужен телефон заявки' });
        return;
      }

      const now = new Date().toISOString();
      const client: Client = {
        id: createId('client'),
        type: 'physical',
        firstName: cleanString(lead.guestName) || 'Гость без имени',
        lastName: '',
        middleName: '',
        birthDate: '',
        phone,
        email: cleanString(lead.email) || undefined,
        passportSeries: '',
        passportNumber: '',
        passportIssuedBy: '',
        passportIssueDate: '',
        registrationAddress: '',
        additionalInfo: '',
        isBlacklisted: false,
        createdAt: now,
      };

      const savedClient = localDb.saveClient(client);
      const updatedLead = localDb.linkLeadToClient(lead.id, savedClient.id);

      res.json({ ok: true, client: savedClient, lead: updatedLead });
    } catch (error) {
      res.status(400).json({ error: asErrorMessage(error) });
    }
  });

  app.patch('/api/leads/:id', requireAuth, (req, res) => {
    try {
      const lead = localDb.updateLead(req.params.id, req.body);
      if (!lead) {
        res.status(404).json({ error: 'Заявка не найдена' });
        return;
      }
      res.json(lead);
    } catch (error) {
      res.status(400).json({ error: asErrorMessage(error) });
    }
  });

  app.patch('/api/leads/:id/status', requireAuth, (req, res) => {
    try {
      const lead = localDb.updateLeadStatus(req.params.id, req.body?.status);
      if (!lead) {
        res.status(404).json({ error: 'Заявка не найдена' });
        return;
      }
      res.json(lead);
    } catch (error) {
      res.status(400).json({ error: asErrorMessage(error) });
    }
  });

  app.delete('/api/leads/:id', requireAuth, (req, res) => {
    try {
      res.json(localDb.deleteLead(req.params.id));
    } catch (error) {
      res.status(400).json({ error: asErrorMessage(error) });
    }
  });

  app.get('/api/tasks', requireAuth, (_req, res) => {
    sendJsonResult(res, () => localDb.listTasks());
  });

  app.post('/api/tasks', requireAuth, (req, res) => {
    try {
      const manager = getRequestManager(req);
      res.json(localDb.saveTask({
        ...req.body,
        createdBy: req.body?.createdBy || manager?.name || manager?.login || 'system',
      }));
    } catch (error) {
      res.status(400).json({ error: asErrorMessage(error) });
    }
  });

  app.put('/api/tasks/:id', requireAuth, (req, res) => {
    try {
      res.json(localDb.saveTask({ ...req.body, id: req.params.id }));
    } catch (error) {
      res.status(400).json({ error: asErrorMessage(error) });
    }
  });

  app.delete('/api/tasks/:id', requireAuth, (req, res) => {
    localDb.deleteTask(req.params.id);
    res.json({ success: true });
  });

  app.get('/api/settings', requireAuth, (_req, res) => {
    sendJsonResult(res, () => localDb.getSettings() || null);
  });

  app.put('/api/settings', requireAuth, (req, res) => {
    res.json(localDb.saveSettings(req.body));
  });

  app.get('/api/settings/:id', requireAuth, (req, res) => {
    sendJsonResult(res, () => localDb.getSettings(req.params.id) || null);
  });

  app.put('/api/settings/:id', requireAuth, (req, res) => {
    res.json(localDb.saveSettings(req.body, req.params.id));
  });

  app.get('/api/organizations', requireAuth, (_req, res) => {
    sendJsonResult(res, () => localDb.listOrganizations());
  });

  app.get('/api/organizations/:id', requireAuth, (req, res) => {
    sendJsonResult(res, () => localDb.getOrganization(req.params.id));
  });

  app.put('/api/organizations/:id', requireAdmin, (req, res) => {
    res.json(localDb.saveOrganization(req.params.id, req.body));
  });

  app.get('/api/templates-meta', requireAuth, (_req, res) => {
    sendJsonResult(res, () => localDb.listTemplatesMeta());
  });

  app.get('/api/pdf-templates', requireAuth, (_req, res) => {
    sendJsonResult(res, () => localDb.listPdfTemplates());
  });

  app.get('/api/pdf-templates/:id', requireAuth, (req, res) => {
    sendJsonResult(res, () => localDb.getPdfTemplate(req.params.id));
  });

  app.put('/api/pdf-templates/:id', requireAdmin, (req, res) => {
    try {
      const saved = localDb.savePdfTemplate(req.params.id, req.body.template || {}, req.body.meta);
      res.json(saved);
    } catch (error) {
      res.status(500).json({ error: asErrorMessage(error) });
    }
  });

  app.delete('/api/pdf-templates/:id', requireAdmin, (req, res) => {
    try {
      localDb.deletePdfTemplate(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: asErrorMessage(error) });
    }
  });

  app.get('/api/email-settings', requireAuth, (_req, res) => {
    const settings = localDb.getEmailSettings<any>() || {};
    const { appPassword: _appPassword, ...safeSettings } = settings;
    res.json(safeSettings);
  });

  app.put('/api/email-settings', requireAdmin, (req, res) => {
    res.json(localDb.saveEmailSettings(req.body));
  });

  app.post('/api/email-settings/test-smtp', requireAdmin, async (req, res) => {
    const smtpConfig = getSmtpConfig(req.body);
    if (!smtpConfig.senderEmail || !smtpConfig.appPassword) {
      return res.status(400).json({
        error: 'SMTP не настроен. Укажите email отправителя и пароль внешнего приложения в настройках Email.',
      });
    }

    try {
      const transporter = createSmtpTransporter(smtpConfig);
      await transporter.verify();
      res.json({
        success: true,
        host: smtpConfig.host,
        port: smtpConfig.port,
        secure: smtpConfig.secure,
        user: smtpConfig.senderEmail,
      });
    } catch (error) {
      res.status(500).json({ error: asEmailErrorMessage(error) });
    }
  });

  app.post('/api/backups', requireAdmin, async (_req, res) => {
    try {
      const backupPath = await localDb.createBackup();
      res.json({ success: true, path: backupPath });
    } catch (error) {
      res.status(500).json({ error: asErrorMessage(error) });
    }
  });

  app.get('/api/backups/status', requireAdmin, async (_req, res) => {
    try {
      res.json(await backupService.getStatus());
    } catch (error) {
      res.status(500).json({ error: asErrorMessage(error) });
    }
  });

  app.get('/api/backups/settings', requireAdmin, (_req, res) => {
    try {
      res.json(backupService.getSettings());
    } catch (error) {
      res.status(500).json({ error: asErrorMessage(error) });
    }
  });

  app.put('/api/backups/settings', requireAdmin, (req, res) => {
    try {
      res.json(backupService.saveSettings(req.body || {}));
    } catch (error) {
      res.status(500).json({ error: asErrorMessage(error) });
    }
  });

  app.post('/api/backups/test-remotes', requireAdmin, async (_req, res) => {
    try {
      res.json(await backupService.testRemotes());
    } catch (error) {
      res.status(500).json({ error: asErrorMessage(error) });
    }
  });

  app.post('/api/backups/rclone/check', requireAdmin, async (_req, res) => {
    try {
      res.json(await backupService.checkRclone());
    } catch (error) {
      res.status(500).json({ error: asErrorMessage(error) });
    }
  });

  app.post('/api/backups/rclone/install', requireAdmin, async (_req, res) => {
    try {
      res.json(await backupService.installRclone());
    } catch (error) {
      res.status(500).json({ error: asErrorMessage(error) });
    }
  });

  app.post('/api/backups/run', requireAdmin, async (req, res) => {
    try {
      const mode = req.body?.mode || 'daily-cloud';
      if (!['daily-cloud', 'weekly-local', 'shutdown'].includes(mode)) {
        return res.status(400).json({ error: 'Неизвестный режим резервного копирования.' });
      }
      res.json(await backupService.run(mode));
    } catch (error) {
      res.status(500).json({ error: asErrorMessage(error) });
    }
  });

  app.post('/api/backups/open-folder', requireAdmin, (_req, res) => {
    try {
      res.json(backupService.openBackupFolder());
    } catch (error) {
      res.status(500).json({ error: asErrorMessage(error) });
    }
  });

  app.post('/api/send-email', requireAuth, async (req, res) => {
    const {
      toEmail,
      subject,
      htmlBody,
      attachmentBase64,
      attachmentName,
    } = req.body;

    const smtpConfig = getSmtpConfig(req.body);
    if (!smtpConfig.senderEmail || !smtpConfig.appPassword) {
      return res.status(400).json({
        error: 'SMTP не настроен. Укажите email отправителя и пароль внешнего приложения в настройках Email.',
      });
    }
    if (!toEmail || !attachmentBase64 || !attachmentName) {
      return res.status(400).json({ error: 'Не хватает получателя или вложения.' });
    }

    const buffer = Buffer.from(attachmentBase64, 'base64');
    const from = smtpConfig.senderName
      ? `"${smtpConfig.senderName}" <${smtpConfig.senderEmail}>`
      : smtpConfig.senderEmail;

    try {
      const transporter = createSmtpTransporter(smtpConfig);

      await transporter.sendMail({
        from,
        to: toEmail,
        subject,
        html: htmlBody,
        attachments: [{
          filename: attachmentName,
          content: buffer,
          contentType: String(attachmentName).endsWith('.xlsx')
            ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            : 'application/pdf',
        }],
      });

      localDb.addEmailHistory({
        toEmail,
        subject,
        attachmentName,
        sentAt: new Date().toISOString(),
      });

      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: asEmailErrorMessage(error) });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    // Динамический import — выполняется только в dev-режиме.
    // В production (NODE_ENV=production, packaged Electron app) этот блок
    // не выполняется, поэтому vite не нужен и не должен быть в node_modules.
    const { createServer: createViteServer } =
      await import('vite') as { createServer: typeof createViteServerType };
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // CRM_DIST_DIR позволяет Electron-оболочке указать папку с frontend.
    // Fallback: dist/ рядом с process.cwd() (npm run start / start-crm.cmd).
    const distPath = process.env.CRM_DIST_DIR
      ? path.resolve(process.env.CRM_DIST_DIR)
      : path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
    // Запускаем планировщик автосинхронизации (если включён в настройках)
    restartAutoSync();
  });
}

startServer();
