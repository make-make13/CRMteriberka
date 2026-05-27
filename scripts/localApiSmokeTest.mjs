const baseUrl = process.env.LOCAL_API_BASE_URL || 'http://localhost:3001';
const stamp = Date.now();

const ids = {
  client: `codex-test-client-${stamp}`,
  contract: `codex-test-contract-${stamp}`,
  conflictContract: `codex-test-conflict-${stamp}`,
};

let authToken = '';

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const error = new Error(body?.error || `${response.status} ${response.statusText}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }

  return body;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const now = new Date().toISOString();
const client = {
  id: ids.client,
  type: 'physical',
  firstName: 'Codex',
  lastName: 'Test',
  middleName: 'Api',
  birthDate: '1990-01-01',
  phone: '+70000000000',
  email: 'codex-test@example.com',
  passportSeries: '0000',
  passportNumber: '000000',
  passportIssuedBy: 'Local API smoke test',
  passportIssueDate: '2020-01-01',
  registrationAddress: 'Local API smoke test',
  isBlacklisted: false,
  createdAt: now,
};

const contract = {
  id: ids.contract,
  number: `TEST-${stamp}`,
  clientId: ids.client,
  baseType: 'golubaya-bukhta',
  status: 'pre_booking',
  totalAmount: 10000,
  prepayment: 1000,
  remainder: 9000,
  createdAt: now,
  dateSigned: '2035-01-01',
  guestsCount: 2,
  bookings: [{
    id: `codex-test-booking-${stamp}`,
    contractId: ids.contract,
    objectId: 'gb-bath',
    baseType: 'golubaya-bukhta',
    startTime: '2035-01-10T12:00:00.000Z',
    endTime: '2035-01-12T10:00:00.000Z',
    type: 'service',
    price: 10000,
  }],
};

const conflictContract = {
  ...contract,
  id: ids.conflictContract,
  number: `TEST-CONFLICT-${stamp}`,
  totalAmount: 5000,
  prepayment: 0,
  remainder: 5000,
  bookings: [{
    id: `codex-test-conflict-booking-${stamp}`,
    contractId: ids.conflictContract,
    objectId: 'gb-bath',
    baseType: 'golubaya-bukhta',
    startTime: '2035-01-11T12:00:00.000Z',
    endTime: '2035-01-13T10:00:00.000Z',
    type: 'service',
    price: 5000,
  }],
};

async function cleanup() {
  await Promise.allSettled([
    request(`/api/contracts/${ids.contract}`, { method: 'DELETE' }),
    request(`/api/contracts/${ids.conflictContract}`, { method: 'DELETE' }),
    request(`/api/clients/${ids.client}`, { method: 'DELETE' }),
  ]);
}

try {
  const health = await request('/api/health');
  assert(health.ok === true, 'Health endpoint did not return ok=true');

  const login = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      login: process.env.LOCAL_API_LOGIN || 'Make',
      password: process.env.LOCAL_API_PASSWORD || '3552',
    }),
  });
  authToken = login.token;
  assert(Boolean(authToken), 'Auth endpoint did not return a token');
  assert(login.manager?.role === 'admin', 'Smoke test requires an admin manager');

  const savedClient = await request('/api/clients', {
    method: 'POST',
    body: JSON.stringify(client),
  });
  assert(savedClient.id === ids.client, 'Client was not saved');

  const savedContract = await request('/api/contracts', {
    method: 'POST',
    body: JSON.stringify(contract),
  });
  assert(savedContract.id === ids.contract, 'Contract was not saved');
  assert(savedContract.bookings?.[0]?.objectId === 'gb-bath', 'Service id was not preserved as gb-bath');

  let conflictStatus = null;
  try {
    await request('/api/contracts', {
      method: 'POST',
      body: JSON.stringify(conflictContract),
    });
  } catch (error) {
    conflictStatus = error.status;
  }
  assert(conflictStatus === 409, `Expected booking conflict status 409, got ${conflictStatus}`);

  const contracts = await request('/api/contracts');
  assert(contracts.some(item => item.id === ids.contract), 'Created contract is missing from list');
  assert(!contracts.some(item => item.id === ids.conflictContract), 'Conflicting contract was saved');

  const backup = await request('/api/backups', { method: 'POST' });
  assert(backup.success === true && backup.path, 'Backup endpoint did not create a backup');

  console.log('Local API smoke test passed.');
  console.log(`Backup: ${backup.path}`);
} finally {
  await cleanup();
}
