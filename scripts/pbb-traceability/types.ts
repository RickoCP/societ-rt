/**
 * PBB Task Traceability Types
 * @see EV-003, EV-007
 */

export interface ParsedTask {
  taskId: number;
  title: string;
  priority: string | null;
  requirements: Set<string>; // Only explicit PBB-REQ-XXX IDs
  validationScope: string | null; // For broad scope like "All P0 requirements"
  dependencies: number[];
  section: string;
  isCheckpoint: boolean;
  isSecurityCriticalTest: boolean;
  blockedDecisionTags: string[];
  rawRequirementsLine: string | null;
}

export interface ParsedRequirement {
  id: string;
  title: string;
  priority: 'P0' | 'P1' | 'P2';
  category: string;
}

export interface TraceabilityMatrix {
  rows: Map<string, {
    tasks: Set<number>;
    securityTests: Set<number>;
    status: 'ACTIVE' | 'DEFERRED' | 'NO_MAPPING';
  }>;
}

export interface ValidationResult {
  passed: boolean;
  tasksParsed: number;
  requirementsParsed: number;
  checkpointCount: number;
  securityTestCount: number;
  mappedPairs: number;
  matrixPairs: number;
  taskToMatrixMissing: Array<{ requirement: string; taskId: number; taskMetadata: string }>;
  matrixToTaskStale: Array<{ requirement: string; taskId: number; taskMetadata: string }>;
  securityMissing: Array<{ requirement: string; taskId: number }>;
  securityStale: Array<{ requirement: string; taskId: number }>;
  p0WithoutTasks: string[];
  ownerDecisionLeaks: string[];
  dependencyErrors: string[];
  versionErrors: string[];
  checkpointsWithRequirements: number[];
  checkpointsWithValidationScope: number[];
  checkpointsWithoutMetadata: number[];
}
