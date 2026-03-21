import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import puppeteer from 'puppeteer-core';
import selfsigned from 'selfsigned';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const extensionDir = path.join(repoRoot, '.output', 'chrome-mv3');
const manifestPath = path.join(extensionDir, 'manifest.json');
const popupHtmlPath = path.join(extensionDir, 'popup.html');
const contentBundlePath = '/content-scripts/content.js';
const testHost = 'acme.my.salesforce.com';

function ensureBuiltExtension() {
  if (!existsSync(extensionDir) || !existsSync(manifestPath) || !existsSync(popupHtmlPath)) {
    throw new Error('Built extension not found. Run "bun run build" before "bun run test:smoke".');
  }
}

function resolveChromeExecutable() {
  const explicit = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (explicit && existsSync(explicit)) return explicit;

  if (process.platform === 'win32') {
    const winPaths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files\\Chromium\\Application\\chrome.exe',
    ];
    const match = winPaths.find((candidate) => existsSync(candidate));
    if (match) return match;
  }

  if (process.platform === 'darwin') {
    const macPaths = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ];
    const match = macPaths.find((candidate) => existsSync(candidate));
    if (match) return match;
  }

  const linuxCandidates = [
    'google-chrome',
    'google-chrome-stable',
    'chromium',
    'chromium-browser',
  ];
  for (const candidate of linuxCandidates) {
    const result = spawnSync(candidate, ['--version'], { stdio: 'ignore' });
    if (result.status === 0) return candidate;
  }

  throw new Error(
    'Chrome executable not found. Set PUPPETEER_EXECUTABLE_PATH to a Chrome or Chromium binary.',
  );
}

function getContentType(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.png')) return 'image/png';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  return 'application/octet-stream';
}

function createChromeStubScript(version) {
  return `<script>
    (() => {
      const syncStore = {};
      const localStore = {};

      const normalizeGet = (store, keys) => {
        if (typeof keys === 'string') {
          return { [keys]: store[keys] };
        }
        if (Array.isArray(keys)) {
          return Object.fromEntries(keys.map((key) => [key, store[key]]));
        }
        if (keys && typeof keys === 'object') {
          return Object.fromEntries(
            Object.entries(keys).map(([key, fallback]) => [key, store[key] ?? fallback]),
          );
        }
        return { ...store };
      };

      const createEvent = () => {
        const listeners = new Set();
        return {
          addListener(listener) {
            listeners.add(listener);
          },
          removeListener(listener) {
            listeners.delete(listener);
          },
          emit(...args) {
            for (const listener of listeners) {
              listener(...args);
            }
          },
        };
      };

      const storageChanged = createEvent();
      const runtimeMessages = createEvent();

      window.chrome = {
        runtime: {
          id: 'sfboost-smoke-runtime',
          getManifest: () => ({ version: ${JSON.stringify(version)} }),
          onMessage: runtimeMessages,
          sendMessage: async (message) => {
            if (message?.type === 'updateBadge') return { ok: true };
            return {};
          },
        },
        storage: {
          sync: {
            async get(keys) {
              return normalizeGet(syncStore, keys);
            },
            async set(values) {
              Object.assign(syncStore, values);
              const changes = Object.fromEntries(
                Object.entries(values).map(([key, value]) => [key, { newValue: value }]),
              );
              storageChanged.emit(changes, 'sync');
            },
          },
          local: {
            async get(keys) {
              return normalizeGet(localStore, keys);
            },
            async set(values) {
              Object.assign(localStore, values);
            },
          },
          onChanged: storageChanged,
        },
        tabs: {
          async create() {},
          async query() {
            return [{ id: 1 }];
          },
          async sendMessage() {},
        },
      };
    })();
  </script>`;
}

async function buildPopupHarness(version) {
  const popupHtml = await readFile(popupHtmlPath, 'utf8');
  return popupHtml.replace('<head>', `<head>\n${createChromeStubScript(version)}`);
}

function buildContentHarness(version) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Setup Profiles</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 24px; }
      .oneContent { min-height: 1200px; }
      table { border-collapse: collapse; width: 100%; margin-top: 16px; }
      th, td { border: 1px solid #d0d0d0; padding: 8px; text-align: left; }
    </style>
    ${createChromeStubScript(version)}
  </head>
  <body>
    <div class="oneContent">
      <lightning-layout class="navBar-container">
        <devops_center-org-info></devops_center-org-info>
        <devops_center-panel-button></devops_center-panel-button>
      </lightning-layout>
      <h1>Profiles</h1>
      <table class="list">
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>System Administrator</td><td>Standard</td></tr>
          <tr><td>Custom Support</td><td>Custom</td></tr>
          <tr><td>Read Only</td><td>Standard</td></tr>
        </tbody>
      </table>
    </div>
    <script src="${contentBundlePath}"></script>
  </body>
</html>`;
}

async function startFixtureServer(version) {
  const popupHarness = await buildPopupHarness(version);
  const contentHarness = buildContentHarness(version);

  const attrs = [{ name: 'commonName', value: testHost }];
  const pems = selfsigned.generate(attrs, {
    algorithm: 'sha256',
    days: 1,
    keySize: 2048,
    extensions: [
      {
        name: 'subjectAltName',
        altNames: [{ type: 2, value: testHost }],
      },
    ],
  });

  const server = createServer(
    { key: pems.private, cert: pems.cert },
    async (req, res) => {
      try {
        const url = new URL(req.url ?? '/', `https://${testHost}`);
        if (url.pathname === '/popup-harness.html') {
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
          res.end(popupHarness);
          return;
        }

        if (url.pathname === '/lightning/setup/Profiles/home') {
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
          res.end(contentHarness);
          return;
        }

        const sanitizedPath = path.normalize(url.pathname).replace(/^(\.\.(\/|\\|$))+/, '');
        const filePath = path.join(extensionDir, sanitizedPath);
        if (!filePath.startsWith(extensionDir) || !existsSync(filePath)) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }

        const file = await readFile(filePath);
        res.writeHead(200, { 'content-type': getContentType(filePath) });
        res.end(file);
      } catch (error) {
        res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
        res.end(error instanceof Error ? error.message : 'Unknown server error');
      }
    },
  );

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Could not determine fixture server port.');
  }

  return {
    server,
    origin: `https://${testHost}:${address.port}`,
  };
}

async function assertContentHarness(page) {
  await page.waitForSelector('#sfboost-env-badge', { timeout: 10000 });
  await page.waitForFunction(() => document.title.startsWith('[PROD]'), { timeout: 10000 });
  await page.waitForSelector('.sfboost-table-filter input', { timeout: 10000 });

  const badgeText = await page.$eval('#sfboost-env-badge', (el) => el.textContent?.trim() ?? '');
  if (!badgeText.startsWith('PRODUCTION')) {
    throw new Error(`Unexpected environment badge text: ${badgeText}`);
  }

  const navBarStillVisible = await page.$('lightning-layout.navBar-container') !== null;
  if (!navBarStillVisible) {
    throw new Error('DevOps Center bar was removed even though hide-devops-bar should be disabled by default.');
  }

  await page.click('body');
  await page.keyboard.down('Alt');
  await page.keyboard.down('Shift');
  await page.keyboard.press('S');
  await page.keyboard.up('Shift');
  await page.keyboard.up('Alt');

  await page.waitForSelector('#sfboost-command-palette input', { timeout: 10000 });
}

async function assertPopupHarness(page) {
  await page.waitForSelector('input[data-module="command-palette"]', { timeout: 10000 });

  const popupState = await page.evaluate(() => {
    const readChecked = (moduleId) => {
      const input = document.querySelector(`input[data-module="${moduleId}"]`);
      return input instanceof HTMLInputElement ? input.checked : null;
    };

    return {
      commandPalette: readChecked('command-palette'),
      dependencyInspector: readChecked('deep-dependency-inspector'),
      hideDevopsBar: readChecked('hide-devops-bar'),
      version: document.getElementById('version-label')?.textContent ?? '',
    };
  });

  if (popupState.commandPalette !== true) {
    throw new Error('Command Palette should be enabled by default in the popup.');
  }
  if (popupState.dependencyInspector !== false) {
    throw new Error('Dependency Inspector should be disabled by default in the popup.');
  }
  if (popupState.hideDevopsBar !== false) {
    throw new Error('Hide DevOps Center Bar should be disabled by default in the popup.');
  }
  if (!popupState.version.startsWith('v')) {
    throw new Error(`Popup version label was not rendered correctly: ${popupState.version}`);
  }
}

async function main() {
  ensureBuiltExtension();
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const version = String(manifest.version ?? '');
  if (!version) {
    throw new Error('Could not read the extension version from the built manifest.');
  }

  const executablePath = resolveChromeExecutable();
  const { server, origin } = await startFixtureServer(version);
  let browser;

  try {
    browser = await puppeteer.launch({
      executablePath,
      headless: process.env.SFBOOST_SMOKE_HEADLESS === '0' ? false : 'new',
      acceptInsecureCerts: true,
      args: [
        '--no-sandbox',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-dev-shm-usage',
        `--host-resolver-rules=MAP ${testHost} 127.0.0.1`,
      ],
    });

    const contentPage = await browser.newPage();
    await contentPage.goto(`${origin}/lightning/setup/Profiles/home`, { waitUntil: 'domcontentloaded' });
    await assertContentHarness(contentPage);

    const popupPage = await browser.newPage();
    await popupPage.goto(`${origin}/popup-harness.html`, { waitUntil: 'domcontentloaded' });
    await assertPopupHarness(popupPage);
  } finally {
    if (browser) {
      await browser.close();
    }
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
