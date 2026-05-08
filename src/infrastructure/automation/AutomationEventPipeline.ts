/**
 * AutomationEventPipeline — Connects the IoT webhook event processing
 * output to the Automation Engine for rule evaluation.
 *
 * Flow: Tuya webhook → ProcessWebhookEventUseCase → event classification
 *       → AutomationEventPipeline → EvaluateRuleUseCase → action execution
 *       → realtime delivery
 *
 * Chain depth is tracked to prevent infinite loops (max depth: 5).
 *
 * @see Requirements 32.7, 36.3, 39.5, 39.6
 */

import type { RealtimeBusProtocol } from '@core/protocols';
import type { RealtimeEvent } from '@core/domains/realtimeBus/entities';
import type { AutomationTriggerEventType } from '@core/domains/automation/entities';
import { isValidTriggerEventType } from '@core/domains/automation/entities';
import type { EvaluateRuleUseCase } from '@core/domains/automation/usecases';
import { EVENT_CHANNELS } from '@core/domains/realtimeBus/entities';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AutomationEventPipelineDeps {
  readonly realtimeBusProtocol: RealtimeBusProtocol;
  readonly evaluateRuleUseCase: EvaluateRuleUseCase;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export const AutomationEventPipeline = ({
  realtimeBusProtocol,
  evaluateRuleUseCase,
}: AutomationEventPipelineDeps) => {
  /**
   * Process a device event through the automation pipeline.
   * Called after ProcessWebhookEventUseCase completes successfully.
   */
  async function processEvent(
    tenantId: string,
    event: RealtimeEvent,
    chainDepth = 0,
  ): Promise<void> {
    if (!isValidTriggerEventType(event.eventType)) {
      return;
    }

    const eventType = event.eventType as AutomationTriggerEventType;

    const result = await evaluateRuleUseCase.execute({
      tenantId,
      eventType,
      event: event.payload,
      chainDepth,
    });

    if (!result.success) {
      console.error(
        JSON.stringify({
          level: 'error',
          code: 'AUTOMATION_PIPELINE_EVALUATION_FAILED',
          tenantId,
          eventType,
          chainDepth,
          error: result.error.message,
          timestamp: new Date().toISOString(),
        }),
      );
    }
  }

  /**
   * Subscribe to security event channels and trigger automation evaluation.
   */
  async function start(tenantId: string): Promise<void> {
    const channels = [
      EVENT_CHANNELS.SECURITY_EVENTS,
      EVENT_CHANNELS.DEVICE_EVENTS,
    ];

    for (const channel of channels) {
      const namespacedChannel = `${channel}:${tenantId}`;
      await realtimeBusProtocol.subscribe(namespacedChannel, (event) => {
        void processEvent(tenantId, event, 0).catch(() => {});
      });
    }
  }

  return { processEvent, start };
};
