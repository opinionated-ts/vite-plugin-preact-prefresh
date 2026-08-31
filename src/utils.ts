import type { ResolvedConfig } from "vite";

import type { ReadonlyString, TransformInput } from "./types";

import { NODE_MODULES_RE, WORKER_RE, REFRESH_REG, REFRESH_SIG } from "./constants";

export function isEnabled(config: Readonly<ResolvedConfig>): boolean {
  return config.command === "serve" && !config.isProduction && config.server.hmr !== false;
}

export function shouldSkipTransform(input: Readonly<TransformInput>): boolean {
  const { context, enabled, id, transformOptions } = input;

  if (!enabled || transformOptions?.ssr === true) {
    return true;
  }

  if (NODE_MODULES_RE.test(id) || WORKER_RE.test(id)) {
    return true;
  }

  // oxlint-disable-next-line unicorn/no-array-callback-reference
  return !context.filter(id);
}

export function getLanguage(filename: ReadonlyString): "js" | "jsx" | "ts" | "tsx" {
  if (filename.endsWith(".tsx")) {
    return "tsx";
  }

  if (filename.endsWith(".ts") || filename.endsWith(".mts") || filename.endsWith(".cts")) {
    return "ts";
  }

  if (filename.endsWith(".jsx")) {
    return "jsx";
  }

  return "js";
}

export function hasRefreshMarkers(code: ReadonlyString): boolean {
  return code.includes(REFRESH_REG) || code.includes(REFRESH_SIG);
}
