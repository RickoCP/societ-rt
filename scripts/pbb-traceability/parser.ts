#!/usr/bin/env npx tsx
/**
 * PBB Task Parser
 * Parses task definitions from tasks.md extracting requirement metadata.
 * @see EV-003, EV-004, EV-005, EV-006
 */

import * as fs from 'fs';
import type { ParsedTask, ParsedRequirement } from './types';

const TASK_PATTERN = /^- \[ \] (\d+)\. (.+)$/;
const REQUIREMENTS_PATTERN = /^\s+- \*\*Requirements\*\*:\s*(.+)$/;
const REQUIREMENTS_ITALIC_PATTERN = /^\s+- _Requirements:\s*(.+)_$/;
const VALIDATION_SCOPE_PATTERN = /^\s+- \*\*Validation Scope\*\*:\s*(.+)$/;
const PRIORITY_PATTERN = /^\s+- \*\*Priority\*\*:\s*(.+)$/;
const DEPENDENCIES_PATTERN = /^\s+- \*\*Dependencies\*\*:\s*(.+)$/;
const BLOCKED_PATTERN = /\[BLOCKED:([A-Z0-9-]+)\]/g;
const SECTION_PATTERN = /^#{2,4}\s+(.+)$/;

// Requirement ID pattern - explicit IDs only
const REQ_ID_PATTERN = /PBB-REQ-(\d{3})/g;
// Range pattern to detect and REJECT
const RANGE_PATTERN = /PBB-REQ-\d{3}\s+through\s+PBB-REQ-\d{3}/i;

export function parseTasksFile(filePath: string): {
  tasks: Map<number, ParsedTask>;
  errors: string[];
} {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/);

  const tasks = new Map<number, ParsedTask>();
  const errors: string[] = [];

  let currentSection = '';
  let currentTask: ParsedTask | null = null;
  let inTaskBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Track section headers
    const sectionMatch = line.match(SECTION_PATTERN);
    if (sectionMatch) {
      currentSection = sectionMatch[1];
      continue;
    }

    // Check for task definition start
    const taskMatch = line.match(TASK_PATTERN);
    if (taskMatch) {
      // Save previous task if exists
      if (currentTask) {
        tasks.set(currentTask.taskId, currentTask);
      }

      const taskId = parseInt(taskMatch[1], 10);
      const title = taskMatch[2].trim();

      // Detect blocked tags in title
      const blockedTags: string[] = [];
      let match;
      const blockedRegex = new RegExp(BLOCKED_PATTERN);
      while ((match = blockedRegex.exec(title)) !== null) {
        blockedTags.push(match[1]);
      }

      currentTask = {
        taskId,
        title,
        priority: null,
        requirements: new Set(),
        validationScope: null,
        dependencies: [],
        section: currentSection,
        isCheckpoint: title.toLowerCase().includes('checkpoint'),
        isSecurityCriticalTest:
          taskId >= 186 && taskId <= 201 && !title.toLowerCase().includes('checkpoint'),
        blockedDecisionTags: blockedTags,
        rawRequirementsLine: null,
      };
      inTaskBlock = true;
      continue;
    }

    // Parse task metadata if in task block
    if (inTaskBlock && currentTask) {
      // Check for next task or section (end of current task block)
      if (line.match(/^- \[ \]/) || line.match(/^#{2,4}\s/) || line.match(/^---$/)) {
        inTaskBlock = false;
        // Don't continue - let the line be processed in next iteration
      }

      // Priority
      const priorityMatch = line.match(PRIORITY_PATTERN);
      if (priorityMatch) {
        currentTask.priority = priorityMatch[1].trim();
        continue;
      }

      // Requirements (explicit IDs only)
      const reqMatch =
        line.match(REQUIREMENTS_PATTERN) || line.match(REQUIREMENTS_ITALIC_PATTERN);
      if (reqMatch) {
        const reqLine = reqMatch[1].trim();
        currentTask.rawRequirementsLine = reqLine;

        // Check for FORBIDDEN range syntax
        if (RANGE_PATTERN.test(reqLine)) {
          errors.push(
            `Task ${currentTask.taskId} (line ${lineNum}): Requirements field contains range syntax "${reqLine}". ` +
              `Ranges must be moved to **Validation Scope** field. Only explicit PBB-REQ-XXX IDs allowed in Requirements.`,
          );
          // Still extract explicit IDs that don't look like ranges
        }

        // Extract explicit requirement IDs
        const reqIdRegex = new RegExp(REQ_ID_PATTERN);
        let reqMatch2;
        while ((reqMatch2 = reqIdRegex.exec(reqLine)) !== null) {
          const reqId = `PBB-REQ-${reqMatch2[1]}`;
          currentTask.requirements.add(reqId);
        }
        continue;
      }

      // Validation Scope (broad scope, not counted for traceability)
      const scopeMatch = line.match(VALIDATION_SCOPE_PATTERN);
      if (scopeMatch) {
        currentTask.validationScope = scopeMatch[1].trim();
        continue;
      }

      // Dependencies
      const depMatch = line.match(DEPENDENCIES_PATTERN);
      if (depMatch) {
        const depLine = depMatch[1];
        // Extract task numbers from dependencies
        const depRegex = /Task[s]?\s+(\d+)/gi;
        let depMatch2;
        while ((depMatch2 = depRegex.exec(depLine)) !== null) {
          currentTask.dependencies.push(parseInt(depMatch2[1], 10));
        }
        continue;
      }
    }
  }

  // Save last task
  if (currentTask) {
    tasks.set(currentTask.taskId, currentTask);
  }

  return { tasks, errors };
}

export function parseRequirementsFile(filePath: string): {
  requirements: Map<string, ParsedRequirement>;
  counts: { total: number; p0: number; p1: number; p2: number };
} {
  const content = fs.readFileSync(filePath, 'utf-8');
  const requirements = new Map<string, ParsedRequirement>();

  // Pattern for requirement definitions in requirements.md
  // Expected format: | PBB-REQ-001 | Title | P0 | ... |
  const reqRowPattern = /\|\s*(PBB-REQ-\d{3})\s*\|\s*([^|]+)\s*\|\s*(P[012])\s*\|/g;

  let match;
  while ((match = reqRowPattern.exec(content)) !== null) {
    const id = match[1];
    const title = match[2].trim();
    const priority = match[3] as 'P0' | 'P1' | 'P2';

    requirements.set(id, {
      id,
      title,
      priority,
      category: '', // Can be extracted if needed
    });
  }

  // Also try alternative pattern for inline requirements
  // | REQ ID | Category | Title | Priority |
  const altPattern = /\|\s*(PBB-REQ-\d{3})\s*\|[^|]*\|[^|]*\|\s*(P[012])\s*\|/g;
  while ((match = altPattern.exec(content)) !== null) {
    const id = match[1];
    if (!requirements.has(id)) {
      requirements.set(id, {
        id,
        title: '',
        priority: match[2] as 'P0' | 'P1' | 'P2',
        category: '',
      });
    }
  }

  // Count by priority
  let p0 = 0,
    p1 = 0,
    p2 = 0;
  for (const req of requirements.values()) {
    if (req.priority === 'P0') p0++;
    else if (req.priority === 'P1') p1++;
    else if (req.priority === 'P2') p2++;
  }

  return {
    requirements,
    counts: { total: requirements.size, p0, p1, p2 },
  };
}

export function parseTraceabilityMatrix(content: string): Map<string, Set<number>> {
  const matrix = new Map<string, Set<number>>();

  // Find the traceability matrix section - ONLY parse between markers
  const startMarker = '<!-- TRACEABILITY:GENERATED:START -->';
  const endMarker = '<!-- TRACEABILITY:GENERATED:END -->';
  const matrixStart = content.indexOf(startMarker);
  const matrixEnd = content.indexOf(endMarker);

  // Extract ONLY the matrix section between markers
  let matrixContent = content;
  if (matrixStart !== -1 && matrixEnd !== -1) {
    matrixContent = content.slice(matrixStart, matrixEnd);
  } else {
    console.warn('[WARN] Traceability markers not found, parsing entire file');
  }

  // Parse table rows ONLY within matrix section
  // | PBB-REQ-001 | 5, 6, 19 | ... |
  const rowPattern = /\|\s*(PBB-REQ-\d{3})\s*\|\s*([^|]*)\s*\|/g;
  let match;

  while ((match = rowPattern.exec(matrixContent)) !== null) {
    const reqId = match[1];
    const tasksStr = match[2].trim();
    const tasks = new Set<number>();

    if (tasksStr !== '-' && tasksStr !== '') {
      // Parse task IDs (handle ranges like 169-179)
      const parts = tasksStr.split(',').map((s) => s.trim());
      for (const part of parts) {
        if (part.includes('-') && /^\d+-\d+$/.test(part)) {
          // Range like 169-179
          const [start, end] = part.split('-').map((n) => parseInt(n, 10));
          for (let i = start; i <= end; i++) {
            tasks.add(i);
          }
        } else {
          const num = parseInt(part, 10);
          if (!isNaN(num)) {
            tasks.add(num);
          }
        }
      }
    }

    matrix.set(reqId, tasks);
  }

  return matrix;
}
