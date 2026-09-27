const { execSync } = require('child_process');
const fs = require('fs');

try {
  const output = execSync('npx tsc --noEmit 2>&1', { 
    encoding: 'utf8', 
    maxBuffer: 50 * 1024 * 1024,
    cwd: process.cwd()
  });
  const lines = output.split('\n').filter(l => 
    l.includes('Security') || 
    l.includes('CrossTenant') || 
    l.includes('TenantDataIsolation') ||
    l.includes('RefreshToken')
  );
  fs.writeFileSync('tsc-security-check.txt', lines.join('\n') || 'No security-related errors found');
} catch(e) {
  const output = e.stdout || e.message || '';
  const lines = output.split('\n').filter(l => 
    l.includes('Security') || 
    l.includes('CrossTenant') || 
    l.includes('TenantDataIsolation') ||
    l.includes('RefreshToken')
  );
  fs.writeFileSync('tsc-security-check.txt', lines.join('\n') || 'No security-related errors found');
}
