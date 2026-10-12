#!/usr/bin/env npx tsx
/**
 * PBB Traceability Matrix Generator
 * Generates the traceability matrix from task metadata.
 * @see EV-009, EV-010
 */

import * as fs from 'fs';
import type { ParsedTask, TraceabilityMatrix } from './types';

const SECURITY_TEST_RANGE = { min: 186, max: 201 };

export function generateTraceabilityMatrix(
  tasks: Map<number, ParsedTask>,
  allRequirementIds: string[],
): TraceabilityMatrix {
  const matrix: TraceabilityMatrix = {
    rows: new Map(),
  };

  // Initialize all requirements
  for (const reqId of allRequirementIds) {
    matrix.rows.set(reqId, {
      tasks: new Set(),
      securityTests: new Set(),
      status: 'NO_MAPPING',
    });
  }

  // Build mapping from task metadata
  for (const [taskId, task] of tasks) {
    for (const reqId of task.requirements) {
      const row = matrix.rows.get(reqId);
      if (row) {
        row.tasks.add(taskId);
        if (taskId >= SECURITY_TEST_RANGE.min && taskId <= SECURITY_TEST_RANGE.max) {
          row.securityTests.add(taskId);
        }
      }
    }
  }

  // Update status
  const deferredReqs = new Set([
    'PBB-REQ-030',
    'PBB-REQ-031',
    'PBB-REQ-032',
    'PBB-REQ-033',
    'PBB-REQ-034',
    'PBB-REQ-035',
    'PBB-REQ-036',
    'PBB-REQ-037',
    'PBB-REQ-041',
    'PBB-REQ-042',
    'PBB-REQ-043',
    'PBB-REQ-044',
    'PBB-REQ-045',
    'PBB-REQ-046',
    'PBB-REQ-070',
    'PBB-REQ-072',
    'PBB-REQ-073',
  ]);

  for (const [reqId, row] of matrix.rows) {
    if (row.tasks.size > 0) {
      row.status = 'ACTIVE';
    } else if (deferredReqs.has(reqId)) {
      row.status = 'DEFERRED';
    } else {
      row.status = 'NO_MAPPING';
    }
  }

  return matrix;
}

export function formatMatrixAsMarkdown(matrix: TraceabilityMatrix): string {
  const lines: string[] = [];

  lines.push('<!-- TRACEABILITY:GENERATED:START -->');
  lines.push('');
  lines.push('| Requirement | Task(s) | Security Critical Tests | Status |');
  lines.push('|-------------|---------|------------------------|--------|');

  // Sort requirements by ID
  const sortedReqs = Array.from(matrix.rows.keys()).sort((a, b) => {
    const numA = parseInt(a.replace('PBB-REQ-', ''), 10);
    const numB = parseInt(b.replace('PBB-REQ-', ''), 10);
    return numA - numB;
  });

  for (const reqId of sortedReqs) {
    const row = matrix.rows.get(reqId)!;

    const tasksStr =
      row.tasks.size > 0
        ? formatTaskList(Array.from(row.tasks).sort((a, b) => a - b))
        : '-';

    const securityStr =
      row.securityTests.size > 0
        ? Array.from(row.securityTests)
            .sort((a, b) => a - b)
            .join(', ')
        : '-';

    lines.push(`| ${reqId} | ${tasksStr} | ${securityStr} | ${row.status} |`);
  }

  lines.push('');
  lines.push('<!-- TRACEABILITY:GENERATED:END -->');

  return lines.join('\n');
}

function formatTaskList(tasks: number[]): string {
  if (tasks.length === 0) return '-';
  if (tasks.length <= 10) return tasks.join(', ');

  // For long lists, try to compress consecutive ranges
  const result: string[] = [];
  let rangeStart = tasks[0];
  let rangeEnd = tasks[0];

  for (let i = 1; i <= tasks.length; i++) {
    if (i < tasks.length && tasks[i] === rangeEnd + 1) {
      rangeEnd = tasks[i];
    } else {
      if (rangeEnd - rangeStart >= 2) {
        result.push(`${rangeStart}-${rangeEnd}`);
      } else if (rangeEnd > rangeStart) {
        result.push(String(rangeStart), String(rangeEnd));
      } else {
        result.push(String(rangeStart));
      }
      if (i < tasks.length) {
        rangeStart = tasks[i];
        rangeEnd = tasks[i];
      }
    }
  }

  return result.join(', ');
}

export function updateTasksFile(filePath: string, matrixMarkdown: string): void {
  let content = fs.readFileSync(filePath, 'utf-8');

  const startMarker = '<!-- TRACEABILITY:GENERATED:START -->';
  const endMarker = '<!-- TRACEABILITY:GENERATED:END -->';

  const startIdx = content.indexOf(startMarker);
  const endIdx = content.indexOf(endMarker);

  if (startIdx !== -1 && endIdx !== -1) {
    // Replace existing generated block
    content =
      content.slice(0, startIdx) + matrixMarkdown + content.slice(endIdx + endMarker.length);
  } else {
    // Insert after existing Traceability Matrix header
    const headerIdx = content.indexOf('## Traceability Matrix');
    if (headerIdx !== -1) {
      // Find next section or end
      const nextSection = content.indexOf('\n## ', headerIdx + 1);
      const nextHr = content.indexOf('\n---\n', headerIdx + 1);
      let insertPoint = nextSection !== -1 ? nextSection : content.length;
      if (nextHr !== -1 && nextHr < insertPoint) insertPoint = nextHr;

      // Find where to insert (after ### header if present)
      const subHeaderIdx = content.indexOf('### Requirements → Tasks', headerIdx);
      if (subHeaderIdx !== -1 && subHeaderIdx < insertPoint) {
        // Find end of existing table
        const tableEndMatch = content.slice(subHeaderIdx).match(/\n\n---|\n\n##/);
        if (tableEndMatch && tableEndMatch.index !== undefined) {
          insertPoint = subHeaderIdx + tableEndMatch.index;
        }
      }

      content =
        content.slice(0, headerIdx) +
        '## Traceability Matrix\n\n### Requirements → Tasks → Tests\n\n' +
        matrixMarkdown +
        content.slice(insertPoint);
    }
  }

  fs.writeFileSync(filePath, content, 'utf-8');
}
