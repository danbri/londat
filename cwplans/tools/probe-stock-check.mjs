// Probe one shop web page for a "check stock in a shop" feature: robots.txt for the path, one headless load, the
// fetch/XHR requests the page makes (method, URL, status, type), stock phrases on the page (short context, printed
// only), and signs of a bot challenge. One page per call; no form, no basket, no login. Optional --click and
// --postcode drive one stock-check widget (one postcode, one search), the same rule as the store-finder exception.
//   NODE_USE_ENV_PROXY=1 node cwplans/tools/probe-stock-check.mjs <url> [--wait=6000] [--click="Check stock"]
//     [--postcode="E14 5AB"] [--input=css] [--submit="Search"] [--all-requests] [--out=file.json]
// Chromium needs the proxy CA in its NSS store (skill cwplans-web-harvest, "Chromium behind the agent proxy").
// Skill: cwplans-stock-check.
import { writeFileSync } from 'fs';
import { chromium } from 'playwright';

const args = process.argv.slice(2), url = args.find(a => !a.startsWith('--'));
const opt = k => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };
const flag = k => args.includes(`--${k}`);
if (!url) { console.error('usage: probe-stock-check.mjs <url> [--wait=ms] [--click=text] [--postcode=pc] [--out=f]'); process.exit(2); }
const wait = +(opt('wait') || 6000);
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PHRASES = /(check (?:stock|availability|store stock|in-store|in store)|in[- ]store availability|find (?:it )?in (?:a )?(?:store|shop)|available (?:in|at) (?:store|shop)|reserve (?:&|and|in) ?(?:collect|store)|click (?:&|and) collect|collect in (?:store|shop)|pick ?up in store|stock checker|in stock (?:at|in)|out of stock|store stock|shop stock|availability in (?:store|shop))/ig;
const CHALLENGE = /(access denied|just a moment|attention required|pardon our interruption|are you a robot|verify you are human|captcha|request unsuccessful|incapsula|px-captcha|enable javascript and cookies)/i;

async function robots(u) {
  const { origin, pathname, search } = new URL(u);
  try {
    const r = await fetch(origin + '/robots.txt', { signal: AbortSignal.timeout(15000) });
    if (!r.ok) return { status: r.status, allowed: true };
    let on = false, rules = [];
    for (const line of (await r.text()).split(/\r?\n/)) {
      const [k, ...v] = line.split(':'), val = v.join(':').split('#')[0].trim(), key = k.trim().toLowerCase();
      if (key === 'user-agent') on = val === '*';
      else if (on && (key === 'disallow' || key === 'allow') && val) rules.push([key, val]);
    }
    const re = p => new RegExp('^' + p.replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
    const m = rules.filter(([, p]) => re(p).test(pathname + search)).sort((a, b) => b[1].length - a[1].length)[0];
    return { status: r.status, allowed: !m || m[0] === 'allow', rule: m ? m.join(': ') : null };
  } catch (e) { return { error: String(e.message || e), allowed: true }; }
}

const out = { url, at: new Date().toISOString(), robots: await robots(url), requests: [], phrases: [], actions: [] };
if (!out.robots.allowed) { out.skipped = 'robots.txt'; console.log(JSON.stringify(out, null, 1)); process.exit(0); }
const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
const browser = await chromium.launch({ headless: true, executablePath: CHROME,
  args: ['--no-sandbox', ...(proxy ? [`--proxy-server=${proxy}`] : [])] });
const page = await (await browser.newContext({ locale: 'en-GB', viewport: { width: 1280, height: 900 } })).newPage();
page.on('response', async res => {
  const req = res.request(), type = req.resourceType();
  if (!flag('all-requests') && !['xhr', 'fetch', 'document'].includes(type)) return;
  out.requests.push({ method: req.method(), type, status: res.status(), url: req.url().slice(0, 400),
    ct: (res.headers()['content-type'] || '').split(';')[0], post: req.postData()?.slice(0, 300) || undefined });
});
try {
  const r = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  out.status = r?.status();
  await page.waitForTimeout(wait);
  const click = opt('click');
  if (click) {
    const el = page.getByText(click, { exact: false }).first();
    await el.click({ timeout: 8000 }).then(() => out.actions.push(`clicked "${click}"`), e => out.actions.push(`click failed: ${e.message.split('\n')[0]}`));
    await page.waitForTimeout(3000);
  }
  const pc = opt('postcode');
  if (pc) {
    const sel = opt('input') || 'input[type=search], input[name*=postcode i], input[placeholder*=postcode i], input[placeholder*=town i], input[placeholder*=location i]';
    const inp = page.locator(sel).first();
    try {
      await inp.fill(pc, { timeout: 8000 }); out.actions.push(`filled ${pc}`);
      const sub = opt('submit');
      if (sub) await page.getByText(sub, { exact: false }).first().click({ timeout: 8000 }); else await inp.press('Enter');
      out.actions.push('submitted'); await page.waitForTimeout(wait);
    } catch (e) { out.actions.push(`postcode failed: ${e.message.split('\n')[0]}`); }
  }
  out.title = await page.title();
  const text = await page.evaluate(() => document.body?.innerText || '');
  const doc = out.requests.filter(r => r.type === 'document' && !/challenges\.cloudflare|captcha/.test(r.url)).pop();
  out.challenge = (CHALLENGE.test(out.title) || (text.length < 3000 && CHALLENGE.test(text))) || [403, 429, 503].includes(doc?.status) ||
    out.requests.some(r => /challenges\.cloudflare\.com|captcha-delivery|px-captcha/.test(r.url));
  // bot-management scripts load on many sites without a challenge; this names the vendor only
  out.botManager = out.requests.some(r => /cloudflare/.test(r.url)) ? 'cloudflare' : out.requests.some(r => /captcha-delivery|datadome/.test(r.url)) ? 'datadome' :
    out.requests.some(r => /perimeterx|px-captcha|px-cdn/.test(r.url)) ? 'perimeterx' : out.requests.some(r => /_Incapsula_/.test(r.url)) ? 'imperva' : null;
  out.requests = out.requests.filter(r => !/cdn-cgi\/challenge-platform|challenges\.cloudflare\.com/.test(r.url));
  const seen = new Set();
  for (const m of text.matchAll(PHRASES)) {
    const k = m[0].toLowerCase(); if (seen.has(k)) continue; seen.add(k);
    out.phrases.push(text.slice(Math.max(0, m.index - 60), m.index + 80).replace(/\s+/g, ' '));
  }
} catch (e) { out.error = String(e.message || e).split('\n')[0]; }
await browser.close();
const s = JSON.stringify(out, null, 1);
if (opt('out')) writeFileSync(opt('out'), s); else console.log(s);
