export class ChatRenderer {
  private container: HTMLElement;
  private currentMsgEl: HTMLElement | null = null;
  private currentContentEl: HTMLElement | null = null;
  private currentReasoningEl: HTMLElement | null = null;
  private currentReasoningContentEl: HTMLElement | null = null;

  constructor(containerId: string) {
    const el = document.getElementById(containerId);
    if (!el) throw new Error(`Container #${containerId} not found`);
    this.container = el;
  }

  private scrollToBottom() {
    this.container.scrollTop = this.container.scrollHeight;
  }

  // Escape HTML simply for now, full markdown would use a library
  private escapeHtml(unsafe: string) {
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
  }

  private renderMarkdown(text: string): string {
    let escaped = this.escapeHtml(text);
    // Extremely basic formatting for now: code blocks and line breaks
    escaped = escaped.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
    escaped = escaped.replace(/`([^`]+)`/g, '<code>$1</code>');
    return escaped.replace(/\n/g, '<br/>');
  }

  public addUserMessage(content: string) {
    const msg = document.createElement('div');
    msg.className = 'message user';
    msg.innerHTML = `<div class="content">${this.escapeHtml(content)}</div>`;
    this.container.appendChild(msg);
    this.scrollToBottom();
  }

  public addSystemMessage(text: string) {
    this.removeLoadingBubble();
    const msg = document.createElement('div');
    msg.className = 'message system';
    msg.innerHTML = `<div class="content">${this.renderMarkdown(text)}</div>`;
    this.container.appendChild(msg);
    this.scrollToBottom();
  }

  public addErrorResponse(text: string, code?: string) {
    this.removeLoadingBubble();
    const msg = document.createElement('div');
    msg.className = 'message error';
    msg.innerHTML = `<div class="content"><strong>Error (${code}):</strong> ${this.escapeHtml(text)}</div>`;
    this.container.appendChild(msg);
    this.scrollToBottom();
  }

  public showLoadingBubble() {
    this.removeLoadingBubble();
    this.currentMsgEl = document.createElement('div');
    this.currentMsgEl.className = 'message agent loading-bubble';
    this.currentMsgEl.innerHTML = `
      <div class="content">
        <div class="typing-indicator">
          <span></span><span></span><span></span>
        </div>
      </div>
    `;
    this.container.appendChild(this.currentMsgEl);
    this.scrollToBottom();
  }

  public removeLoadingBubble() {
    if (this.currentMsgEl && this.currentMsgEl.classList.contains('loading-bubble')) {
      this.currentMsgEl.remove();
      this.currentMsgEl = null;
    }
  }

  public initAssistantMessage() {
    this.removeLoadingBubble();
    this.currentMsgEl = document.createElement('div');
    this.currentMsgEl.className = 'message agent';
    
    this.currentContentEl = document.createElement('div');
    this.currentContentEl.className = 'content';
    this.currentContentEl.setAttribute('data-raw', '');
    
    this.currentMsgEl.appendChild(this.currentContentEl);
    this.container.appendChild(this.currentMsgEl);
    this.scrollToBottom();
  }

  public appendTextChunk(chunk: string) {
    if (!this.currentContentEl || (this.currentMsgEl && this.currentMsgEl.classList.contains('loading-bubble'))) {
      this.initAssistantMessage();
    }
    
    const raw = this.currentContentEl!.getAttribute('data-raw') || '';
    const updated = raw + chunk;
    this.currentContentEl!.setAttribute('data-raw', updated);
    this.currentContentEl!.innerHTML = this.renderMarkdown(updated);
    this.scrollToBottom();
  }

  public openReasoning() {
    if (!this.currentMsgEl || this.currentMsgEl.classList.contains('loading-bubble')) {
      this.initAssistantMessage();
    }
    
    const block = document.createElement('div');
    block.className = 'reasoning-block';
    
    const header = document.createElement('div');
    header.className = 'reasoning-header';
    header.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
      </svg>
      <span>Reasoning Block (Thinking...)</span>
    `;
    
    header.onclick = () => {
      block.classList.toggle('open');
    };
    
    const content = document.createElement('div');
    content.className = 'reasoning-content';
    
    block.appendChild(header);
    block.appendChild(content);
    
    // Insert reasoning block before main content
    this.currentMsgEl!.insertBefore(block, this.currentContentEl);
    
    this.currentReasoningEl = block;
    this.currentReasoningContentEl = content;
    
    // Auto-open reasoning
    block.classList.add('open');
    this.scrollToBottom();
  }

  public appendReasoningChunk(chunk: string) {
    if (!this.currentReasoningContentEl) this.openReasoning();
    const txt = document.createTextNode(chunk);
    this.currentReasoningContentEl!.appendChild(txt);
    this.scrollToBottom();
  }

  public closeReasoning() {
    if (this.currentReasoningEl) {
      const headerSpan = this.currentReasoningEl.querySelector('span');
      if (headerSpan) headerSpan.textContent = 'Reasoning Complete';
      
      if (this.currentReasoningContentEl) {
        this.currentReasoningContentEl.textContent = this.currentReasoningContentEl.textContent?.trimEnd() || '';
      }
      
      // Auto-collapse reasoning after it completes to save space
      setTimeout(() => {
        if (this.currentReasoningEl) {
          this.currentReasoningEl.classList.remove('open');
        }
      }, 1000);
      
      this.currentReasoningEl = null;
      this.currentReasoningContentEl = null;
    }
  }

  public addToolBadge(functionName: string, args: any) {
    if (!this.currentMsgEl || this.currentMsgEl.classList.contains('loading-bubble')) {
      this.initAssistantMessage();
    }
    
    const badge = document.createElement('div');
    badge.className = 'tool-badge';
    
    const sfArgs = JSON.stringify(args).substring(0, 40) + (JSON.stringify(args).length > 40 ? '...' : '');
    
    badge.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3"></circle>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
      </svg>
      <span>${functionName}(${sfArgs})</span>
    `;
    
    this.currentMsgEl!.insertBefore(badge, this.currentContentEl);
    this.scrollToBottom();
  }

  public terminateCurrentMessage() {
    this.currentMsgEl = null;
    this.currentContentEl = null;
    this.closeReasoning(); // Just in case
  }
}
