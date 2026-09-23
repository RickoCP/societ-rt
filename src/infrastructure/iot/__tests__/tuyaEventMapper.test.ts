import {
  normalizeTuyaEventType,
  TUYA_DOOR_DP_CODE,
} from '../tuyaEventMapper';

describe('normalizeTuyaEventType', () => {
  describe('already-canonical events', () => {
    it('passes through door_opened unchanged', () => {
      expect(
        normalizeTuyaEventType({ eventType: 'door_opened', eventData: {} }),
      ).toBe('door_opened');
    });
    it('passes through door_closed unchanged', () => {
      expect(
        normalizeTuyaEventType({ eventType: 'door_closed', eventData: {} }),
      ).toBe('door_closed');
    });
  });

  describe('flat DP value (Shape A)', () => {
    it('maps doorcontact_state=true -> door_opened', () => {
      expect(
        normalizeTuyaEventType({
          eventType: TUYA_DOOR_DP_CODE,
          eventData: { doorcontact_state: true },
        }),
      ).toBe('door_opened');
    });
    it('maps doorcontact_state=false -> door_closed', () => {
      expect(
        normalizeTuyaEventType({
          eventType: TUYA_DOOR_DP_CODE,
          eventData: { doorcontact_state: false },
        }),
      ).toBe('door_closed');
    });
  });

  describe('Tuya Cloud status array (Shape B)', () => {
    it('maps status array open -> door_opened', () => {
      expect(
        normalizeTuyaEventType({
          eventType: 'status_report',
          eventData: {
            status: [{ code: 'doorcontact_state', value: true }],
          },
        }),
      ).toBe('door_opened');
    });
    it('maps status array closed -> door_closed', () => {
      expect(
        normalizeTuyaEventType({
          eventType: 'status_report',
          eventData: {
            status: [
              { code: 'battery_percentage', value: 88 },
              { code: 'doorcontact_state', value: false },
            ],
          },
        }),
      ).toBe('door_closed');
    });
  });

  describe('value coercion', () => {
    it('coerces string "open" -> door_opened', () => {
      expect(
        normalizeTuyaEventType({
          eventType: TUYA_DOOR_DP_CODE,
          eventData: { doorcontact_state: 'open' },
        }),
      ).toBe('door_opened');
    });
    it('coerces numeric 0 -> door_closed', () => {
      expect(
        normalizeTuyaEventType({
          eventType: TUYA_DOOR_DP_CODE,
          eventData: { doorcontact_state: 0 },
        }),
      ).toBe('door_closed');
    });
  });

  describe('non-door / pass-through', () => {
    it('leaves motion events untouched', () => {
      expect(
        normalizeTuyaEventType({
          eventType: 'motion_detected',
          eventData: { pir: 'pir' },
        }),
      ).toBe('motion_detected');
    });
    it('leaves panic events untouched', () => {
      expect(
        normalizeTuyaEventType({
          eventType: 'panic_button_pressed',
          eventData: {},
        }),
      ).toBe('panic_button_pressed');
    });
    it('does not map when door DP is present but unrecognizable', () => {
      expect(
        normalizeTuyaEventType({
          eventType: 'status_report',
          eventData: { doorcontact_state: 'maybe' },
        }),
      ).toBe('status_report');
    });
    it('does not map an empty status array', () => {
      expect(
        normalizeTuyaEventType({
          eventType: 'status_report',
          eventData: { status: [] },
        }),
      ).toBe('status_report');
    });
  });
});
