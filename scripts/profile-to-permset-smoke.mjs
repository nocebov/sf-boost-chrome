const PROFILE = '00e000000000001AAA';
const SECOND_PROFILE = '00e000000000002AAA';
const APPROVAL = '04a000000000001AAA';
const BUTTON = '#sfboost-extract-permset-btn';
const PROFILE_ROUTE = `/lightning/setup/EnhancedProfiles/page?address=%2F${PROFILE}`;
const APPROVAL_ROUTE = `/lightning/setup/ApprovalProcesses/page?address=%2F${APPROVAL}`;

export function profilePageFixture(url) {
  if (![
    '/lightning/setup/EnhancedProfiles/page', '/lightning/setup/Profiles/page',
    '/lightning/setup/ApprovalProcesses/page', '/lightning/setup/PermSets/page',
    `/${PROFILE}`, `/${SECOND_PROFILE}`, `/${APPROVAL}`,
  ].includes(url.pathname)) return null;
  if (url.searchParams.has('frame')) {
    const id = url.searchParams.get('frame') === 'stale' ? APPROVAL : PROFILE;
    return `<div class="oneContent"><iframe title="Setup" src="/${id}"></iframe></div>`;
  }
  return '<div class="oneContent setupcontent"><div class="bPageTitle"><div class="ptBody"><h2>Detail heading</h2></div></div></div>';
}

export async function assertProfileToPermset(page, helperPage, origin, setEnabledModules, defaults) {
  const enabled = [...defaults, 'profile-to-permset'];
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  async function absent() {
    if (await page.$(BUTTON) || await page.$('#sfboost-extract-permset-wrapper') || await page.$('#sfboost-permset-modal')) {
      throw new Error('Profile extraction UI present outside a profile detail page');
    }
  }
  await setEnabledModules(helperPage, enabled);
  // The screenshot regression: Classic title markup and a valid non-Profile ID.
  await page.goto(origin + APPROVAL_ROUTE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#sfboost-env-badge');
  await pause(5500);
  await absent();

  for (const route of [
    `/lightning/setup/ApprovalProcesses/page?address=%2F${PROFILE}`,
    `/lightning/setup/PermSets/page?address=%2F${PROFILE}`,
    `/lightning/setup/Profiles/page?address=%2F${APPROVAL}`,
    `/lightning/setup/Profiles/home?address=%2F${PROFILE}`,
  ]) {
    await page.evaluate((next) => history.pushState({}, '', next), route);
    await pause(1200);
    await absent();
  }

  for (const route of [PROFILE_ROUTE, `/lightning/setup/Profiles/page?address=%2F${PROFILE}`, `/${PROFILE}`]) {
    await page.goto(origin + route, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector(BUTTON, { timeout: 10000 });
    await pause(1100);
    if (await page.$$eval(BUTTON, (buttons) => buttons.length) !== 1) throw new Error('Duplicate extraction button');
    // Click twice in one task: only one wizard/request should start.
    await page.evaluate((selector) => {
      document.querySelector(selector).click();
      document.querySelector(selector).click();
    }, BUTTON);
    await page.waitForFunction(() => document.querySelector('#sfboost-permset-modal')?.textContent.includes('Error reading profile'));
    if (await page.$$eval('#sfboost-permset-modal', (nodes) => nodes.length) !== 1) throw new Error('Duplicate extraction wizard');
    await page.evaluate((next) => history.pushState({}, '', next), APPROVAL_ROUTE);
    await page.waitForFunction(() => !document.querySelector('#sfboost-extract-permset-btn') && !document.querySelector('#sfboost-permset-modal'));
    await absent();
  }

  // Click the old button synchronously, before the navigation polling tick.
  await page.goto(origin + PROFILE_ROUTE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(BUTTON);
  await page.evaluate(({ next, selector }) => {
    const oldButton = document.querySelector(selector);
    history.pushState({}, '', next);
    oldButton.click();
  }, { next: APPROVAL_ROUTE, selector: BUTTON });
  await absent();

  // A different profile must not reuse the previous profile's captured ID.
  await page.evaluate((next) => history.pushState({}, '', next), PROFILE_ROUTE);
  await page.waitForSelector(BUTTON);
  await page.evaluate(({ next, selector }) => {
    const oldButton = document.querySelector(selector);
    history.pushState({}, '', next);
    oldButton.click();
  }, { next: `/lightning/setup/Profiles/page?address=%2F${SECOND_PROFILE}`, selector: BUTTON });
  await absent();
  await page.waitForFunction((id) => document.querySelector('#sfboost-extract-permset-btn')?.dataset.profileId === id, {}, SECOND_PROFILE);

  // DOM replacement after the old 5-second retry window must recover.
  await page.evaluate(() => document.querySelector('.setupcontent').replaceChildren());
  await pause(5500);
  await page.evaluate(() => {
    const header = document.createElement('h1');
    header.textContent = 'Replacement profile heading';
    document.querySelector('.setupcontent').append(header);
  });
  await page.waitForSelector(BUTTON);
  await setEnabledModules(helperPage, defaults);
  await page.waitForFunction(() => !document.querySelector('#sfboost-extract-permset-wrapper'));
  const restored = await page.$eval('.setupcontent > h1', (header) => header.textContent);
  if (restored !== 'Replacement profile heading') throw new Error('Header was not restored on disable');
  await pause(1100);
  await absent();
  await setEnabledModules(helperPage, enabled);
  await page.waitForSelector(BUTTON);

  // A same-origin Classic iframe is allowed only when its actual route matches.
  await page.goto(origin + PROFILE_ROUTE + '&frame=stale', { waitUntil: 'load' });
  await pause(1500);
  for (const frame of page.frames()) {
    if (await frame.$(BUTTON)) throw new Error('Button attached to an unrelated retained iframe');
  }
  await page.goto(origin + PROFILE_ROUTE + '&frame=profile', { waitUntil: 'load' });
  const frame = page.frames().find((candidate) => candidate.url().includes(`/${PROFILE}`));
  if (!frame) throw new Error('Profile iframe missing');
  await frame.waitForSelector(BUTTON);
  await pause(1100);
  if (await frame.$$eval(BUTTON, (nodes) => nodes.length) !== 1) throw new Error('Duplicate iframe button');
  await page.evaluate((next) => history.pushState({}, '', next), APPROVAL_ROUTE);
  await frame.waitForFunction(() => !document.querySelector('#sfboost-extract-permset-wrapper'));
  await setEnabledModules(helperPage, defaults);
}
