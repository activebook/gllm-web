import './style.css';
import 'diff2html/bundles/css/diff2html.min.css';
import { fetchSSECompletion, resolveInteraction } from './api';
import { ChatRenderer } from './chat';

const chatRenderer = new ChatRenderer('chat-container');

// UI Elements
const form = document.getElementById('chat-form') as HTMLFormElement;
const input = document.getElementById('prompt-input') as HTMLTextAreaElement;
const sendBtn = document.getElementById('send-btn') as HTMLButtonElement;
const statusDot = document.querySelector('.dot') as HTMLElement;
const statusText = document.getElementById('connection-status') as HTMLElement;
const toolToast = document.getElementById('tool-status-toast') as HTMLElement;
const toolStatusText = document.getElementById('tool-status-text')!;

let isStreaming = false;
let currentAbortController: AbortController | null = null;
let currentSession = 'testbed-session';

// Track the last tool block for diff confirmation
let lastToolBlockForConfirm: Element | null = null;


// Auto-resize textarea
input.addEventListener('input', () => {
  input.style.height = 'auto';
  input.style.height = (input.scrollHeight) + 'px';
  if (input.value === '') {
    input.style.height = '';// reset
  }
});

// Submit on Enter (Shift+Enter for new line)
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (!isStreaming && input.value.trim().length > 0) {
      form.requestSubmit();
    }
  }
});

// State Handlers
function setStatus(statusType: string) {
  statusText.textContent = statusType;
  if (statusType === 'start_reasoning') {
    statusDot.className = 'dot thinking';
    statusText.textContent = 'Thinking...';
  } else if (statusType === 'agent_finished') {
    statusDot.className = 'dot';
    statusText.textContent = 'Ready';
  } else if (statusType === 'converting_session') {
    statusDot.className = 'dot active';
    statusText.textContent = 'Loading...';
  } else if (statusType === 'session_ready') {
    statusDot.className = 'dot active';
    statusText.textContent = 'Active';
  } else {
    statusDot.className = 'dot active';
  }
}

function lockInput() {
  isStreaming = true;
  input.disabled = true;
  sendBtn.disabled = false;
  sendBtn.classList.add('stop-btn');
  sendBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="7" width="10" height="10"></rect></svg>`;
  statusDot.classList.add('active');
  chatRenderer.showLoadingBubble();
}

function unlockInput() {
  isStreaming = false;
  input.disabled = false;
  sendBtn.disabled = false;
  sendBtn.classList.remove('stop-btn');
  sendBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>`;
  input.focus();
  statusDot.className = 'dot';
  statusText.textContent = 'Ready';
  toolToast.classList.add('hidden');
  currentAbortController = null;

  chatRenderer.removeLoadingBubble();
  // Terminate current active message bounds
  chatRenderer.terminateCurrentMessage();
  
  // Reset the tracked tool block
  lastToolBlockForConfirm = null;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (isStreaming) {
    if (currentAbortController) {
      currentAbortController.abort();
    }
    return;
  }

  const text = input.value.trim();
  if (!text) return;

  // Add user message to UI
  chatRenderer.addUserMessage(text);

  // Reset input UI
  input.value = '';
  input.style.height = '';
  lockInput();

  currentAbortController = new AbortController();

  await fetchSSECompletion({
    messages: [{ role: 'user', content: text }],
    session: currentSession,
    abortSignal: currentAbortController.signal,

    onStatus: (status) => {
      console.log('[SSE] status:', status);
      setStatus(status);
      if (status === 'start_reasoning') {
        chatRenderer.openReasoning();
      } else if (status === 'end_reasoning') {
        chatRenderer.closeReasoning();
      }
    },

    onTextChunk: (chunk) => {
      chatRenderer.appendTextChunk(chunk);
    },

    onReasoningChunk: (chunk) => {
      chatRenderer.appendReasoningChunk(chunk);
    },

    onToolCall: (fnName, args) => {
      console.log('[SSE] tool_call:', fnName, args);
      toolToast.classList.remove('hidden');
      toolStatusText.textContent = `Using ${fnName}...`;
      
      // Track which tool block this is for potential confirmation
      const toolBlock = chatRenderer.addToolBadge(fnName, args);
      lastToolBlockForConfirm = toolBlock;
      console.log('[DEBUG] toolBlock:', toolBlock, 'lastToolBlockForConfirm:', lastToolBlockForConfirm);
    },

    onCommand: (output, error) => {
      console.log('[SSE] command:', { output: output?.slice(0, 100), error });
      if (error) {
        chatRenderer.addErrorResponse(error);
      } else {
        chatRenderer.addSystemMessage(output);
      }
    },

    onDiff: (before, after) => {
      console.log('[SSE] diff received:', { 
        beforeLen: before?.length, 
        afterLen: after?.length,
        beforePreview: before?.slice(0, 100),
        afterPreview: after?.slice(0, 100)
      });
      // Store diff for the next confirm request
      chatRenderer.stashDiff(before, after);
      console.log('[DEBUG] diff stashed, stashedDiff:', chatRenderer.getStashedDiff());
    },

    onRequest: (id, type, purpose) => {
      console.log('[SSE] request:', { id, type, purpose });
      
      if (type === 'ask_user') {
        chatRenderer.addAskUserCard(purpose, async (answer, cancelled) => {
          await resolveInteraction(id, type, cancelled ? { cancelled: true } : { answer });
        });
      } else if (type === 'tool_confirm') {
        console.log('[DEBUG] before addConfirmCard - lastToolBlockForConfirm:', lastToolBlockForConfirm);
        console.log('[DEBUG] before addConfirmCard - stashedDiff:', chatRenderer.getStashedDiff());
        
        // Pass the last tool block so confirm card goes inside it
        chatRenderer.addConfirmCard(purpose, async (choice) => {
          console.log('[DEBUG] user choice:', choice);
          await resolveInteraction(id, type, { approve: choice });
        }, lastToolBlockForConfirm);
        
        // Clear the tracked tool block after use
        lastToolBlockForConfirm = null;
      }
    },

    onError: (msg, code) => {
      console.log('[SSE] error:', { msg, code });
      chatRenderer.addErrorResponse(msg, code);
      unlockInput();
    },

    onDone: () => {
      console.log('[SSE] done');
      unlockInput();
    }
  });
});
