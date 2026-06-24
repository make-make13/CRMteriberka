import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
  scripts?: Record<string, string>;
};
const builderConfig = fs.readFileSync(path.join(root, 'electron-builder.yml'), 'utf8');
const dbSource = fs.readFileSync(path.join(root, 'server', 'localDatabase.ts'), 'utf8');
const tsupConfig = fs.readFileSync(path.join(root, 'tsup.config.ts'), 'utf8');

assert.ok(
  fs.existsSync(path.join(root, 'scripts', 'preparePackagedDefaults.mjs')),
  'Installer build must generate packaged defaults from local env without committing .env.local.',
);

assert.match(
  packageJson.scripts?.['prepare:packaged-defaults'] || '',
  /preparePackagedDefaults\.mjs/,
  'package.json must expose prepare:packaged-defaults.',
);
assert.match(
  packageJson.scripts?.['electron:pack'] || '',
  /prepare:packaged-defaults/,
  'electron:pack must embed packaged defaults before electron-builder runs.',
);
assert.match(
  packageJson.scripts?.['electron:installer'] || '',
  /prepare:packaged-defaults/,
  'electron:installer must embed packaged defaults before electron-builder runs.',
);

assert.match(
  builderConfig,
  /build\/packaged-default-settings\.json/,
  'electron-builder must include generated packaged-default-settings.json in the app.',
);

assert.match(
  dbSource,
  /loadPackagedDefaultSettings/,
  'LocalDatabase must load packaged default settings at startup.',
);
assert.match(
  dbSource,
  /packaged-default-settings\.json/,
  'LocalDatabase must read the generated packaged defaults file.',
);
assert.match(
  dbSource,
  /packagedDefaults\.integrations/,
  'Default integration settings must be seeded from packaged defaults.',
);
assert.match(
  dbSource,
  /packagedDefaults\.email/,
  'Default email settings must be seeded from packaged defaults.',
);

for (const key of ['SUPABASE_SERVICE_ROLE_KEY', 'SMTP_PASSWORD']) {
  assert.doesNotMatch(
    tsupConfig,
    new RegExp(`process\\.env\\.${key}['"]\\s*:`),
    `tsup must not inline ${key}; packaged defaults file is the explicit installer secret carrier.`,
  );
}

console.log('packaged defaults embedding checks passed.');
