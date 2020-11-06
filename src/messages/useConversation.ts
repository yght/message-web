import { useCallback, useReducer } from 'react';
import { MessageApi, ApiError } from '../api/client';
import { messageReducer, initialState, visibleMessages } from './messageReducer';
import { Message, ServerMessage } from './types';

/**
 * Generate a client message id.
 *
 * Not crypto-strong and does not need to be - it only has to be unique within
 * one conversation for long enough to reconcile a send. crypto.randomUUID is
 * not available in the browsers we support.
 */
function clientMessageId(): string {
  return (
    Date.now().toString(36) +
    '-' +
    Math.random().toString(36).slice(2, 10)
  );
}

interface Args {
  api: MessageApi;
  conversationId: string;
  currentUserId: string;
  recipientId: string;
}

export function useConversation({ api, conversationId, currentUserId, recipientId }: Args) {
  const [state, dispatch] = useReducer(messageReducer, initialState);

  const onMessages = useCallback((messages: ServerMessage[], until: string | null) => {
    dispatch({ type: 'MESSAGES_RECEIVED', messages, until });
  }, []);

  const deliver = useCallback(
    async (body: string, id: string) => {
      try {
        const saved = await api.sendMessage({ recipientId, body, clientMessageId: id });
        dispatch({ type: 'SEND_SUCCEEDED', clientMessageId: id, message: saved });
      } catch (err) {
        dispatch({
          type: 'SEND_FAILED',
          clientMessageId: id,
          reason: friendly(err)
        });
      }
    },
    [api, recipientId]
  );

  const send = useCallback(
    (body: string) => {
      const id = clientMessageId();

      const optimistic: Message = {
        id: 'tmp_' + id,
        clientMessageId: id,
        conversationId,
        senderId: currentUserId,
        body,
        sentAt: new Date().toISOString(),
        readAt: null,
        status: 'sending'
      };

      dispatch({ type: 'SEND_STARTED', message: optimistic });
      deliver(body, id);
    },
    [conversationId, currentUserId, deliver]
  );

  const retry = useCallback(
    (id: string) => {
      const existingId = state.byClientId[id];
      const message = existingId ? state.entities[existingId] : null;

      if (!message) {
        return;
      }

      dispatch({ type: 'RETRY_SEND', clientMessageId: id });
      deliver(message.body, id);
    },
    [state.byClientId, state.entities, deliver]
  );

  return {
    messages: visibleMessages(state),
    since: state.since,
    onMessages,
    send,
    retry
  };
}

/**
 * The API sends a reason on failures worth explaining. Anything else gets a
 * sentence the user can act on rather than a status code.
 */
function friendly(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 0) {
      return 'No connection.';
    }
    if (err.status === 401) {
      return 'Your session expired. Sign in again.';
    }
    if (err.status === 403) {
      return 'You cannot message this person.';
    }
    if (err.status === 413) {
      return 'That message is too long.';
    }
    if (err.status >= 500) {
      return 'The server is having trouble. Tap to try again.';
    }
    return err.reason || 'Not delivered.';
  }

  return 'No connection.';
}
