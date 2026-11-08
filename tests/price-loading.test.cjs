// Run with Node.js 18+: node --test tests/price-loading.test.cjs
// No dependencies or live network requests. Executes the actual page script with mocked DOM/fetch.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const app = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
    .map(match => match[1]).find(script => script.includes("document.addEventListener('DOMContentLoaded'"));
const flush = () => new Promise(resolve => setImmediate(resolve));
const response = data => ({ ok: true, json: async () => data });
const primary = (price = '100', open = '80') => response({ last: price, open });
const fallback = (price = 100, change = 25) => response({ bitcoin: { usd: price, usd_24h_change: change } });
const reject = () => Promise.reject(new TypeError('Network unavailable'));
const hang = (_url, { signal }) => new Promise((resolve, rejectPromise) => {
    signal.addEventListener('abort', () => rejectPromise(new DOMException('Aborted', 'AbortError')), { once: true });
});

function createApp(options = {}) {
    const elements = new Map();
    for (const match of html.matchAll(/<([a-z][\w-]*)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
        const classes = new Set((match[2].match(/class="([^"]*)"/)?.[1] || '').split(' ').filter(Boolean));
        const listeners = new Map();
        const element = {
            textContent: '', innerHTML: '', value: '', hidden: /\bhidden\b/.test(match[2]), disabled: false,
            style: {}, dataset: { langKey: match[2].match(/data-lang-key="([^"]+)"/)?.[1] },
            classList: {
                add(...names) { names.forEach(name => classes.add(name)); },
                remove(...names) { names.forEach(name => classes.delete(name)); },
                contains(name) { return classes.has(name); },
                toggle(name, force = !classes.has(name)) { force ? classes.add(name) : classes.delete(name); }
            },
            addEventListener(name, handler) { listeners.set(name, handler); },
            click() { if (!this.disabled) listeners.get('click')?.(); },
            getAttribute(name) { return name === 'data-lang-key' ? this.dataset.langKey : null; },
            getContext() { return {}; }
        };
        Object.defineProperty(element, 'innerText', { get() { return this.textContent; }, set(value) { this.textContent = value; } });
        elements.set(match[3], element);
    }
    const timeouts = new Map(), intervals = new Map(), requests = [], charts = [];
    let nextTimer = 0, ready;
    const context = {
        document: {
            documentElement: {},
            getElementById: id => elements.get(id),
            querySelectorAll: () => [...elements.values()].filter(element => element.dataset.langKey),
            addEventListener(name, handler) { if (name === 'DOMContentLoaded') ready = handler; }
        },
        localStorage: options.storage || { getItem: () => options.language || null, setItem() {} },
        AbortController, DOMException, Date,
        console: { warn() {}, error() {} },
        setTimeout(fn, delay) { const id = ++nextTimer; timeouts.set(id, { fn, delay }); return id; },
        clearTimeout(id) { timeouts.delete(id); },
        setInterval(fn, delay) { intervals.set(delay, fn); },
        fetch(url, init) { requests.push({ url, ...init }); return options.fetch(url, init, requests.length); },
        Chart: function (_canvas, config) { charts.push(config); this.destroy = () => {}; },
        alert(message) { throw new Error(message); }
    };
    if (!options.missingSupply) {
        context.btcSupplyData = [{ Date: '2026-01-01', Supply: 100 }, { Date: '2026-01-02', Supply: 110 }];
        context.ethSupplyData = [{ Date: '2026-01-01', Supply: 200 }, { Date: '2026-01-02', Supply: 205 }];
    }
    vm.runInNewContext(app, context, { filename: 'index.html' });
    ready();
    return {
        element: id => elements.get(id), requests, timeouts, charts,
        click: id => elements.get(id).click(),
        refresh: () => intervals.get(30000)(),
        async expire() {
            for (const [id, timer] of [...timeouts]) { timeouts.delete(id); timer.fn(); }
            await flush();
        }
    };
}

test('Coinbase renders price and 24-hour change, with provider and received time', async () => {
    const ui = createApp({ fetch: async () => primary() });
    await flush();
    assert.equal(ui.element('crypto-price').textContent, '$100.00');
    assert.equal(ui.element('crypto-change').textContent, '+20.00 (+25.00%)');
    assert.match(ui.element('price-status').textContent, /^Coinbase · 수신 시각 /);
    assert.equal(ui.element('price-retry').hidden, true);
    assert.equal(ui.timeouts.size, 0);
});

test('HTTP failure falls back to CoinGecko', async () => {
    const ui = createApp({ fetch: async (_url, _init, call) => call === 1 ? { ok: false, status: 429 } : fallback() });
    await flush();
    assert.equal(ui.requests.length, 2);
    assert.match(ui.requests[1].url, /coingecko/);
    assert.equal(ui.element('crypto-price').textContent, '$100.00');
    assert.equal(ui.element('crypto-change').textContent, '+20.00 (+25.00%)');
    assert.match(ui.element('price-status').textContent, /CoinGecko/);
});

test('invalid Coinbase values trigger fallback', async () => {
    for (const value of ['12junk', 'Infinity', '-5', '0', '', null, true, {}]) {
        const ui = createApp({ fetch: async (_url, _init, call) => call === 1 ? primary(value) : fallback() });
        await flush();
        assert.equal(ui.requests.length, 2, String(value));
        assert.equal(ui.element('crypto-price').textContent, '$100.00');
    }
});

test('invalid CoinGecko data never displays NaN, Infinity, or a misleading price', async () => {
    const invalid = [undefined, null, {}, { bitcoin: null }, { bitcoin: { usd: -10, usd_24h_change: 1 } },
        { bitcoin: { usd: 100, usd_24h_change: null } }, { bitcoin: { usd: 100, usd_24h_change: -100 } },
        { bitcoin: { usd: 100, usd_24h_change: Infinity } }, { bitcoin: { usd: 100, usd_24h_change: '2' } }];
    for (const data of invalid) {
        const ui = createApp({ fetch: (_url, _init, call) => call === 1 ? reject() : Promise.resolve(response(data)) });
        await flush();
        assert.equal(ui.element('crypto-price').textContent, '—');
        assert.equal(ui.element('crypto-change').textContent, '');
        assert.equal(ui.element('price-retry').hidden, false);
    }
});

test('both providers failing shows a translated error and Retry', async () => {
    const ui = createApp({ fetch: reject });
    await flush();
    assert.equal(ui.element('crypto-price').textContent, '—');
    assert.match(ui.element('price-status').textContent, /가격을 불러오지 못했습니다/);
    assert.equal(ui.element('price-retry').hidden, false);
    ui.click('lang-en');
    assert.match(ui.element('price-status').textContent, /Price unavailable/);
    assert.equal(ui.element('price-retry').textContent, 'Retry');
});

test('a hung primary request times out after 6 seconds and falls back', async () => {
    const ui = createApp({ fetch: (url, init, call) => call === 1 ? hang(url, init) : Promise.resolve(fallback()) });
    assert.equal([...ui.timeouts.values()][0].delay, 6000);
    await ui.expire();
    assert.equal(ui.requests[0].signal.aborted, true);
    assert.equal(ui.element('crypto-price').textContent, '$100.00');
    assert.equal(ui.timeouts.size, 0);
});

test('both providers hanging leave Loading after two bounded attempts', async () => {
    const ui = createApp({ fetch: hang });
    await ui.expire();
    assert.equal(ui.requests.length, 2);
    await ui.expire();
    assert.equal(ui.element('crypto-price').textContent, '—');
    assert.equal(ui.element('price-retry').hidden, false);
    assert.equal(ui.timeouts.size, 0);
});

test('timeout also covers a hanging response body', async () => {
    const ui = createApp({ fetch: async (url, init, call) => call === 1
        ? { ok: true, json: () => hang(url, init) } : fallback() });
    await flush();
    await ui.expire();
    assert.equal(ui.element('crypto-price').textContent, '$100.00');
    assert.equal(ui.requests.length, 2);
});

test('coin change clears old quote immediately, changes title, and cancels obsolete request', async () => {
    const ui = createApp({ fetch: (url, init, call) => call === 1 ? Promise.resolve(primary()) : hang(url, init) });
    await flush();
    ui.refresh();
    ui.click('btn-eth');
    await flush();
    assert.equal(ui.element('price-title').textContent, '이더리움 가격');
    assert.equal(ui.element('crypto-price').textContent, '가격 불러오는 중...');
    assert.equal(ui.element('crypto-change').textContent, '');
    assert.equal(ui.requests[1].signal.aborted, true);
    assert.equal(ui.requests.length, 3, 'cancelled request must not start a fallback');
});

test('BTC → ETH → BTC ignores obsolete success even if abort arrives too late', async () => {
    const pending = [];
    const ui = createApp({ fetch: () => new Promise(resolve => pending.push(resolve)) });
    ui.click('btn-eth');
    ui.click('btn-btc');
    pending[2](primary('300'));
    await flush();
    pending[0](primary('100'));
    pending[1](primary('200'));
    await flush();
    assert.equal(ui.element('crypto-price').textContent, '$300.00');
    assert.equal(ui.element('price-title').textContent, '비트코인 가격');
});

test('an obsolete failure cannot overwrite the new coin loading state', async () => {
    const ui = createApp({ fetch: hang });
    ui.click('btn-eth');
    await flush();
    assert.equal(ui.element('crypto-price').textContent, '가격 불러오는 중...');
    assert.equal(ui.element('price-title').textContent, '이더리움 가격');
    assert.equal(ui.element('price-retry').hidden, true);
});

test('refresh failure keeps the correct last quote with an explicit stale warning', async () => {
    const ui = createApp({ fetch: (_url, _init, call) => call === 1 ? Promise.resolve(primary()) : reject() });
    await flush();
    ui.refresh();
    await flush();
    assert.equal(ui.element('crypto-price').textContent, '$100.00');
    assert.match(ui.element('price-status').textContent, /업데이트 실패 · 마지막으로 받은 가격/);
    assert.equal(ui.element('crypto-change').classList.contains('up'), false);
    assert.equal(ui.element('price-retry').hidden, false);
});

test('Retry recovers without duplicate in-flight requests and polling resumes', async () => {
    let finish;
    const ui = createApp({ fetch: (_url, _init, call) => call <= 2 ? reject() : new Promise(resolve => { finish = resolve; }) });
    await flush();
    ui.click('price-retry');
    ui.click('price-retry');
    ui.refresh();
    assert.equal(ui.requests.length, 3);
    finish(primary('120'));
    await flush();
    assert.equal(ui.element('crypto-price').textContent, '$120.00');
    assert.equal(ui.element('price-retry').hidden, true);
    ui.refresh();
    assert.equal(ui.requests.length, 4);
    finish(primary('130'));
    await flush();
    assert.equal(ui.element('crypto-price').textContent, '$130.00');
});

test('switching language on ETH preserves the Ethereum title and quote', async () => {
    const ui = createApp({ fetch: async () => primary() });
    await flush();
    ui.click('btn-eth');
    await flush();
    ui.click('lang-en');
    assert.equal(ui.element('price-title').textContent, 'Ethereum Price');
    assert.equal(ui.element('crypto-price').textContent, '$100.00');
    ui.click('lang-ko');
    assert.equal(ui.element('price-title').textContent, '이더리움 가격');
});

test('negative 24-hour change is formatted without an extra plus sign', async () => {
    const ui = createApp({ fetch: async () => primary('80', '100') });
    await flush();
    assert.equal(ui.element('crypto-change').textContent, '-20.00 (-20.00%)');
    assert.equal(ui.element('crypto-change').classList.contains('down'), true);
});

test('blocked localStorage does not prevent price loading', async () => {
    const ui = createApp({ fetch: async () => primary(), storage: {
        getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('SecurityError'); }
    } });
    await flush();
    assert.equal(ui.element('crypto-price').textContent, '$100.00');
});

test('unknown saved language falls back safely to Korean', async () => {
    for (const language of ['fr', '__proto__']) {
        const ui = createApp({ fetch: async () => primary(), language });
        await flush();
        assert.equal(ui.element('price-title').textContent, '비트코인 가격');
    }
});

test('missing supply files disable calculators without stopping prices or coin switching', async () => {
    const ui = createApp({ fetch: async () => primary(), missingSupply: true });
    await flush();
    assert.equal(ui.element('crypto-price').textContent, '$100.00');
    assert.equal(ui.element('btc-calculateBtn').disabled, true);
    ui.click('btn-eth');
    await flush();
    assert.equal(ui.element('price-title').textContent, '이더리움 가격');
});

test('supply calculation and chart still work while live price APIs fail', async () => {
    const ui = createApp({ fetch: reject });
    await flush();
    for (const coin of ['btc', 'eth']) {
        ui.element(`${coin}-startDate`).value = '2026-01-01';
        ui.element(`${coin}-endDate`).value = '2026-01-02';
        ui.click(`${coin}-calculateBtn`);
        assert.equal(ui.element(`results-${coin}`).classList.contains('hidden'), false);
    }
    assert.equal(ui.charts.length, 2);
    assert.deepEqual(Array.from(ui.charts[0].data.datasets[0].data), [0, 10]);
    assert.deepEqual(Array.from(ui.charts[1].data.datasets[0].data), [0, 5]);
});

test('ETH uses the Ethereum CoinGecko identifier and quote', async () => {
    const ui = createApp({ fetch: async (url) => url.includes('coinbase') ? { ok: false, status: 503 }
        : response({ bitcoin: { usd: 100, usd_24h_change: 1 }, ethereum: { usd: 2500, usd_24h_change: -2 } }) });
    await flush();
    ui.click('btn-eth');
    await flush();
    assert.match(ui.requests.at(-1).url, /ids=ethereum&/);
    assert.equal(ui.element('crypto-price').textContent, '$2,500.00');
    assert.equal(ui.element('crypto-change').textContent, '-51.02 (-2.00%)');
});

test('malformed JSON and invalid open price fall back safely', async () => {
    const bad = [primary('100', '0'), primary('100', '-1'), primary('100', null),
        { ok: true, json: async () => { throw new SyntaxError('Invalid JSON'); } }];
    for (const first of bad) {
        const ui = createApp({ fetch: async (_url, _init, call) => call === 1 ? first : fallback() });
        await flush();
        assert.equal(ui.element('crypto-price').textContent, '$100.00');
        assert.match(ui.element('price-status').textContent, /CoinGecko/);
    }
});

test('returning to a cached coin never displays the other coin quote', async () => {
    const ui = createApp({ fetch: (_url, _init, call) => call === 1 ? Promise.resolve(primary('100'))
        : call === 2 ? Promise.resolve(primary('2500')) : reject() });
    await flush();
    ui.click('btn-eth');
    await flush();
    ui.click('btn-btc');
    assert.equal(ui.element('crypto-price').textContent, '$100.00');
    assert.match(ui.element('price-status').textContent, /가격 업데이트 중/);
    await flush();
    assert.equal(ui.element('crypto-price').textContent, '$100.00');
    assert.match(ui.element('price-status').textContent, /업데이트 실패/);
});
