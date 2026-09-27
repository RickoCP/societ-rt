const fs = require('fs');
const content = fs.readFileSync('tsc-result.txt', 'utf8');
const lines = content.split('\n');

// Count errors by path prefix
const srcErrors = lines.filter(l => /^src\/.*error TS/.test(l)).length;
const scriptErrors = lines.filter(l => /^scripts\/.*error TS/.test(l)).length;
const nextErrors = lines.filter(l => /^\.next\/.*error TS/.test(l)).length;
const totalErrors = lines.filter(l => /error TS/.test(l)).length;

console.log('=== TypeScript Error Summary ===');
console.log('Source (src/) errors:', srcErrors);
console.log('Script (scripts/) errors:', scriptErrors);
console.log('.next/ errors:', nextErrors);
console.log('Total errors:', totalErrors);
console.log('');
console.log('Last 5 lines:');
lines.slice(-5).forEach(l => console.log(l));
