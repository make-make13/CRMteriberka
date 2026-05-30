import fs from 'fs';

async function main() {
  const pdfPath = 'C:/Users/Make/.gemini/antigravity/brain/f93eae09-9a00-40af-8ef7-73b51a1a11a6/scratch/trace_out.pdf';
  if (!fs.existsSync(pdfPath)) {
    console.error('PDF file does not exist');
    return;
  }

  const buf = fs.readFileSync(pdfPath);
  
  // Try importing from @pdfme/pdf-lib
  let PDFDocument;
  try {
    const pdfLib = await import('@pdfme/pdf-lib');
    PDFDocument = pdfLib.PDFDocument;
    console.log('Loaded @pdfme/pdf-lib');
  } catch (e: any) {
    try {
      // @ts-ignore
      const pdfLib = await import('pdf-lib');
      PDFDocument = pdfLib.PDFDocument;
      console.log('Loaded pdf-lib');
    } catch (e2: any) {
      console.error('Could not load pdf-lib or @pdfme/pdf-lib', e, e2);
      return;
    }
  }

  if (PDFDocument) {
    const pdfDoc = await PDFDocument.load(buf);
    console.log('--- VERIFICATION SUCCESS ---');
    console.log('Page count:', pdfDoc.getPageCount());
    const pages = pdfDoc.getPages();
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const { width, height } = page.getSize();
      console.log(`Page ${i + 1} size: ${width}x${height}`);
    }
  }
}

main().catch(console.error);
