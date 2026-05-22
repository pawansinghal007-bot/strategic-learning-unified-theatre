# Agent Prompt: Robot Framework Testing Module for strategic-learning-unified-theatre
## Sprint R6 — Automated Quality Gate with TDD Enforcement

---

## Session Bootstrap

```
Project: strategic-learning-unified-theatre at E:\VS Code Agent\Solution
Architecture: 6 core sprints complete + 5 enhancement modules (R1–R5).
Failing tests: store.test.js timeout, e2e/rotation.test.js timeout — fix first.
Active sprint: R6 — Robot Framework Testing Module
Goal: Build a fully automated, 100% coverage testing module using Robot Framework
      for functional, non-functional, and regression testing, with TDD enforcement
      baked into the strategic-learning-unified-theatre CLI and daemon.
```

Read `E:\VS Code Agent\Solution\docs\README.md` and
`E:\VS Code Agent\strategic-learning-unified-theatre-master-instructions.md` before writing any code.

---

## Objective

Build `src/test-runner.js` and its supporting Robot Framework suite as a new
**R6 module** that:

1. Runs **Robot Framework** (via a Python subprocess bridge) for all functional
   and non-functional tests against strategic-learning-unified-theatre's CLI and modules.
2. Provides a **regression gate** — no new feature code is accepted unless the
   full Robot suite is green.
3. Enforces **TDD mindset** by blocking `strategic-learning-unified-theatre` commands unless a
   corresponding `.robot` test file exists and was written *before* the
   implementation file's last-modified timestamp.
4. Integrates cleanly alongside the existing **vitest** unit tests, which remain
   the unit layer; Robot Framework is the integration/system/non-functional layer.
5. Reports results back into the **experience DB** so the local LLM can reason
   about test health over time.

---

## Constraints (Non-Negotiable — Inherited from Master Instructions)

- Node.js 18+, ESM modules, no build step
- Robot Framework is driven via `python -m robot` subprocess (Python 3.10+
  must be available on PATH; detect and warn if absent)
- No GPU required; no cloud API calls from this module
- No plaintext secrets in logs
- All new Node unit tests use **vitest** (the Robot layer is separate)
- Atomic writes (temp → fsync → rename) for all state files
- `chmod 700` on `~/.vscode-rotator/`, `chmod 600` on all files inside

---

## File Layout to Create

```
E:\VS Code Agent\Solution\
├── src/
│   └── test-runner.js            ← R6 Node orchestrator (new)
├── tests/
│   └── test-runner.test.js       ← vitest unit tests for the orchestrator (new)
├── robot/
│   ├── README.md                 ← Robot suite documentation (new)
│   ├── resources/
│   │   ├── common.resource       ← shared keywords, setup/teardown (new)
│   │   └── cli.resource          ← CLI invocation keywords (new)
│   ├── functional/
│   │   ├── store.robot           ← AccountStore CRUD via CLI (new)
│   │   ├── switcher.robot        ← Auth switch dry-run (new)
│   │   ├── lock.robot            ← Concurrent lock enforcement (new)
│   │   ├── scorer.robot          ← pickBest and scoreAccount (new)
│   │   ├── workspace.robot       ← .code-workspace binding (new)
│   │   ├── git_monitor.robot     ← parseStatusSummary, parseLastCommitLine (new)
│   │   ├── agent_handoff.robot   ← Sprint lifecycle via CLI (new)
│   │   ├── idea_store.robot      ← Idea CRUD and export via CLI (new)
│   │   ├── browser_bridge.robot  ← Prompt library CRUD via CLI (new)
│   │   └── local_llm.robot       ← Ingest, mistake promotion, generate (new)
│   ├── non_functional/
│   │   ├── performance.robot     ← Response time SLAs per command (new)
│   │   ├── security.robot        ← No secrets in logs; file permissions (new)
│   │   ├── reliability.robot     ← Lock re-acquire after crash; atomic writes (new)
│   │   └── concurrency.robot     ← Parallel switch attempts → only one wins (new)
│   └── regression/
│       ├── regression_suite.robot ← Full smoke + critical path (new)
│       └── known_fixes.robot     ← One test per closed bug (new)
├── robot-results/                ← gitignored output directory
│   ├── output.xml
│   ├── log.html
│   └── report.html
└── robot.config.json             ← R6 configuration (new)
```

---

## Module 1 — `src/test-runner.js` (Node Orchestrator)

This is an ESM module. Export the following named functions.

### `detectPython()`
- Runs `python --version` and `python3 --version` (try both).
- Returns `{ available: boolean, version: string|null, cmd: string|null }`.
- Throws `RobotFrameworkError` with message `"Python 3.10+ is required for Robot Framework tests"` if unavailable.

### `detectRobotFramework(pythonCmd)`
- Runs `<pythonCmd> -m robot --version`.
- Returns `{ available: boolean, version: string|null }`.
- If unavailable, throws `RobotFrameworkError` with install instructions:
  `"Run: pip install robotframework robotframework-playwright"`.

### `runSuite(options)`
Parameters:
```js
{
  suite: "functional"|"non_functional"|"regression"|"all",  // default: "all"
  tags: string[],        // optional --include tags
  excludeTags: string[], // optional --exclude tags
  outputDir: string,     // default: <projectRoot>/robot-results
  dryRun: boolean,       // default: false — pass --dryrun to robot
  baseDir: string,       // project root
  env: object            // extra env vars passed to subprocess
}
```
Returns:
```js
{
  exitCode: number,
  passed: number,
  failed: number,
  skipped: number,
  outputXml: string,   // absolute path
  reportHtml: string,  // absolute path
  durationMs: number,
  errors: string[]     // parsed from output.xml
}
```
- Spawns `python -m robot` as a subprocess with `--outputdir`, `--log`,
  `--report`, `--xunit` flags.
- Streams stdout/stderr to the journal via `src/journal.js`.
- On non-zero exit, parse `output.xml` and extract failed test names and
  messages into `errors[]`.
- After completion, call `persistResultsToDb(results, baseDir)`.

### `persistResultsToDb(results, baseDir)`
- Opens the experience DB at `<baseDir>/experience.db` (or
  `~/.vscode-rotator/experience.db` if not specified).
- Inserts a row into a new `test_runs` table:
  ```sql
  CREATE TABLE IF NOT EXISTS test_runs (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    ts        TEXT NOT NULL,
    suite     TEXT NOT NULL,
    passed    INTEGER NOT NULL,
    failed    INTEGER NOT NULL,
    skipped   INTEGER NOT NULL,
    duration  INTEGER NOT NULL,
    errors    TEXT,          -- JSON array of failed test names
    report    TEXT           -- path to report.html
  );
  ```
- Returns the inserted row id.

### `enforceTdd(srcFile, robotDir)`
- Given a source file path (e.g. `src/idea-store.js`), derives the expected
  Robot test file path by convention:
  `robot/functional/<basename_snake_case>.robot`
- Checks: does the `.robot` file exist AND was it last-modified **before**
  `srcFile`'s last-modified time?
- Returns:
  ```js
  {
    compliant: boolean,
    robotFile: string,
    reason: string|null   // human-readable explanation if non-compliant
  }
  ```
- Non-compliant conditions:
  - `.robot` file does not exist → `"No robot test found for <srcFile>. Write the test first."`
  - `.robot` file is newer than `srcFile` — that's **correct** TDD order, this is compliant.
  - `.robot` file is older than `srcFile` by more than a configurable grace period
    (default: 0ms, override via `robot.config.json: { tddGraceMs: 60000 }`) →
    `"Implementation was modified after its test. Run tests before modifying src."`

### `assertTddGate(srcFiles, robotDir, options)`
- Runs `enforceTdd()` for each file in `srcFiles`.
- If any are non-compliant and `options.strict` is `true` (the default),
  throws `TddViolationError` listing all violations.
- If `options.strict` is `false`, logs warnings to the journal and returns
  violations without throwing.

### `generateSkeletonRobotFile(srcFile, robotDir)`
- When `enforceTdd()` reports a missing `.robot` file, this function
  generates a skeleton `.robot` file with:
  - `*** Settings ***` section: `Library` and `Resource` imports
  - `*** Variables ***` section: placeholder CLI invocation vars
  - `*** Test Cases ***` section: one `TODO` test case per exported function
    detected in the source file (via a simple `export` regex scan)
  - `*** Keywords ***` section: empty
- Writes the file atomically and returns its path.
- Prints: `"Skeleton robot file created. Write real tests before implementing."`

---

## Module 2 — `robot/resources/common.resource`

Shared Robot Framework resource file. Define these keywords:

```robot
*** Settings ***
Library    OperatingSystem
Library    Process
Library    Collections
Library    DateTime

*** Variables ***
${CLI}              strategic-learning-unified-theatre
${TEMP_DIR}         %{TEMP}/strategic-learning-unified-theatre-robot
${BASE_DIR}         ${TEMP_DIR}

*** Keywords ***
Suite Setup With Temp Dir
    [Documentation]    Creates an isolated temp directory for the suite.
    ${ts}=             Get Current Date    result_format=%Y%m%d%H%M%S
    Set Suite Variable    ${BASE_DIR}    ${TEMP_DIR}${/}${ts}
    Create Directory    ${BASE_DIR}

Suite Teardown With Temp Dir
    [Documentation]    Removes the temp directory after the suite.
    Remove Directory    ${BASE_DIR}    recursive=True

Run CLI
    [Arguments]    @{args}
    [Documentation]    Runs the strategic-learning-unified-theatre CLI and returns result.
    ${result}=    Run Process    ${CLI}    @{args}
    ...           env:VSCODE_ROTATOR_BASE_DIR=${BASE_DIR}
    ...           env:VSCODE_ROTATOR_MOCK_LLM=1
    RETURN    ${result}

CLI Should Succeed
    [Arguments]    @{args}
    ${r}=    Run CLI    @{args}
    Should Be Equal As Integers    ${r.rc}    0
    ...    msg=CLI failed: ${r.stderr}
    RETURN    ${r}

CLI Should Fail
    [Arguments]    ${expected_msg}    @{args}
    ${r}=    Run CLI    @{args}
    Should Not Be Equal As Integers    ${r.rc}    0
    ...    msg=CLI unexpectedly succeeded
    Should Contain    ${r.stderr}    ${expected_msg}
    RETURN    ${r}

File Should Have Permission 600
    [Arguments]    ${path}
    [Documentation]    Unix-only: verifies chmod 600 on a file.
    ${result}=    Run Process    stat    -c    %a    ${path}
    Should Be Equal    ${result.stdout.strip()}    600

No Secret In Output
    [Arguments]    ${text}
    [Documentation]    Asserts that output contains no obvious secrets.
    Should Not Contain    ${text}    authBlob
    Should Not Contain    ${text}    password
    Should Not Contain    ${text}    token
    Should Not Contain    ${text}    secret
```

---

## Module 3 — `robot/resources/cli.resource`

```robot
*** Settings ***
Resource    common.resource

*** Keywords ***
Add Account
    [Arguments]    ${email}    ${agent}=codex    ${blob}=testblob
    CLI Should Succeed    account    add
    ...    --email    ${email}
    ...    --agent    ${agent}
    ...    --auth-blob    ${blob}

List Accounts
    ${r}=    CLI Should Succeed    account    list
    RETURN    ${r.stdout}

Remove Account
    [Arguments]    ${id}
    CLI Should Succeed    account    remove    ${id}

Create Sprint
    [Arguments]    ${goal}    ${agent}=chatgpt    ${model}=gpt-4    ${limit}=500
    ${r}=    CLI Should Succeed    handoff    create
    ...    --agent    ${agent}
    ...    --model    ${model}
    ...    --goal    ${goal}
    ...    --tokens-limit    ${limit}
    RETURN    ${r.stdout}

Create Idea
    [Arguments]    ${title}    ${project}=test    ${priority}=3
    ${r}=    CLI Should Succeed    idea    create
    ...    --body    # ${title}\nTest content
    ...    --project    ${project}
    ...    --priority    ${priority}
    RETURN    ${r.stdout}
```

---

## Module 4 — Functional Robot Test Files

### `robot/functional/store.robot`

```robot
*** Settings ***
Resource        ../resources/cli.resource
Suite Setup     Suite Setup With Temp Dir
Suite Teardown  Suite Teardown With Temp Dir
Tags            functional    store

*** Test Cases ***
Add And List Account
    [Documentation]    Adding an account makes it appear in the list.
    Add Account    test@example.com    codex
    ${listing}=    List Accounts
    Should Contain    ${listing}    test@example.com

Remove Account Removes It From List
    Add Account    remove-me@example.com    codex
    ${listing}=    List Accounts
    ${id}=    Extract Id From Listing    ${listing}    remove-me@example.com
    Remove Account    ${id}
    ${after}=    List Accounts
    Should Not Contain    ${after}    remove-me@example.com

Account Store File Has Correct Permissions
    [Tags]    security
    Add Account    perm@example.com    codex
    File Should Have Permission 600
    ...    ${BASE_DIR}${/}accounts.enc

No Secrets In Account List Output
    Add Account    secret@example.com    codex    supersecretblob
    ${listing}=    List Accounts
    No Secret In Output    ${listing}

*** Keywords ***
Extract Id From Listing
    [Arguments]    ${listing}    ${email}
    # Parse the id from CLI JSON or tabular output
    ${lines}=    Split To Lines    ${listing}
    FOR    ${line}    IN    @{lines}
        ${match}=    Run Keyword And Return Status
        ...    Should Contain    ${line}    ${email}
        IF    ${match}    RETURN    ${line.split()[0]}
    END
    Fail    Could not find id for ${email}
```

### `robot/functional/agent_handoff.robot`

```robot
*** Settings ***
Resource        ../resources/cli.resource
Suite Setup     Suite Setup With Temp Dir
Suite Teardown  Suite Teardown With Temp Dir
Tags            functional    handoff

*** Test Cases ***
Create Sprint Has Active Status
    ${out}=    Create Sprint    Build health checks
    Should Contain    ${out}    active

Token Budget Warning At 85 Percent
    ${out}=    Create Sprint    Budget test    limit=100
    ${id}=    Parse Sprint Id    ${out}
    ${r}=    CLI Should Succeed    handoff    update    ${id}
    ...    --tokens-used    86    --tokens-limit    100
    Should Contain    ${r.stdout}    85%

Token Budget Critical Exhausts Sprint
    ${out}=    Create Sprint    Exhaust test    limit=100
    ${id}=    Parse Sprint Id    ${out}
    CLI Should Succeed    handoff    update    ${id}
    ...    --tokens-used    96    --tokens-limit    100
    ${r}=    CLI Should Succeed    handoff    show    ${id}
    Should Contain    ${r.stdout}    exhausted

Close Sprint Generates Resume Prompt Under 800 Chars
    ${out}=    Create Sprint    Resume prompt test    limit=500
    ${id}=    Parse Sprint Id    ${out}
    CLI Should Succeed    handoff    task    add    ${id}    --desc    Implement feature
    CLI Should Succeed    handoff    task    complete    ${id}    --all
    CLI Should Succeed    handoff    blocker    add    ${id}    --desc    Needs review
    ${r}=    CLI Should Succeed    handoff    close    ${id}    --status    paused
    ${len}=    Get Length    ${r.stdout}
    Should Be True    ${len} <= 800

*** Keywords ***
Parse Sprint Id
    [Arguments]    ${output}
    # Extract UUID from output line like "Sprint created: abc-123"
    ${match}=    Get Regexp Matches
    ...    ${output}
    ...    [0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}
    Should Not Be Empty    ${match}    msg=No sprint ID found in output
    RETURN    ${match}[0]
```

### `robot/functional/idea_store.robot`

```robot
*** Settings ***
Resource        ../resources/cli.resource
Suite Setup     Suite Setup With Temp Dir
Suite Teardown  Suite Teardown With Temp Dir
Tags            functional    ideas

*** Test Cases ***
Create Idea With Priority
    ${r}=    Create Idea    My Feature    project=myapp    priority=1
    Should Contain    ${r}    myapp

List Ideas Filters By Status
    Create Idea    Active Idea    project=p1    priority=2
    ${r}=    CLI Should Succeed    idea    list    --status    active    --project    p1
    Should Contain    ${r.stdout}    Active Idea

Mark Idea Done Changes Status
    ${out}=    Create Idea    Done Task
    ${id}=    Parse Idea Id    ${out}
    CLI Should Succeed    idea    done    ${id}
    ${r}=    CLI Should Succeed    idea    show    ${id}
    Should Contain    ${r.stdout}    done

Export Ideas Returns Formatted Text
    Create Idea    Export Me    project=exptest    priority=1
    ${r}=    CLI Should Succeed    idea    export
    ...    --project    exptest    --status    active
    Should Contain    ${r.stdout}    exptest

Empty Body Rejected
    CLI Should Fail    body cannot be empty
    ...    idea    create    --body    ${EMPTY}    --project    test

*** Keywords ***
Parse Idea Id
    [Arguments]    ${output}
    ${match}=    Get Regexp Matches
    ...    ${output}
    ...    [0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}
    Should Not Be Empty    ${match}
    RETURN    ${match}[0]
```

### `robot/functional/local_llm.robot`

```robot
*** Settings ***
Resource        ../resources/cli.resource
Suite Setup     Suite Setup With Temp Dir
Suite Teardown  Suite Teardown With Temp Dir
Tags            functional    llm
# VSCODE_ROTATOR_MOCK_LLM=1 is set in common.resource Run CLI keyword

*** Test Cases ***
Ingest New Snapshot Document
    Create Snapshot With Guide    ${BASE_DIR}
    ${r}=    CLI Should Succeed    llm    ingest
    Should Contain    ${r.stdout}    ingested

Second Ingest Is Idempotent
    Create Snapshot With Guide    ${BASE_DIR}
    CLI Should Succeed    llm    ingest
    ${r}=    CLI Should Succeed    llm    ingest
    Should Contain    ${r.stdout}    0    # 0 new items

Recurring Mistake Promoted To Rubric
    FOR    ${i}    IN RANGE    3
        CLI Should Succeed    llm    mistake    add
        ...    --desc    Forgot await    --category    api-misuse
    END
    ${r}=    CLI Should Succeed    llm    rubric    list
    Should Contain    ${r.stdout}    Forgot await

Generate Prompt Contains Rubric And Sprint Context
    CLI Should Succeed    llm    mistake    add
    ...    --desc    Always check nulls    --category    safety
    CLI Should Succeed    llm    mistake    add
    ...    --desc    Always check nulls    --category    safety
    CLI Should Succeed    llm    mistake    add
    ...    --desc    Always check nulls    --category    safety
    ${r}=    CLI Should Succeed    llm    generate
    ...    --goal    Add REST endpoint    --project    strategic-learning-unified-theatre
    Should Contain    ${r.stdout}    Always check nulls

*** Keywords ***
Create Snapshot With Guide
    [Arguments]    ${dir}
    Create File    ${dir}${/}guide.md    # Guide\nUse the account health endpoint.
    ${snapshot}=    Catenate    SEPARATOR=\n
    ...    {
    ...      "lastScan": "2026-05-19T00:00:00.000Z",
    ...      "paths": {
    ...        "${dir}/guide.md": {"ts": "2026-05-19T00:00:00.000Z", "ingestible": true}
    ...      }
    ...    }
    Create File    ${dir}${/}storage-snapshot.json    ${snapshot}
```

---

## Module 5 — Non-Functional Robot Test Files

### `robot/non_functional/performance.robot`

```robot
*** Settings ***
Resource        ../resources/cli.resource
Library         DateTime
Suite Setup     Suite Setup With Temp Dir
Suite Teardown  Suite Teardown With Temp Dir
Tags            non_functional    performance

*** Variables ***
${MAX_ACCOUNT_LIST_MS}     500
${MAX_SWITCH_DRY_RUN_MS}   1000
${MAX_INGEST_MS}           3000
${MAX_GENERATE_MS}         5000

*** Test Cases ***
Account List Responds Within SLA
    Add Account    perf@example.com
    ${start}=    Get Current Date
    CLI Should Succeed    account    list
    ${end}=    Get Current Date
    ${ms}=    Subtract Date From Date    ${end}    ${start}    result_format=number
    Should Be True    ${ms} * 1000 < ${MAX_ACCOUNT_LIST_MS}
    ...    msg=account list took ${ms}s; SLA is ${MAX_ACCOUNT_LIST_MS}ms

Dry Run Switch Responds Within SLA
    Add Account    perf-switch@example.com
    ${listing}=    List Accounts
    ${id}=    Extract Id From Listing    ${listing}    perf-switch@example.com
    ${start}=    Get Current Date
    CLI Should Succeed    account    switch    ${id}    --dry-run
    ${end}=    Get Current Date
    ${ms}=    Subtract Date From Date    ${end}    ${start}    result_format=number
    Should Be True    ${ms} * 1000 < ${MAX_SWITCH_DRY_RUN_MS}

LLM Ingest Responds Within SLA
    Create Snapshot With Guide    ${BASE_DIR}
    ${start}=    Get Current Date
    CLI Should Succeed    llm    ingest
    ${end}=    Get Current Date
    ${ms}=    Subtract Date From Date    ${end}    ${start}    result_format=number
    Should Be True    ${ms} * 1000 < ${MAX_INGEST_MS}
    ...    msg=llm ingest took ${ms}s; SLA is ${MAX_INGEST_MS}ms

LLM Generate Responds Within SLA
    ${start}=    Get Current Date
    CLI Should Succeed    llm    generate    --goal    test
    ${end}=    Get Current Date
    ${ms}=    Subtract Date From Date    ${end}    ${start}    result_format=number
    Should Be True    ${ms} * 1000 < ${MAX_GENERATE_MS}

*** Keywords ***
Create Snapshot With Guide
    [Arguments]    ${dir}
    Create File    ${dir}${/}guide.md    # Guide
    Create File    ${dir}${/}storage-snapshot.json
    ...    {"lastScan":"2026-05-19T00:00:00.000Z","paths":{"${dir}/guide.md":{"ts":"2026-05-19T00:00:00.000Z","ingestible":true}}}

Extract Id From Listing
    [Arguments]    ${listing}    ${email}
    ${lines}=    Split To Lines    ${listing}
    FOR    ${line}    IN    @{lines}
        ${match}=    Run Keyword And Return Status    Should Contain    ${line}    ${email}
        IF    ${match}    RETURN    ${line.split()[0]}
    END
    Fail    Could not find ${email}
```

### `robot/non_functional/security.robot`

```robot
*** Settings ***
Resource        ../resources/cli.resource
Suite Setup     Suite Setup With Temp Dir
Suite Teardown  Suite Teardown With Temp Dir
Tags            non_functional    security

*** Test Cases ***
Account File Has Permission 600 After Add
    Add Account    sec-perm@example.com    codex    mySuperSecretBlob
    File Should Have Permission 600
    ...    ${BASE_DIR}${/}accounts.enc

Auth Blob Never Appears In Account List Output
    Add Account    sec-blob@example.com    codex    SHOULD_NOT_APPEAR
    ${listing}=    List Accounts
    Should Not Contain    ${listing}    SHOULD_NOT_APPEAR

Daemon Log Contains No Tokens
    CLI Should Succeed    daemon    start    --once
    ${log}=    Get File    ${BASE_DIR}${/}daemon.log
    No Secret In Output    ${log}

Config File Has Permission 600
    CLI Should Succeed    config    set    pollIntervalMs    5000
    File Should Have Permission 600
    ...    ${BASE_DIR}${/}config.json

Sprint Manifest Contains No Secrets
    ${out}=    Create Sprint    Security test sprint
    ${id}=    Parse Sprint Id    ${out}
    ${content}=    Get File    ${BASE_DIR}${/}sprints${/}${id}.json
    No Secret In Output    ${content}

*** Keywords ***
Parse Sprint Id
    [Arguments]    ${output}
    ${match}=    Get Regexp Matches
    ...    ${output}
    ...    [0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}
    Should Not Be Empty    ${match}
    RETURN    ${match}[0]
```

### `robot/non_functional/reliability.robot`

```robot
*** Settings ***
Resource        ../resources/cli.resource
Library         OperatingSystem
Suite Setup     Suite Setup With Temp Dir
Suite Teardown  Suite Teardown With Temp Dir
Tags            non_functional    reliability

*** Test Cases ***
Lock File Is Released After Process Exit
    # Write a stale lock with a non-existent PID
    Create File    ${BASE_DIR}${/}switch.lock    999999
    # The next acquire should succeed (re-acquire stale lock)
    ${r}=    CLI Should Succeed    account    list
    # Lock should be gone after CLI exits
    File Should Not Exist    ${BASE_DIR}${/}switch.lock

Atomic Write Leaves No Temp Files After Success
    Add Account    atomic@example.com    codex
    ${temps}=    List Files In Directory
    ...    ${BASE_DIR}    *.tmp
    Should Be Empty    ${temps}
    ...    msg=Temp files found after atomic write: ${temps}

Second Concurrent Switch Attempt Is Rejected
    [Tags]    concurrency
    Add Account    concurrent@example.com    codex
    ${listing}=    List Accounts
    ${id}=    Extract Id From Listing    ${listing}    concurrent@example.com
    # Simulate a held lock
    Create File    ${BASE_DIR}${/}switch.lock    ${id}
    CLI Should Fail    lock    account    switch    ${id}    --dry-run
    Remove File    ${BASE_DIR}${/}switch.lock

Experience DB Is Created With Permission 600
    CLI Should Succeed    llm    generate    --goal    test
    File Should Have Permission 600
    ...    ${BASE_DIR}${/}experience.db

*** Keywords ***
Extract Id From Listing
    [Arguments]    ${listing}    ${email}
    ${lines}=    Split To Lines    ${listing}
    FOR    ${line}    IN    @{lines}
        ${match}=    Run Keyword And Return Status    Should Contain    ${line}    ${email}
        IF    ${match}    RETURN    ${line.split()[0]}
    END
    Fail    Could not find ${email}
```

---

## Module 6 — Regression Suite

### `robot/regression/regression_suite.robot`

```robot
*** Settings ***
Resource        ../resources/cli.resource
Suite Setup     Suite Setup With Temp Dir
Suite Teardown  Suite Teardown With Temp Dir
Tags            regression    smoke

*** Test Cases ***
[REGRESSION] Store Round-Trip
    [Tags]    regression    store
    Add Account    reg-a@example.com    codex
    ${listing}=    List Accounts
    Should Contain    ${listing}    reg-a@example.com

[REGRESSION] Sprint Lifecycle
    [Tags]    regression    handoff
    ${out}=    Create Sprint    Regression sprint
    ${id}=    Parse Sprint Id    ${out}
    CLI Should Succeed    handoff    close    ${id}    --status    complete
    ${r}=    CLI Should Succeed    handoff    show    ${id}
    Should Contain    ${r.stdout}    complete

[REGRESSION] Idea CRUD
    [Tags]    regression    ideas
    ${out}=    Create Idea    Regression Idea    project=reg    priority=2
    ${id}=    Parse Idea Id    ${out}
    CLI Should Succeed    idea    done    ${id}
    ${r}=    CLI Should Succeed    idea    show    ${id}
    Should Contain    ${r.stdout}    done

[REGRESSION] LLM Ingest And Generate
    [Tags]    regression    llm
    Create File    ${BASE_DIR}${/}guide.md    # Guide\nRegression doc.
    Create File    ${BASE_DIR}${/}storage-snapshot.json
    ...    {"lastScan":"2026-05-19T00:00:00.000Z","paths":{"${BASE_DIR}/guide.md":{"ts":"2026-05-19T00:00:00.000Z","ingestible":true}}}
    CLI Should Succeed    llm    ingest
    CLI Should Succeed    llm    generate    --goal    Regression check

[REGRESSION] No Secrets Leak In Any Output
    [Tags]    regression    security
    Add Account    nosecret@example.com    codex    PRIVATE_BLOB
    ${listing}=    List Accounts
    No Secret In Output    ${listing}

*** Keywords ***
Parse Sprint Id
    [Arguments]    ${output}
    ${match}=    Get Regexp Matches    ${output}
    ...    [0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}
    Should Not Be Empty    ${match}
    RETURN    ${match}[0]

Parse Idea Id
    [Arguments]    ${output}
    ${match}=    Get Regexp Matches    ${output}
    ...    [0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}
    Should Not Be Empty    ${match}
    RETURN    ${match}[0]
```

### `robot/regression/known_fixes.robot`

Each test case here documents a specific closed bug. Add a new test case for
every future bug fix. Format: `[FIX-NNN] <description>`.

```robot
*** Settings ***
Resource        ../resources/cli.resource
Suite Setup     Suite Setup With Temp Dir
Suite Teardown  Suite Teardown With Temp Dir
Tags            regression    known_fixes

*** Test Cases ***
[FIX-001] Store Timeout — scryptSync Must Not Block Test Environment
    [Documentation]    store.test.js was timing out at 5000ms due to slow
    ...    scryptSync. The fix stubs machineId in the test context.
    ...    This robot test verifies the CLI account commands complete fast enough.
    ${start}=    Get Current Date
    Add Account    fix001@example.com    codex
    ${end}=    Get Current Date
    ${ms}=    Subtract Date From Date    ${end}    ${start}    result_format=number
    Should Be True    ${ms} * 1000 < 5000
    ...    msg=Account add took too long (store timeout regression)

[FIX-002] E2E Rotation Timeout — WatcherDaemon Must Accept pollIntervalMs
    [Documentation]    rotation.test.js timed out because WatcherDaemon didn't
    ...    accept a short poll interval. The fix adds pollIntervalMs to WatcherDaemon.
    Add Account    fix002-a@example.com    codex
    Add Account    fix002-b@example.com    codex
    # If daemon starts and immediately cycles without hanging, the fix is effective.
    ${r}=    Run CLI    daemon    start    --once    --poll-interval    100
    Should Be Equal As Integers    ${r.rc}    0
    ...    msg=Daemon did not complete one cycle: ${r.stderr}
```

---

## Module 7 — `robot.config.json`

```json
{
  "pythonCmd": "python",
  "robotArgs": ["--loglevel", "INFO", "--timestampoutputs"],
  "outputDir": "robot-results",
  "tddGraceMs": 0,
  "sla": {
    "accountListMs": 500,
    "switchDryRunMs": 1000,
    "llmIngestMs": 3000,
    "llmGenerateMs": 5000
  },
  "tags": {
    "smoke": ["regression"],
    "full": ["functional", "non_functional", "regression"]
  },
  "persistResults": true,
  "blockCiOnFailure": true
}
```

---

## Module 8 — CLI Integration (`src/cli.js` additions)

Add these subcommands to the existing CLI. They must integrate with the current
commander-based CLI structure.

```
strategic-learning-unified-theatre test [suite]
  --suite <name>      all|functional|non_functional|regression  (default: all)
  --tags <tags>       comma-separated Robot --include tags
  --dry-run           pass --dryrun to Robot; no DB write
  --tdd-check         run enforceTdd on all src/*.js before testing

strategic-learning-unified-theatre test tdd-check [file]
  With no argument, checks all src/**/*.js files.
  Prints: PASS | FAIL for each, then exits 1 if any violations exist.

strategic-learning-unified-theatre test skeleton <src-file>
  Generates a skeleton .robot file for the given source file if missing.
  Prints the path of the generated file.

strategic-learning-unified-theatre test history [--limit N]
  Reads the test_runs table from experience DB and prints a summary table
  of recent robot suite runs: date, suite, passed/failed, duration.
```

---

## Module 9 — `tests/test-runner.test.js` (vitest unit tests)

Write vitest tests covering the following behaviours. These are unit tests only
— no subprocess spawning. Mock `child_process.spawn` and `fs` as needed.

```js
// detectPython
it('returns available:false when python is not on PATH')
it('returns the version string when python is found')
it('prefers python over python3 when both exist')

// detectRobotFramework
it('throws RobotFrameworkError with install instructions when robot is missing')
it('returns version when robot --version succeeds')

// enforceTdd
it('returns compliant:false when robot file does not exist')
it('returns compliant:true when robot file is older than src file')
it('returns compliant:false when robot file is newer than src file by more than graceMs')
it('returns compliant:true when within grace period')

// persistResultsToDb
it('creates test_runs table if it does not exist')
it('inserts a row with correct passed/failed/skipped counts')
it('returns the inserted row id')

// generateSkeletonRobotFile
it('creates a .robot file in the correct path derived from src filename')
it('includes a test case per exported function found in the source')
it('writes the file atomically (temp → rename)')

// runSuite (integration-style with mocked subprocess)
it('spawns python -m robot with correct args')
it('passes env vars including VSCODE_ROTATOR_MOCK_LLM=1')
it('parses exitCode, passed, failed from output.xml mock')
it('calls persistResultsToDb after a successful run')
it('returns errors array populated from failed test names in output.xml')
```

---

## Module 10 — `package.json` Script Updates

Add these scripts:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:robot": "node -e \"import('./src/test-runner.js').then(m => m.runSuite({ suite: 'all' }))\"",
    "test:robot:smoke": "node -e \"import('./src/test-runner.js').then(m => m.runSuite({ suite: 'regression' }))\"",
    "test:robot:functional": "node -e \"import('./src/test-runner.js').then(m => m.runSuite({ suite: 'functional' }))\"",
    "test:robot:nonfunctional": "node -e \"import('./src/test-runner.js').then(m => m.runSuite({ suite: 'non_functional' }))\"",
    "test:tdd": "node -e \"import('./src/test-runner.js').then(m => m.assertTddGate(process.argv.slice(2), './robot'))\"",
    "test:all": "npm test && npm run test:robot"
  }
}
```

---

## TDD Enforcement Workflow (How It Works in Practice)

The TDD gate is enforced at two levels:

### Level 1 — Pre-commit (via git hook or CI)
```bash
npm run test:tdd src/my-new-module.js
# → FAIL: No robot test found for src/my-new-module.js. Write the test first.
npm run test:all
# → Generates skeleton, developer fills it in, then implements
```

### Level 2 — CLI guard (for new feature commands)
Any `strategic-learning-unified-theatre` command that touches a source file modified more recently
than its robot test file will print a yellow warning:

```
⚠ TDD VIOLATION: src/my-module.js was modified after robot/functional/my_module.robot
  Run: strategic-learning-unified-theatre test tdd-check src/my-module.js
  Fix: update the robot test to cover your changes, then rerun.
```

In `--strict` mode (default in CI), this is a hard error and the command exits 1.

---

## Acceptance Criteria (Definition of Done for R6)

All of the following must be true before closing this sprint:

- [ ] `npm run test:robot:smoke` exits 0 and prints a passing regression report
- [ ] `npm run test:robot:functional` exits 0 — all functional suites pass
- [ ] `npm run test:robot:nonfunctional` exits 0 — all SLA and security checks pass
- [ ] `npm run test:tdd` exits 0 when all src files have a corresponding .robot file
- [ ] `npm run test:tdd src/new-file.js` exits 1 when no robot file exists
- [ ] `npm test` still exits 0 (no regressions in vitest unit layer)
- [ ] `experience.db` contains a `test_runs` table with at least one row after any robot run
- [ ] `strategic-learning-unified-theatre test history` prints the last test run without error
- [ ] `robot-results/report.html` is generated after every `npm run test:robot`
- [ ] No test file commits any plaintext secret to git
- [ ] Known failing tests (store.test.js, rotation.test.js) are fixed first

---

## End-of-Sprint Checklist (R6-specific)

1. `npm run test:all` — must be green
2. `strategic-learning-unified-theatre handoff update <id> --tokens-used <n>`
3. `strategic-learning-unified-theatre handoff close <id> --status complete`
4. `strategic-learning-unified-theatre log show --tail 20`
5. Update `strategic-learning-unified-theatre-master-instructions.md`:
   - Add `src/test-runner.js` to the Module Map
   - Add `robot/` to the Architecture section
   - Update Known Failing Tests section (mark fixed)
   - Add Sprint R6 to the completed sprint list
6. Copy `resumePrompt` for the next session

---

*Prompt authored: 2026-05-19 | Target sprint: R6 | Module: Robot Framework Testing*

