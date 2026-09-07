figma.showUI(__html__, { width: 390, height: 690, themeColors: true });

const exportableTypes = new Set(["FRAME", "COMPONENT", "SECTION"]);
const maxFrames = 1000;
const pluginKeyStorage = "passoff-plugin-key";
const projectKeyStorage = "passoff-project-key";
const scopeStorage = "passoff-export-scope";

function isExportable(node) {
  return exportableTypes.has(node.type);
}

function collectDeep(roots) {
  const found = [];
  const seen = new Set();

  function visit(node) {
    if (!node || seen.has(node.id)) return;
    if (isExportable(node)) {
      seen.add(node.id);
      found.push(node);
    }
    if ("children" in node && Array.isArray(node.children)) {
      for (const child of node.children) visit(child);
    }
  }

  for (const root of roots) visit(root);
  return found;
}

function collectHighLevel(roots) {
  const found = [];
  const seen = new Set();
  for (const node of roots) {
    if (!isExportable(node) || seen.has(node.id)) continue;
    seen.add(node.id);
    found.push(node);
  }
  return found;
}

function framesForScope(scope) {
  const selected = figma.currentPage.selection.filter(isExportable);
  const roots = selected.length ? selected : figma.currentPage.children;
  return scope === "all" ? collectDeep(roots) : collectHighLevel(roots);
}

function resolveFileKey() {
  const key = typeof figma.fileKey === "string" ? figma.fileKey.trim() : "";
  // Development plugins only get fileKey with enablePrivatePluginApi; otherwise synthesize a stable-enough local key.
  if (/^[A-Za-z0-9_-]+$/.test(key)) return key;
  return `local-${Date.now()}`;
}

function asRestJson(value) {
  if (value && typeof value === "object" && !ArrayBuffer.isView(value) && value.document && typeof value.document === "object") {
    return value;
  }
  if (ArrayBuffer.isView(value)) {
    const bytes = value instanceof Uint8Array ? value : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    let text = "";
    const chunk = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunk) {
      text += String.fromCharCode.apply(null, Array.from(bytes.subarray(offset, offset + chunk)));
    }
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && parsed.document && typeof parsed.document === "object") return parsed;
  }
  throw new Error("Could not read REST JSON for one of the selected frames.");
}

Promise.all([
  figma.clientStorage.getAsync(pluginKeyStorage),
  figma.clientStorage.getAsync(projectKeyStorage),
  figma.clientStorage.getAsync(scopeStorage),
]).then(([pluginKey, projectKey, scope]) => {
  if (typeof pluginKey === "string" && pluginKey) {
    figma.ui.postMessage({ type: "plugin-key", pluginKey });
  }
  if (typeof projectKey === "string" && projectKey) {
    figma.ui.postMessage({ type: "project-key", projectKey });
  }
  if (scope === "all" || scope === "high-level") {
    figma.ui.postMessage({ type: "export-scope", scope });
  }
}).catch(() => {});

figma.ui.onmessage = async (message) => {
  if (message?.type === "cancel") return figma.closePlugin();
  if (message?.type === "save-plugin-key") {
    const pluginKey = typeof message.pluginKey === "string" ? message.pluginKey.trim() : "";
    if (pluginKey) await figma.clientStorage.setAsync(pluginKeyStorage, pluginKey);
    return;
  }
  if (message?.type === "save-project-key") {
    const projectKey = typeof message.projectKey === "string" ? message.projectKey.trim() : "";
    if (projectKey) await figma.clientStorage.setAsync(projectKeyStorage, projectKey);
    return;
  }
  if (message?.type === "save-export-scope") {
    const scope = message.scope === "all" ? "all" : "high-level";
    await figma.clientStorage.setAsync(scopeStorage, scope);
    return;
  }
  if (message?.type !== "export") return;
  try {
    const scope = message.scope === "all" ? "all" : "high-level";
    const frames = framesForScope(scope);
    if (!frames.length) {
      throw new Error(
        scope === "all"
          ? "No frames, components, or sections found on this page (or in the selection)."
          : "Select at least one frame, component, or section—or place one at the top level of the current page.",
      );
    }
    if (frames.length > maxFrames) {
      throw new Error(`Select at most ${maxFrames} frames at a time. You currently have ${frames.length} exportable items. Try High level, or select a smaller area.`);
    }

    const file = {
      key: resolveFileKey(),
      name: String(figma.root.name || "Untitled"),
      pageName: String(figma.currentPage.name || "Page"),
    };
    // Keep large page exports under the development import size budget.
    const previewWidth = frames.length > 200 ? 720 : frames.length > 100 ? 900 : 1200;
    figma.ui.postMessage({ type: "started", total: frames.length, file, scope });

    for (let index = 0; index < frames.length; index += 1) {
      const frame = frames[index];
      figma.ui.postMessage({ type: "progress", index, total: frames.length, message: `Reading ${frame.name}` });
      const restJson = asRestJson(await frame.exportAsync({ format: "JSON_REST_V1" }));
      const pngBytes = await frame.exportAsync({
        format: "PNG",
        constraint: { type: "WIDTH", value: Math.max(1, Math.min(previewWidth, Math.round(frame.width || previewWidth))) },
      });
      figma.ui.postMessage({
        type: "frame",
        index,
        total: frames.length,
        frame: {
          id: frame.id,
          name: frame.name,
          type: frame.type,
          x: frame.x,
          y: frame.y,
          width: frame.width,
          height: frame.height,
          restJson,
          pngBytes,
        },
      });
    }

    figma.ui.postMessage({ type: "ready", total: frames.length, file, scope });
  } catch (error) {
    figma.ui.postMessage({ type: "error", message: error instanceof Error ? error.message : String(error) });
  }
};
