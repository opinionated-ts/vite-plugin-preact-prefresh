import { transformSync } from "oxc-transform";

import type { OxcTransformResult, PluginContext, ReadonlyString } from "./types";

import { getLanguage } from "./utils";

export function transformWithOxc(
  context: Readonly<PluginContext>,
  filename: ReadonlyString,
  code: ReadonlyString,
): OxcTransformResult | null {
  // oxlint-disable-next-line node/no-sync
  const result = transformSync(filename, code, {
    jsx: {
      development: true,
      importSource: context.jsxImportSource,
      pure: true,
      refresh: true,
      runtime: "automatic",
    },
    lang: getLanguage(filename),
    sourceType: "module",
    sourcemap: true,
    target: context.target,
    typescript: {
      onlyRemoveTypeImports: true,
    },
  });

  if (result.errors.length > 0 || !result.map) {
    return null;
  }

  return {
    ...result,
    map: result.map,
  };
}
