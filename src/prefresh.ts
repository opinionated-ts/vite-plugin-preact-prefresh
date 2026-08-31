import type { Plugin, ResolvedConfig } from "vite";

import { createFilter } from "@rollup/pluginutils";
import { normalizePath } from "vite";

import type { PrefreshOptions, PluginContext, TransformInput, ReadonlyString } from "./types";

import { SCRIPT_RE } from "./constants";
import { injectPrefresh } from "./inject";
import { transformWithOxc } from "./oxc";
import { isEnabled, shouldSkipTransform, hasRefreshMarkers } from "./utils";

function prefresh(options: Readonly<PrefreshOptions> = {}): Plugin {
  const context: PluginContext = {
    filter: createFilter(options.include, options.exclude),
    jsxImportSource: options.jsxImportSource ?? "preact",
    target: options.target ?? "esnext",
  };

  let enabled = false;

  return {
    apply: "serve",
    enforce: "pre",
    name: "vite-plugin-prefresh",

    configResolved(config: Readonly<ResolvedConfig>) {
      enabled = isEnabled(config);
    },

    transform: {
      filter: { id: SCRIPT_RE },

      handler(
        code: ReadonlyString,
        id: ReadonlyString,
        transformOptions?: Readonly<TransformInput["transformOptions"]>,
      ) {
        const input: TransformInput = {
          context,
          enabled,
          id,
          transformOptions,
        };

        if (shouldSkipTransform(input)) {
          return null;
        }

        const filename = normalizePath(id);
        const result = transformWithOxc(context, filename, code);

        if (result === null || !hasRefreshMarkers(result.code)) {
          return null;
        }

        return injectPrefresh(filename, result);
      },
    },
  };
}

export { prefresh };
export type { PrefreshOptions } from "./types";

// oxlint-disable-next-line import/no-default-export
export default prefresh;
