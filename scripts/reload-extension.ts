/**
 * Перезавантажує Chrome-розширення через Chrome DevTools Protocol (CDP).
 *
 * Налаштування:
 *   1. Запусти Chrome з debug-портом (start-chrome-debug.ps1)
 *   2. Створи .env.local та пропиши EXTENSION_ID=<твій-id>
 *      ID знаходиться на chrome://extensions після встановлення розширення
 */

const CDP_PORT = process.env.CDP_PORT ?? '9222';
const EXTENSION_ID = process.env.EXTENSION_ID;

if (!EXTENSION_ID) {
  console.log('\x1b[33m⚠️  EXTENSION_ID не вказано\x1b[0m');
  console.log('   Створи .env.local та додай:');
  console.log('   EXTENSION_ID=aaabbbcccdddeeefffggghhh');
  console.log('   (ID знаходиться на chrome://extensions)');
  process.exit(0);
}

type CdpTarget = {
  id: string;
  url: string;
  type: string;
  webSocketDebuggerUrl: string;
};

async function reloadExtension(): Promise<void> {
  let targets: CdpTarget[];

  try {
    const res = await fetch(`http://localhost:${CDP_PORT}/json`);
    targets = await res.json() as CdpTarget[];
  } catch {
    throw new Error(
      `Не вдалось підключитись до Chrome на порту ${CDP_PORT}.\n` +
      `  Запусти Chrome через: .\\start-chrome-debug.ps1`,
    );
  }

  const sw = targets.find(
    t => t.url?.startsWith(`chrome-extension://${EXTENSION_ID}`) && t.type === 'service_worker',
  );

  if (!sw) {
    const anyTarget = targets.find(t => t.url?.startsWith(`chrome-extension://${EXTENSION_ID}`));
    if (!anyTarget) {
      throw new Error(
        `Розширення з ID "${EXTENSION_ID}" не знайдено серед відкритих targets.\n` +
        `  Перевір EXTENSION_ID у .env.local.`,
      );
    }
    throw new Error('Service worker не знайдено. Переконайся, що розширення активне.');
  }

  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(sw.webSocketDebuggerUrl);

    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('Таймаут підключення до Chrome DevTools'));
    }, 5000);

    ws.onopen = () => {
      ws.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: { expression: 'chrome.runtime.reload()' },
      }));
    };

    ws.onmessage = () => {
      clearTimeout(timeout);
      ws.close();
      resolve();
    };

    ws.onerror = (e) => {
      clearTimeout(timeout);
      reject(e);
    };
  });
}

try {
  await reloadExtension();
  console.log('\x1b[32m✅ Розширення перезавантажено!\x1b[0m');
} catch (e) {
  console.error('\x1b[31m❌ Помилка:\x1b[0m', (e as Error).message);
  process.exit(1);
}
