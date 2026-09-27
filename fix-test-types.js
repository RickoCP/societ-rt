/**
 * Script to fix TypeScript errors in security test files.
 * 
 * Patterns to fix:
 * 1. mockRepository.createCalls[0].xyz -> Add null check
 * 2. result.data.xyz (without success check) -> Add success check
 * 3. result.error.xyz (without success check) -> Add success check
 */

const fs = require('fs');
const path = require('path');

const testFiles = [
  'src/core/domains/audit/services/__tests__/AuditSecurityEventsService.test.ts',
  'src/core/domains/audit/services/__tests__/TenantDataIsolationAuditService.test.ts',
  'src/core/domains/authorization/services/__tests__/CrossTenantPreventionService.test.ts',
  'src/infrastructure/auth/__tests__/RefreshTokenSecurityService.test.ts',
];

function addNullCheckToArrayAccess(content) {
  // Pattern: const call = mockRepository.createCalls[0];
  // followed by expect(call.xyz)
  // Change to: const call = mockRepository.createCalls[0]; if (call) { expect(call.xyz) }
  
  // This is complex to do with simple regex, so we'll handle it differently
  return content;
}

function fixDomainResultAccess(content) {
  // Pattern: expect(result.data.xyz) without preceding if (result.success)
  // This is also complex to fix with regex
  return content;
}

// For now, just report what needs to be fixed
testFiles.forEach(file => {
  const fullPath = path.join(__dirname, file);
  if (fs.existsSync(fullPath)) {
    const content = fs.readFileSync(fullPath, 'utf8');
    const lines = content.split('\n');
    
    let issues = [];
    lines.forEach((line, index) => {
      // Check for direct array access that might be undefined
      if (line.match(/createCalls\[0\]\.\w+/) && !line.includes('if (')) {
        issues.push({ line: index + 1, issue: 'Array access without null check', text: line.trim() });
      }
      // Check for result.data access without success check
      if (line.match(/result\.data\??\.\w+/) && !line.includes('if (result.success)')) {
        // Check if there's a success check in the previous few lines
        const prevLines = lines.slice(Math.max(0, index - 5), index).join('\n');
        if (!prevLines.includes('if (result.success)') && !prevLines.includes('result.success).toBe(true)')) {
          // issues.push({ line: index + 1, issue: 'result.data without success check', text: line.trim() });
        }
      }
    });
    
    console.log(`\n${file}:`);
    console.log(`  Issues found: ${issues.length}`);
    issues.slice(0, 5).forEach(i => console.log(`  Line ${i.line}: ${i.issue}`));
  }
});

console.log('\nNote: Manual fixes needed for proper TypeScript type narrowing.');
