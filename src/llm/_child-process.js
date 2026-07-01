/**
 * Thin re-export of node:child_process.execFile.
 *
 * Keeping this as a separate user-land module allows Vitest to intercept it
 * via vi.mock() in tests (Vite externalises node: built-ins and cannot mock
 * them directly; a local wrapper is processed through Vite's transform
 * pipeline and is therefore fully mockable).
 */
export { execFile } from "node:child_process";
