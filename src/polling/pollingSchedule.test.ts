import { delayAfter, nextFailureCount, shouldPoll, PollOutcome } from './pollingSchedule';

const noJitter = { random: () => 0.5 };

describe('delayAfter', () => {
  it('polls again immediately after a successful poll', () => {
    expect(delayAfter({ kind: 'messages' }, 0, noJitter)).toBe(0);
  });

  it('polls again immediately when the long poll simply timed out empty', () => {
    expect(delayAfter({ kind: 'empty' }, 0, noJitter)).toBe(0);
  });

  it('stops entirely when the poll was aborted', () => {
    expect(delayAfter({ kind: 'aborted' }, 0, noJitter)).toBeNull();
  });

  it('stops entirely on a 401, because the token will not fix itself', () => {
    expect(delayAfter({ kind: 'error', status: 401 }, 1, noJitter)).toBeNull();
  });

  it('backs off exponentially on errors', () => {
    const err: PollOutcome = { kind: 'error', status: 503 };

    expect(delayAfter(err, 1, noJitter)).toBe(1000);
    expect(delayAfter(err, 2, noJitter)).toBe(2000);
    expect(delayAfter(err, 3, noJitter)).toBe(4000);
    expect(delayAfter(err, 5, noJitter)).toBe(16000);
  });

  it('caps the backoff', () => {
    expect(delayAfter({ kind: 'error', status: 500 }, 20, noJitter)).toBe(60000);
  });

  it('jitters, so twenty tabs do not retry in lockstep', () => {
    const err: PollOutcome = { kind: 'error', status: 503 };
    const seen = new Set<number | null>();

    for (let i = 0; i < 200; i++) {
      seen.add(delayAfter(err, 4));
    }

    expect(seen.size).toBeGreaterThan(100);
  });

  it('stays inside the jitter band', () => {
    const err: PollOutcome = { kind: 'error', status: 503 };

    expect(delayAfter(err, 3, { random: () => 0 })).toBe(3000);       // 4000 * 0.75
    expect(delayAfter(err, 3, { random: () => 0.999999 })).toBe(5000); // 4000 * 1.25
  });
});

describe('nextFailureCount', () => {
  it('counts consecutive errors', () => {
    expect(nextFailureCount(0, { kind: 'error', status: 500 })).toBe(1);
    expect(nextFailureCount(3, { kind: 'error', status: 500 })).toBe(4);
  });

  it('resets on any success', () => {
    expect(nextFailureCount(7, { kind: 'messages' })).toBe(0);
    expect(nextFailureCount(7, { kind: 'empty' })).toBe(0);
  });
});

describe('shouldPoll', () => {
  it('polls a visible, authenticated tab', () => {
    expect(shouldPoll('visible', true)).toBe(true);
  });

  it('does not poll a hidden tab', () => {
    expect(shouldPoll('hidden', true)).toBe(false);
  });

  it('does not poll when signed out', () => {
    expect(shouldPoll('visible', false)).toBe(false);
  });
});
