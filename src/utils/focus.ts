// Focus management and keyboard behavior utilities

/**
 * Manages Enter key behavior in forms:
 * - Enter/Go advances to next field
 * - On last field, submits
 * - Shift+Enter in multiline inserts newline
 */
export function setupFormNavigation(formEl: HTMLFormElement): () => void {
  const handler = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') return;

    // Shift+Enter in textarea = newline (default behavior)
    if (e.key === 'Enter' && e.shiftKey && target.tagName === 'TEXTAREA') return;

    if (e.key === 'Enter') {
      e.preventDefault();
      const inputs = Array.from(
        formEl.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
          'input:not([type=hidden]), textarea, select'
        )
      ).filter((el) => !el.disabled && !el.readOnly);

      const idx = inputs.indexOf(target as HTMLInputElement);
      if (idx < inputs.length - 1) {
        // Move to next field
        inputs[idx + 1].focus();
      } else {
        // Last field — submit
        formEl.requestSubmit();
      }
    }
  };

  formEl.addEventListener('keydown', handler);
  return () => formEl.removeEventListener('keydown', handler);
}

/** Applies visible focus ring style using bucket color */
export function applyFocusRing(el: HTMLElement, color: string): void {
  el.style.outline = `2px solid ${color}`;
  el.style.outlineOffset = '2px';
}

export function removeFocusRing(el: HTMLElement): void {
  el.style.outline = '';
  el.style.outlineOffset = '';
}
