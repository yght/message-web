import * as React from 'react';
import { Message } from '../messages/types';
import { MessageBubble } from './MessageBubble';

interface Props {
  messages: Message[];
  currentUserId: string;
  onRetry: (clientMessageId: string) => void;
}

export function MessageList({ messages, currentUserId, onRetry }: Props): JSX.Element {
  const bottom = React.useRef<HTMLDivElement>(null);

  // Scroll to the newest message when one arrives. Keyed on length rather
  // than the array itself so a read receipt on an old message does not yank
  // the user back down while they are reading history.
  React.useEffect(() => {
    if (bottom.current && bottom.current.scrollIntoView) {
      bottom.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length]);

  if (messages.length === 0) {
    return <p className="messages__empty">No messages yet. Say something.</p>;
  }

  return (
    <div className="messages">
      <ul className="messages__list">
        {messages.map(message => (
          <MessageBubble
            key={message.id}
            message={message}
            isMine={message.senderId === currentUserId}
            onRetry={onRetry}
          />
        ))}
      </ul>
      <div ref={bottom} />
    </div>
  );
}
