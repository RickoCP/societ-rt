const { execSync } = require('child_process');
const fs = require('fs');
try {
  const result = execSync('npx tsc --noEmit 2>&1', { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });
  fs.writeFileSync('tsc-result.txt', result + '\nEXIT_CODE: 0');
} catch (e) {
  fs.writeFileSync('tsc-result.txt', (e.stdout || '') + (e.stderr || '') + '\nEXIT_CODE: ' + e.status);
}
