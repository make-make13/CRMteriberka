import { createDefaultChungaChangaContractPdfmeTemplate } from '../src/utils/pdfmeTemplates';

function main() {
  console.log('--- PAGE 1 FIELDS ---');
  const template = createDefaultChungaChangaContractPdfmeTemplate();
  const schemas = template.schemas[0];
  for (const schema of schemas) {
    console.log(`Field: ${schema.name}, Type: ${schema.type}`);
    if (schema.type === 'text' || schema.type === 'multiVariableText') {
      console.log('  Content:', String(schema.content).replace(/\n/g, '\\n'));
    }
  }
}

main();
