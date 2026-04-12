import './style.css';
import { fetchSSECompletion } from './api';
import { ChatRenderer } from './chat';

const chatRenderer = new ChatRenderer('chat-container');

// UI Elements
const form = document.getElementById('chat-form') as HTMLFormElement;
const input = document.getElementById('prompt-input') as HTMLTextAreaElement;
const sendBtn = document.getElementById('send-btn') as HTMLButtonElement;
const statusDot = document.querySelector('.dot') as HTMLElement;
const statusText = document.getElementById('connection-status') as HTMLElement;
const toolToast = document.getElementById('tool-status-toast') as HTMLElement;
const toolStatusText = document.getElementById('tool-status-text') as HTMLElement;
let isStreaming = false;
let currentSession = 'testbed-session';

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
  sendBtn.disabled = true;
  sendBtn.innerHTML = `<div class="btn-spinner"></div>`;
  statusDot.classList.add('active');
  chatRenderer.showLoadingBubble();
}

function unlockInput() {
  isStreaming = false;
  input.disabled = false;
  sendBtn.disabled = false;
  sendBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>`;
  input.focus();
  statusDot.className = 'dot';
  statusText.textContent = 'Ready';
  toolToast.classList.add('hidden');
  
  chatRenderer.removeLoadingBubble();
  // Terminate current active message bounds
  chatRenderer.terminateCurrentMessage();
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text || isStreaming) return;

  // Add user message to UI
  chatRenderer.addUserMessage(text);
  
  // Reset input UI
  input.value = '';
  input.style.height = '';
  lockInput();

  await fetchSSECompletion({
    messages: [{ role: 'user', content: text }],
    session: currentSession,
    
    onStatus: (status) => {
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
      toolToast.classList.remove('hidden');
      toolStatusText.textContent = `Using ${fnName}...`;
      chatRenderer.addToolBadge(fnName, args);
    },

    onCommand: (output, error) => {
      if (error) {
        chatRenderer.addErrorResponse(error);
      } else {
        chatRenderer.addSystemMessage(output);
      }
    },

    onError: (msg, code) => {
      chatRenderer.addErrorResponse(msg, code);
      unlockInput();
    },

    onDone: () => {
      unlockInput();
    }
  });
});
