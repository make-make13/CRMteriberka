import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('..', import.meta.url);
const rootPath = fileURLToPath(root);
const read = (relativePath: string) => fs.readFileSync(new URL(relativePath, root), 'utf8');

const appSource = read('src/App.tsx');
const clientsSource = read('src/components/clients/Clients.tsx');
const clientModalSource = read('src/components/clients/ClientModal.tsx');
const additionalSource = read('src/components/additional/Additional.tsx');
const contractsSource = read('src/components/contracts/Contracts.tsx');
const contractModalSource = read('src/components/contracts/ContractModal.tsx');
const settingsSource = read('src/components/settings/SettingsView.tsx');

assert.ok(appSource.includes("label: 'Гости'"), 'Navigation should show guests');
assert.equal(appSource.includes("label: 'Клиенты'"), false, 'Navigation should not show legacy clients label');

assert.ok(clientsSource.includes('<h2 className="text-2xl font-bold">Гости</h2>'), 'Guests page title should be visible');
assert.ok(clientsSource.includes('Добавить гостя'), 'Guests page should use guest add label');
assert.equal(clientsSource.includes('Клиенты'), false, 'Guests page should not show legacy clients heading text');
assert.equal(clientsSource.includes('Добавить клиента'), false, 'Guests page should not show legacy add-client label');

assert.ok(clientModalSource.includes('Новый гость'), 'Client modal should use new guest label');
assert.ok(clientModalSource.includes('Редактировать гостя'), 'Client modal should use edit guest label');
assert.ok(clientModalSource.includes('Карточка гостя'), 'Client modal should use guest card label');
assert.equal(clientModalSource.includes('Новый клиент'), false, 'Client modal should not show new-client label');
assert.equal(clientModalSource.includes('Редактировать клиента'), false, 'Client modal should not show edit-client label');

assert.equal(additionalSource.includes('GiftCertificateModal'), false, 'Additional must not import gift certificate modal');
assert.equal(additionalSource.includes('Сертификат ГБ'), false, 'Additional must not show GB certificate');
assert.ok(additionalSource.includes('Задачи'), 'Additional should keep tasks');
assert.ok(additionalSource.includes('Заявление на возврат'), 'Additional should keep return application');

assert.equal(contractsSource.includes('Все базы'), false, 'Contracts list should not show all-bases filter');
assert.equal(contractsSource.includes('Чунга-Чанга'), false, 'Contracts list should not show Chunga-Changa');
assert.equal(contractsSource.includes('Голубая Бухта'), false, 'Contracts list should not show Golubaya Bukhta');
assert.equal(contractModalSource.includes('Чунга-Чанга'), false, 'Contract modal should not show Chunga-Changa in ordinary UI');
assert.equal(contractModalSource.includes('Голубая Бухта'), false, 'Contract modal should not show Golubaya Bukhta in ordinary UI');

assert.equal(settingsSource.includes('Адрес объекта (Чунга-Чанга)'), false, 'Settings should not show Chunga-Changa object label');
assert.equal(settingsSource.includes('Адрес объекта (Голубая Бухта)'), false, 'Settings should not show Golubaya Bukhta object label');

assert.equal(fs.existsSync(path.join(rootPath, 'src/components/contracts/GiftCertificateModal.tsx')), false, 'Unused GiftCertificateModal file should be removed');
assert.equal(fs.existsSync(path.join(rootPath, 'src/utils/giftCertificates.ts')), false, 'Unused gift certificate helpers should be removed');

console.log('hotel UI cleanup tests passed');
