// Shared UI utilities for SF Boost modules

/** Create a modal with backdrop, card, and close handler */
export function createModal(
  id: string,
  options: { width?: string } = {}
): { backdrop: HTMLDivElement; card: HTMLDivElement; close: () => void } {
  const { width = '560px' } = options;

  const backdrop = document.createElement('div');
  backdrop.id = `${id}-backdrop`;
  backdrop.setAttribute('style', `
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.2);
    backdrop-filter: blur(4px);
    z-index: 99999998;
    opacity: 0; transition: opacity 0.15s;
  `);

  const card = document.createElement('div');
  card.id = id;
  card.setAttribute('style', `
    position: fixed;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%) scale(0.98);
    background: #fff;
    border-radius: 12px;
    width: ${width};
    max-width: calc(100vw - 40px);
    max-height: calc(100vh - 40px);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    z-index: 99999999;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    opacity: 0;
    transition: transform 0.15s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.15s;
  `);

  const close = () => {
    backdrop.style.opacity = '0';
    card.style.opacity = '0';
    card.style.transform = 'translate(-50%, -50%) scale(0.98)';
    setTimeout(() => {
      backdrop.remove();
      card.remove();
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

  // Escape key
  const onKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      close();
      document.removeEventListener('keydown', onKeydown);
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
    border: 3px solid #e5e7eb;
    border-top-color: #0176d3;
    border-radius: 50%;
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
    padding: ${small ? '4px 12px' : '8px 20px'};
    background: ${primary ? '#0176d3' : '#fff'};
    color: ${primary ? '#fff' : '#181818'};
    border: ${primary ? 'none' : '1px solid #d8dde6'};
    border-radius: 4px;
    font-size: ${small ? '12px' : '13px'};
    font-weight: 600;
    cursor: pointer;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    transition: background 0.15s;
  `);
  btn.addEventListener('mouseenter', () => {
    btn.style.background = primary ? '#014486' : '#f3f3f3';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.background = primary ? '#0176d3' : '#fff';
  });
  return btn;
}
