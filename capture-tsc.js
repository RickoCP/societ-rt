const { execSync } = require('child_process');
const fs = require('fs');

try {
  const result = execSync('npx tsc --noEmit', { 
    encoding: 'utf8', 
    maxBuffer: 50 * 1024 * 1024,
    timeout: 300000,
    cwd: process.cwd()
  });
  fs.writeFileSync('tsc-output.txt', result + '\n[EXIT_CODE: 0]');
  console.log('TSC completed with exit code 0');
} catch (e) {
  const output = (e.stdout || '') + '\n' + (e.stderr || '');
  fs.writeFileSync('tsc-output.txt', output + '\n[EXIT_CODE: ' + (e.status || 'unknown') + ']');
  console.log('TSC completed with errors, check tsc-output.txt');
}
