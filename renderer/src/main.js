import { exportToBlob } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";

window.renderExcalidrawToPngBytes = async (scene, opts = {}) => {
  const appState = {
    ...(scene.appState || {}),
    exportBackground: opts.exportBackground ?? true,
    exportScale: opts.exportScale ?? 2,
    viewBackgroundColor:
      opts.viewBackgroundColor ||
      scene.appState?.viewBackgroundColor ||
      "#ffffff",
  };

  const blob = await exportToBlob({
    elements: scene.elements || [],
    appState,
    files: scene.files || {},
    mimeType: "image/png",
  });

  return Array.from(new Uint8Array(await blob.arrayBuffer()));
};

document.querySelector("#status").textContent = "ready";
document.body.dataset.ready = "true";
