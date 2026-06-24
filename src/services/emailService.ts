import { apiRequest } from './localApi';

export interface SendEmailParams {
  contractId: string;
  contractNumber: string;
  toEmail: string;
  toName: string;
  documentType: 'Договор' | 'Счёт на оплату' | 'Акт оказанных услуг' | 'Пакет документов' | 'Подарочный сертификат';
  docxBlob?: Blob;
  attachmentBase64?: string;
  sentBy: string;
  customMessage?: string;
  senderName?: string;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function escapeHtml(value: string) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildEmailHtml(
  clientName: string,
  documentType: string,
  contractNumber: string,
  message?: string,
  senderName?: string,
): string {
  const safeClientName = escapeHtml(clientName);
  const safeDocumentType = escapeHtml(documentType);
  const safeContractNumber = escapeHtml(contractNumber);
  const safeMessage = message ? escapeHtml(message) : '';
  const safeSenderName = escapeHtml(senderName || 'Администрация');

  return `
    <div style="font-family:Arial,sans-serif;font-size:14px;color:#333;max-width:600px;line-height:1.5;">
      <p>Здравствуйте, ${safeClientName}!</p>
      <p>Направляем Вам запрошенный документ: <strong>${safeDocumentType} № ${safeContractNumber}</strong>.</p>
      ${safeMessage ? `<p style="margin: 16px 0; padding: 12px; background-color: #f9f9f9; border-left: 4px solid #e5e7eb;">${safeMessage}</p>` : ''}
      <p>Пожалуйста, ознакомьтесь с прикрепленным файлом в формате PDF.</p>
      <p>Если у вас возникнут вопросы, вы можете ответить на это письмо.</p>
      <hr style="border:none;border-top:1px solid #eee;margin:20px 0;">
      <p style="color:#888;font-size:12px;margin:0;">С уважением,</p>
      <p style="color:#555;font-size:14px;font-weight:bold;margin:4px 0 0 0;">${safeSenderName}</p>
    </div>`;
}

export async function getEmailResponseError(response: Response) {
  const text = await response.text();
  if (!text) return 'Failed to send email via server';

  try {
    const data = JSON.parse(text) as { error?: unknown };
    return typeof data.error === 'string' && data.error
      ? data.error
      : text;
  } catch {
    return text;
  }
}

export const emailService = {
  async send(params: SendEmailParams): Promise<void> {
    let base64 = params.attachmentBase64;
    if (!base64 && params.docxBlob) {
      base64 = await blobToBase64(params.docxBlob);
    }

    if (!base64) {
      throw new Error('No attachment provided');
    }

    const fileName = `${params.documentType}_${params.contractNumber}.pdf`;
    const htmlBody = buildEmailHtml(
      params.toName,
      params.documentType,
      params.contractNumber,
      params.customMessage,
      params.senderName,
    );

    await apiRequest('/api/send-email', {
      method: 'POST',
      body: JSON.stringify({
        toEmail: params.toEmail,
        subject: `${params.documentType} № ${params.contractNumber}`,
        htmlBody,
        attachmentBase64: base64,
        attachmentName: fileName,
        senderName: params.senderName,
      }),
    });
  },
};
