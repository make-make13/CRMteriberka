import * as pdfmeTemplates from '../src/utils/pdfmeTemplates';

function main() {
  console.log('Exports from pdfmeTemplates:');
  console.log(Object.keys(pdfmeTemplates).filter(k => k.includes('Cc') || k.includes('Gb') || k.includes('Chunga')));
}

main();
