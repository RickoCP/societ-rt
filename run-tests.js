const { execSync } = require('child_process');
const fs = require('fs');
try {
  const result = execSync('npm test 2>&1', { encoding: 'utf8', maxBuffer: 100 * 1024 * 1024 });
  fs.writeFileSync('test-verify.txt', result);
  console.log('Tests completed');
} catch (e) {
  fs.writeFileSync('test-verify.txt', (e.stdout || '') + (e.stderr || ''));
  console.log('Tests failed');
}
