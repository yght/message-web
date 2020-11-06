import * as React from 'react';
import { MessageApi } from '../api/client';
import { useConversation } from '../messages/useConversation';
import { usePolling } from '../polling/usePolling';
import { MessageList } from './MessageList';
import { MessageComposer } from './MessageComposer';

interface Props {
  api: MessageApi;
  conversationId: string;
  currentUserId: string;
  recipientId: string;
  recipientName: string;
  authenticated: boolean;
  onAuthFailure?: () => void;
}

export function ConversationView({
  api,
  conversationId,
  currentUserId,
  recipientId,
  recipientName,
  authenticated,
  onAuthFailure
}: Props): JSX.Element {
  const { messages, since, onMessages, send, retry } = useConversation({
    api,
    conversationId,
    currentUserId,
    recipientId
  });

  usePolling({ api, since, authenticated, onMessages, onAuthFailure });

  return (
    <section className="conversation">
      <header className="conversation__header">
        <h1>{recipientName}</h1>
      </header>

      <MessageList messages={messages} currentUserId={currentUserId} onRetry={retry} />

      <MessageComposer onSend={send} disabled={!authenticated} />
    </section>
  );
}
