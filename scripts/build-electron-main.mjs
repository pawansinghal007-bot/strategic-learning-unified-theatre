import { build } from 'esbuild';
const shared = {
  bundle: true, platform: 'node', format: 'cjs', target: 'node18',
  external: ["electron","electron-updater","electron-store","fsevents","better-sqlite3","keytar","onnxruntime-node","playwright-core","chromium-bidi"],
  loader: { '.node': 'file' },
  define: { 'import.meta.url': '__importMetaUrl' },
  banner: {
    js: "const __importMetaUrl = typeof __filename === 'string' ? require('url').pathToFileURL(__filename).href : globalThis.location?.href;",
  },
  logLevel: 'info',
};
await Promise.all([
  build({ ...shared, entryPoints: ['electron-ui/main.cjs'], outfile: 'electron-ui/main.bundled.cjs' }),
  build({ ...shared, entryPoints: ['electron-ui/preload.cjs'], outfile: 'electron-ui/preload.bundled.cjs' }),
  build({ ...shared, entryPoints: ['electron-ui/browser-pane.cjs'], outfile: 'electron-ui/browser-pane.bundled.cjs' }),
  build({ ...shared, entryPoints: ['electron-ui/ipc/handlers.cjs'], outfile: 'electron-ui/ipc/handlers.bundled.cjs' }),
  build({ ...shared, entryPoints: ['electron-ui/ipc/capture-handlers.cjs'], outfile: 'electron-ui/ipc/capture-handlers.bundled.cjs' }),
  build({ ...shared, entryPoints: ['electron-ui/ipc/provider-telemetry-handlers.cjs'], outfile: 'electron-ui/ipc/provider-telemetry-handlers.bundled.cjs' }),
  build({ ...shared, entryPoints: ['electron-ui/ipc/provider-policy-handlers.cjs'], outfile: 'electron-ui/ipc/provider-policy-handlers.bundled.cjs' }),
  build({ ...shared, entryPoints: ['electron-ui/ipc/workspace-handlers.cjs'], outfile: 'electron-ui/ipc/workspace-handlers.bundled.cjs' }),
  build({ ...shared, entryPoints: ['electron-ui/ipc/workspace-routing-handlers.cjs'], outfile: 'electron-ui/ipc/workspace-routing-handlers.bundled.cjs' }),
  build({ ...shared, entryPoints: ['electron-ui/ipc/workspace-report-handlers.cjs'], outfile: 'electron-ui/ipc/workspace-report-handlers.bundled.cjs' }),
  build({ ...shared, entryPoints: ['electron-ui/ipc/audit-handlers.cjs'], outfile: 'electron-ui/ipc/audit-handlers.bundled.cjs' }),
]);
console.log('All bundles built.');
