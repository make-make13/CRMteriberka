import net from 'node:net';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';

dotenv.config({ path: '.env.local' });
dotenv.config();

const host = process.env.SMTP_HOST || 'smtp.yandex.ru';
const configuredPort = Number(process.env.SMTP_PORT || 465);
const secure = String(process.env.SMTP_SECURE || 'true') !== 'false';
const user = process.env.SMTP_USER || '';
const password = process.env.SMTP_PASSWORD || '';

function maskEmail(value) {
  const [name, domain] = value.split('@');
  if (!name || !domain) return value ? '***' : '(empty)';
  return `${name.slice(0, 2)}***@${domain}`;
}

function tcpCheck(port) {
  return new Promise(resolve => {
    const socket = net.createConnection({ host, port });
    const done = result => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(8000);
    socket.once('connect', () => done({ port, ok: true }));
    socket.once('timeout', () => done({ port, ok: false, error: 'timeout' }));
    socket.once('error', error => done({ port, ok: false, error: error.code || error.message }));
  });
}

console.log(`SMTP host: ${host}`);
console.log(`SMTP user: ${maskEmail(user)}`);
console.log(`Configured port: ${configuredPort}, secure: ${secure}`);
console.log(`Password present: ${password ? 'yes' : 'no'}`);

const ports = [...new Set([configuredPort, 465, 587])];
const tcpResults = await Promise.all(ports.map(tcpCheck));

for (const result of tcpResults) {
  console.log(`TCP ${host}:${result.port} ${result.ok ? 'OK' : `FAILED (${result.error})`}`);
}

if (!user || !password) {
  console.error('SMTP_USER or SMTP_PASSWORD is missing in .env.local');
  process.exit(1);
}

if (!tcpResults.some(result => result.port === configuredPort && result.ok)) {
  console.error('Configured SMTP port is not reachable from this PC.');
  process.exit(1);
}

try {
  const transporter = nodemailer.createTransport({
    host,
    port: configuredPort,
    secure,
    auth: { user, pass: password },
  });
  await transporter.verify();
  console.log('SMTP auth/connect verification passed.');
} catch (error) {
  console.error(`SMTP verification failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
