import { Notice } from 'obsidian';

/* eslint-disable @typescript-eslint/no-deprecated */
export class CancellableNotice {
    public readonly signal: AbortSignal;
    private readonly controller: AbortController;
    private readonly notice: Notice;
    private readonly messageEl: HTMLElement;
    private readonly buttonEl: HTMLButtonElement;

    constructor(initialMessage: string) {
        this.controller = new AbortController();
        this.signal = this.controller.signal;

        this.notice = new Notice('', 0);
        this.notice.noticeEl.empty();
        this.notice.noticeEl.addClass('frog-cancellable-notice');

        this.messageEl = this.notice.noticeEl.createSpan({
            text: initialMessage,
            cls: 'frog-cancellable-notice-message'
        });

        this.buttonEl = this.notice.noticeEl.createEl('button', {
            text: 'Cancel',
            cls: 'frog-cancellable-notice-button'
        });
        this.buttonEl.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.cancel();
        };
    }

    setMessage(text: string): void {
        this.messageEl.setText(text);
    }

    hide(): void {
        this.notice.hide();
    }
    
    get isCancelled(): boolean {
        return this.signal.aborted;
    }

    private cancel(): void {
        if (this.signal.aborted) return;
        this.controller.abort();
        this.buttonEl.hide();
        this.messageEl.setText('⛔ Cancelling…');
    }
}

export function throwIfAborted(signal: AbortSignal): void {
    if (signal.aborted) {
        throw new DOMException('Operation cancelled', 'AbortError');
    }
}