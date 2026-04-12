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
  onToolCall?: (functionName: string, args: any) => void;
  onCommand?: (output: string, error?: string) => void;
  onError?: (message: string, code: string) => void;
  onDone?: () => void;
}

export async function fetchSSECompletion(params: FetchCompletionParams) {
  const url = 'http://localhost:8080/v1/chat/completions';
  
  try {
    const response = await fetch(url, {
      method: 'POST',
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
                params.onToolCall?.(data.content.function, data.content.args);
                break;
              case 'command':
                params.onCommand?.(data.content, data.error);
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
    params.onError?.(err.message, 'client_error');
    params.onDone?.();
  }
}
