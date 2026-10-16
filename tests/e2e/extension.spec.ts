import {
  chromium,
  expect,
  test,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import path from 'node:path';

let context: BrowserContext;
let page: Page;
const errors: string[] = [];

test.beforeEach(async () => {
  errors.length = 0;
  const extension = path.resolve('.output/chrome-mv3');
  context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: true,
    viewport: { width: 1366, height: 900 },
    args: [
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
    ],
  });
  page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('http://localhost:3000');
  await expect(page.locator('#main-video')).toHaveJSProperty('duration', 90);
  await page.getByRole('button', { name: 'Open What did I miss?' }).click();
});

test.afterEach(async () => {
  await context?.close();
  expect(errors).toEqual([]);
});

test('real extension: playback, bounded mock, keyboard, rewind, minimize and close', async () => {
  const panel = page.getByRole('dialog');
  await expect(panel.getByText('Paused', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Play / pause' }).click();
  await expect(panel.getByText('Playing', { exact: true })).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator('#main-video')
        .evaluate((video: HTMLVideoElement) => video.currentTime),
    )
    .toBeGreaterThan(0.3);
  await page.getByRole('button', { name: 'Play / pause' }).click();
  await expect(panel.getByText('Paused', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Seek to 0:47' }).click();
  await expect(panel.getByLabel('Playback position')).toHaveText('0:47 / 1:30');
  await page.screenshot({ path: 'test-results/widget-dark.png' });
  const input = panel.getByRole('textbox');
  await input.fill('What happened?');
  await input.press('Shift+Enter');
  await expect(input).toHaveValue('What happened?\n');
  await input.press('Enter');
  await expect(
    panel.getByText(/Your question reached the local mock at 0:47/),
  ).toBeVisible();
  await page.screenshot({ path: 'test-results/widget-conversation.png' });
  await panel.getByRole('button', { name: 'Minimize chat' }).click();
  await expect(panel).not.toBeVisible();
  await page.getByRole('button', { name: 'Open What did I miss?' }).click();
  await expect(
    panel.getByText(/Your question reached the local mock/),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Seek to 0:12' }).click();
  await expect(
    panel.getByText(/Your question reached the local mock/),
  ).toHaveCount(0);
  await expect(panel.getByLabel('Playback position')).toHaveText('0:12 / 1:30');
  await input.fill('Pending at 12');
  await input.press('Enter');
  await page.locator('#main-video').evaluate((video: HTMLVideoElement) => {
    video.currentTime = 2;
  });
  await expect(panel.getByText('Pending at 12', { exact: true })).toHaveCount(
    0,
  );
  await expect(panel.getByRole('log')).toHaveCount(0);
  await panel.getByRole('button', { name: 'Close and clear chat' }).click();
  await page.getByRole('button', { name: 'Open What did I miss?' }).click();
  await expect(panel.getByText(/Ask about what you've watched/)).toBeVisible();
  await expect(panel.getByText('Developer context')).toHaveCount(0);
});

test('theme persists; CSS isolation, missing video and replacement work', async () => {
  const panel = page.getByRole('dialog');
  await panel.getByRole('button', { name: 'Switch to light mode' }).click();
  await page.screenshot({ path: 'test-results/widget-light.png' });
  await page.reload();
  await page.getByRole('button', { name: 'Open What did I miss?' }).click();
  await expect(
    panel.getByRole('button', { name: 'Switch to dark mode' }),
  ).toBeVisible();
  const header = panel.getByRole('heading', { name: 'What did I miss?' });
  const fontSize = await header.evaluate(
    (node) => getComputedStyle(node).fontSize,
  );
  await page.getByText('More fixture controls').click();
  await page.getByRole('button', { name: 'Toggle hostile host CSS' }).click();
  await expect
    .poll(() => header.evaluate((node) => getComputedStyle(node).fontSize))
    .toBe(fontSize);
  await expect(
    page.getByRole('heading', { name: 'The quiet interval', exact: true }),
  ).toHaveCSS('font-size', '45px');
  await page.getByRole('button', { name: 'Remove video', exact: true }).click();
  await expect(panel.getByText('No active video detected')).toBeVisible();
  await inputQuestion(panel);
  await expect(
    panel.getByRole('button', { name: 'Send message' }),
  ).toBeDisabled();
  await page
    .getByRole('button', { name: 'Restore video', exact: true })
    .click();
  await expect(panel.getByText('Paused', { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 375, height: 667 });
  const box = await panel.boundingBox();
  expect(box?.x).toBeGreaterThanOrEqual(0);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(375);
  await page.screenshot({ path: 'test-results/widget-narrow.png' });
});

async function inputQuestion(panel: ReturnType<Page['getByRole']>) {
  await panel.getByRole('textbox').fill('Question without video');
}

test('compact panel keeps chat readable and details keyboard accessible on small screens', async () => {
  const panel = page.getByRole('dialog');
  const details = page.getByLabel('Video details', { exact: true });
  await expect(panel.getByRole('combobox')).toBeHidden();
  await panel.getByRole('textbox').fill('What happened so far?');
  await panel.getByRole('button', { name: 'Send message' }).click();
  await expect(
    panel.getByText(/Your question reached the local mock/),
  ).toBeVisible();
  const conversation = panel.getByRole('log');
  const panelBox = (await panel.boundingBox())!;
  const chatBox = (await conversation.boundingBox())!;
  expect(chatBox.height).toBeGreaterThan(panelBox.height * 0.6);
  await page.screenshot({ path: 'test-results/widget-minimal-chat.png' });
  await details.focus();
  await page.keyboard.press('Enter');
  await expect(panel.getByRole('combobox')).toBeVisible();
  await expect(panel.getByRole('textbox')).toBeVisible();
  await page.setViewportSize({ width: 375, height: 500 });
  const composer = (await panel.getByRole('textbox').boundingBox())!;
  expect(composer.y + composer.height).toBeLessThan(500);
  expect((await conversation.boundingBox())!.height).toBeGreaterThan(90);
  await details.focus();
  await page.keyboard.press('Enter');
  await expect(panel.getByRole('combobox')).toBeHidden();
  await expect(
    panel.getByText(/Your question reached the local mock/),
  ).toBeVisible();
  await page.screenshot({ path: 'test-results/widget-minimal-narrow.png' });
});

test('a separate playing ad-like video cannot take over an active conversation', async () => {
  const panel = page.getByRole('dialog');
  await page.getByRole('button', { name: 'Seek to 0:47' }).click();
  await expect(panel.getByLabel('Playback position')).toHaveText('0:47 / 1:30');
  await panel.getByRole('textbox').fill('Keep this player');
  await panel.getByRole('button', { name: 'Send message' }).click();
  await expect(
    panel.getByText(/Your question reached the local mock at 0:47/),
  ).toBeVisible();
  await openVideoDetails();
  const picker = panel.getByRole('combobox', { name: 'Video source' });
  const selected = await picker.inputValue();
  expect(selected).not.toBe('auto');
  await page.evaluate(async () => {
    const original = document.querySelector<HTMLVideoElement>('#main-video')!;
    const second = document.createElement('video');
    second.id = 'ad-like-video';
    second.src = original.currentSrc;
    second.muted = true;
    second.setAttribute('aria-label', 'Separate ad-like player');
    document.body.append(second);
    await second.play();
  });
  await openVideoDetails();
  await panel.getByRole('button', { name: 'Refresh videos' }).click();
  await expect(
    picker.locator('option', { hasText: 'Separate ad-like player' }),
  ).toHaveCount(1);
  await expect(picker).toHaveValue(selected);
  await expect(panel.getByLabel('Playback position')).toHaveText('0:47 / 1:30');
  await expect(panel.getByText('Kept for this conversation')).toBeVisible();
  await page.locator('#main-video').evaluate((video) => video.remove());
  await expect(panel.getByText('No active video detected')).toBeVisible();
  await expect(
    panel.getByText(/Your question reached the local mock/),
  ).toHaveCount(0);
  await expect(picker).toHaveValue(selected);
  await picker.selectOption('auto');
  await expect(panel.getByText('Playing', { exact: true })).toBeVisible();
});

test('unexplained timeline changes suspend tracking without interrupting playback', async () => {
  const panel = page.getByRole('dialog');
  await page.getByRole('button', { name: 'Seek to 0:47' }).click();
  await expect(panel.getByLabel('Playback position')).toHaveText('0:47 / 1:30');
  await panel.getByRole('textbox').fill('Before transition');
  await panel.getByRole('button', { name: 'Send message' }).click();
  await expect(
    panel.getByText(/Your question reached the local mock/),
  ).toBeVisible();
  // A generated live stream changes the actual media duration while retaining the
  // element's source attribute. Page-world property overrides cannot affect the
  // extension's isolated-world DOM wrappers.
  await page
    .locator('#main-video')
    .evaluate(async (video: HTMLVideoElement) => {
      const canvas = document.createElement('canvas');
      canvas.getContext('2d')!.fillRect(0, 0, 300, 150);
      video.srcObject = canvas.captureStream(10);
      video.muted = true;
      await video.play();
    });
  await expect(
    panel.getByText('Tracking unavailable · Timeline uncertain'),
  ).toBeVisible();
  await expect(
    panel.getByText(/Your question reached the local mock/),
  ).toHaveCount(0);
  await panel.getByRole('textbox').fill('Blocked');
  await expect(
    panel.getByRole('button', { name: 'Send message' }),
  ).toBeDisabled();
  await expect(page.locator('#main-video')).toHaveJSProperty('paused', false);
  await openVideoDetails();
  await panel.getByRole('button', { name: 'Refresh videos' }).click();
  await expect(
    panel.getByRole('button', { name: 'Send message' }),
  ).toBeDisabled();
});

test('container fullscreen preserves the widget and returns it to the page', async () => {
  await page.getByRole('button', { name: 'Container fullscreen' }).click();
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement?.id))
    .toBe('player-container');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect
    .poll(() =>
      page.locator('wdim-companion').evaluate((host) => host.parentElement?.id),
    )
    .toBe('player-container');
  await page.getByRole('textbox').fill('In fullscreen');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(
    page.getByText(/Your question reached the local mock/),
  ).toBeVisible();
  await page.evaluate(() => document.exitFullscreen());
  await expect
    .poll(() =>
      page
        .locator('wdim-companion')
        .evaluate((host) => host.parentElement?.tagName),
    )
    .toBe('BODY');
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('discovers cross-origin embedded players and reads their selected timestamp', async () => {
  await page.goto('http://localhost:3000/players.html');
  await page.getByRole('button', { name: 'Add cross-origin player' }).click();
  const embedded = page.frameLocator('iframe');
  await expect(embedded.locator('video')).toHaveJSProperty('duration', 90);
  await page.getByRole('button', { name: 'Open What did I miss?' }).click();
  await openVideoDetails();
  const picker = page.getByRole('combobox', { name: 'Video source' });
  const option = picker
    .locator('option')
    .filter({ hasText: 'Embedded movie player' });
  await expect(option).toHaveCount(1);
  expect(await embedded.locator('wdim-companion').count()).toBe(0);
  await picker.selectOption((await option.getAttribute('value'))!);
  await embedded.getByRole('button', { name: 'Seek embedded to 0:47' }).click();
  await expect(page.getByLabel('Playback position')).toHaveText('0:47 / 1:30');
  await page.getByRole('textbox').fill('Question about embedded player');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(
    page.getByText(/Your question reached the local mock at 0:47/),
  ).toBeVisible();
  await page.screenshot({ path: 'test-results/widget-embedded.png' });
  await page.locator('iframe').evaluate((frame) => frame.remove());
  await expect(
    page.getByText(
      'Selected video is unavailable. Refresh or choose another video.',
    ),
  ).toBeVisible();
  await expect(
    page.getByText(/Your question reached the local mock/),
  ).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Send message' }),
  ).toBeDisabled();
});

test('discovers open/closed shadow trees, srcdoc, hidden playing video and manual rescan', async () => {
  await page.goto('http://localhost:3000/players.html');
  await page.getByRole('button', { name: 'Add open-shadow player' }).click();
  await page.getByRole('button', { name: 'Add closed-shadow player' }).click();
  await page.getByRole('button', { name: 'Add srcdoc player' }).click();
  await page.getByRole('button', { name: 'Add hidden playing video' }).click();
  await page.getByRole('button', { name: 'Open What did I miss?' }).click();
  await openVideoDetails();
  await page.getByRole('button', { name: 'Refresh videos' }).click();
  await openVideoDetails();
  const picker = page.getByRole('combobox', { name: 'Video source' });
  for (const label of [
    'open-shadow movie',
    'closed-shadow movie',
    'Srcdoc movie',
    'Hidden playing movie',
  ]) {
    await expect(
      picker.locator('option').filter({ hasText: label }),
    ).toHaveCount(1);
  }
  const closed = picker
    .locator('option')
    .filter({ hasText: 'closed-shadow movie' });
  await picker.selectOption((await closed.getAttribute('value'))!);
  await expect(page.getByLabel('Playback position')).toHaveText('0:00 / 1:30');
  await expect(page.getByText('Paused', { exact: true })).toBeVisible();
  // A late attachShadow on an existing node emits no light-DOM child mutation.
  await page.evaluate(() => {
    const host = document.createElement('div');
    host.id = 'late-shadow';
    document.body.append(host);
  });
  await openVideoDetails();
  await page.getByRole('button', { name: 'Refresh videos' }).click();
  await expect(
    page.getByRole('button', { name: 'Refresh videos' }),
  ).toBeEnabled();
  await page.evaluate(() => {
    const host = document.querySelector('#late-shadow')!;
    const video = document.createElement('video');
    video.src = '/sample.webm';
    video.preload = 'auto';
    video.setAttribute('aria-label', 'Late attached player');
    host.attachShadow({ mode: 'closed' }).append(video);
  });
  await openVideoDetails();
  await page.getByRole('button', { name: 'Refresh videos' }).click();
  await expect(
    picker.locator('option').filter({ hasText: 'Late attached player' }),
  ).toHaveCount(1);
});

test('selects another tab without stealing selection and clears it when that tab closes', async () => {
  const other = await context.newPage();
  await other.goto('http://localhost:3000/?second-tab=1');
  await expect(other.locator('video')).toHaveJSProperty('duration', 90);
  await other.locator('video').evaluate((video: HTMLVideoElement) => {
    video.currentTime = 47;
  });
  await page.bringToFront();
  await openVideoDetails();
  const picker = page.getByRole('combobox', { name: 'Video source' });
  await expect(picker.locator('optgroup')).toHaveCount(2);
  const remote = picker
    .locator('optgroup')
    .filter({ has: page.locator('option') });
  const value = await remote.evaluateAll((groups) => {
    const group = groups.find((item) =>
      item.getAttribute('label')?.startsWith('Tab '),
    );
    return group?.querySelector('option')?.value;
  });
  expect(value).toBeTruthy();
  await picker.selectOption(value!);
  await expect(page.getByLabel('Playback position')).toHaveText('0:47 / 1:30');
  await page
    .locator('#main-video')
    .evaluate(async (video: HTMLVideoElement) => {
      video.currentTime = 12;
      await video.play();
    });
  await expect(picker).toHaveValue(value!);
  await expect(page.getByLabel('Playback position')).toHaveText('0:47 / 1:30');
  await page.getByRole('textbox').fill('Question for another tab');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(
    page.getByText(/Your question reached the local mock at 0:47/),
  ).toBeVisible();
  await other.close();
  await expect(
    page.getByText(
      'Selected video is unavailable. Refresh or choose another video.',
    ),
  ).toBeVisible();
  await expect(
    page.getByText(/Your question reached the local mock/),
  ).toHaveCount(0);
  await picker.selectOption('auto');
  await expect(page.getByText('Playing', { exact: true })).toBeVisible();
});

test('recovers discovery after the MV3 worker restarts', async () => {
  const cdp = await context.newCDPSession(page);
  let versionId: string | undefined;
  cdp.on('ServiceWorker.workerVersionUpdated', ({ versions }) => {
    for (const version of versions) {
      if (
        version.scriptURL.startsWith('chrome-extension://') &&
        version.status === 'activated'
      )
        versionId = version.versionId;
    }
  });
  await cdp.send('ServiceWorker.enable');
  await expect.poll(() => versionId).toBeTruthy();
  await cdp.send('ServiceWorker.stopWorker', { versionId: versionId! });
  await openVideoDetails();
  await page.getByRole('button', { name: 'Refresh videos' }).click();
  await expect(
    page
      .getByRole('combobox', { name: 'Video source' })
      .locator('option')
      .filter({ hasText: 'Local test video' }),
  ).toHaveCount(1);
  await page.getByRole('button', { name: 'Seek to 0:47' }).click();
  await expect(page.getByLabel('Playback position')).toHaveText('0:47 / 1:30');
  await page.getByRole('textbox').fill('After worker restart');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(
    page.getByText(/Your question reached the local mock at 0:47/),
  ).toBeVisible();
  await cdp.detach();
});

test('keeps native picture-in-picture video discoverable when its element is hidden', async () => {
  await page.goto('http://localhost:3000/players.html');
  await page.getByRole('button', { name: 'Add cross-origin player' }).click();
  const embedded = page.frameLocator('iframe');
  await expect(embedded.locator('video')).toHaveJSProperty('duration', 90);
  await embedded
    .getByRole('button', { name: 'Picture-in-picture', exact: true })
    .click();
  await expect
    .poll(() =>
      embedded
        .locator('video')
        .evaluate(
          (video) => video.ownerDocument.pictureInPictureElement === video,
        ),
    )
    .toBe(true);
  await page.getByRole('button', { name: 'Open What did I miss?' }).click();
  await openVideoDetails();
  const picker = page.getByRole('combobox', { name: 'Video source' });
  const option = picker
    .locator('option')
    .filter({ hasText: 'Picture-in-picture' });
  await expect(option).toHaveCount(1);
  const id = (await option.getAttribute('value'))!;
  await picker.selectOption(id);
  await embedded.locator('video').evaluate((video: HTMLVideoElement) => {
    video.style.display = 'none';
    video.currentTime = 47;
  });
  await expect(page.getByLabel('Playback position')).toHaveText('0:47 / 1:30');
  await expect(picker).toHaveValue(id);
  await embedded
    .locator('body')
    .evaluate(() => document.exitPictureInPicture());
  await expect(
    picker.locator('option').filter({ hasText: 'Picture-in-picture' }),
  ).toHaveCount(0);
  await expect(picker).toHaveValue(id);
});

test('page navigation and history restoration reconnect the video collector', async () => {
  await page.getByRole('button', { name: 'Seek to 0:47' }).click();
  await expect(page.getByLabel('Playback position')).toHaveText('0:47 / 1:30');
  await page.goto('http://localhost:3000/players.html');
  await page.goBack();
  const launcher = page.getByRole('button', { name: 'Open What did I miss?' });
  if (await launcher.isVisible()) await launcher.click();
  await openVideoDetails();
  await page.getByRole('button', { name: 'Refresh videos' }).click();
  await expect(
    page
      .getByRole('combobox', { name: 'Video source' })
      .locator('option')
      .filter({ hasText: 'Local test video' }),
  ).toHaveCount(1);
  await page.getByRole('button', { name: 'Seek to 0:12' }).click();
  await expect(page.getByLabel('Playback position')).toHaveText('0:12 / 1:30');
  await expect(page.locator('wdim-companion')).toHaveCount(1);
});

test('discovers blob, data and sandboxed nested frames through their initiating origin', async () => {
  await page.goto('http://localhost:3000/players.html');
  await page.evaluate(() => {
    const html = (label: string) =>
      `<!doctype html><video controls muted preload="auto" src="http://localhost:3000/sample.webm" aria-label="${label}" style="width:320px"></video>`;
    const blob = document.createElement('iframe');
    blob.src = URL.createObjectURL(
      new Blob([html('Blob frame movie')], { type: 'text/html' }),
    );
    const data = document.createElement('iframe');
    data.src = 'data:text/html,' + encodeURIComponent(html('Data frame movie'));
    const sandbox = document.createElement('iframe');
    sandbox.sandbox.add('allow-scripts');
    sandbox.srcdoc =
      '<iframe src="http://127.0.0.1:3000/embedded.html"></iframe>' +
      html('Sandbox frame movie');
    document.querySelector('#players')!.append(blob, data, sandbox);
  });
  await page.getByRole('button', { name: 'Open What did I miss?' }).click();
  await openVideoDetails();
  const picker = page.getByRole('combobox', { name: 'Video source' });
  for (const label of [
    'Blob frame movie',
    'Data frame movie',
    'Sandbox frame movie',
    'Embedded movie player',
  ]) {
    const option = picker.locator('option').filter({ hasText: label });
    await expect(option).toHaveCount(1);
    await picker.selectOption((await option.getAttribute('value'))!);
    await expect(page.getByLabel('Playback position')).toHaveText(
      '0:00 / 1:30',
    );
  }
});

test('automatically selects a hidden paused PiP video inside a closed shadow root', async () => {
  await page.goto('http://localhost:3000/players.html');
  await page.evaluate(() => {
    const host = document.createElement('div');
    const root = host.attachShadow({ mode: 'closed' });
    const video = document.createElement('video');
    video.src = '/sample.webm';
    video.preload = 'auto';
    video.muted = true;
    video.setAttribute('aria-label', 'Shadow PiP movie');
    root.append(video);
    const button = document.createElement('button');
    button.textContent = 'Launch shadow PiP';
    button.disabled = true;
    video.addEventListener('loadeddata', () => {
      button.disabled = false;
    });
    button.onclick = async () => {
      await video.requestPictureInPicture();
      video.style.display = 'none';
      video.currentTime = 47;
    };
    document.querySelector('#players')!.append(host, button);
  });
  await page.getByRole('button', { name: 'Launch shadow PiP' }).click();
  await page.getByRole('button', { name: 'Open What did I miss?' }).click();
  await openVideoDetails();
  const picker = page.getByRole('combobox', { name: 'Video source' });
  await expect(picker).toHaveValue('auto');
  await expect(
    picker.locator('option').filter({ hasText: 'Picture-in-picture' }),
  ).toHaveCount(1);
  await expect(page.getByLabel('Playback position')).toHaveText('0:47 / 1:30');
  await page.evaluate(() => document.exitPictureInPicture());
  await expect(page.getByText('No active video detected')).toBeVisible();
});

async function openVideoDetails() {
  const details = page.locator('.video-details');
  if (!(await details.evaluate((element: HTMLDetailsElement) => element.open)))
    await page.getByLabel('Video details', { exact: true }).click();
}
