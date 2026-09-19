/// <reference types="vite/client" />

// Ambient module declarations for non-code imports.
// Vite handles the actual loading; these exist purely so the type checker can
// resolve side-effectful imports of assets referenced from TypeScript/JS.
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}
