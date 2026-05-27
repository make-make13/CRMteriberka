import dotenv from 'dotenv';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'node:path';
import nodemailer from 'nodemailer';
import { fileURLToPath } from 'node:url';
import { BookingConflictError, localDb } from './server/localDatabase';
import { backupService } from './server/backupService';
import { authService } from './server/authService';
import { syncSupabaseLeads } from './server/supabaseLeadSync';
import { buildClientContractHistory } from './src/utils/clientHistory';
import { validate, clientSchema, contractSchema, ValidationError } from './server/validation';
import type { Client } from './src/types';

dotenv.config({ path: '.env.local' });
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function asErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

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

function asEmailErrorMessage(error: unknown) {
  const message = asErrorMessage(error);
  if (message.includes('ECONNREFUSED')) {
    return 'Не удалось подключиться к SMTP-серверу. Проверьте, что интернет, антивирус, фаервол или роутер не блокируют исходящие подключения к smtp.yandex.ru на портах 465/587.';
  }
  if (message.includes('ETIMEDOUT')) {
    return 'SMTP-сервер не ответил вовремя. Проверьте интернет-соединение и доступность smtp.yandex.ru на портах 465/587.';
  }
  if (message.includes('EAUTH') || message.includes('Invalid login')) {
    return 'SMTP-сервер отклонил логин или пароль. Проверьте SMTP_USER и новый пароль приложения Яндекса в .env.local.';
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

function getSmtpConfig(body: any) {
  const storedSettings = localDb.getEmailSettings<any>() || {};
  const senderEmail = process.env.SMTP_USER || storedSettings.senderEmail;
  const appPassword = process.env.SMTP_PASSWORD;
  const senderName = process.env.SMTP_FROM_NAME || storedSettings.senderName || body.senderName || '';
  const host = process.env.SMTP_HOST || 'smtp.yandex.ru';
  const port = Number(process.env.SMTP_PORT || 465);
  const secure = String(process.env.SMTP_SECURE || 'true') !== 'false';

  return {
    senderEmail: String(senderEmail || '').trim(),
    appPassword: String(appPassword || '').trim(),
    senderName: String(senderName || '').trim(),
    host,
    port,
    secure,
  };
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3001);

  app.use(express.json({ limit: '50mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
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
    res.json(localDb.listClients());
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
    localDb.deleteClient(req.params.id);
    res.json({ success: true });
  });

  app.get('/api/clients/:id/history', requireAuth, (req, res) => {
    const contracts = localDb.listContractsByClient(req.params.id);
    res.json(buildClientContractHistory(contracts as any, req.params.id));
  });

  app.get('/api/contracts', requireAuth, (_req, res) => {
    res.json(localDb.listContracts());
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

  app.delete('/api/contracts/:id', requireAdmin, (req, res) => {
    localDb.deleteContract(req.params.id);
    res.json({ success: true });
  });

  app.get('/api/leads', requireAuth, (req, res) => {
    res.json(localDb.getLeads({
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

  app.get('/api/tasks', requireAuth, (_req, res) => {
    res.json(localDb.listTasks());
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
    res.json(localDb.getSettings() || null);
  });

  app.put('/api/settings', requireAuth, (req, res) => {
    res.json(localDb.saveSettings(req.body));
  });

  app.get('/api/settings/:id', requireAuth, (req, res) => {
    res.json(localDb.getSettings(req.params.id) || null);
  });

  app.put('/api/settings/:id', requireAuth, (req, res) => {
    res.json(localDb.saveSettings(req.body, req.params.id));
  });

  app.get('/api/organizations', requireAuth, (_req, res) => {
    res.json(localDb.listOrganizations());
  });

  app.get('/api/organizations/:id', requireAuth, (req, res) => {
    res.json(localDb.getOrganization(req.params.id));
  });

  app.put('/api/organizations/:id', requireAdmin, (req, res) => {
    res.json(localDb.saveOrganization(req.params.id, req.body));
  });

  app.get('/api/templates-meta', requireAuth, (_req, res) => {
    res.json(localDb.listTemplatesMeta());
  });

  app.get('/api/pdf-templates', requireAuth, (_req, res) => {
    res.json(localDb.listPdfTemplates());
  });

  app.get('/api/pdf-templates/:id', requireAuth, (req, res) => {
    res.json(localDb.getPdfTemplate(req.params.id));
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
        error: 'SMTP не настроен. Укажите SMTP_USER и SMTP_PASSWORD в .env.local и перезапустите сервер.',
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
      const transporter = nodemailer.createTransport({
        host: smtpConfig.host,
        port: smtpConfig.port,
        secure: smtpConfig.secure,
        auth: {
          user: smtpConfig.senderEmail,
          pass: smtpConfig.appPassword,
        },
      });

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
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
