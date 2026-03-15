// Shared UI utilities for SF Boost modules

import { tokens } from './design-tokens';

/** Create a modal with backdrop, card, and close handler */
export function createModal(
  id: string,
  options: { width?: string; maxHeight?: string; onBeforeClose?: () => boolean } = {}
): { backdrop: HTMLDivElement; card: HTMLDivElement; close: () => void } {
  const { width = '560px', maxHeight = 'calc(100vh - 40px)' } = options;
  const previousActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  const backdrop = document.createElement('div');
  backdrop.id = `${id}-backdrop`;
  backdrop.setAttribute('style', `
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.2);
    backdrop-filter: blur(4px);
    z-index: ${tokens.zIndex.modalBackdrop};
    opacity: 0; transition: opacity ${tokens.transition.normal};
  `);

  const card = document.createElement('div');
  card.id = id;
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  card.setAttribute('style', `
    position: fixed;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%) scale(0.98);
    background: ${tokens.color.surfaceBase};
    border-radius: ${tokens.radius.xl};
    width: ${width};
    max-width: calc(100vw - 40px);
    max-height: ${maxHeight};
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: ${tokens.shadow.lg};
    z-index: ${tokens.zIndex.modal};
    font-family: ${tokens.font.family.sans};
    opacity: 0;
    transition: transform ${tokens.transition.modalEase}, opacity ${tokens.transition.normal};
  `);

  let isClosed = false;
  const cleanup = () => {
    document.removeEventListener('keydown', onKeydown);
  };

  const close = () => {
    if (isClosed) return;
    if (options.onBeforeClose && !options.onBeforeClose()) return;
    isClosed = true;
    cleanup();
    backdrop.style.opacity = '0';
    card.style.opacity = '0';
    card.style.transform = 'translate(-50%, -50%) scale(0.98)';
    setTimeout(() => {
      backdrop.remove();
      card.remove();
      if (previousActiveElement?.isConnected) {
        previousActiveElement.focus();
      }
    }, 150);
  };

  backdrop.addEventListener('click', close);

  document.body.appendChild(backdrop);
  document.body.appendChild(card);

  // Animate in
  requestAnimationFrame(() => {
    backdrop.style.opacity = '1';
    card.style.opacity = '1';
    card.style.transform = 'translate(-50%, -50%) scale(1)';
  });

  // Keyboard: Escape to close + focus trap
  const onKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      close();
      return;
    }
    if (e.key === 'Tab') {
      const focusable = card.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (e.shiftKey) {
        if (document.activeElement === first || !card.contains(document.activeElement)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last || !card.contains(document.activeElement)) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  };
  document.addEventListener('keydown', onKeydown);

  return { backdrop, card, close };
}

/** Create a loading spinner element */
export function createSpinner(size = 24): HTMLDivElement {
  const spinner = document.createElement('div');
  spinner.setAttribute('style', `
    width: ${size}px; height: ${size}px;
    border: 3px solid ${tokens.color.borderDefault};
    border-top-color: ${tokens.color.primary};
    border-radius: ${tokens.radius.full};
    animation: sfboost-spin 0.6s linear infinite;
  `);

  // Inject keyframes if not present
  if (!document.getElementById('sfboost-spinner-keyframes')) {
    const style = document.createElement('style');
    style.id = 'sfboost-spinner-keyframes';
    style.textContent = '@keyframes sfboost-spin { to { transform: rotate(360deg); } }';
    document.head.appendChild(style);
  }

  return spinner;
}

/** Create a styled button matching SF Boost design */
export function createButton(
  text: string,
  options: { primary?: boolean; small?: boolean } = {}
): HTMLButtonElement {
  const { primary = true, small = false } = options;
  const btn = document.createElement('button');
  btn.textContent = text;
  btn.setAttribute('style', `
    padding: ${small ? `${tokens.space.xs} ${tokens.space.lg}` : `${tokens.space.md} ${tokens.space['2xl']}`};
    background: ${primary ? tokens.color.primary : tokens.color.surfaceBase};
    color: ${primary ? tokens.color.textOnPrimary : tokens.color.textPrimary};
    border: ${primary ? 'none' : `1px solid ${tokens.color.borderInput}`};
    border-radius: ${tokens.radius.sm};
    font-size: ${small ? tokens.font.size.sm : tokens.font.size.base};
    font-weight: ${tokens.font.weight.semibold};
    cursor: pointer;
    font-family: ${tokens.font.family.sans};
    transition: background ${tokens.transition.normal};
  `);
  btn.addEventListener('mouseenter', () => {
    btn.style.background = primary ? tokens.color.primaryHover : tokens.color.surfaceSubtle;
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.background = primary ? tokens.color.primary : tokens.color.surfaceBase;
  });
  return btn;
}

/** Create a styled text input */
export function createInput(options: {
  placeholder?: string;
  maxWidth?: string;
} = {}): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'text';
  if (options.placeholder) input.placeholder = options.placeholder;
  input.setAttribute('style', `
    padding: ${tokens.space.sm} ${tokens.space.md};
    border: 1px solid ${tokens.color.borderInput};
    border-radius: ${tokens.radius.sm};
    font-size: ${tokens.font.size.base};
    font-family: ${tokens.font.family.sans};
    color: ${tokens.color.textPrimary};
    outline: none;
    flex: 1;
    ${options.maxWidth ? `max-width: ${options.maxWidth};` : ''}
    transition: border-color ${tokens.transition.normal};
  `);
  input.addEventListener('focus', () => {
    input.style.borderColor = tokens.color.primary;
  });
  input.addEventListener('blur', () => {
    input.style.borderColor = tokens.color.borderInput;
  });
  return input;
}

/** Create a small badge/pill */
export function createBadge(
  text: string,
  variant: 'info' | 'success' | 'warning' | 'error' | 'neutral' = 'info'
): HTMLSpanElement {
  const colorMap = {
    info: { bg: tokens.color.primaryLight, text: tokens.color.primary, border: tokens.color.primaryBorder },
    success: { bg: tokens.color.successLight, text: tokens.color.successText, border: tokens.color.successBorder },
    warning: { bg: tokens.color.warningLight, text: tokens.color.warningText, border: tokens.color.warningBorder },
    error: { bg: tokens.color.errorLight, text: tokens.color.errorText, border: tokens.color.errorBorder },
    neutral: { bg: tokens.color.surfaceSubtle, text: tokens.color.textSecondary, border: tokens.color.borderDefault },
  };
  const c = colorMap[variant];
  const badge = document.createElement('span');
  badge.textContent = text;
  badge.setAttribute('style', `
    display: inline-block;
    padding: ${tokens.space.xs} ${tokens.space.md};
    background: ${c.bg};
    color: ${c.text};
    border: 1px solid ${c.border};
    border-radius: ${tokens.radius.xl};
    font-size: ${tokens.font.size.sm};
    font-weight: ${tokens.font.weight.medium};
    white-space: nowrap;
  `);
  return badge;
}

/** Create a filter bar container with input, count, and clear button */
export function createFilterBar(options: {
  placeholder?: string;
  onInput: (value: string) => void;
  onClear: () => void;
}): {
  container: HTMLDivElement;
  input: HTMLInputElement;
  countSpan: HTMLSpanElement;
} {
  const container = document.createElement('div');
  container.setAttribute('style', `
    display: flex;
    align-items: center;
    gap: ${tokens.space.md};
    padding: ${tokens.space.sm} ${tokens.space.lg};
    border: 1px solid ${tokens.color.borderInput};
    border-radius: ${tokens.radius.sm};
    background: ${tokens.color.surfaceBase};
    box-shadow: ${tokens.shadow.xs};
    margin-bottom: ${tokens.space.xs};
    font-family: ${tokens.font.family.sans};
  `);

  // Search icon
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('style', 'flex-shrink: 0;');
  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', '11');
  circle.setAttribute('cy', '11');
  circle.setAttribute('r', '8');
  circle.setAttribute('stroke', tokens.color.textSalesforceGray);
  circle.setAttribute('stroke-width', '2');
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  line.setAttribute('x1', '21');
  line.setAttribute('y1', '21');
  line.setAttribute('x2', '16.65');
  line.setAttribute('y2', '16.65');
  line.setAttribute('stroke', tokens.color.textSalesforceGray);
  line.setAttribute('stroke-width', '2');
  svg.appendChild(circle);
  svg.appendChild(line);

  const input = document.createElement('input');
  input.type = 'text';
  if (options.placeholder) input.placeholder = options.placeholder;
  input.setAttribute('style', `
    flex: 1;
    border: none;
    outline: none;
    font-size: ${tokens.font.size.base};
    font-family: ${tokens.font.family.sans};
    color: ${tokens.color.textPrimary};
    background: transparent;
  `);

  const countSpan = document.createElement('span');
  countSpan.setAttribute('style', `
    font-size: ${tokens.font.size.sm};
    color: ${tokens.color.textSalesforceGray};
    white-space: nowrap;
  `);

  const clearBtn = document.createElement('button');
  clearBtn.textContent = '\u00d7';
  clearBtn.title = 'Clear filter';
  clearBtn.setAttribute('style', `
    background: none;
    border: none;
    font-size: 18px;
    color: ${tokens.color.textSalesforceGray};
    cursor: pointer;
    padding: 0 ${tokens.space.xs};
    line-height: 1;
    display: none;
    transition: color ${tokens.transition.normal};
  `);
  clearBtn.addEventListener('mouseenter', () => { clearBtn.style.color = tokens.color.textPrimary; });
  clearBtn.addEventListener('mouseleave', () => { clearBtn.style.color = tokens.color.textSalesforceGray; });

  input.addEventListener('input', () => {
    const val = input.value;
    clearBtn.style.display = val ? 'block' : 'none';
    options.onInput(val);
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    clearBtn.style.display = 'none';
    options.onClear();
    input.focus();
  });

  container.appendChild(svg);
  container.appendChild(input);
  container.appendChild(countSpan);
  container.appendChild(clearBtn);

  return { container, input, countSpan };
}
