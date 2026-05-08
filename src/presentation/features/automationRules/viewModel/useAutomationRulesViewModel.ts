'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AutomationRule {
  id: string;
  name: string;
  enabled: boolean;
  triggerEvent: string;
  conditions: { field: string; operator: string; value: string }[];
  actions: { type: string; params: Record<string, unknown> }[];
  createdAt: string;
  lastTriggered: string | null;
}

export interface AutomationExecution {
  id: string;
  ruleId: string;
  ruleName: string;
  status: 'success' | 'failure';
  triggeredAt: string;
  error: string | null;
}

interface CreateRuleInput {
  name: string;
  triggerEvent: string;
  conditions: { field: string; operator: string; value: string }[];
  actions: { type: string; params: Record<string, unknown> }[];
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

async function fetchRules(): Promise<AutomationRule[]> {
  const res = await fetch('/api/automation/rules');
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Failed to fetch automation rules');
  }
  const json = (await res.json()) as { data: AutomationRule[] };
  return json.data;
}

async function fetchExecutions(): Promise<AutomationExecution[]> {
  const res = await fetch('/api/automation/executions');
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Failed to fetch executions');
  }
  const json = (await res.json()) as { data: AutomationExecution[] };
  return json.data;
}

async function createRule(input: CreateRuleInput): Promise<AutomationRule> {
  const res = await fetch('/api/automation/rules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Failed to create rule');
  }
  const json = (await res.json()) as { data: AutomationRule };
  return json.data;
}

async function toggleRule(input: { ruleId: string; enabled: boolean }): Promise<void> {
  const res = await fetch(`/api/automation/rules/${input.ruleId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: input.enabled }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? 'Failed to toggle rule');
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAutomationRulesViewModel() {
  const queryClient = useQueryClient();

  const rulesQuery = useQuery({
    queryKey: ['automation-rules'],
    queryFn: fetchRules,
  });

  const executionsQuery = useQuery({
    queryKey: ['automation-executions'],
    queryFn: fetchExecutions,
  });

  const createMutation = useMutation({
    mutationFn: createRule,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['automation-rules'] });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: toggleRule,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['automation-rules'] });
    },
  });

  return {
    rules: rulesQuery.data ?? [],
    executions: executionsQuery.data ?? [],
    isLoading: rulesQuery.isLoading,
    isError: rulesQuery.isError,
    error: rulesQuery.error,
    createRule: createMutation.mutate,
    isCreating: createMutation.isPending,
    createError: createMutation.error,
    toggleRule: toggleMutation.mutate,
    isToggling: toggleMutation.isPending,
  };
}
