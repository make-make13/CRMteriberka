import fs from 'fs';

function main() {
  const code = fs.readFileSync('D:/CRM Teriberka/CRM-main/CRM-main/src/utils/pdfmeTemplates.ts', 'utf8');
  const lines = code.split('\n');
  
  let currentFunc = '';
  let funcLines: string[] = [];
  let braceCount = 0;
  let inFunc = false;

  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!inFunc) {
      if (line.includes('function createCcContractPage') || line.includes('function createGbContractPage')) {
        inFunc = true;
        currentFunc = line;
        funcLines = [line];
        braceCount = (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
      }
    } else {
      funcLines.push(line);
      braceCount += (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
      if (braceCount === 0) {
        inFunc = false;
        result.push(funcLines.join('\n'));
      }
    }
  }

  fs.writeFileSync('C:/Users/Make/.gemini/antigravity/brain/f93eae09-9a00-40af-8ef7-73b51a1a11a6/scratch/extracted_page_functions.txt', result.join('\n\n'));
  console.log('Done! Extracted functions count:', result.length);
}

main();
