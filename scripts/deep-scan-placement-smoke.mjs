import assert from 'node:assert/strict';

const BUTTON = '#sfboost-deep-scan-btn';

export async function assertDeepScanPlacement(page) {
  if (new URL(page.url()).searchParams.has('delayedHeader')) {
    await page.waitForSelector('#sfboost-env-badge');
    // Let the content script initialize without a title: no floating fallback.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    assert.equal(await page.$(BUTTON), null, 'Deep Scan must wait for the heading');
    await page.evaluate(() => {
      const template = document.getElementById('delayed-header');
      template.replaceWith(template.content.cloneNode(true));
    });
  }

  async function readPlacement() {
    await page.waitForSelector(BUTTON, { timeout: 10000 });
    return page.$eval(BUTTON, (button) => {
      const heading = button.previousElementSibling;
      const style = getComputedStyle(button);
      const rect = button.getBoundingClientRect();
      const titleRect = heading.getBoundingClientRect();
      return {
        count: document.querySelectorAll('#sfboost-deep-scan-btn').length,
        nextToHeading: heading.matches('.pageDescription'),
        position: style.position,
        radius: style.borderRadius,
        shadow: style.boxShadow,
        beside: rect.left >= titleRect.right && Math.abs(rect.top + rect.height / 2 - titleRect.top - titleRect.height / 2) < 2,
      };
    });
  }

  const before = await readPlacement();
  assert.equal(before.count, 1);
  assert.equal(before.nextToHeading, true);
  assert.equal(before.position, 'static');
  assert.equal(before.shadow, 'none');
  assert.equal(before.beside, true, 'Button should align beside the title');

  // Salesforce can replace the title without navigating to another URL.
  await page.evaluate(() => {
    const header = document.querySelector('.bPageTitle');
    header.replaceWith(document.createRange().createContextualFragment(
      '<div class="bPageTitle"><h1 class="pageDescription">Welcome template</h1></div>',
    ));
  });
  assert.deepEqual(await readPlacement(), before, 'Rerender must preserve one button and its design');

  // Narrow headers should wrap the button without squeezing its label.
  await page.$eval('.bPageTitle', (header) => { header.style.width = '240px'; });
  const fits = await page.$eval(BUTTON, (button) => {
    const rect = button.getBoundingClientRect();
    const parent = button.parentElement.getBoundingClientRect();
    return rect.left >= parent.left && rect.right <= parent.right && button.scrollWidth <= button.clientWidth;
  });
  assert.equal(fits, true, 'Deep Scan must fit in a narrow header');
  await page.$eval('.bPageTitle', (header) => { header.style.removeProperty('width'); });
}
