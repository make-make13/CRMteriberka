import fs from 'fs';

function main() {
  const code = fs.readFileSync('D:/CRM Teriberka/CRM-main/CRM-main/src/utils/pdfmeTemplates.ts', 'utf8');
  const lines = code.split('\n');
  let startLine = -1;
  let endLine = -1;
  
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('const CC_LAYOUT_OVERRIDES')) {
      startLine = i;
      break;
    }
  }

  if (startLine !== -1) {
    // Show 60 lines starting from startLine
    endLine = Math.min(lines.length, startLine + 80);
    console.log(`Lines ${startLine+1} to ${endLine}`);
    console.log(lines.slice(startLine, endLine).join('\n'));
  } else {
    console.log('Not found');
  }
}

main();
