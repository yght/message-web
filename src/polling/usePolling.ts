import { useEffect, useRef } from 'react';
import { MessageApi } from '../api/client';
import { ServerMessage } from '../messages/types';
import { ApiError } from '../api/client';
import { PollOutcome, delayAfter, nextFailureCount } from './pollingSchedule';

interface PollingArgs {
  api: MessageApi;
  since: string | null;
  authenticated: boolean;
  onMessages: (messages: ServerMessage[], until: string | null) => void;
  onAuthFailure?: () => void;
}

/**
 * Runs the long poll for as long as the component is mounted.
 *
 * The loop is a recursive setTimeout rather than a setInterval. An interval
 * fires whether or not the previous poll came back, so a slow server gives
 * you overlapping requests, out-of-order responses and a cursor that walks
 * backwards.
 */
export function usePolling({
  api,
  since,
  authenticated,
  onMessages,
  onAuthFailure
}: PollingArgs): void {
  // The cursor lives in a ref as well as in state so the loop always reads
  // the current value without having to restart on every message.
  const sinceRef = useRef(since);
  sinceRef.current = since;

  const onMessagesRef = useRef(onMessages);
  onMessagesRef.current = onMessages;

  useEffect(() => {
    if (!authenticated) {
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let controller: AbortController | null = null;
    let failures = 0;

    async function loop(): Promise<void> {
      if (cancelled) {
        return;
      }

      controller = new AbortController();
      let outcome: PollOutcome;

      try {
        const response = await api.poll(sinceRef.current, controller.signal);

        if (cancelled) {
          return;
        }

        onMessagesRef.current(response.messages, response.until);
        outcome = response.messages.length > 0 ? { kind: 'messages' } : { kind: 'empty' };
      } catch (err) {
        if (cancelled || (err instanceof Error && err.name === 'AbortError')) {
          outcome = { kind: 'aborted' };
        } else if (err instanceof ApiError) {
          outcome = { kind: 'error', status: err.status };
          if (err.status === 401 && onAuthFailure) {
            onAuthFailure();
          }
        } else {
          outcome = { kind: 'error', status: 0 };
        }
      }

      failures = nextFailureCount(failures, outcome);
      const delay = delayAfter(outcome, failures);

      if (delay === null || cancelled) {
        return;
      }

      timer = setTimeout(loop, delay);
    }

    loop();

    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
      if (controller) {
        controller.abort();
      }
    };
  }, [api, authenticated, onAuthFailure]);
}
