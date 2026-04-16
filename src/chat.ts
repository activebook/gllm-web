import { createPatch } from 'diff';
import { html as d2h } from 'diff2html';

export class ChatRenderer {
  private container: HTMLElement;
  private currentMsgEl: HTMLElement | null = null;
  private currentContentEl: HTMLElement | null = null;
  private currentReasoningEl: HTMLElement | null = null;
  private currentReasoningContentEl: HTMLElement | null = null;
  private currentSystemMsgEl: HTMLElement | null = null;
  private currentSystemMsgContent: string = '';
  
  // Stashed diff for the next confirm request
  private stashedDiff: { before: string; after: string } | null = null;

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
    this.terminateCurrentMessage();
    const msg = document.createElement('div');
    msg.className = 'message user';
    msg.innerHTML = `<div class="content">${this.escapeHtml(content)}</div>`;
    this.container.appendChild(msg);
    this.scrollToBottom();
  }

  public addSystemMessage(text: string) {
    this.removeLoadingBubble();
    
    if (!this.currentSystemMsgEl) {
      this.currentSystemMsgContent = '';
      
      const systemBlock = document.createElement('div');
      systemBlock.className = 'message system command-block open';
      this.currentSystemMsgEl = systemBlock;
      
      const header = document.createElement('div');
      header.className = 'command-header';
      header.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line>
        </svg>
        <span>Command Execution / Feedback</span>
      `;
      
      header.onclick = () => {
        systemBlock.classList.toggle('open');
      };
      
      const content = document.createElement('div');
      content.className = 'command-content';
      
      systemBlock.appendChild(header);
      systemBlock.appendChild(content);
      
      this.container.appendChild(systemBlock);
    }
    
    this.currentSystemMsgContent += text;
    
    // We optionally treat terminal output as markdown code block if not already properly formatted, 
    // but renderMarkdown handles it if properly wrapped. We'll dump it raw mapped or let renderMarkdown process.
    const contentBox = this.currentSystemMsgEl.querySelector('.command-content')!;
    contentBox.innerHTML = this.renderMarkdown(this.currentSystemMsgContent);
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

  // Stash diff for the next confirm request
  public stashDiff(before: string, after: string) {
    this.stashedDiff = { before, after };
  }

  // Get the stashed diff (for debugging)
  public getStashedDiff(): { before: string; after: string } | null {
    return this.stashedDiff;
  }

  // Track the last tool block for proper ordering
  private lastToolBlock: Element | null = null;

  // Add a tool badge and return the tool block element
  // Returns: the tool block element for tracking
  public addToolBadge(functionName: string, description: string): HTMLElement | null {
    if (!this.currentMsgEl || this.currentMsgEl.classList.contains('loading-bubble')) {
      this.initAssistantMessage();
    }
    
    let purpose = description || '';
    
    const block = document.createElement('div');
    block.className = 'tool-block';
    
    const header = document.createElement('div');
    header.className = 'tool-header';
    
    const titleHtml = `
      <div class="tool-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3"></circle>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
        </svg>
        <span>${functionName}</span>
      </div>
    `;

    const purposeHtml = purpose ? `<div class="tool-purpose">${this.escapeHtml(purpose)}</div>` : '';
    header.innerHTML = titleHtml + purposeHtml;
    
    header.onclick = () => {
      block.classList.toggle('open');
    };
    
    const content = document.createElement('div');
    content.className = 'tool-content';
    
    block.appendChild(header);
    block.appendChild(content);
    
    // Insert tool block after the last tool block to maintain streaming order
    // If no lastToolBlock, insert before currentContentEl
    if (this.lastToolBlock && this.lastToolBlock.parentNode === this.currentMsgEl) {
      // Insert after the last tool block
      this.currentMsgEl!.insertBefore(block, this.lastToolBlock.nextSibling);
    } else {
      // First tool or lastToolBlock was removed, insert before content
      this.currentMsgEl!.insertBefore(block, this.currentContentEl);
    }
    this.lastToolBlock = block;
    this.scrollToBottom();
    
    return block;
  }

  public terminateCurrentMessage() {
    this.currentMsgEl = null;
    this.currentContentEl = null;
    this.currentSystemMsgEl = null;
    this.currentSystemMsgContent = '';
    this.lastToolBlock = null;
    this.closeReasoning(); // Just in case
    // Clear stashed diff when message is terminated
    this.stashedDiff = null;
  }

  // Renders an inline confirmation card (tool_confirm) appended to the chat container.
  // The diff (if available) is rendered as a side-by-side diff2html block.
  // 
  // @param purpose - The purpose/description of the action being confirmed
  // @param onChoice - Callback when user makes a choice (once, always, cancel)
  // @param parentToolBlock - Optional: If provided, the confirm card is appended inside this tool block
  public addConfirmCard(
    purpose: string,
    onChoice: (choice: 'once' | 'always' | 'cancel') => Promise<void>,
    parentToolBlock?: Element | null
  ) {
    this.removeLoadingBubble();

    // Get the stashed diff (if any) - tools like edit_file and write_file send diff before confirm
    const diff = this.stashedDiff;
    this.stashedDiff = null;

    // ── Resolve the tool-block we'll inject the card into ─────────────────────
    // Priority: explicit parentToolBlock → last tool-block in currentMsgEl → outer container
    let toolBlock: Element | null = parentToolBlock ?? null;
    if (!toolBlock && this.currentMsgEl) {
      const blocks = this.currentMsgEl.querySelectorAll('.tool-block');
      if (blocks.length > 0) toolBlock = blocks[blocks.length - 1];
    }

    let targetContainer: HTMLElement = this.container;
    if (toolBlock) {
      const contentDiv = toolBlock.querySelector('.tool-content');
      if (contentDiv) {
        targetContainer = contentDiv as HTMLElement;
        toolBlock.classList.add('open');
      } else {
        toolBlock = null; // can't inject — fall back to outer container
      }
    }

    const card = document.createElement('div');
    card.className = 'interaction-card confirm-card';

    // 1. Purpose row
    const purposeEl = document.createElement('div');
    purposeEl.className = 'interaction-card-purpose';
    purposeEl.textContent = purpose;
    card.appendChild(purposeEl);

    // 2. Optional diff viewer - appended directly, buttons come after
    if (diff) {
      try {
        const patch = createPatch('changes', diff.before, diff.after, '', '', { context: 3 });
        const diffHtml = d2h(patch, {
          drawFileList: false,
          matching: 'lines',
          outputFormat: 'line-by-line',
          renderNothingWhenEmpty: false,
        });
        const diffEl = document.createElement('div');
        diffEl.className = 'interaction-card-diff';
        diffEl.innerHTML = diffHtml;
        card.appendChild(diffEl);
      } catch (e) {
        console.error('Failed to render diff:', e);
      }
    }

    // 3. Action buttons
    const buttonsEl = document.createElement('div');
    buttonsEl.className = 'interaction-card-actions';

    const resolve = (statusText: string) => {
      buttonsEl.remove();
      card.classList.add('resolved');
      const label = document.createElement('div');
      label.className = 'interaction-card-actions';
      label.style.fontStyle = 'italic';
      label.style.color = 'var(--text-secondary)';
      label.style.fontSize = '0.9rem';
      label.textContent = `Result: ${statusText}`;
      card.appendChild(label);
      if (toolBlock) setTimeout(() => toolBlock!.classList.remove('open'), 400);
    };

    const denyBtn = document.createElement('button');
    denyBtn.className = 'interaction-btn danger';
    denyBtn.textContent = 'Deny';
    denyBtn.onclick = async () => { resolve('Denied'); await onChoice('cancel'); };

    const onceBtn = document.createElement('button');
    onceBtn.className = 'interaction-btn secondary';
    onceBtn.textContent = 'Allow Once';
    onceBtn.onclick = async () => { resolve('Allowed once'); await onChoice('once'); };

    const alwaysBtn = document.createElement('button');
    alwaysBtn.className = 'interaction-btn primary';
    alwaysBtn.textContent = 'Allow this session';
    alwaysBtn.onclick = async () => { resolve('Allowed for session'); await onChoice('always'); };

    buttonsEl.appendChild(denyBtn);
    buttonsEl.appendChild(onceBtn);
    buttonsEl.appendChild(alwaysBtn);
    card.appendChild(buttonsEl);

    // ── Inject and reveal ───────────────────────────────────────────────────
    targetContainer.appendChild(card);
    this.scrollToBottom();
  }

  // Renders an inline ask-user card appended to the chat container.
  public addAskUserCard(
    question: string,
    onSubmit: (answer: string, cancelled: boolean) => Promise<void>
  ) {
    this.removeLoadingBubble();

    const card = document.createElement('div');
    card.className = 'interaction-card ask-card';

    const questionEl = document.createElement('div');
    questionEl.className = 'interaction-card-purpose';
    questionEl.textContent = question;
    card.appendChild(questionEl);

    const textarea = document.createElement('textarea');
    textarea.className = 'interaction-card-input';
    textarea.placeholder = 'Type your answer…';
    textarea.rows = 3;
    card.appendChild(textarea);

    const actions = document.createElement('div');
    actions.className = 'interaction-card-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'interaction-btn secondary';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.onclick = async () => { 
      const val = textarea.value.trim();
      if (val) {
        this.addUserMessage(val);
      } else {
        this.addUserMessage("[User canceled input]");
      }
      card.remove();
      await onSubmit('', true); 
    };

    const submitBtn = document.createElement('button');
    submitBtn.className = 'interaction-btn primary';
    submitBtn.textContent = 'Submit';
    submitBtn.onclick = async () => { 
      const val = textarea.value.trim();
      if (val) {
        this.addUserMessage(val);
      }
      card.remove();
      await onSubmit(textarea.value, false); 
    };

    actions.appendChild(cancelBtn);
    actions.appendChild(submitBtn);
    card.appendChild(actions);

    this.container.appendChild(card);
    textarea.focus();
    this.scrollToBottom();
  }
}
