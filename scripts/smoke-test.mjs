import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import puppeteer from 'puppeteer-core';
import selfsigned from 'selfsigned';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const extensionDir = path.join(repoRoot, '.output', 'chrome-mv3');
const manifestPath = path.join(extensionDir, 'manifest.json');

const HOSTS = {
  lightning: 'acme.my.salesforce.com',
  classic: 'na123.salesforce.com',
  setupShell: 'acme.salesforce-setup.com',
  publicHelp: 'help.salesforce.com',
};

const DEFAULT_ENABLED_MODULE_IDS = [
  'command-palette',
  'field-inspector',
  'quick-copy',
  'table-filter',
  'environment-safeguard',
];

const DEBUG = process.env.SFBOOST_SMOKE_DEBUG === '1';

function debug(...args) {
  if (DEBUG) console.log('[smoke]', ...args);
}

function ensureBuiltExtension() {
  if (!existsSync(extensionDir) || !existsSync(manifestPath)) {
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

function buildOrigin(host, port) {
  return `https://${host}:${port}`;
}

function createHtmlPage(title, body) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 24px; background: #f8fafc; }
      .oneContent, #content, .bodyDiv { min-height: 1200px; }
      table { border-collapse: collapse; width: 100%; margin-top: 16px; background: #fff; }
      th, td { border: 1px solid #d0d7de; padding: 8px; text-align: left; }
      .shell-frame { width: 100%; min-height: 460px; border: 1px solid #94a3b8; background: #fff; }
      .page-note { color: #334155; margin-bottom: 12px; }
    </style>
  </head>
  <body>
    ${body}
  </body>
</html>`;
}

function buildLightningSetupHarness() {
  return createHtmlPage(
    'Profiles',
    `
      <div class="oneContent">
        <lightning-layout class="navBar-container">
          <devops_center-org-info></devops_center-org-info>
          <devops_center-panel-button></devops_center-panel-button>
        </lightning-layout>
        <p class="page-note">Lightning Setup page for smoke coverage.</p>
        <h1>Profiles</h1>
        <table class="list">
          <tbody>
            <tr>
              <th>Name</th>
              <th>Type</th>
            </tr>
            <tr><td>System Administrator</td><td>Standard</td></tr>
            <tr><td>Custom Support</td><td>Custom</td></tr>
            <tr><td>Read Only</td><td>Standard</td></tr>
          </tbody>
        </table>
      </div>
    `,
  );
}

function buildClassicSetupHarness() {
  return createHtmlPage(
    'Classic Setup',
    `
      <div id="content">
        <div class="bodyDiv">
          <p class="page-note">Classic pod host smoke page.</p>
          <table class="list">
            <tbody>
              <tr>
                <th>User</th>
                <th>Status</th>
              </tr>
              <tr><td>Ada Lovelace</td><td>Active</td></tr>
              <tr><td>Grace Hopper</td><td>Active</td></tr>
              <tr><td>Alan Turing</td><td>Frozen</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    `,
  );
}

function buildSetupShellHarness(port) {
  const iframeSrc = `${buildOrigin(HOSTS.lightning, port)}/00e123456789012?setupid=EnhancedProfiles&isdtp=p1`;
  return createHtmlPage(
    'Enhanced Profiles',
    `
      <div class="oneContent">
        <p class="page-note">Lightning shell with a classic cross-origin setup iframe.</p>
        <iframe
          class="setupcontent shell-frame"
          name="setupFrame"
          title="Setup Frame"
          src="${iframeSrc}"></iframe>
      </div>
    `,
  );
}

function buildBulkCheckFrameHarness() {
  return createHtmlPage(
    'Profile Permissions',
    `
      <div class="setupcontent">
        <table class="list">
          <tbody>
            <tr>
              <th>Permission</th>
              <th>Read</th>
              <th>Edit</th>
            </tr>
            <tr>
              <td>Account</td>
              <td><input type="checkbox" /></td>
              <td><input type="checkbox" /></td>
            </tr>
            <tr>
              <td>Contact</td>
              <td><input type="checkbox" /></td>
              <td><input type="checkbox" /></td>
            </tr>
            <tr>
              <td>Opportunity</td>
              <td><input type="checkbox" /></td>
              <td><input type="checkbox" /></td>
            </tr>
          </tbody>
        </table>
      </div>
    `,
  );
}

function buildPublicSalesforceHarness() {
  return createHtmlPage(
    'Help Article',
    `
      <main>
        <h1>Salesforce Help</h1>
        <p class="page-note">Public Salesforce site used to verify that console formatter does not inject there.</p>
      </main>
    `,
  );
}

async function startFixtureServer() {
  const altNames = Object.values(HOSTS).map((host) => ({ type: 2, value: host }));
  const pems = selfsigned.generate(
    [{ name: 'commonName', value: HOSTS.lightning }],
    {
      algorithm: 'sha256',
      days: 1,
      keySize: 2048,
      extensions: [{ name: 'subjectAltName', altNames }],
    },
  );

  const server = createServer(
    { key: pems.private, cert: pems.cert },
    (req, res) => {
      try {
        const host = String(req.headers.host ?? '').split(':')[0];
        const requestUrl = new URL(req.url ?? '/', `https://${host}`);

        let body = null;
        if (host === HOSTS.lightning && requestUrl.pathname === '/lightning/setup/Profiles/home') {
          body = buildLightningSetupHarness();
        } else if (host === HOSTS.classic && requestUrl.pathname === '/setup/forcecomHomepage.apexp') {
          body = buildClassicSetupHarness();
        } else if (host === HOSTS.setupShell && requestUrl.pathname === '/lightning/setup/Profiles/home') {
          body = buildSetupShellHarness(server.address().port);
        } else if (host === HOSTS.lightning && requestUrl.pathname === '/00e123456789012') {
          body = buildBulkCheckFrameHarness();
        } else if (host === HOSTS.lightning && requestUrl.pathname === '/lightning/page/home') {
          body = buildLightningSetupHarness();
        } else if (host === HOSTS.publicHelp && requestUrl.pathname === '/articleView') {
          body = buildPublicSalesforceHarness();
        }

        if (!body) {
          res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
          res.end('Not found');
          return;
        }

        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(body);
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
    port: address.port,
  };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForFrame(page, urlFragment, timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const frame = page.frames().find((candidate) => candidate.url().includes(urlFragment));
    if (frame) return frame;
    await wait(100);
  }

  throw new Error(`Frame containing "${urlFragment}" was not found.`);
}

function normalizeFilesystemPath(value) {
  return path.normalize(value).replace(/\\/g, '/').toLowerCase();
}

async function readExtensionIdFromPreferences(userDataDir) {
  const preferencesPath = path.join(userDataDir, 'Default', 'Preferences');
  if (!existsSync(preferencesPath)) return null;

  const preferences = JSON.parse(await readFile(preferencesPath, 'utf8'));
  const settings = preferences?.extensions?.settings;
  if (!settings || typeof settings !== 'object') return null;

  const expectedPath = normalizeFilesystemPath(extensionDir);
  for (const [extensionId, rawEntry] of Object.entries(settings)) {
    const entry = rawEntry && typeof rawEntry === 'object' ? rawEntry : null;
    const entryPath = typeof entry?.path === 'string' ? entry.path : null;
    if (entryPath && normalizeFilesystemPath(entryPath) === expectedPath) {
      return extensionId;
    }
  }

  return null;
}

async function getExtensionId(browser, userDataDir) {
  try {
    const serviceWorkerTarget = await browser.waitForTarget(
      (target) =>
        target.type() === 'service_worker' &&
        target.url().startsWith('chrome-extension://'),
      { timeout: 5000 },
    );
    return new URL(serviceWorkerTarget.url()).host;
  } catch {
    // Fall back to the Chrome profile when headless does not expose the worker early enough.
  }

  const startedAt = Date.now();
  while (Date.now() - startedAt < 20000) {
    const extensionId = await readExtensionIdFromPreferences(userDataDir);
    if (extensionId) return extensionId;
    await wait(250);
  }

  throw new Error('Timed out after waiting 20000ms');
}

async function createExtensionHelperPage(browser, extensionId) {
  const page = await browser.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`, {
    waitUntil: 'domcontentloaded',
  });
  return page;
}

async function setEnabledModules(helperPage, enabledIds) {
  await helperPage.evaluate(
    (ids) =>
      new Promise((resolve) => {
        chrome.storage.sync.set({ enabledModules: ids }, () => resolve());
      }),
    enabledIds,
  );
  await wait(400);
}

async function assertLightningContentPage(page, port) {
  debug('assertLightningContentPage:start');
  await page.goto(`${buildOrigin(HOSTS.lightning, port)}/lightning/setup/Profiles/home`, {
    waitUntil: 'domcontentloaded',
  });
  await page.bringToFront();
  await page.waitForSelector('#sfboost-env-badge', { timeout: 10000 });
  await page.waitForSelector('.sfboost-table-filter input', { timeout: 10000 });
  await page.waitForFunction(() => document.title.startsWith('[PROD]'), { timeout: 10000 });

  const badgeText = await page.$eval('#sfboost-env-badge', (el) => el.textContent?.trim() ?? '');
  if (!badgeText.startsWith('PRODUCTION')) {
    throw new Error(`Unexpected Lightning environment badge text: ${badgeText}`);
  }

  await page.click('body');
  await page.keyboard.down('Alt');
  await page.keyboard.down('Shift');
  await page.keyboard.press('S');
  await page.keyboard.up('Shift');
  await page.keyboard.up('Alt');

  await page.waitForSelector('#sfboost-command-palette input', { timeout: 10000 });
  debug('assertLightningContentPage:done');
}

async function assertClassicContentPage(page, port) {
  debug('assertClassicContentPage:start');
  await page.goto(
    `${buildOrigin(HOSTS.classic, port)}/setup/forcecomHomepage.apexp?setupid=Users`,
    { waitUntil: 'domcontentloaded' },
  );
  await page.waitForSelector('#sfboost-env-badge', { timeout: 10000 });
  await page.waitForSelector('.sfboost-table-filter input', { timeout: 10000 });
  debug('assertClassicContentPage:done');
}

async function assertPopupPage(browser, extensionId, version) {
  debug('assertPopupPage:start');
  const page = await browser.newPage();
  try {
    await page.goto(`chrome-extension://${extensionId}/popup.html`, {
      waitUntil: 'domcontentloaded',
    });
    await page.waitForSelector('input[data-module="command-palette"]', { timeout: 10000 });

    const popupState = await page.evaluate(() => {
      const readChecked = (moduleId) => {
        const input = document.querySelector(`input[data-module="${moduleId}"]`);
        return input instanceof HTMLInputElement ? input.checked : null;
      };

      return {
        commandPalette: readChecked('command-palette'),
        dependencyInspector: readChecked('deep-dependency-inspector'),
        bulkCheck: readChecked('bulk-check'),
        consoleFormatter: readChecked('console-formatter'),
        version: document.getElementById('version-label')?.textContent ?? '',
      };
    });

    if (popupState.commandPalette !== true) {
      throw new Error('Command Palette should be enabled by default in the popup.');
    }
    if (popupState.dependencyInspector !== false) {
      throw new Error('Dependency Inspector should be disabled by default in the popup.');
    }
    if (popupState.bulkCheck !== false) {
      throw new Error('Bulk Check should be disabled by default in the popup.');
    }
    if (popupState.consoleFormatter !== false) {
      throw new Error('Console Formatter should be disabled by default in the popup.');
    }
    if (popupState.version !== `v${version}`) {
      throw new Error(`Popup version label mismatch: expected v${version}, got ${popupState.version}`);
    }
  } finally {
    await page.close();
  }
  debug('assertPopupPage:done');
}

async function assertBulkCheckRuntimeToggle(page, helperPage, port) {
  debug('assertBulkCheckRuntimeToggle:start');
  await setEnabledModules(helperPage, DEFAULT_ENABLED_MODULE_IDS);

  await page.goto(`${buildOrigin(HOSTS.setupShell, port)}/lightning/setup/Profiles/home`, {
    waitUntil: 'domcontentloaded',
  });
  const frame = await waitForFrame(page, '/00e123456789012', 10000);

  await wait(2500);
  const hasControlsBeforeToggle = await frame.evaluate(
    () => document.querySelector('.sfboost-bulk-check-wrap') !== null,
  );
  if (hasControlsBeforeToggle) {
    throw new Error('Bulk Check rendered before the module was enabled.');
  }

  await setEnabledModules(helperPage, [...DEFAULT_ENABLED_MODULE_IDS, 'bulk-check']);
  await frame.waitForSelector('.sfboost-bulk-check-wrap', { timeout: 10000 });

  await frame.click('.sfboost-bulk-check-wrap');
  await frame.waitForFunction(
    () => {
      const checkboxes = Array.from(
        document.querySelectorAll('tbody input[type="checkbox"]'),
      );
      return (
        checkboxes.length > 0 &&
        checkboxes.every((node) => node instanceof HTMLInputElement && node.checked)
      );
    },
    { timeout: 5000 },
  );

  await setEnabledModules(helperPage, DEFAULT_ENABLED_MODULE_IDS);
  await frame.waitForFunction(
    () => document.querySelector('.sfboost-bulk-check-wrap') === null,
    { timeout: 10000 },
  );
  debug('assertBulkCheckRuntimeToggle:done');
}

async function assertConsoleFormatterRuntime(page, helperPage, port) {
  debug('assertConsoleFormatterRuntime:start');
  await setEnabledModules(helperPage, [...DEFAULT_ENABLED_MODULE_IDS, 'console-formatter']);

  await page.goto(`${buildOrigin(HOSTS.lightning, port)}/lightning/page/home`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForFunction(
    () => Boolean(window.SFBoostConsole && window.__sfBoostConsoleFormatterState__),
    { timeout: 10000 },
  );

  const formatterActive = await page.evaluate(() => (
    Boolean(
      window.SFBoostConsole &&
      window.__sfBoostConsoleFormatterState__ &&
      window.console.log !== window.__sfBoostConsoleFormatterState__.originalConsole.log,
    )
  ));
  if (!formatterActive) {
    throw new Error('Console Formatter did not activate on an authenticated org host.');
  }

  await setEnabledModules(helperPage, DEFAULT_ENABLED_MODULE_IDS);
  await page.waitForFunction(
    () => !window.SFBoostConsole && !window.__sfBoostConsoleFormatterState__,
    { timeout: 10000 },
  );

  await setEnabledModules(helperPage, [...DEFAULT_ENABLED_MODULE_IDS, 'console-formatter']);
  await page.goto(`${buildOrigin(HOSTS.publicHelp, port)}/articleView`, {
    waitUntil: 'domcontentloaded',
  });
  await wait(1500);

  const formatterPresentOnPublicPage = await page.evaluate(() => (
    'SFBoostConsole' in window || '__sfBoostConsoleFormatterState__' in window
  ));
  if (formatterPresentOnPublicPage) {
    throw new Error('Console Formatter injected into a public Salesforce page.');
  }

  await setEnabledModules(helperPage, DEFAULT_ENABLED_MODULE_IDS);
  debug('assertConsoleFormatterRuntime:done');
}

async function main() {
  ensureBuiltExtension();
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const version = String(manifest.version ?? '');
  if (!version) {
    throw new Error('Could not read the extension version from the built manifest.');
  }

  const executablePath = resolveChromeExecutable();
  const { server, port } = await startFixtureServer();
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'sfboost-smoke-'));
  let browser;
  let helperPage = null;

  try {
    const hostResolverRules = Object.values(HOSTS)
      .map((host) => `MAP ${host} 127.0.0.1`)
      .join(', ');

    browser = await puppeteer.launch({
      executablePath,
      userDataDir,
      pipe: true,
      enableExtensions: [extensionDir],
      headless: process.env.SFBOOST_SMOKE_HEADLESS === '0' ? false : 'new',
      acceptInsecureCerts: true,
      args: [
        '--no-sandbox',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-dev-shm-usage',
        '--ignore-certificate-errors',
        `--host-resolver-rules=${hostResolverRules}`,
      ],
    });
    debug('browser:launched');

    const extensionId = await getExtensionId(browser, userDataDir);
    debug('extensionId', extensionId);
    helperPage = await createExtensionHelperPage(browser, extensionId);
    debug('helperPage:ready');

    await assertPopupPage(browser, extensionId, version);

    const contentPage = await browser.newPage();
    await assertLightningContentPage(contentPage, port);
    await assertClassicContentPage(contentPage, port);
    await assertBulkCheckRuntimeToggle(contentPage, helperPage, port);
    await assertConsoleFormatterRuntime(contentPage, helperPage, port);

    await contentPage.close();
  } finally {
    if (helperPage) {
      await helperPage.close().catch(() => {});
    }
    if (browser) {
      await browser.close();
    }
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    await rm(userDataDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
