import * as React from 'react';
import { Message } from '../messages/types';

interface Props {
  message: Message;
  isMine: boolean;
}

/**
 * One message.
 */
export function MessageBubble({ message, isMine }: Props): JSX.Element {
  return (
    <li className={'bubble' + (isMine ? ' bubble--mine' : '')}>
      <p className="bubble__body">{message.body}</p>

      <span className="bubble__meta">
        <time dateTime={message.sentAt}>{formatTime(message.sentAt)}</time>

      </span>
        )}
      </span>

    </li>
  );
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return hours + ':' + minutes;
}
