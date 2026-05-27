#!/usr/bin/env node
/**
 * Browser Capture v2 Diagnostics
 * Checks database initialization and Flask API health
 */

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const DB_PATH = join(homedir(), 'AppData', 'Roaming', 'BrowserCapture', 'capture.db');
const SCHEMA_PATH = 'c:\\SW Development\\VS Code Agent\\files\\bc2-native-host\\native-host\\schema.sql';

console.log('\n╔════════════════════════════════════════════════════════════╗');
console.log('║         Browser Capture v2 Diagnostics                     ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

// ────────────────────────────────────────
// 1. Check database file
// ────────────────────────────────────────
console.log('📁 Database File Check\n');
console.log(`Expected path: ${DB_PATH}`);
console.log(`File exists: ${existsSync(DB_PATH) ? '✅ YES' : '❌ NO'}`);

if (!existsSync(DB_PATH)) {
  console.log('\n⚠️  Database file not found!');
  console.log('   Ensure native host has been run at least once to initialize it.\n');
}

// ────────────────────────────────────────
// 2. Check schema file
// ────────────────────────────────────────
console.log('📄 Schema File Check\n');
console.log(`Expected path: ${SCHEMA_PATH}`);
console.log(`File exists: ${existsSync(SCHEMA_PATH) ? '✅ YES' : '❌ NO'}`);

// ────────────────────────────────────────
// 3. Flask API error inspection
// ────────────────────────────────────────
console.log('\n🔍 Flask API Error Inspection\n');
console.log('To see Flask error logs, check the terminal where api.py was started.');
console.log('Common issues:');
console.log('  1. Database schema not initialized (run native host first)');
console.log('  2. Python SQLite3 import error');
console.log('  3. Database file permissions issue\n');

// ────────────────────────────────────────
// 4. Suggest fixes
// ────────────────────────────────────────
console.log('✅ Troubleshooting Steps\n');
console.log('1. Ensure browser extension has captured some events:');
console.log('   - Load Firefox or Brave with the extension');
console.log('   - Navigate to ChatGPT, Claude, Gemini, or Perplexity');
console.log('   - Send a message and capture a response\n');

console.log('2. Check if native host is running:');
console.log('   - The native host should initialize the database on first run');
console.log('   - Events from the browser extension are sent here\n');

console.log('3. Verify Flask API logs:');
console.log('   - The terminal where "python api.py" was started should show errors');
console.log('   - Look for SQLite errors or schema issues\n');

console.log('4. If database schema is missing, reinitialize:');
console.log('   - Delete: ' + DB_PATH);
console.log('   - Run the browser extension again (will recreate and initialize schema)\n');

console.log('5. Test direct Python SQLite access (for debugging):');
console.log('   Check database tables with:');
console.log(`   python3 -c "import sqlite3; db=sqlite3.connect('${DB_PATH}'); cursor=db.execute('SELECT name FROM sqlite_master WHERE type=\"table\"'); print([row[0] for row in cursor])"`);
console.log('\n');
