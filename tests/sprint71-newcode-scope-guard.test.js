// Vitest globals mode - do NOT import describe/it/expect from "vitest"
// Global variables: describe, it, expect, beforeAll, afterAll, beforeEach, afterEach

import fs from 'node:fs';
import path from 'node:path';

const timelinePath = path.resolve('master_timeline_sprints_1_54.md');
const instructionsPath = path.resolve('strategic-learning-unified-theatre-master-instructions.md');
const sprint70StablePath = path.resolve('strategic-learning-unified-theatre-ai-snapshot-sprint70-stable');
const packageJsonPath = path.resolve('package.json');
const sprint70GuardPath = path.resolve('tests/sprint70-coverage-pipeline-guard.test.js');

describe('Sprint 71 new-code scope guard', () => {
  let timeline;
  let instructions;
  let sprint70Stable;
  let packageJson;

  beforeAll(() => {
    timeline = fs.readFileSync(timelinePath, 'utf8');
    instructions = fs.readFileSync(instructionsPath, 'utf8');
    sprint70Stable = fs.readFileSync(sprint70StablePath, 'utf8');
    packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  });

  describe('Sprint 70 root-cause preserved', () => {
    it('timeline records Sprint 70 as Complete', () => {
      expect(timeline).toContain('| 70     |');
      expect(timeline).toContain('| Complete |');
    });

    it('master-instructions contains Sprint 70 Complete block', () => {
      expect(instructions).toContain('## Sprint 70 Complete');
    });

    it('sprint70 stable snapshot contains root-cause finding with "could never have moved"', () => {
      expect(sprint70Stable).toContain('could never have moved');
    });

    it('sprint70 stable confirms source files were not modified in Sprint 60+', () => {
      expect(sprint70Stable).toContain('were not modified in any Sprint 60+ commit');
    });

    it('master-instructions records sonar-project.properties was not changed', () => {
      expect(instructions).toContain('sonar-project.properties confirmed already correctly configured');
    });
  });

  describe('Sprint 71 scope boundary', () => {
    it('sprint70 stable confirms new-code-period change is a human admin decision', () => {
      expect(sprint70Stable).toContain('admin UI action');
      expect(sprint70Stable).toContain('outside automated-script scope');
    });

    it('sprint70 pipeline guard file still exists', () => {
      expect(fs.existsSync(sprint70GuardPath)).toBe(true);
    });
  });

  describe('Coverage and Sonar scripts preserved', () => {
    it('coverage script exists in package.json', () => {
      expect(packageJson.scripts.coverage).toBeTruthy();
      expect(packageJson.scripts.coverage).toContain('vitest run --coverage');
    });

    it('sonar scan script exists in package.json', () => {
      expect(packageJson.scripts['sonar:scan']).toBeTruthy();
    });

    it('sonar quality gate script exists in package.json', () => {
      expect(packageJson.scripts['sonar:qualitygate']).toBeTruthy();
    });
  });

  describe('Prior sprint guards preserved', () => {
    it('all sprint guard files from 65-70 still exist', () => {
      const guards = [
        'tests/sprint65-guard-only.test.js',
        'tests/sprint66-remediation-guard.test.js',
        'tests/sprint67-measured-cleanup.test.js',
        'tests/sprint68-gate-path-guard.test.js',
        'tests/sprint69-coverage-guard.test.js',
        'tests/sprint70-coverage-pipeline-guard.test.js',
      ];
      for (const g of guards) {
        expect(fs.existsSync(path.resolve(g))).toBe(true);
      }
    });
  });
});
