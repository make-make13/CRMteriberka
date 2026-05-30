import fs from 'fs';

function main() {
  const code = fs.readFileSync('D:/CRM Teriberka/CRM-main/CRM-main/src/utils/pdfmeTemplates.ts', 'utf8');
  const lines = code.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('isBm') || lines[i].includes('isBM') || lines[i].includes('BM') || lines[i].includes('bm_')) {
      if (lines[i].includes('isBm') || lines[i].includes('isBM') || lines[i].includes('bm_s')) {
        console.log(`Line ${i+1}: ${lines[i].trim()}`);
      }
    }
  }
}

main();
