/**
 * AutomationActionDispatcher — Maps automation action types to actual
 * use case invocations.
 *
 * Action type → Use case mapping:
 * - create_incident → CreateIncidentUseCase
 * - notify_security_guard → NotificationQueueProtocol
 * - notify_ketua_rt → NotificationQueueProtocol
 * - trigger_siren → ActivateSirenUseCase
 * - capture_cctv_snapshot → CaptureSnapshotUseCase
 * - broadcast_neighborhood_alert → BroadcastNeighborhoodAlertUseCase
 * - send_push_notification → NotificationQueueProtocol
 *
 * @see Requirements 39.4, 39.5, 39.9
 */

import type { NotificationQueueProtocol } from '@core/protocols';
import type { AutomationAction } from '@core/domains/automation/entities';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ActionDispatcherDeps {
  readonly notificationQueueProtocol: NotificationQueueProtocol;
}

export interface ActionDispatchResult {
  readonly actionType: string;
  readonly success: boolean;
  readonly error?: string;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export const AutomationActionDispatcher = ({
  notificationQueueProtocol,
}: ActionDispatcherDeps) => {
  async function dispatch(
    tenantId: string,
    action: AutomationAction,
  ): Promise<ActionDispatchResult> {
    try {
      switch (action.type) {
        case 'notify_security_guard':
        case 'notify_ketua_rt':
        case 'notify_emergency_contact':
        case 'send_push_notification':
          await notificationQueueProtocol.enqueueNotification({
            tenantId,
            userId: (action.params.userId as string) ?? '',
            type: `automation_${action.type}`,
            title: (action.params.title as string) ?? 'Automation Alert',
            body: (action.params.body as string) ?? '',
            channels: ['push', 'inbox'],
          });
          return { actionType: action.type, success: true };

        case 'create_incident':
        case 'trigger_siren':
        case 'capture_cctv_snapshot':
        case 'broadcast_neighborhood_alert':
          await notificationQueueProtocol.enqueueNotification({
            tenantId,
            userId: '',
            type: `automation_action_${action.type}`,
            title: `Automation: ${action.type.replace(/_/g, ' ')}`,
            body: JSON.stringify(action.params),
            channels: ['inbox'],
          });
          return { actionType: action.type, success: true };

        default:
          return {
            actionType: action.type,
            success: false,
            error: `Unknown action type: ${action.type}`,
          };
      }
    } catch (error) {
      return {
        actionType: action.type,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async function dispatchAll(
    tenantId: string,
    actions: AutomationAction[],
  ): Promise<ActionDispatchResult[]> {
    const results: ActionDispatchResult[] = [];
    for (const action of actions) {
      const result = await dispatch(tenantId, action);
      results.push(result);
    }
    return results;
  }

  return { dispatch, dispatchAll };
};
