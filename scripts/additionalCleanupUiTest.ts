import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/components/additional/Additional.tsx', import.meta.url), 'utf8');

assert.ok(source.includes('Задачи'), 'Additional section should keep tasks');
assert.ok(source.includes('Архив задач'), 'Additional section should keep task archive');
assert.ok(source.includes('Заявление на возврат'), 'Additional section should keep return application');

assert.equal(source.includes('GiftCertificateModal'), false, 'Additional section must not import or render gift certificate modal');
assert.equal(source.includes('isGiftCertificateOpen'), false, 'Additional section must not keep gift certificate state');
assert.equal(source.includes('setIsGiftCertificateOpen'), false, 'Additional section must not open gift certificate actions');
assert.equal(source.includes('Сертификат ГБ'), false, 'Additional section must not show GB certificate');
assert.equal(source.includes('Подарочный'), false, 'Additional section must not show gift certificate labels');

console.log('additional cleanup UI tests passed');
