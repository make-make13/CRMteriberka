import fs from 'fs';

function main() {
  const code = fs.readFileSync('D:/CRM Teriberka/CRM-main/CRM-main/src/utils/pdfmeTemplates.ts', 'utf8');
  const lines = code.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('cc_contract_header')) {
      console.log(`Line ${i+1}: ${lines[i].trim()}`);
      // Print next 5 lines
      for (let j = 1; j <= 5; j++) {
        if (i + j < lines.length) {
          console.log(`Line ${i+j+1}: ${lines[i+j].trim()}`);
        }
      }
    }
  }
}

main();
