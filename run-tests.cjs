const { execSync } = require('child_process');
const { readdirSync } = require('fs');
const path = require('path');

const tests = readdirSync('tests').filter(f => f.endsWith('.test.js'));

for (const test of tests) {
  console.log('RUNNING:', test);

  try {
    execSync(
      `npx vitest run "${path.join('tests', test)}" --maxWorkers 1`,
      { stdio: 'inherit' }
    );

  } catch (err) {
    console.error('FAILED:', test);
    process.exit(1);
  }
}

console.log('ALL TESTS PASSED');
