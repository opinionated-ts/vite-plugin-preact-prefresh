import type { Plugin, ResolvedConfig, TransformResult } from "vite";

import remapping from "@ampproject/remapping";
import { createFilter } from "@rollup/pluginutils";
import MagicString from "magic-string";
import { transformSync } from "oxc-transform";
import { normalizePath } from "vite";

const SCRIPT_RE = /\.[cm]?[jt]sx?$/u;
const NODE_MODULES_RE = /(?:^|[/\\])node_modules(?:[/\\]|$)/u;
const WORKER_RE = /(?:\?|&)worker(?:&|$)/u;

const REFRESH_REG = "$RefreshReg$(";
const REFRESH_SIG = "$RefreshSig$(";
const PREFRESH_CORE = "@prefresh/core";
const PREFRESH_UTILS = "@prefresh/utils";

export interface PrefreshOptions {
  readonly exclude?: Readonly<Parameters<typeof createFilter>[1]>;
  readonly include?: Readonly<Parameters<typeof createFilter>[0]>;
  readonly jsxImportSource?: string;
  readonly target?: string | string[];
}

interface TransformOptions {
  readonly ssr?: boolean;
}

interface PluginContext {
  readonly filter: ReturnType<typeof createFilter>;
  readonly jsxImportSource: string;
  readonly target: string | string[];
}

interface TransformInput {
  readonly context: PluginContext;
  readonly enabled: boolean;
  readonly id: string;
  readonly transformOptions?: TransformOptions;
}

type OxcResult = ReturnType<typeof transformSync>;

type OxcTransformResult = Omit<OxcResult, "map"> & {
  readonly map: NonNullable<OxcResult["map"]>;
};

type ReadonlyString = Readonly<string>;

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
        transformOptions?: Readonly<TransformOptions>,
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

function isEnabled(config: Readonly<ResolvedConfig>): boolean {
  return config.command === "serve" && !config.isProduction && config.server.hmr !== false;
}

function shouldSkipTransform(input: Readonly<TransformInput>): boolean {
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

function transformWithOxc(
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

function hasRefreshMarkers(code: ReadonlyString): boolean {
  return code.includes(REFRESH_REG) || code.includes(REFRESH_SIG);
}

function injectPrefresh(
  filename: ReadonlyString,
  result: Readonly<OxcTransformResult>,
): TransformResult {
  const magic = new MagicString(result.code);

  magic.prepend(createPrelude(filename)).append(createHmrBlock());

  const code = magic.toString();

  const pluginMap = magic.generateMap({
    hires: true,
    includeContent: false,
    source: filename,
  });

  const remappedMap = remapping([pluginMap.toString(), JSON.stringify(result.map)], () => null, {
    decodedMappings: false,
    excludeContent: true,
  });

  return {
    code,
    map: toRolldownSourceMap(remappedMap),
  };
}

function toRolldownSourceMap(
  map: Readonly<ReturnType<typeof remapping>>,
): NonNullable<TransformResult["map"]> {
  const serialized = map.toString();

  const mappings = typeof map.mappings === "string" ? map.mappings : JSON.stringify(map.mappings);

  return {
    file: map.file ?? "",
    mappings,
    names: map.names.map((name) => name),
    sources: map.sources.map((source) => source ?? ""),
    sourcesContent: map.sourcesContent?.map((content) => content ?? "") ?? [],
    toUrl: () => `data:application/json;charset=utf-8,${encodeURIComponent(serialized)}`,
    version: map.version,
  };
}

function getLanguage(filename: ReadonlyString): "js" | "jsx" | "ts" | "tsx" {
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

function createPrelude(moduleId: ReadonlyString): string {
  return [
    `import ${JSON.stringify(PREFRESH_CORE)};`,
    `import { flush as flushUpdates } from ${JSON.stringify(PREFRESH_UTILS)};`,
    "",
    "let prevRefreshReg;",
    "let prevRefreshSig;",
    "",
    "if (import.meta.hot) {",
    "  prevRefreshReg = self.$RefreshReg$;",
    "  prevRefreshSig = self.$RefreshSig$;",
    "",
    "  self.$RefreshReg$ = (type, id) => {",
    "    self.__PREFRESH__.register(",
    "      type,",
    `      ${JSON.stringify(moduleId)} + " " + id,`,
    "    );",
    "  };",
    "",
    "  self.$RefreshSig$ = () => {",
    "    let status = 'begin';",
    "    let savedType;",
    "",
    "    return (type, key, forceReset, getCustomHooks) => {",
    "      if (!savedType) {",
    "        savedType = type;",
    "      }",
    "",
    "      status = self.__PREFRESH__.sign(",
    "        type || savedType,",
    "        key,",
    "        forceReset,",
    "        getCustomHooks,",
    "        status,",
    "      );",
    "",
    "      return type;",
    "    };",
    "  };",
    "}",
    "",
  ].join("\n");
}

function createHmrBlock(): string {
  return `
if (import.meta.hot) {
  self.$RefreshReg$ = prevRefreshReg;
  self.$RefreshSig$ = prevRefreshSig;

  import.meta.hot.accept(() => {
    try {
      flushUpdates();
    } catch {
      self.location.reload();
    }
  });
}
`;
}

export { prefresh };

// oxlint-disable-next-line import/no-default-export max-lines no-warning-comments
export default prefresh; // TODO: Modularize the plugin and remove this disable: See issue #2.
