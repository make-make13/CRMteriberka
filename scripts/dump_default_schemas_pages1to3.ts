import { createDefaultChungaChangaContractPdfmeTemplate } from '../src/utils/pdfmeTemplates';

function main() {
  const template = createDefaultChungaChangaContractPdfmeTemplate();
  console.log('Total contract pages:', template.schemas.length);
  const endPage = Math.min(3, template.schemas.length);
  for (let i = 0; i < endPage; i++) {
    console.log(`\n--- PAGE ${i+1} ---`);
    for (const schema of template.schemas[i]) {
      console.log(`Field: ${schema.name}, Type: ${schema.type}`);
      if (schema.type === 'text' || schema.type === 'multiVariableText') {
        console.log('  Content:', String(schema.content).replace(/\n/g, '\\n'));
      }
    }
  }
}

main();
