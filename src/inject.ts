import type { TransformResult } from "vite";

import remapping from "@ampproject/remapping";
import { MagicString } from "magic-string";

import type { ReadonlyString, OxcTransformResult } from "./types";

import { PREFRESH_CORE, PREFRESH_UTILS } from "./constants";

export function injectPrefresh(
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
