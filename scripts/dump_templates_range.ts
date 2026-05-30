import fs from 'fs';

function main() {
  const code = fs.readFileSync('D:/CRM Teriberka/CRM-main/CRM-main/src/utils/pdfmeTemplates.ts', 'utf8');
  const lines = code.split('\n');
  
  // Print lines 2050 to 2250
  const start = 2050;
  const end = 2250;
  console.log(`Lines ${start} to ${end}`);
  console.log(lines.slice(start - 1, end).join('\n'));
}

main();
