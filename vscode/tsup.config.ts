import { defineConfig } from 'tsup'

// One CommonJS file for the extension host. elkjs and the icon sets are loaded at runtime
// through createRequire(import.meta.url), so they ship as real dependencies in the .vsix
// and `shims` gives import.meta.url a value under CJS.
export default defineConfig({
  entry: { extension: 'src/extension.ts' },
  format: ['cjs'],
  outExtension: () => ({ js: '.cjs' }),
  external: ['vscode', 'elkjs', '@iconify-json/logos', '@iconify-json/lucide'],
  noExternal: [/^(?!vscode$|elkjs|@iconify-json).*/],
  shims: true,
  platform: 'node',
  target: 'node20',
  clean: true,
  outDir: 'dist',
})
