import nodemailer from 'nodemailer';

async function test() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;

  if (!user || !pass) {
    console.error('Set SMTP_USER and SMTP_PASSWORD before running this script.');
    process.exit(1);
  }

  const transporter = nodemailer.createTransport({
    host: 'smtp.yandex.ru',
    port: 465,
    secure: true,
    auth: {
      user,
      pass
    },
    debug: true,
    logger: true
  });

  try {
    await transporter.verify();
    console.log('Verify success!');
  } catch (e) {
    console.error('Verify failed:', e);
  }
}

test();
