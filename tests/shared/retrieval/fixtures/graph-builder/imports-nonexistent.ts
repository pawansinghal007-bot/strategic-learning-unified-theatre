/**
 * imports-nonexistent.ts — triggers line 170 (no-resolvable-declarations)
 *
 * Imports a name that doesn't exist in the module's exports. The TS checker
 * will resolve the import specifier but fail to find a matching export,
 * so importedDeclarationsToProcess() returns [] and collectDeclarationsToProcess()
 * returns an empty array → "no-resolvable-declarations" branch fires.
 */

// @ts-ignore — deliberately importing a non-existent export to trigger line 170
import { nonExistentExport } from "./coverage-gaps.js";

export function callsNonExistentImport(): void {
  // @ts-ignore
  nonExistentExport(); // import specifier with no resolvable symbol in the module
}
