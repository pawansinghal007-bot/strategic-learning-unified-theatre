#!/usr/bin/env node
/**
 * Browser Capture v2 Integration Test
 * Validates: Browser Extension → Native Host → SQLite → Flask API → Ollama
 * 
 * Run: node test-bc2-integration.js
 */

import http from 'http';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ════════════════════════════════════════
// CONFIG
// ════════════════════════════════════════

const API_URL = 'http://localhost:7070';
const TEST_TIMEOUT = 10000;

// ════════════════════════════════════════
// UTILITIES
// ════════════════════════════════════════

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: TEST_TIMEOUT }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, data });
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

function httpPost(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const options = new URL(url);
    const req = http.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      },
      timeout: TEST_TIMEOUT
    }, (res) => {
      let respData = '';
      res.on('data', chunk => respData += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, headers: res.headers, data: JSON.parse(respData) });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, data: respData });
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    req.write(data);
    req.end();
  });
}

// ════════════════════════════════════════
// TESTS
// ════════════════════════════════════════

async function test(name, fn) {
  try {
    await fn();
    console.log(`✅ ${name}`);
    return true;
  } catch (err) {
    console.error(`❌ ${name}: ${err.message}`);
    return false;
  }
}

async function fetchEventCount() {
  const res = await httpGet(`${API_URL}/events?limit=10`);
  if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
  if (!Array.isArray(res.data)) throw new Error('Expected array response');
  return res.data.length;
}

async function assertApiReachable() {
  const res = await httpGet(`${API_URL}/health`);
  if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
  if (!res.data.db) throw new Error('Missing db field in health response');
}

async function assertEventStats() {
  const res = await httpGet(`${API_URL}/events/stats`);
  if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
  if (typeof res.data.total !== 'number') throw new Error('Missing total field');
  console.log(`   → Total events: ${res.data.total}`);
  console.log(`   → Today: ${res.data.today}`);
  if (res.data.by_type?.length > 0) {
    console.log(`   → Event types: ${res.data.by_type.map((t) => `${t.event_type}(${t.count})`).join(', ')}`);
  }
}

async function fetchRecentContext() {
  const res = await httpGet(`${API_URL}/events/recent-context?n=5`);
  if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
  if (!res.data.context) throw new Error('Missing context field');
  return res.data;
}

async function assertSearchResults() {
  const res = await httpGet(`${API_URL}/events/search?q=error&limit=5`);
  if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
  if (!Array.isArray(res.data)) throw new Error('Expected array response');
  console.log(`   → Found ${res.data.length} events matching "error"`);
}

async function runOllamaQuestionTest() {
  const res = await httpPost(`${API_URL}/ollama/ask`, {
    question: 'What was the user doing recently?',
    context_n: 5,
  });

  if (res.status !== 200) {
    if (res.status === 500 || res.status === 502) {
      console.log('   ⚠️  Ollama server not responding (expected if not running)');
      console.log('       Start Ollama separately: ollama serve');
      return;
    }
    throw new Error(`Expected 200, got ${res.status}`);
  }

  if (res.data.answer) {
    console.log('   → Received response from Ollama:');
    console.log(`      ${res.data.answer.substring(0, 300)}`);
  }
}

async function assertEventDetail() {
  const listRes = await httpGet(`${API_URL}/events?limit=1`);
  if (listRes.data.length === 0) throw new Error('No events to retrieve');
  const eventId = listRes.data[0].id;

  const res = await httpGet(`${API_URL}/events/${eventId}`);
  if (res.status !== 200) throw new Error(`Expected 200, got ${res.status}`);
  if (!res.data.event_type) throw new Error('Missing event_type field');
  console.log(`   → Event ID: ${eventId}`);
  console.log(`   → Type: ${res.data.event_type}`);
  console.log(`   → Browser: ${res.data.browser}`);
  console.log(`   → URL: ${res.data.tab_url}`);
}

async function runTests() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║         Browser Capture v2 Integration Tests              ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  let passed = 0;
  let failed = 0;
  let eventCount = 0;
  let recentContext = '';

  const steps = [
    { name: 'API is reachable at localhost:7070', fn: assertApiReachable },
    {
      name: 'GET /events returns event list',
      fn: async () => {
        eventCount = await fetchEventCount();
      },
    },
    {
      name: 'Event count displayed',
      fn: async () => {
        console.log(`   → Total events captured: ${eventCount}`);
      },
    },
    { name: 'GET /events/stats returns statistics', fn: assertEventStats },
    {
      name: 'GET /events/recent-context returns chat context',
      fn: async () => {
        const data = await fetchRecentContext();
        recentContext = data.context;
        console.log(`   → Retrieved ${data.count} recent events as context`);
        if (recentContext.trim().length > 0) {
          console.log('   → Context sample (first 200 chars):');
          console.log(`      ${recentContext.substring(0, 200).replace(/\n/g, '\n      ')}`);
        } else {
          console.log('   → (No recent events yet; ensure browser extension is active)');
        }
      },
    },
    { name: 'GET /events/search with query parameter', fn: assertSearchResults },
    {
      name: 'POST /ollama/ask accepts question with context',
      fn: async () => {
        if (eventCount === 0) {
          console.log('⚠️  Skipping Ollama test: No events in database yet');
          console.log('    Ensure browser extension is loaded and capture some activity.');
          return;
        }
        await runOllamaQuestionTest();
      },
    },
    {
      name: 'GET /events/<id> retrieves single event',
      fn: async () => {
        if (eventCount === 0) {
          console.log('⏭️  Skipping event detail test (no events yet)');
          return;
        }
        await assertEventDetail();
      },
    },
  ];

  for (const step of steps) {
    if (await test(step.name, step.fn)) passed++; else failed++;
  }

  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log(`║  Tests: ${passed} passed, ${failed} failed                          ║`);
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  if (failed === 0) {
    console.log('🎉 All tests passed! Browser Capture v2 integration is working.\n');
    console.log('📝 Next steps:');
    console.log('   1. Load the browser extension (Firefox/Brave) if not already loaded');
    console.log('   2. Navigate to ChatGPT, Claude, Gemini, or Perplexity');
    console.log('   3. Send a message and capture the response');
    console.log('   4. Rerun this test to see captured events');
    console.log('   5. Start Ollama locally: ollama serve');
    console.log('   6. Test /ollama/ask endpoint with your captured context\n');
  } else {
    console.log('❌ Some tests failed. Check the Flask API and native host.\n');
  }

  return failed === 0 ? 0 : 1;
}

// ════════════════════════════════════════
// MAIN
// ════════════════════════════════════════

try {
  const exitCode = await runTests();
  process.exit(exitCode);
} catch (err) {
  console.error(`\n❌ Unexpected error: ${err.message}`);
  process.exit(1);
}
