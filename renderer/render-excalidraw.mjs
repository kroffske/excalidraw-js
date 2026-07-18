import http from "node:http";
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(here, "dist");

const parseArgs = (argv) => {
  const args = {
    exportBackground: true,
    exportScale: 2,
    viewBackgroundColor: "#ffffff",
    port: 0,
    browserLog: false,
  };
  const positional = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--scale") {
      args.exportScale = Number(argv[++i]);
    } else if (arg === "--background") {
      args.viewBackgroundColor = argv[++i];
      args.exportBackground = true;
    } else if (arg === "--transparent") {
      args.exportBackground = false;
    } else if (arg === "--port") {
      args.port = Number(argv[++i]);
    } else if (arg === "--browser-log") {
      args.browserLog = true;
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else {
      positional.push(arg);
    }
  }

  args.input = positional[0];
  args.output = positional[1];
  return args;
};

const usage = () => {
  console.log(`Usage: node render-excalidraw.mjs INPUT.excalidraw OUTPUT.png [options]

Options:
  --scale N              Export scale, default 2
  --background COLOR     Background color, default #ffffff
  --transparent          Export without background
  --port PORT            Static server port, default random free port
  --browser-log          Print browser console messages
`);
};

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
  ".woff2": "font/woff2",
};

const startServer = async (port) => {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url || "/", "http://127.0.0.1");
    const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
    const target = resolve(distDir, `.${pathname}`);

    if (!target.startsWith(distDir) || !existsSync(target) || !statSync(target).isFile()) {
      response.writeHead(404);
      response.end("not found");
      return;
    }

    response.writeHead(200, {
      "content-type": contentTypes[extname(target)] || "application/octet-stream",
    });
    createReadStream(target).pipe(response);
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(port, "127.0.0.1", resolveListen);
  });

  const address = server.address();
  return { server, url: `http://127.0.0.1:${address.port}` };
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }
  if (!args.input || !args.output) {
    usage();
    process.exitCode = 2;
    return;
  }
  if (!existsSync(join(distDir, "index.html"))) {
    throw new Error(`Renderer bundle is missing at ${distDir}. Run excalidraw-render-setup first.`);
  }

  const input = resolve(args.input);
  const output = resolve(args.output);
  const scene = JSON.parse(readFileSync(input, "utf8"));
  const { server, url } = await startServer(args.port);
  let browser;

  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => {
      pageErrors.push(error.message);
      if (args.browserLog) {
        console.error(`[browser:pageerror] ${error.message}`);
      }
    });
    if (args.browserLog) {
      page.on("console", (msg) => console.log(`[browser:${msg.type()}] ${msg.text()}`));
    }
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForSelector("body[data-ready='true']", { timeout: 20_000 });
    const bytes = await page.evaluate(
      async ({ scene, opts }) => window.renderExcalidrawToPngBytes(scene, opts),
      {
        scene,
        opts: {
          exportBackground: args.exportBackground,
          exportScale: args.exportScale,
          viewBackgroundColor: args.viewBackgroundColor,
        },
      },
    );
    if (pageErrors.length > 0) {
      throw new Error(`Renderer page errors:\n${pageErrors.join("\n")}`);
    }

    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, Buffer.from(bytes));
    console.log(`Wrote ${output}`);
  } finally {
    if (browser) {
      await browser.close();
    }
    await new Promise((resolveClose) => server.close(resolveClose));
  }
};

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
