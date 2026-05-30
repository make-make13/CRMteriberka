import { generatePdfmeContractBlob } from '../src/utils/pdfmeDocumentGenerator';
import { authApi, setAuthToken } from '../src/services/localApi';
import type { ContractData } from '../src/types';
import fs from 'fs';
import { PDFDocument } from '@pdfme/pdf-lib';

// Mock fetch
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input.url;
  const fullUrl = url.startsWith('/') ? `http://localhost:3002${url}` : url;
  return originalFetch(fullUrl, init);
};

// Mock FileReader for Node.js
class MockFileReader {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  result: string | null = null;
  error: Error | null = null;

  async readAsDataURL(blob: Blob) {
    try {
      const buffer = Buffer.from(await blob.arrayBuffer());
      this.result = `data:${blob.type};base64,${buffer.toString('base64')}`;
      if (this.onload) this.onload();
    } catch (e: any) {
      this.error = e;
      if (this.onerror) this.onerror();
    }
  }
}
globalThis.FileReader = MockFileReader as any;

const baseData: ContractData = {
  contractNumber: '6',
  signDate: '2026-05-29',
  dateIn: '2026-06-01',
  timeIn: '14:00',
  dateOut: '2026-06-05',
  timeOut: '12:00',
  nights: 4,
  guests: 2,
  cottageNumber: '№2',
  roomCategory: 'Стандарт',
  base: 'chunga-changa',
  totalRub: 20000,
  prepaymentRub: 5000,
  client: {
    fullName: 'Иванов Иван Иванович',
    dob: '1985-06-15',
    passport: '5112 345678',
    passportDate: '2010-08-20',
    passportIssuedBy: 'УМВД России по г. Мурманску',
    address: 'г. Мурманск, ул. Ленина, д. 1, кв. 5',
    phone: '+7 (911) 316-46-09',
    email: 'ivanov@mail.ru',
  }
};

async function generateAndVerify(data: ContractData, filename: string, expectedPages: number) {
  console.log(`Generating ${filename}...`);
  const blob = await generatePdfmeContractBlob(data, 'send');
  const buffer = Buffer.from(await blob.arrayBuffer());
  const filePath = `C:/Users/Make/.gemini/antigravity/brain/f93eae09-9a00-40af-8ef7-73b51a1a11a6/scratch/${filename}`;
  fs.writeFileSync(filePath, buffer);
  
  const pdfDoc = await PDFDocument.load(buffer);
  const actualPages = pdfDoc.getPageCount();
  console.log(`${filename} pages: ${actualPages} (Expected: ${expectedPages})`);
  if (actualPages !== expectedPages) {
    throw new Error(`Page count mismatch for ${filename}: got ${actualPages}, expected ${expectedPages}`);
  }
}

async function main() {
  console.log('Authenticating...');
  try {
    const { token } = await authApi.login('Make', '3552');
    setAuthToken(token);
    console.log('Authentication successful. Starting trace...');

    // 1. Big Bear (BM / chunga-changa base) - expected 6 pages
    const bmData = { ...baseData, base: 'chunga-changa' as const };
    await generateAndVerify(bmData, 'trace_bm.pdf', 6);

    // 2. Golubaya Bukhta (GB) - expected 4 pages
    const gbData = { ...baseData, base: 'golubaya-bukhta' as const };
    await generateAndVerify(gbData, 'trace_gb.pdf', 4);

    // 3. Banya (BK) - expected 4 pages
    const bkData = {
      ...baseData,
      base: 'chunga-changa' as const, // can be any base, but services.banya triggers banya template
      services: {
        banya: {
          timeFrom: '10:00',
          timeTo: '12:00',
        }
      }
    };
    await generateAndVerify(bkData, 'trace_bk.pdf', 4);

    console.log('ALL GENERATION TESTS PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('Error in trace:', err);
    process.exit(1);
  }
}

main();
