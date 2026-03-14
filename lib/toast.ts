import { tokens } from './design-tokens';

export function showToast(message: string, position: 'center' | 'right' = 'center', durationMs = 2000) {
  const toast = document.createElement('div');
  const isRight = position === 'right';
  toast.setAttribute('style', `
    position: fixed; bottom: ${isRight ? '72px' : '20px'};
    ${isRight ? 'right: 20px;' : 'left: 50%; transform: translateX(-50%);'}
    background: ${tokens.color.surfaceDark}; color: ${tokens.color.textOnPrimary};
    padding: ${isRight ? `${tokens.space.md} ${tokens.space.xl}` : `${tokens.space.lg} ${tokens.space['2xl']}`}; border-radius: ${tokens.radius.lg};
    font-size: ${isRight ? tokens.font.size.sm : tokens.font.size.base}; font-family: ${tokens.font.family.sans};
    z-index: ${tokens.zIndex.toast};
  `);
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = `opacity ${tokens.transition.slow}`;
    setTimeout(() => toast.remove(), 300);
  }, durationMs);
}
