export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface FetchCompletionParams {
  messages: Message[];
  session?: string;
  onTextChunk?: (chunk: string) => void;
  onReasoningChunk?: (chunk: string) => void;
  onStatus?: (status: string) => void;
  onToolCall?: (functionName: string, description: string) => void;
  onCommand?: (output: string, error?: string) => void;
  onRequest?: (id: string, kind: string, purpose: string, tool?: string) => void;
  onDiff?: (before: string, after: string) => void;
  onError?: (message: string, code: string) => void;
  onDone?: () => void;
  abortSignal?: AbortSignal;
}

export async function fetchSSECompletion(params: FetchCompletionParams) {
  const url = 'http://localhost:8080/v1/chat/completions';

  try {
    const response = await fetch(url, {
      method: 'POST',
      signal: params.abortSignal,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: params.messages,
        session: params.session,
        model: 'gpt-4o', // default placeholder
        stream: true
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    if (!response.body) {
      throw new Error("ReadableStream not yet supported in this browser.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n\n');
      // The last element is either an empty string (if ends with \n\n) or incomplete chunk
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;

        const dataStr = line.substring(6).trim(); // Remove "data: "

        if (dataStr === '[DONE]') {
          params.onDone?.();
          return;
        }

        try {
          const packet = JSON.parse(dataStr);

          if (packet.choices) {
            const delta = packet.choices[0].delta;
            if (delta.content && params.onTextChunk) {
              params.onTextChunk(delta.content);
            }
            if (delta.reasoning_content && params.onReasoningChunk) {
              params.onReasoningChunk(delta.reasoning_content);
            }
          } else if (packet.type) {
            const data = packet.data;
            switch (packet.type) {
              case 'status':
                params.onStatus?.(data.content);
                break;
              case 'tool_call':
                params.onToolCall?.(data.content.function, data.content.description);
                break;
              case 'command':
                params.onCommand?.(data.content, data.error);
                break;
              case 'request':
                params.onRequest?.(data.id, data.type, data.purpose, data.tool);
                break;
              case 'diff':
                params.onDiff?.(data.before, data.after);
                break;
              case 'error':
                params.onError?.(data.content, data.code);
                break;
            }
          }
        } catch (e) {
          console.error("Failed to parse SSE packet:", e, dataStr);
        }
      }
    }

    params.onDone?.(); // Call done if stream ends without [DONE] 

  } catch (err: any) {
    if (err.name === 'AbortError') {
      console.log('Stream aborted by user');
      params.onDone?.();
      return;
    }
    params.onError?.(err.message, 'client_error');
    params.onDone?.();
  }
}

export async function resolveInteraction(id: string, kind: string, payload: any) {
  const url = 'http://localhost:8080/v1/interact';
  const body = { id, kind, ...payload };
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
}
