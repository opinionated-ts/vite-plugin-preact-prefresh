import type { createFilter } from "@rollup/pluginutils";
import type { transformSync } from "oxc-transform";

export interface PrefreshOptions {
  readonly exclude?: Readonly<Parameters<typeof createFilter>[1]>;
  readonly include?: Readonly<Parameters<typeof createFilter>[0]>;
  readonly jsxImportSource?: string;
  readonly target?: string | string[];
}

export interface TransformOptions {
  readonly ssr?: boolean;
}

export interface PluginContext {
  readonly filter: ReturnType<typeof createFilter>;
  readonly jsxImportSource: string;
  readonly target: string | string[];
}

export interface TransformInput {
  readonly context: PluginContext;
  readonly enabled: boolean;
  readonly id: string;
  readonly transformOptions?: TransformOptions;
}

export type OxcResult = ReturnType<typeof transformSync>;

export type OxcTransformResult = Omit<OxcResult, "map"> & {
  readonly map: NonNullable<OxcResult["map"]>;
};

export type ReadonlyString = Readonly<string>;
