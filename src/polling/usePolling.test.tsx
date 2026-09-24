import React from 'react';
import { act, render } from '@testing-library/react';
import { ApiError, MessageApi, PollResponse } from '../api/client';
import { usePolling } from './usePolling';

function harness(poll: jest.Mock, onMessages = jest.fn(), onAuthFailure = jest.fn()) {
  const api = { poll } as unknown as MessageApi;
  function View() {
    usePolling({ api, since: null, authenticated: true, onMessages, onAuthFailure });
    return null;
  }
  return { ...render(<View />), onMessages, onAuthFailure };
}
function visible() {
  act(() => { document.dispatchEvent(new Event('visibilitychange')); });
}
beforeEach(() => {
  jest.useFakeTimers();
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
});
afterEach(() => jest.useRealTimers());

test('visibility events cannot start overlapping requests', async () => {
  let resolve!: (value: PollResponse) => void;
  const poll = jest.fn(() => new Promise<PollResponse>(r => { resolve = r; }));
  const view = harness(poll);
  visible();
  visible();
  expect(poll).toHaveBeenCalledTimes(1);
  await act(async () => resolve({ messages: [], until: 'next' }));
  act(() => { jest.runOnlyPendingTimers(); });
  expect(poll).toHaveBeenCalledTimes(2);
  view.unmount();
});

test('unauthorized response stays stopped across visibility changes', async () => {
  const poll = jest.fn().mockRejectedValue(new ApiError(401, 'expired'));
  const view = harness(poll);
  await act(async () => {});
  visible();
  await act(async () => {});
  expect(poll).toHaveBeenCalledTimes(1);
  expect(view.onAuthFailure).toHaveBeenCalledTimes(1);
  view.unmount();
});

test('unmount aborts the request and ignores a late response', async () => {
  let resolve!: (value: PollResponse) => void;
  const poll = jest.fn(() => new Promise<PollResponse>(r => { resolve = r; }));
  const view = harness(poll);
  const signal = (poll.mock.calls as unknown as [unknown, AbortSignal][])[0][1];
  view.unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => resolve({ messages: [], until: 'late' }));
  expect(view.onMessages).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
});
