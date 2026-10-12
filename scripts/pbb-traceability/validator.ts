#!/usr/bin/env npx tsx
/**
 * PBB Traceability Validator
 * Validates bidirectional traceability between task metadata and matrix.
 * @see EV-011, EV-012, EV-013, EV-014, EV-015, EV-016
 */

import * as fs from 'fs';
import type { ParsedTask, ParsedRequirement, ValidationResult } from './types';
import { parseTraceabilityMatrix } from './parser';

const OWNER_DECISION_PREFIXES = ['O-00', 'O-01', 'OPEN-Q-'];

export function validate(
  tasks: Map<number, ParsedTask>,
  requirements: Map<string, ParsedRequirement>,
  tasksFilePath: string,
): ValidationResult {
  const result: ValidationResult = {
    passed: true,
    tasksParsed: tasks.size,
    requirementsParsed: requirements.size,
    checkpointCount: 0,
    securityTestCount: 0,
    mappedPairs: 0,
    matrixPairs: 0,
    taskToMatrixMissing: [],
    matrixToTaskStale: [],
    securityMissing: [],
    securityStale: [],
    p0WithoutTasks: [],
    ownerDecisionLeaks: [],
    dependencyErrors: [],
    versionErrors: [],
    checkpointsWithRequirements: [],
    checkpointsWithValidationScope: [],
    checkpointsWithoutMetadata: [],
  };

  // Re-read file to parse saved matrix
  const content = fs.readFileSync(tasksFilePath, 'utf-8');
  const matrixTasks = parseTraceabilityMatrix(content);

  // Build expected requirement->tasks map from task metadata
  const expectedReqTasks = new Map<string, Set<number>>();
  for (const reqId of requirements.keys()) {
    expectedReqTasks.set(reqId, new Set());
  }

  // Classify tasks and build expected map
  for (const [taskId, task] of tasks) {
    if (task.isCheckpoint) {
      result.checkpointCount++;
      if (task.requirements.size > 0) {
        result.checkpointsWithRequirements.push(taskId);
      } else if (task.validationScope) {
        result.checkpointsWithValidationScope.push(taskId);
      } else {
        result.checkpointsWithoutMetadata.push(taskId);
      }
    }

    if (task.isSecurityCriticalTest) {
      result.securityTestCount++;
    }

    // Add to expected map
    for (const reqId of task.requirements) {
      const set = expectedReqTasks.get(reqId);
      if (set) {
        set.add(taskId);
        result.mappedPairs++;
      }

      // Check for owner decision leaks
      for (const prefix of OWNER_DECISION_PREFIXES) {
        if (reqId.startsWith(prefix)) {
          result.ownerDecisionLeaks.push(`Task ${taskId} has owner decision ${reqId} in requirements`);
          result.passed = false;
        }
      }
    }
  }

  // Count matrix pairs
  for (const tasks of matrixTasks.values()) {
    result.matrixPairs += tasks.size;
  }

  // EV-012: Bidirectional validation
  // 1. TASK→MATRIX: Every task requirement should be in matrix
  for (const [reqId, expectedTasks] of expectedReqTasks) {
    const actualTasks = matrixTasks.get(reqId) ?? new Set();

    for (const taskId of expectedTasks) {
      if (!actualTasks.has(taskId)) {
        const task = tasks.get(taskId)!;
        result.taskToMatrixMissing.push({
          requirement: reqId,
          taskId,
          taskMetadata: Array.from(task.requirements).join(', '),
        });
        result.passed = false;
      }
    }
  }

  // 2. MATRIX→TASK: Every matrix task should have that requirement in metadata
  for (const [reqId, actualTasks] of matrixTasks) {
    const expectedTasks = expectedReqTasks.get(reqId) ?? new Set();

    for (const taskId of actualTasks) {
      if (!expectedTasks.has(taskId)) {
        const task = tasks.get(taskId);
        const metadata = task ? Array.from(task.requirements).join(', ') : 'TASK NOT FOUND';
        result.matrixToTaskStale.push({
          requirement: reqId,
          taskId,
          taskMetadata: metadata,
        });
        result.passed = false;
      }
    }
  }

  // EV-013: Security test validation
  for (const [reqId, expectedTasks] of expectedReqTasks) {
    const expectedSecurity = new Set(Array.from(expectedTasks).filter((t) => t >= 186 && t <= 201));

    // Parse security tests from matrix (would need to add this to parser)
    // For now, check that security tasks are in main tasks column
    for (const taskId of expectedSecurity) {
      const actualTasks = matrixTasks.get(reqId) ?? new Set();
      if (!actualTasks.has(taskId)) {
        result.securityMissing.push({ requirement: reqId, taskId });
        result.passed = false;
      }
    }
  }

  // EV-014: P0 coverage
  for (const [reqId, req] of requirements) {
    if (req.priority === 'P0') {
      const mappedTasks = expectedReqTasks.get(reqId);
      if (!mappedTasks || mappedTasks.size === 0) {
        result.p0WithoutTasks.push(reqId);
        result.passed = false;
      }
    }
  }

  // EV-016: Dependency validation
  const allTaskIds = new Set(tasks.keys());
  for (const [taskId, task] of tasks) {
    for (const depId of task.dependencies) {
      if (!allTaskIds.has(depId)) {
        result.dependencyErrors.push(`Task ${taskId} depends on non-existent Task ${depId}`);
        result.passed = false;
      }
      if (depId >= taskId) {
        result.dependencyErrors.push(`Task ${taskId} has forward dependency on Task ${depId}`);
        result.passed = false;
      }
    }
  }

  // EV-018: Version validation
  const headerVersionMatch = content.match(/\|\s*Version\s*\|\s*(\d+\.\d+\.\d+)\s*\|/);
  if (headerVersionMatch) {
    const headerVersion = headerVersionMatch[1];
    if (headerVersion !== '2.2.8') {
      result.versionErrors.push(`Header version ${headerVersion} should be 2.2.8`);
      result.passed = false;
    }
  }

  return result;
}

export function formatValidationReport(result: ValidationResult): string {
  const lines: string[] = [];

  lines.push('═'.repeat(70));
  lines.push('  PBB TASK TRACEABILITY VALIDATION REPORT');
  lines.push('═'.repeat(70));
  lines.push('');

  lines.push(`Tasks parsed:                     ${result.tasksParsed}`);
  lines.push(`Requirements parsed:              ${result.requirementsParsed}`);
  lines.push(`Checkpoints:                      ${result.checkpointCount}`);
  lines.push(`Security tests:                   ${result.securityTestCount}`);
  lines.push(`Mapped task-requirement pairs:    ${result.mappedPairs}`);
  lines.push(`Matrix task pairs:                ${result.matrixPairs}`);
  lines.push('');

  lines.push('─'.repeat(70));
  lines.push('BIDIRECTIONAL VALIDATION');
  lines.push('─'.repeat(70));
  lines.push(`Task→Matrix missing pairs:        ${result.taskToMatrixMissing.length}`);
  lines.push(`Matrix→Task stale pairs:          ${result.matrixToTaskStale.length}`);
  lines.push(`Security missing pairs:           ${result.securityMissing.length}`);
  lines.push(`Security stale pairs:             ${result.securityStale.length}`);
  lines.push('');

  if (result.taskToMatrixMissing.length > 0) {
    lines.push('TASK→MATRIX MISSING (task has requirement but matrix does not):');
    for (const item of result.taskToMatrixMissing) {
      lines.push(`  FAIL ${item.requirement} MISSING task ${item.taskId}`);
      lines.push(`       Task metadata: ${item.taskMetadata}`);
    }
    lines.push('');
  }

  if (result.matrixToTaskStale.length > 0) {
    lines.push('MATRIX→TASK STALE (matrix has task but task metadata does not):');
    for (const item of result.matrixToTaskStale) {
      lines.push(`  FAIL ${item.requirement} STALE task ${item.taskId}`);
      lines.push(`       Task metadata: ${item.taskMetadata}`);
    }
    lines.push('');
  }

  lines.push('─'.repeat(70));
  lines.push('COVERAGE VALIDATION');
  lines.push('─'.repeat(70));
  lines.push(`P0 without tasks:                 ${result.p0WithoutTasks.length}`);
  lines.push(`Owner decision leaks:             ${result.ownerDecisionLeaks.length}`);
  lines.push(`Dependency errors:                ${result.dependencyErrors.length}`);
  lines.push(`Version errors:                   ${result.versionErrors.length}`);
  lines.push('');

  if (result.p0WithoutTasks.length > 0) {
    lines.push('P0 REQUIREMENTS WITHOUT TASKS:');
    for (const req of result.p0WithoutTasks) {
      lines.push(`  FAIL ${req}`);
    }
    lines.push('');
  }

  if (result.ownerDecisionLeaks.length > 0) {
    lines.push('OWNER DECISION LEAKS:');
    for (const leak of result.ownerDecisionLeaks) {
      lines.push(`  FAIL ${leak}`);
    }
    lines.push('');
  }

  if (result.dependencyErrors.length > 0) {
    lines.push('DEPENDENCY ERRORS:');
    for (const err of result.dependencyErrors) {
      lines.push(`  FAIL ${err}`);
    }
    lines.push('');
  }

  if (result.versionErrors.length > 0) {
    lines.push('VERSION ERRORS:');
    for (const err of result.versionErrors) {
      lines.push(`  FAIL ${err}`);
    }
    lines.push('');
  }

  lines.push('─'.repeat(70));
  lines.push('CHECKPOINT CLASSIFICATION');
  lines.push('─'.repeat(70));
  lines.push(
    `With explicit requirements:       ${result.checkpointsWithRequirements.length} [${result.checkpointsWithRequirements.join(', ')}]`,
  );
  lines.push(
    `With validation scope only:       ${result.checkpointsWithValidationScope.length} [${result.checkpointsWithValidationScope.join(', ')}]`,
  );
  lines.push(
    `Without metadata:                 ${result.checkpointsWithoutMetadata.length} [${result.checkpointsWithoutMetadata.join(', ')}]`,
  );
  lines.push('');

  lines.push('═'.repeat(70));
  lines.push(`  Status: ${result.passed ? '✅ PASSED' : '❌ FAILED'}`);
  lines.push('═'.repeat(70));

  return lines.join('\n');
}
