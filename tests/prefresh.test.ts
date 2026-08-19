// oxlint-disable-next-line unicorn/no-abusive-eslint-disable
// oxlint-disable
// TODO: Improve type safety, fix lint errors, and remove these disables. See issue #1.

import type { Plugin, ResolvedConfig, TransformResult } from "vite";

import { describe, expect, it } from "vitest";

import { prefresh } from "@/prefresh";

type TestModuleType = "js" | "jsx" | "ts" | "tsx" | "mjs" | "cjs";

interface TestConfigOverride {
  readonly command?: ResolvedConfig["command"];
  readonly isProduction?: boolean;
  readonly hmr?: boolean;
  readonly server?: {
    readonly hmr?: boolean;
  };
}

interface TestTransformOptions {
  readonly moduleType?: TestModuleType;
  readonly ssr?: boolean;
}

function createConfig(config: TestConfigOverride = {}): ResolvedConfig {
  const { command = "serve", isProduction = false, hmr = true, server } = config;

  return {
    command,
    isProduction,
    server: {
      hmr: server?.hmr ?? hmr,
    } as ResolvedConfig["server"],
  } as ResolvedConfig;
}

function createPlugin(options?: Parameters<typeof prefresh>[0]): Plugin {
  return prefresh(options);
}

function getTransformHandler(plugin: Plugin) {
  if (!plugin.transform || typeof plugin.transform === "function") {
    throw new Error("Expected object transform hook");
  }

  return plugin.transform.handler;
}

function configurePlugin(plugin: Plugin, config: ResolvedConfig = createConfig()): void {
  if (typeof plugin.configResolved === "function") {
    plugin.configResolved.call({} as never, config);
  }
}
function getModuleTypeFromId(id: string): TestModuleType {
  if (id.endsWith(".tsx")) {
    return "tsx";
  }

  if (id.endsWith(".ts")) {
    return "ts";
  }

  if (id.endsWith(".jsx")) {
    return "jsx";
  }

  return "js";
}

async function transform(
  plugin: Plugin,
  code: string,
  id: string,
  options?: TestTransformOptions,
): Promise<TransformResult | null> {
  const handler = getTransformHandler(plugin);
  const transformOptions: Required<TestTransformOptions> = {
    moduleType: getModuleTypeFromId(id),
    ssr: false,
    ...options,
  };

  return handler.call({} as never, code, id, transformOptions) as
    | Promise<TransformResult | null>
    | TransformResult
    | null;
}

async function transformWithPlugin(
  code: string,
  id: string,
  options?: {
    plugin?: Parameters<typeof prefresh>[0];
    transform?: TestTransformOptions;
    config?: TestConfigOverride;
  },
): Promise<TransformResult | null> {
  const plugin = createPlugin(options?.plugin);

  configurePlugin(plugin, createConfig(options?.config));

  return transform(plugin, code, id, options?.transform);
}

const COMPONENT = `
  export function Component() {
    return <div>Hello</div>;
  }
`;

describe("prefresh", () => {
  describe("plugin configuration", () => {
    it("exposes the expected plugin metadata", () => {
      const plugin = createPlugin();

      expect(plugin.name).toBe("vite-plugin-prefresh");
      expect(plugin.enforce).toBe("pre");
      expect(plugin.apply).toBe("serve");
    });
  });

  describe("enabled state", () => {
    it("transforms modules during development with HMR enabled", async () => {
      const result = await transformWithPlugin(COMPONENT, "/src/Component.tsx");

      expect(result).not.toBeNull();
    });

    it("disables transformation during production", async () => {
      const result = await transformWithPlugin("export const value = 1;", "/src/value.ts", {
        config: {
          isProduction: true,
        },
      });

      expect(result).toBeNull();
    });

    it("disables transformation when HMR is disabled", async () => {
      const result = await transformWithPlugin(COMPONENT, "/src/Component.tsx", {
        config: {
          server: {
            hmr: false,
          },
        },
      });

      expect(result).toBeNull();
    });

    it("disables transformation during build", async () => {
      const result = await transformWithPlugin(COMPONENT, "/src/Component.tsx", {
        config: {
          command: "build",
        },
      });

      expect(result).toBeNull();
    });
  });

  describe("filtering", () => {
    it("ignores modules from node_modules", async () => {
      const result = await transformWithPlugin(
        COMPONENT,
        "/project/node_modules/example/Component.tsx",
      );

      expect(result).toBeNull();
    });

    it("ignores worker modules", async () => {
      const result = await transformWithPlugin(COMPONENT, "/src/worker.tsx?worker");

      expect(result).toBeNull();
    });

    it("transforms JSX modules", async () => {
      const result = await transformWithPlugin(COMPONENT, "/src/Component.jsx");

      expect(result).not.toBeNull();
    });

    it("transforms TSX modules", async () => {
      const result = await transformWithPlugin(
        `
          export function Component(): JSX.Element {
            return <div>Hello</div>;
          }
        `,
        "/src/Component.tsx",
      );

      expect(result).not.toBeNull();
    });

    it("respects include patterns", async () => {
      const options = {
        plugin: {
          include: ["**/components/**"],
        },
      };

      const included = await transformWithPlugin(
        COMPONENT,
        "/src/components/Component.tsx",
        options,
      );

      const excluded = await transformWithPlugin(COMPONENT, "/src/pages/Component.tsx", options);

      expect(included).not.toBeNull();
      expect(excluded).toBeNull();
    });

    it("respects exclude patterns", async () => {
      const options = {
        plugin: {
          exclude: ["**/components/**"],
        },
      };

      const excluded = await transformWithPlugin(
        COMPONENT,
        "/src/components/Component.tsx",
        options,
      );

      const included = await transformWithPlugin(COMPONENT, "/src/pages/Component.tsx", options);

      expect(excluded).toBeNull();
      expect(included).not.toBeNull();
    });
  });

  describe("transformation", () => {
    it("ignores modules without refresh markers", async () => {
      const result = await transformWithPlugin("export const value = 42;", "/src/value.ts");

      expect(result).toBeNull();
    });

    it("ignores invalid source", async () => {
      const result = await transformWithPlugin(
        `
          export function Component( {
            return <div />;
          }
        `,
        "/src/Component.tsx",
      );

      expect(result).toBeNull();
    });

    it("injects the Prefresh runtime and HMR handling", async () => {
      const result = await transformWithPlugin(COMPONENT, "/src/Component.tsx");

      expect(result).not.toBeNull();
      expect(result?.code).toContain('import "@prefresh/core";');
      expect(result?.code).toContain('import { flush as flushUpdates } from "@prefresh/utils";');
      expect(result?.code).toContain("import.meta.hot.accept");
      expect(result?.code).toContain("flushUpdates()");
    });

    it("registers components with Prefresh", async () => {
      const result = await transformWithPlugin(COMPONENT, "/src/Component.tsx");

      expect(result).not.toBeNull();
      expect(result?.code).toContain("self.$RefreshReg$");
      expect(result?.code).toContain("self.__PREFRESH__.register");
      expect(result?.code).toContain("/src/Component.tsx");
    });

    it("preserves hook signatures for refresh", async () => {
      const result = await transformWithPlugin(
        `
          import { useState } from "preact/hooks";

          export function Counter() {
            const [count] = useState(0);

            return <div>{count}</div>;
          }
        `,
        "/src/Counter.tsx",
      );

      expect(result).not.toBeNull();
      expect(result?.code).toContain("self.$RefreshSig$");
      expect(result?.code).toContain("self.__PREFRESH__.sign");
    });

    it("restores the previous refresh globals", async () => {
      const result = await transformWithPlugin(COMPONENT, "/src/Component.tsx");

      expect(result).not.toBeNull();
      expect(result?.code).toContain("self.$RefreshReg$ = prevRefreshReg;");
      expect(result?.code).toContain("self.$RefreshSig$ = prevRefreshSig;");
    });

    it("preserves the transformed module code", async () => {
      const result = await transformWithPlugin(COMPONENT, "/src/Component.tsx");

      expect(result).not.toBeNull();
      expect(result?.code).toContain("Hello");
    });
  });

  describe("options", () => {
    it("uses a custom JSX import source", async () => {
      const result = await transformWithPlugin(COMPONENT, "/src/Component.tsx", {
        plugin: {
          jsxImportSource: "custom-jsx",
        },
      });

      expect(result).not.toBeNull();
      expect(result?.code).toContain("custom-jsx");
    });
  });

  describe("SSR", () => {
    it("ignores SSR transformations", async () => {
      const result = await transformWithPlugin(COMPONENT, "/src/Component.tsx", {
        transform: {
          ssr: true,
        },
      });

      expect(result).toBeNull();
    });
  });

  describe("source maps", () => {
    it("returns a valid source map", async () => {
      const result = await transformWithPlugin(COMPONENT, "/src/Component.tsx");

      const map = result?.map as
        | {
            version?: number;
            sources?: string[];
            toUrl?: () => string;
          }
        | undefined;

      expect(result?.map).toBeDefined();
      expect(map?.version).toBe(3);
      expect(map?.sources).toContain("/src/Component.tsx");
    });

    it("provides a source map data URL", async () => {
      const result = await transformWithPlugin(COMPONENT, "/src/Component.tsx");

      const map = result?.map as
        | {
            version?: number;
            sources?: string[];
            toUrl?: () => string;
          }
        | undefined;

      expect(map?.toUrl?.()).toMatch(/^data:application\/json;charset=utf-8,/u);
    });
  });
});
