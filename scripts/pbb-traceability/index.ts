#!/usr/bin/env npx tsx
/**
 * PBB Task Traceability Generator & Validator CLI
 *
 * Usage:
 *   npx tsx scripts/pbb-traceability/index.ts generate  # Generate matrix
 *   npx tsx scripts/pbb-traceability/index.ts validate  # Validate only
 *   npx tsx scripts/pbb-traceability/index.ts           # Generate then validate
 *
 * Exit codes:
 *   0 - Validation passed
 *   1 - Validation failed
 *   2 - Error during execution
 *
 * @see EV-001 through EV-026
 */

import * as path from 'path';
import { parseTasksFile, parseRequirementsFile } from './parser';
import {
  generateTraceabilityMatrix,
  formatMatrixAsMarkdown,
  updateTasksFile,
} from './generator';
import { validate, formatValidationReport } from './validator';

const SCRIPT_NAME = 'pbb-traceability';
const SPECS_DIR = '.kiro/specs/pbb-ai';

function log(message: string): void {
  console.log(`[${SCRIPT_NAME}] ${message}`);
}

function error(message: string): void {
  console.error(`[${SCRIPT_NAME}] ERROR: ${message}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0] || 'all';

  const projectRoot = process.cwd();
  const tasksPath = path.join(projectRoot, SPECS_DIR, 'tasks.md');
  const requirementsPath = path.join(projectRoot, SPECS_DIR, 'requirements.md');

  log(`Tasks file: ${tasksPath}`);
  log(`Requirements file: ${requirementsPath}`);
  log('');

  try {
    // Parse requirements first
    log('Parsing requirements.md...');
    const { requirements, counts } = parseRequirementsFile(requirementsPath);
    log(`  Found ${counts.total} requirements (${counts.p0} P0, ${counts.p1} P1, ${counts.p2} P2)`);

    // Parse tasks
    log('Parsing tasks.md...');
    const { tasks, errors: parseErrors } = parseTasksFile(tasksPath);
    log(`  Found ${tasks.size} tasks`);

    if (parseErrors.length > 0) {
      log('');
      log('PARSE ERRORS (must be fixed before generation):');
      for (const err of parseErrors) {
        error(err);
      }
      process.exit(2);
    }

    // Generate if requested
    if (command === 'generate' || command === 'all') {
      log('');
      log('Generating traceability matrix...');

      const allReqIds = Array.from({ length: 74 }, (_, i) =>
        `PBB-REQ-${String(i + 1).padStart(3, '0')}`,
      );

      const matrix = generateTraceabilityMatrix(tasks, allReqIds);
      const matrixMarkdown = formatMatrixAsMarkdown(matrix);

      log('Writing matrix to tasks.md...');
      updateTasksFile(tasksPath, matrixMarkdown);
      log('Matrix written successfully.');
    }

    // Validate
    if (command === 'validate' || command === 'all') {
      log('');
      log('Validating traceability (re-reading saved file)...');

      const result = validate(tasks, requirements, tasksPath);

      console.log('');
      console.log(formatValidationReport(result));

      if (!result.passed) {
        process.exit(1);
      }

      log('');
      log('TASK PLAN VERIFICATION: PASS');
      log('');
      log('requirements.md v1.4');
      log('  APPROVED / FROZEN');
      log('');
      log('design.md v1.4');
      log('  APPROVED / FROZEN');
      log('');
      log('tasks.md v2.2.8');
      log('  READY FOR OWNER IMPLEMENTATION APPROVAL');
      log('');
      log('IMPLEMENTATION');
      log('  NOT AUTHORIZED');
    }

    process.exit(0);
  } catch (err) {
    error(String(err));
    process.exit(2);
  }
}

main();
