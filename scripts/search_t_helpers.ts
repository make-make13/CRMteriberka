import fs from 'fs';

function main() {
  const code = fs.readFileSync('D:/CRM Teriberka/CRM-main/CRM-main/src/utils/pdfmeTemplates.ts', 'utf8');
  const lines = code.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('function t(') || lines[i].startsWith('function mvt(')) {
      console.log(`Line ${i+1}: ${lines[i].trim()}`);
      for (let j = 1; j <= 20; j++) {
        console.log(`Line ${i+j+1}: ${lines[i+j].trim()}`);
      }
    }
  }
}

main();
