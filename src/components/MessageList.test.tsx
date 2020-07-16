import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { MessageList } from './MessageList';
import { Message } from '../messages/types';

const ME = 'user_yousof';

function message(over: Partial<Message> = {}): Message {
  return {
    id: 'm1',
    clientMessageId: null,
    conversationId: 'c1',
    senderId: ME,
    body: 'hello',
    sentAt: '2020-05-14T10:00:00Z',
    readAt: null,
    status: 'sent',
    ...over
  };
}

describe('MessageList', () => {
  it('says so when there is nothing yet', () => {
    render(<MessageList messages={[]} currentUserId={ME} />);
    expect(screen.getByText(/no messages yet/i)).toBeInTheDocument();
  });

  it('renders each message', () => {
    render(
      <MessageList
        messages={[message({ id: 'a', body: 'first' }), message({ id: 'b', body: 'second' })]}
        currentUserId={ME}
       
      />
    );

    expect(screen.getByText('first')).toBeInTheDocument();
    expect(screen.getByText('second')).toBeInTheDocument();
  });

  it('announces delivery state to screen readers, not just with a tick', () => {
    render(<MessageList messages={[message({ status: 'sending' })]} currentUserId={ME} />);
    expect(screen.getByLabelText('Sending')).toBeInTheDocument();
  });

  it('distinguishes sent from read', () => {
    const { rerender } = render(
      <MessageList messages={[message()]} currentUserId={ME} />
    );
    expect(screen.getByLabelText('Sent')).toBeInTheDocument();

    rerender(
      <MessageList
        messages={[message({ readAt: '2020-05-14T10:05:00Z' })]}
        currentUserId={ME}
       
      />
    );
    expect(screen.getByLabelText('Read')).toBeInTheDocument();
  });

  it('shows no delivery state on messages that are not ours', () => {
    render(
      <MessageList messages={[message({ senderId: 'someone_else' })]} currentUserId={ME} />
    );

    expect(screen.queryByLabelText('Sent')).not.toBeInTheDocument();
  });

});
