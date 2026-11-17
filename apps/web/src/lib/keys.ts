/** True while the person is typing in a box, so single-key shortcuts (N, /) leave the keys alone. */
export const isTyping = (el: Element | null): boolean =>
  !!el &&
  (el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement ||
    (el as HTMLElement).isContentEditable);
