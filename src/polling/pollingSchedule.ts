/**
 * Long-poll scheduling.
 *
 * The API holds a poll open for up to 30 seconds and returns as soon as
 * something arrives. So the happy path is: poll returns, poll again straight
 * away, forever. The interesting part is everything else.
 *
 * Pure and clock-free: given the outcome of the last poll, say how long to
 * wait before the next one. The hook does the waiting.
 */

export type PollOutcome =
  | { kind: 'messages' }
  | { kind: 'empty' }
  | { kind: 'error'; status: number }
  | { kind: 'aborted' };

export interface ScheduleOptions {
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitterRatio?: number;
  random?: () => number;
}

const DEFAULTS = {
  baseDelayMs: 1000,
  maxDelayMs: 60000,
  jitterRatio: 0.25
};

/**
 * How many consecutive failures we have seen, given the previous count and
 * what just happened. Anything that is not an error resets it.
 */
export function nextFailureCount(previous: number, outcome: PollOutcome): number {
  return outcome.kind === 'error' ? previous + 1 : 0;
}

/**
 * Delay before the next poll.
 *
 * Zero after a successful poll - the server was holding the connection, so
 * there is no need to add a wait on top of it. Backoff only applies to
 * failures.
 *
 * A 401 is not retried at all. The token is not going to fix itself, and
 * hammering the auth endpoint from every open tab is how you get rate
 * limited by your own identity provider.
 */
export function delayAfter(
  outcome: PollOutcome,
  failureCount: number,
  options: ScheduleOptions = {}
): number | null {
  const opts = { ...DEFAULTS, ...options };
  const random = options.random || Math.random;

  if (outcome.kind === 'aborted') {
    return null;
  }

  if (outcome.kind === 'error' && outcome.status === 401) {
    return null;
  }

  if (outcome.kind === 'messages' || outcome.kind === 'empty') {
    return 0;
  }

  const exponential = opts.baseDelayMs * Math.pow(2, Math.max(0, failureCount - 1));
  const capped = Math.min(exponential, opts.maxDelayMs);
  const multiplier = 1 - opts.jitterRatio + random() * opts.jitterRatio * 2;

  return Math.max(0, Math.round(capped * multiplier));
}

/**
 * Should we be polling at all?
 *
 * A backgrounded tab does not need live messages, and twenty open tabs
 * holding twenty long polls is a real cost on both ends. We stop when the
 * document is hidden and poll once immediately when it comes back.
 */
export function shouldPoll(visibility: string, authenticated: boolean): boolean {
  return authenticated && visibility !== 'hidden';
}
