import { useEffect, useRef } from 'react';
import { useAppState, useAppDispatch } from '../../state/AppContext';
import { AgentInput } from './AgentInput';
import { MessageList } from './MessageList';
import { processAgentResponse } from '../../agent/mockAgent';

export function AgentWorkspace() {
  const { messages, profile, comments, readiness } = useAppState();
  const dispatch = useAppDispatch();
  const initializedRef = useRef(false);

  // Send initial onboarding message
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const greeting = processAgentResponse(
      { type: 'init' },
      { profile, readiness },
    );
    for (const msg of greeting) {
      dispatch({ type: 'ADD_MESSAGE', message: msg });
    }
  }, []);

  // Process comment batches
  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.type !== 'comment-batch') return;

    // Simulate agent thinking delay
    const timer = setTimeout(() => {
      const responses = processAgentResponse(
        { type: 'comments', comments: lastMsg.comments || [] },
        { profile, readiness },
      );
      for (const msg of responses) {
        dispatch({ type: 'ADD_MESSAGE', message: msg });
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [messages.length]);

  function handleUserMessage(text: string) {
    // Add user message
    dispatch({
      type: 'ADD_MESSAGE',
      message: {
        id: crypto.randomUUID(),
        type: 'user-text',
        content: text,
        timestamp: Date.now(),
      },
    });

    // Simulate agent response
    setTimeout(() => {
      const responses = processAgentResponse(
        { type: 'freeform', text },
        { profile, readiness },
      );
      for (const msg of responses) {
        dispatch({ type: 'ADD_MESSAGE', message: msg });
      }
    }, 800 + Math.random() * 700);
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <MessageList messages={messages} />
      <AgentInput onSend={handleUserMessage} />
    </div>
  );
}
