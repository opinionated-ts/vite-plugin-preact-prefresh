# vite-plugin-prefresh

A Prefresh plugin for Vite and Preact.

This is a focused alternative to the Prefresh integration included in `@preact/preset-vite`.

## Differences

- Focused specifically on Prefresh and HMR.
- Uses `oxc-transform` for JSX, TypeScript, and Refresh transformations.
- Handles source maps after injecting the Prefresh runtime.
- Runs only during development with Vite HMR enabled.
- Skips SSR, workers, and `node_modules`.
- Provides a small configuration API with `include`, `exclude`, `jsxImportSource`, and `target`.

Unlike `@preact/preset-vite`, it does not include Preact aliases, DevTools, prerendering, or the other integrations provided by the preset.
