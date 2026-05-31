import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export function packageRoot(importMetaUrl: string): string {
  let current = dirname(fileURLToPath(importMetaUrl));
  for (let depth = 0; depth < 8; depth += 1) {
    if (existsSync(join(current, "package.json")) && (existsSync(join(current, "assets")) || existsSync(join(current, "skills")))) {
      return current;
    }
    current = dirname(current);
  }
  throw new Error("Could not locate excalidraw-diagrams package root.");
}
