'use client';

import { useState } from 'react';
import { Spinner } from '@components/atoms/Spinner';
import { Badge } from '@components/atoms/Badge';
import { Button } from '@components/atoms/Button';
import { ErrorMessage } from '@components/molecules/ErrorMessage';
import { useAutomationRulesViewModel } from '../viewModel/useAutomationRulesViewModel';

const TRIGGER_EVENTS = [
  'gate_open_too_long',
  'motion_detected',
  'smoke_detected',
  'panic_button_pressed',
  'device_offline',
  'low_battery',
  'intrusion_detected',
];

const ACTION_TYPES = [
  'create_incident',
  'send_notification',
  'activate_siren',
  'capture_snapshot',
  'broadcast_alert',
];

export function AutomationRulesScreen() {
  const vm = useAutomationRulesViewModel();
  const [showBuilder, setShowBuilder] = useState(false);
  const [ruleName, setRuleName] = useState('');
  const [triggerEvent, setTriggerEvent] = useState('');
  const [actionType, setActionType] = useState('');

  const handleCreateRule = () => {
    if (!ruleName.trim() || !triggerEvent || !actionType) return;
    vm.createRule({
      name: ruleName.trim(),
      triggerEvent,
      conditions: [],
      actions: [{ type: actionType, params: {} }],
    });
    setRuleName('');
    setTriggerEvent('');
    setActionType('');
    setShowBuilder(false);
  };

  if (vm.isLoading) {
    return <div className="flex items-center justify-center py-12"><Spinner /></div>;
  }

  if (vm.isError) {
    return <ErrorMessage message={vm.error?.message ?? 'Failed to load automation rules'} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Automation Rules</h1>
        <Button size="sm" onClick={() => setShowBuilder(!showBuilder)}>
          {showBuilder ? 'Cancel' : '+ Create Rule'}
        </Button>
      </div>

      {/* Rule builder */}
      {showBuilder && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
          <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">New Automation Rule</h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="rule-name" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Rule Name</label>
              <input id="rule-name" type="text" value={ruleName} onChange={e => setRuleName(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100" />
            </div>
            <div>
              <label htmlFor="trigger-event" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Trigger Event</label>
              <select id="trigger-event" value={triggerEvent} onChange={e => setTriggerEvent(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
                <option value="">Select trigger...</option>
                {TRIGGER_EVENTS.map(evt => (
                  <option key={evt} value={evt}>{evt.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="action-type" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">Action</label>
              <select id="action-type" value={actionType} onChange={e => setActionType(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
                <option value="">Select action...</option>
                {ACTION_TYPES.map(act => (
                  <option key={act} value={act}>{act.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-4">
            <Button onClick={handleCreateRule} disabled={vm.isCreating || !ruleName.trim() || !triggerEvent || !actionType}>
              {vm.isCreating ? 'Creating...' : 'Create Rule'}
            </Button>
          </div>
          {vm.createError && <p className="mt-2 text-sm text-red-600">{vm.createError.message}</p>}
        </div>
      )}

      {/* Rules list */}
      {vm.rules.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No automation rules configured.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {vm.rules.map(rule => (
            <div key={rule.id} className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100">{rule.name}</h3>
                  <Badge variant={rule.enabled ? 'success' : 'default'}>{rule.enabled ? 'Active' : 'Disabled'}</Badge>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Trigger: {rule.triggerEvent.replace(/_/g, ' ')} → {rule.actions.map(a => a.type.replace(/_/g, ' ')).join(', ')}
                </p>
                {rule.lastTriggered && (
                  <p className="text-xs text-gray-400">Last triggered: {new Date(rule.lastTriggered).toLocaleString()}</p>
                )}
              </div>
              <Button
                size="sm"
                variant={rule.enabled ? 'secondary' : 'primary'}
                disabled={vm.isToggling}
                onClick={() => vm.toggleRule({ ruleId: rule.id, enabled: !rule.enabled })}
              >
                {rule.enabled ? 'Disable' : 'Enable'}
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Execution history */}
      {vm.executions.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold text-gray-900 dark:text-gray-100">Execution History</h2>
          <div className="flex flex-col gap-2">
            {vm.executions.slice(0, 20).map(exec => (
              <div key={exec.id} className="flex items-center justify-between rounded border border-gray-100 bg-gray-50 px-4 py-2 dark:border-gray-700 dark:bg-gray-800/50">
                <div>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{exec.ruleName}</span>
                  <span className="ml-2 text-xs text-gray-400">{new Date(exec.triggeredAt).toLocaleString()}</span>
                </div>
                <Badge variant={exec.status === 'success' ? 'success' : 'danger'}>{exec.status}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
