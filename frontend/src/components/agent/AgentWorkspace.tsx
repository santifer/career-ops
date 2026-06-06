import { useEffect, useRef, useState } from 'react';
import { useAppState, useAppDispatch } from '../../state/useAppContext';
import { AgentInput } from './AgentInput';
import { MessageList } from './MessageList';
import { processAgentResponse } from '../../agent/mockAgent';

export function AgentWorkspace() {
  const { messages, profile, readiness } = useAppState();
  const dispatch = useAppDispatch();
  const [isThinking, setIsThinking] = useState(false);
  const initializedRef = useRef(false);
  const processedBatchIdsRef = useRef(new Set<string>());

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
  }, [dispatch, profile, readiness]);

  // Process comment batches
  useEffect(() => {
    const lastMsg = messages[messages.length - 1];
    if (!lastMsg || lastMsg.type !== 'comment-batch') return;
    const batchId = lastMsg.comments?.[0]?.batchId || lastMsg.id;
    if (processedBatchIdsRef.current.has(batchId)) return;
    processedBatchIdsRef.current.add(batchId);

    setIsThinking(true);
    const timer = setTimeout(() => {
      const responses = processAgentResponse(
        { type: 'comments', comments: lastMsg.comments || [] },
        { profile, readiness },
      );
      for (const msg of responses) {
        dispatch({ type: 'ADD_MESSAGE', message: msg });
      }
      setIsThinking(false);
    }, 1000);

    return () => {
      clearTimeout(timer);
      setIsThinking(false);
    };
  }, [dispatch, messages, profile, readiness]);

  function handleUserMessage(text: string) {
    dispatch({
      type: 'ADD_MESSAGE',
      message: {
        id: crypto.randomUUID(),
        type: 'user-text',
        content: text,
        timestamp: Date.now(),
      },
    });

    setIsThinking(true);
    setTimeout(() => {
      const responses = processAgentResponse(
        { type: 'freeform', text },
        { profile, readiness },
      );
      for (const msg of responses) {
        dispatch({ type: 'ADD_MESSAGE', message: msg });
      }
      setIsThinking(false);
    }, 800 + Math.random() * 700);
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <MessageList messages={messages} isThinking={isThinking} />
      <AgentInput onSend={handleUserMessage} />
    </div>
  );
}
