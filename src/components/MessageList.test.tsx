import * as React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
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
    render(<MessageList messages={[]} currentUserId={ME} onRetry={jest.fn()} />);
    expect(screen.getByText(/no messages yet/i)).toBeInTheDocument();
  });

  it('renders each message', () => {
    render(
      <MessageList
        messages={[message({ id: 'a', body: 'first' }), message({ id: 'b', body: 'second' })]}
        currentUserId={ME}
        onRetry={jest.fn()}
      />
    );

    expect(screen.getByText('first')).toBeInTheDocument();
    expect(screen.getByText('second')).toBeInTheDocument();
  });

  it('announces delivery state to screen readers, not just with a tick', () => {
    render(<MessageList messages={[message({ status: 'sending' })]} currentUserId={ME} onRetry={jest.fn()} />);
    expect(screen.getByLabelText('Sending')).toBeInTheDocument();
  });

  it('distinguishes sent from read', () => {
    const { rerender } = render(
      <MessageList messages={[message()]} currentUserId={ME} onRetry={jest.fn()} />
    );
    expect(screen.getByLabelText('Sent')).toBeInTheDocument();

    rerender(
      <MessageList
        messages={[message({ readAt: '2020-05-14T10:05:00Z' })]}
        currentUserId={ME}
        onRetry={jest.fn()}
      />
    );
    expect(screen.getByLabelText('Read')).toBeInTheDocument();
  });

  it('shows no delivery state on messages that are not ours', () => {
    render(
      <MessageList messages={[message({ senderId: 'someone_else' })]} currentUserId={ME} onRetry={jest.fn()} />
    );

    expect(screen.queryByLabelText('Sent')).not.toBeInTheDocument();
  });

  it('offers a retry on a failed message, and says why', () => {
    const onRetry = jest.fn();
    render(
      <MessageList
        messages={[message({ status: 'failed', failureReason: 'Network unreachable', clientMessageId: 'c9' })]}
        currentUserId={ME}
        onRetry={onRetry}
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Network unreachable');

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledWith('c9');
  });
});
