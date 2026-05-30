import fs from 'fs';

function main() {
  const code = fs.readFileSync('D:/CRM Teriberka/CRM-main/CRM-main/src/utils/pdfmeTemplates.ts', 'utf8');
  const lines = code.split('\n');
  console.log(lines.slice(1440, 1490).join('\n'));
}

main();
