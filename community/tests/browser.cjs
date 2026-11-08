/* Run with Playwright installed: node community/tests/browser.cjs
 * Optional CHROMIUM_EXECUTABLE_PATH selects an installed Chromium.
 * Optionally set COMMUNITY_BASE_URL; otherwise a loopback-only static server is used.
 * No external hosting, network APIs, or backend are needed. */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
(async () => {
  const root = path.resolve(__dirname, '../..');
  let server, browser;
  try {
    let base = process.env.COMMUNITY_BASE_URL;
    if (!base) {
      server = http.createServer((req, res) => {
        const file = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
        if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
        fs.readFile(file.endsWith(path.sep) ? path.join(file, 'index.html') : file, (err, data) => {
          if (err) { res.writeHead(404).end(); return; }
          res.setHeader('Content-Type', ({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'})[path.extname(file)] || 'application/octet-stream');
          res.end(data);
        });
      });
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      base = `http://127.0.0.1:${server.address().port}/community/index.html`;
    }
    fs.mkdirSync(path.resolve(__dirname, '../preview'), { recursive: true });
    browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}) });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1080 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const count = async n => assert.equal(await page.locator('#posts .post').count(), n);
    const clickText = text => page.getByRole('button', { name: text, exact: true }).click();
    const close = async () => { await page.locator('#dialog-close').click(); await page.waitForFunction(() => !document.querySelector('#dialog').open); };
    const login = async role => { await page.locator('#login-button').click(); await page.locator(`[data-role="${role}"]`).click(); };
    const moderate = async label => { await clickText(label); await page.locator('#moderation-reason').fill('테스트 검토 사유입니다'); await clickText('처리 확정'); };
    const key = 'cryptoflow.community.demo.v1';
    await page.goto(base); await count(5);
    assert.equal(await page.locator('meta[name=robots]').getAttribute('content'), 'noindex, nofollow');
    await page.locator('[data-category=btc]').click(); await count(1);
    await page.locator('[data-category=all]').click();
    await page.locator('#search').fill('없는검색어'); await count(0);
    await clickText('검색 초기화'); await count(5);
    await page.locator('#sort').selectOption('comments');
    assert.match(await page.locator('.post-title').first().innerText(), /같은 기간/);
    await page.locator('#sort').selectOption('newest');
    for (const cancel of ['close', 'escape']) {
      await page.locator('#write-button').click();
      assert.equal(await page.locator('[data-role=member]').count(), 1);
      if (cancel === 'close') await close(); else await page.keyboard.press('Escape');
      await login('member');
      assert.equal(await page.locator('#post-form').count(), 0, 'cancelled pending write must not resume');
      await page.locator('#login-button').click();
    }
    // Login must resume an explicitly requested write.
    await page.locator('#write-button').click(); await page.locator('[data-role=member]').click();
    await page.waitForFunction(() => document.activeElement?.id === 'post-title');
    const title = '<img src=x onerror=alert(1)> 테스트';
    await page.locator('#post-title').fill(title);
    await page.locator('#post-body').fill('<script>window.INJECTED=true</script> 이것은 문자 그대로입니다.');
    await clickText('데모 게시글 등록'); await count(6);
    assert.equal(await page.locator('#dialog-title').innerText(), title);
    assert.equal(await page.locator('#dialog-content img, #dialog-content script').count(), 0);
    assert.equal(await page.evaluate(() => window.INJECTED), undefined);
    await page.locator('#comment-body').fill('댓글 테스트 내용'); await clickText('댓글 등록');
    assert.equal(await page.locator('.comment').count(), 1);
    await page.locator('.comment .quiet').click(); await clickText('데모 신고 접수');
    await clickText('게시글 신고'); await clickText('데모 신고 접수'); await close();
    await page.locator('#login-button').click(); await login('moderator'); await page.locator('#moderator-button').click();
    assert.equal(await page.getByText('검토 대기 2건', {exact:true}).count(), 1);
    // Comment report appears first; hide then restore it.
    await page.getByRole('button', {name:'숨김 처리', exact:true}).first().click();
    await page.locator('#moderation-reason').fill('댓글 숨김 사유'); await clickText('처리 확정');
    await page.screenshot({path:path.resolve(__dirname, '../preview/moderation.png'), fullPage:true});
    await moderate('복원하기');
    await moderate('숨김 처리'); await count(5); await moderate('복원하기'); await count(6);
    // A new sample report tests dismissal separately.
    await page.locator('.post-title').filter({hasText:'같은 기간'}).click();
    await clickText('게시글 신고'); await clickText('데모 신고 접수'); await close();
    await moderate('신고 기각');
    assert.equal(await page.getByText('검토 대기 0건', {exact:true}).count(), 1);
    await page.locator('#remember').check();
    assert.ok(await page.evaluate(k => localStorage.getItem(k), key));
    await page.reload(); await count(6);
    assert.equal(await page.locator('#login-button').innerText(), '데모 로그인', 'login is never persisted');
    await page.locator('#reset-button').click(); await clickText('취소'); await count(6);
    await page.locator('#reset-button').click(); await clickText('데모 초기화 확인'); await count(5);
    assert.equal(await page.evaluate(k => localStorage.getItem(k), key), null);
    // Corrupted and inaccessible storage both fall back to a usable memory demo.
    await page.evaluate(k => localStorage.setItem(k, '{bad json'), key); await page.reload(); await count(5);
    assert.match(await page.locator('#storage-status').innerText(), /손상/);
    await page.evaluate(k => localStorage.removeItem(k), key);
    const denied = await browser.newContext();
    await denied.addInitScript(() => { for (const method of ['getItem','setItem','removeItem']) Storage.prototype[method] = () => { throw new DOMException('Denied', 'SecurityError'); }; });
    const p2 = await denied.newPage(); await p2.goto(base);
    assert.equal(await p2.locator('#posts .post').count(), 5);
    await p2.locator('#remember').check(); assert.equal(await p2.locator('#remember').isChecked(), false);
    await p2.locator('#reset-button').click();
    await p2.getByRole('button', {name:'데모 초기화 확인', exact:true}).click();
    assert.equal(await p2.locator('#dialog').evaluate(el => el.open), false);
    assert.match(await p2.locator('#storage-status').innerText(), /저장본 삭제에 실패/);
    await denied.close();
    await page.reload();
    fs.mkdirSync(path.resolve(__dirname, '../preview'), { recursive: true });
    await page.screenshot({path:path.resolve(__dirname, '../preview/desktop.png'), fullPage:true});
    await page.setViewportSize({width:390, height:844});
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'mobile must not overflow horizontally');
    await page.screenshot({path:path.resolve(__dirname, '../preview/mobile.png'), fullPage:true});
    assert.deepEqual(errors, []);
    console.log('PASS: browse, filtering, search, sort, auth cancellation/resume, posts, comments, literal XSS, reports, moderation, reset, persistence, storage failures, desktop/mobile screenshots');
  } finally { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
