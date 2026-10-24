import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { withBrowserSession } from './browser-session.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.LAYOUT_PROBE_PLAYWRIGHT
  ?? join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const server = createServer((request, response) => response.end('<!doctype html><title>Pending operation test</title>'));
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const deadlineMs = 3_000;
let browser, pendingEvaluation, operationStarted = false;
const startedAt = performance.now();
await assert.rejects(withBrowserSession(server, chromium, async session => {
  browser = session;
  const page = await browser.newPage();
  await page.goto(origin);
  await page.exposeFunction('stage0PendingStarted', () => { operationStarted = true; });
  pendingEvaluation = page.evaluate(() => {
    window.stage0PendingStarted();
    return new Promise(() => {});
  });
  return pendingEvaluation;
}, { deadlineMs }), error => error.code === 'BROWSER_PROBE_TIMEOUT' && error.deadlineMs === deadlineMs);
assert.equal(operationStarted, true, 'The browser must actually enter the never-settling operation');
assert.equal(browser.isConnected(), false, 'The browser must close after the deadline');
assert.equal(server.listening, false, 'The HTTP server must close after the deadline');
await assert.rejects(pendingEvaluation, /closed/i, 'Closing the browser must cancel its pending evaluation');
await assert.rejects(fetch(origin, { signal: AbortSignal.timeout(1_000) }),
  error => error.cause?.code === 'ECONNREFUSED');
console.log(JSON.stringify({ scenario: 'artificial-never-settling-browser-operation', deadlineMs,
  elapsedMs: Math.round(performance.now() - startedAt), operationStarted,
  browserClosed: !browser.isConnected(), serverClosed: !server.listening,
  pendingEvaluationCancelled: true, timeoutCode: 'BROWSER_PROBE_TIMEOUT' }));
