// Probe-only deadline and resource ownership; no production runtime API.
export async function withBrowserSession(server, chromium, operation, { deadlineMs = 30_000 } = {}) {
  let browser, timer;
  try {
    browser = await chromium.launch({ headless: true, timeout: 30_000 });
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(
        new Error(`Browser probe operation exceeded ${deadlineMs} ms`),
        { code: 'BROWSER_PROBE_TIMEOUT', deadlineMs },
      )), deadlineMs);
    });
    return await Promise.race([operation(browser), timeout]);
  } finally {
    clearTimeout(timer);
    try {
      await browser?.close();
    } finally {
      // Closing active sockets also releases a request left pending by a timeout.
      await new Promise((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
        server.closeAllConnections();
      });
    }
  }
}
