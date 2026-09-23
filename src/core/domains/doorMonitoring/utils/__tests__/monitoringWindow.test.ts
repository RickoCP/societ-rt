import {
  isValidTimeOfDay,
  toMinutesOfDay,
  isWithinMonitoringWindow,
} from '../monitoringWindow';

/**
 * Use UTC so tests are deterministic regardless of the machine timezone.
 * We pass timeZone: 'UTC' explicitly to isWithinMonitoringWindow.
 */
function at(hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(2026, 0, 15, h, m, 0));
}

describe('isValidTimeOfDay', () => {
  it('accepts valid HH:mm', () => {
    expect(isValidTimeOfDay('00:00')).toBe(true);
    expect(isValidTimeOfDay('22:00')).toBe(true);
    expect(isValidTimeOfDay('23:59')).toBe(true);
  });

  it('rejects invalid values', () => {
    expect(isValidTimeOfDay('24:00')).toBe(false);
    expect(isValidTimeOfDay('22:60')).toBe(false);
    expect(isValidTimeOfDay('9:00')).toBe(false);
    expect(isValidTimeOfDay('foo')).toBe(false);
    expect(isValidTimeOfDay('')).toBe(false);
  });
});

describe('toMinutesOfDay', () => {
  it('converts to minutes since midnight', () => {
    expect(toMinutesOfDay('00:00')).toBe(0);
    expect(toMinutesOfDay('01:30')).toBe(90);
    expect(toMinutesOfDay('23:59')).toBe(1439);
  });
});

describe('isWithinMonitoringWindow', () => {
  describe('same-day window (start < end)', () => {
    it('is inside within the range', () => {
      expect(isWithinMonitoringWindow(at('10:00'), '08:00', '17:00', 'UTC')).toBe(true);
    });
    it('is inside at the start boundary (inclusive)', () => {
      expect(isWithinMonitoringWindow(at('08:00'), '08:00', '17:00', 'UTC')).toBe(true);
    });
    it('is outside at the end boundary (exclusive)', () => {
      expect(isWithinMonitoringWindow(at('17:00'), '08:00', '17:00', 'UTC')).toBe(false);
    });
    it('is outside before/after', () => {
      expect(isWithinMonitoringWindow(at('07:59'), '08:00', '17:00', 'UTC')).toBe(false);
      expect(isWithinMonitoringWindow(at('18:00'), '08:00', '17:00', 'UTC')).toBe(false);
    });
  });

  describe('overnight window (start > end, wraps midnight)', () => {
    const start = '22:00';
    const end = '05:00';
    it('is inside late at night', () => {
      expect(isWithinMonitoringWindow(at('23:30'), start, end, 'UTC')).toBe(true);
    });
    it('is inside early morning', () => {
      expect(isWithinMonitoringWindow(at('04:59'), start, end, 'UTC')).toBe(true);
    });
    it('is inside at the start boundary', () => {
      expect(isWithinMonitoringWindow(at('22:00'), start, end, 'UTC')).toBe(true);
    });
    it('is outside at the end boundary (exclusive)', () => {
      expect(isWithinMonitoringWindow(at('05:00'), start, end, 'UTC')).toBe(false);
    });
    it('is outside during the day', () => {
      expect(isWithinMonitoringWindow(at('12:00'), start, end, 'UTC')).toBe(false);
      expect(isWithinMonitoringWindow(at('21:59'), start, end, 'UTC')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('treats start === end as an empty window (never inside)', () => {
      expect(isWithinMonitoringWindow(at('12:00'), '00:00', '00:00', 'UTC')).toBe(false);
    });
    it('returns false for invalid inputs', () => {
      expect(isWithinMonitoringWindow(at('12:00'), 'bad', '05:00', 'UTC')).toBe(false);
      expect(isWithinMonitoringWindow(at('12:00'), '22:00', 'bad', 'UTC')).toBe(false);
    });
  });
});
