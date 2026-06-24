import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve('data/crm.sqlite');
const db = new Database(dbPath);

console.log('\n--- ALL BOOKINGS ---');
const bookings = db.prepare('SELECT * FROM bookings').all();
console.log(JSON.stringify(bookings, null, 2));

console.log('\n--- ALL CONTRACTS ---');
const contracts = db.prepare('SELECT id, number, base_type, status FROM contracts').all();
console.log(JSON.stringify(contracts, null, 2));

db.close();
