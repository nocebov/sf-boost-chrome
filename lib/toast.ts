export function showToast(message: string, position: 'center' | 'right' = 'center') {
  const toast = document.createElement('div');
  const isRight = position === 'right';
  toast.setAttribute('style', `
    position: fixed; bottom: ${isRight ? '72px' : '20px'};
    ${isRight ? 'right: 20px;' : 'left: 50%; transform: translateX(-50%);'}
    background: #1a1a2e; color: #fff;
    padding: ${isRight ? '8px 16px' : '10px 20px'}; border-radius: 8px;
    font-size: ${isRight ? '12px' : '13px'}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    z-index: 99999999;
  `);
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}
