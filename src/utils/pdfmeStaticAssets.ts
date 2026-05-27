import type { Template } from '@pdfme/common';

const STATIC_ASSET_URLS = {
  stamp: '/pdfme-assets/stamp.png',
  signature: '/pdfme-assets/signature.png',
  giftCertificateBackground: '/pdfme-assets/gift-certificate-template.jpg',
} as const;

const STATIC_IMAGE_FIELDS: Record<string, keyof typeof STATIC_ASSET_URLS> = {
  company_static_stamp: 'stamp',
  director_static_signature: 'signature',
  accountant_static_signature: 'signature',
  act_company_static_stamp: 'stamp',
  act_director_static_signature: 'signature',
  cc_company_stamp_image: 'stamp',
  cc_executor_signature_image: 'signature',
  gift_certificate_background: 'giftCertificateBackground',
};

const dataUrlCache: Partial<Record<keyof typeof STATIC_ASSET_URLS, string>> = {};

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Cannot read image asset'));
    reader.readAsDataURL(blob);
  });
}

async function loadStaticAsset(asset: keyof typeof STATIC_ASSET_URLS) {
  if (dataUrlCache[asset]) return dataUrlCache[asset] as string;

  const response = await fetch(STATIC_ASSET_URLS[asset]);
  if (!response.ok) {
    throw new Error(`Cannot load PDFMe asset: ${STATIC_ASSET_URLS[asset]}`);
  }

  const dataUrl = await blobToDataUrl(await response.blob());
  dataUrlCache[asset] = dataUrl;
  return dataUrl;
}

export async function hydratePdfmeStaticAssetsInTemplate(template: Template): Promise<Template> {
  const schemas = await Promise.all(template.schemas.map(async page => Promise.all(page.map(async schema => {
    const name = String((schema as Record<string, unknown>).name || '');
    const asset = STATIC_IMAGE_FIELDS[name];
    if (!asset || (schema as Record<string, unknown>).type !== 'image') return schema;

    return {
      ...schema,
      content: await loadStaticAsset(asset),
    };
  }))));

  return { ...template, schemas };
}
