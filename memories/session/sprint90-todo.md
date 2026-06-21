## Sprint 90 Todo List

### Task 2: Classify and Fix Coverage Gaps

| File              | Coverage       | Bucket | Status                                                          |
| ----------------- | -------------- | ------ | --------------------------------------------------------------- |
| journal.js        | 3.22% → 64.51% | A      | ✅ Tests written                                                |
| daemonStatus.js   | 3.33%          | B      | ✅ Excluded                                                     |
| storageStatus.js  | 5% → 90%       | A      | ✅ Tests fixed (5/5) - Completed                                |
| test-runner.js    | 5.63% → 43.66% | A      | ✅ Tests written (16/16) - Completed                            |
| vscode.js         | 6.81%          | B      | ✅ Excluded (Environment-bound: requires OS processes/binaries) |
| storage-monitor.js | 60.2% | A | ⏃ In progress |
| ...               | ...            | ?      | ⏃ Not started                                                   |

### Progress

- ✅ journal.js: 13/13 tests passing, coverage improved to 64.51%
- ✅ daemonStatus.js: Excluded from coverage (Bucket B)
- ✅ storageStatus.js: 5/5 tests passing, coverage improved to 90% (statements)
  - Fixed: Mocked ROTATOR_STATE_DIR env var to use test directory
  - Fixed: Created snapshot files in correct path (.vscode-rotator/storage-snapshot.json)
  - Fixed: Set mtime correctly for recent file tests
- ✅ test-runner.js: 16/16 tests passing, coverage improved to 43.66% (statements)
  - Added tests for: detectPython, detectRobotFramework, generateSkeletonRobotFile, enforceTdd, listRobotFiles, readRobotFile
  - Fixed: Created subdirectories before writing files in enforceTdd tests
  - Fixed: Set mtime correctly for enforceTdd tests
- ✅ vscode.js: Excluded from coverage (Bucket B - Environment-bound: requires OS processes/binaries)
