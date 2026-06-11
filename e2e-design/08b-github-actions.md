# GitHub Actions Workflows

## PR Workflow

```yaml
name: E2E PR

on:
  pull_request:
    paths:
      - "electron-ui/**"
      - "src/main/**"
      - "src/accounts/**"
      - "src/policies/**"
      - "src/governance/**"
      - "src/audit/**"
      - "src/llm/**"
      - "src/browser-bridge.js"
      - "Preload/**"
      - "IPC/**"
      - "e2e/**"
      - "playwright.config.ts"
      - "package.json"
      - "package-lock.json"
  workflow_dispatch:
    inputs:
      include_macos:
        description: "Run optional macOS matrix leg"
        required: false
        default: false
        type: boolean

permissions:
  contents: read

env:
  CI: "true"
  NODE_ENV: test
  VSCODE_ROTATOR_MOCK_LLM: "1"
  NODE_OPTIONS: "--max-old-space-size=8192"

jobs:
  smoke:
    name: Smoke / ${{ matrix.os }}
    runs-on: ${{ matrix.os }}
    strategy:
      fail-fast: false
      matrix:
        os: ${{ fromJSON(github.event_name == 'workflow_dispatch' && inputs.include_macos && '["windows-latest","macos-latest"]' || '["windows-latest"]') }}
    timeout-minutes: 15
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright runtime
        run: npx playwright install chromium

      - name: Build renderer
        run: npm run ui:build

      - name: Run smoke suite
        run: npx playwright test e2e/specs/smoke --project=electron --workers=1 --retries=2

      - name: Upload screenshots
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: smoke-screenshots-${{ matrix.os }}
          path: test-results/e2e/**/*.png
          if-no-files-found: ignore
          retention-days: 14

      - name: Upload traces
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: smoke-traces-${{ matrix.os }}
          path: test-results/e2e/**/*.zip
          if-no-files-found: ignore
          retention-days: 14

      - name: Upload videos
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: smoke-videos-${{ matrix.os }}
          path: test-results/e2e/**/*.webm
          if-no-files-found: ignore
          retention-days: 14

      - name: Upload Playwright report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: smoke-playwright-report-${{ matrix.os }}
          path: |
            playwright-report/e2e
            test-results/e2e-results.json
          if-no-files-found: ignore
          retention-days: 14

  regression:
    name: Regression / ${{ matrix.os }}
    runs-on: ${{ matrix.os }}
    needs: smoke
    strategy:
      fail-fast: false
      matrix:
        os: ${{ fromJSON(github.event_name == 'workflow_dispatch' && inputs.include_macos && '["windows-latest","macos-latest"]' || '["windows-latest"]') }}
    timeout-minutes: 60
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright runtime
        run: npx playwright install chromium

      - name: Build renderer
        run: npm run ui:build

      - name: Run regression suite
        run: npx playwright test e2e/specs/j1-account-rotation-capture e2e/specs/j2-workspace-policy-routing e2e/specs/j3-approval-audit e2e/specs/j4-quota-governance e2e/specs/j5-routing-review --project=electron --workers=2 --retries=2

      - name: Upload screenshots
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: regression-screenshots-${{ matrix.os }}
          path: test-results/e2e/**/*.png
          if-no-files-found: ignore
          retention-days: 14

      - name: Upload traces
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: regression-traces-${{ matrix.os }}
          path: test-results/e2e/**/*.zip
          if-no-files-found: ignore
          retention-days: 14

      - name: Upload videos
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: regression-videos-${{ matrix.os }}
          path: test-results/e2e/**/*.webm
          if-no-files-found: ignore
          retention-days: 14

      - name: Upload Playwright report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: regression-playwright-report-${{ matrix.os }}
          path: |
            playwright-report/e2e
            test-results/e2e-results.json
            e2e/artifacts
          if-no-files-found: ignore
          retention-days: 14
```

## Nightly Workflow

```yaml
name: E2E Nightly

on:
  schedule:
    - cron: "30 20 * * *"
  workflow_dispatch:
    inputs:
      include_macos:
        description: "Run optional macOS matrix leg"
        required: false
        default: false
        type: boolean

permissions:
  contents: read

env:
  CI: "true"
  NODE_ENV: test
  VSCODE_ROTATOR_MOCK_LLM: "1"
  NODE_OPTIONS: "--max-old-space-size=8192"

jobs:
  full:
    name: Full / ${{ matrix.os }}
    runs-on: ${{ matrix.os }}
    strategy:
      fail-fast: false
      matrix:
        os: ${{ fromJSON(github.event_name == 'workflow_dispatch' && inputs.include_macos && '["windows-latest","macos-latest"]' || '["windows-latest"]') }}
    timeout-minutes: 150
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright runtime
        run: npx playwright install chromium

      - name: Build renderer
        run: npm run ui:build

      - name: Run full suite
        run: npx playwright test --project=electron --workers=2 --retries=2

      - name: Upload screenshots
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: full-screenshots-${{ matrix.os }}
          path: test-results/e2e/**/*.png
          if-no-files-found: ignore
          retention-days: 30

      - name: Upload traces
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: full-traces-${{ matrix.os }}
          path: test-results/e2e/**/*.zip
          if-no-files-found: ignore
          retention-days: 30

      - name: Upload videos
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: full-videos-${{ matrix.os }}
          path: test-results/e2e/**/*.webm
          if-no-files-found: ignore
          retention-days: 30

      - name: Upload Playwright report and diagnostics
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: full-playwright-report-${{ matrix.os }}
          path: |
            playwright-report/e2e
            test-results/e2e-results.json
            e2e/artifacts
          if-no-files-found: ignore
          retention-days: 30
```

## Notes & Customisation Points

- Windows is the required matrix target; macOS is present as an optional workflow-dispatch leg for platform-sensitive validation.
- `--retries=2` makes retry behavior explicit even though the Playwright config also enables CI retries.
- Replace the regression command with tag filters such as `--grep @regression` if the suite is later tagged directly.
- Add shard keys to the nightly matrix if the full suite exceeds the 80-120 minute target.
