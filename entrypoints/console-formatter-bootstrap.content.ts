import { installConsoleFormatterRuntime } from '../modules/console-formatter/runtime';
import {
  CONSOLE_FORMATTER_MATCHES,
  isConsoleFormatterSupportedHost,
} from '../modules/console-formatter/constants';

export default defineContentScript({
  matches: CONSOLE_FORMATTER_MATCHES,
  runAt: 'document_start',
  world: 'MAIN',
  registration: 'runtime',

  main() {
    if (!isConsoleFormatterSupportedHost(window.location.hostname)) return;
    installConsoleFormatterRuntime(window as unknown as Parameters<typeof installConsoleFormatterRuntime>[0]);
  },
});
