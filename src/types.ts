import type { FilterPattern } from "@rollup/pluginutils";
import type { TransformResult } from "oxc-transform";

export interface PrefreshOptions {
  readonly exclude?: Readonly<FilterPattern>;
  readonly include?: Readonly<FilterPattern>;
  readonly jsxImportSource?: string;
  readonly target?: string | string[];
}

export interface TransformOptions {
  readonly ssr?: boolean;
}

export interface PluginContext {
  readonly filter: (id: unknown) => boolean;
  readonly jsxImportSource: string;
  readonly target: string | string[];
}

export interface TransformInput {
  readonly context: PluginContext;
  readonly enabled: boolean;
  readonly id: string;
  readonly transformOptions?: TransformOptions;
}

export type OxcTransformResult = Omit<TransformResult, "map"> & {
  readonly map: NonNullable<TransformResult["map"]>;
};

export type ReadonlyString = Readonly<string>;
