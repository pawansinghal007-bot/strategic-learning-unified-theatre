// @vitest-globals
import fs from 'node:fs';
import path from 'node:path';

const timelinePath = path.resolve('master_timeline_sprints_1_54.md');
const instructionsPath = path.resolve('strategic-learning-unified-theatre-master-instructions.md');
const sprint71StablePath = path.resolve('strategic-learning-unified-theatre-ai-snapshot-sprint71-stable');
const sprint71GuardPath = path.resolve('tests/sprint71-newcode-scope-guard.test.js');
const sprint70GuardPath = path.resolve('tests/sprint70-coverage-pipeline-guard.test.js');
const packageJsonPath = path.resolve('package.json');

describe('Sprint 72 modified-newcode boundary guard', () => {
  let timeline;
  let instructions;
  let sprint71Stable;
  let pkg;

  beforeAll(() => {
    timeline = fs.readFileSync(timelinePath, 'utf8');
    instructions = fs.readFileSync(instructionsPath, 'utf8');
    sprint71Stable = fs.readFileSync(sprint71StablePath, 'utf8');
    pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  });

  describe('Sprint 71 closure preserved', () => {
    it('timeline contains Sprint 71 row as Complete', () => {
      expect(timeline).toContain('| 71 ');
      expect(timeline).toContain('| Complete |');
    });

    it('master-instructions contains Sprint 71 Complete block', () => {
      expect(instructions).toContain('## Sprint 71 Complete');
    });

    it('master-instructions contains Sprint 72 Planned block', () => {
      expect(instructions).toContain('## Sprint 72 Planned');
    });

    it('instructions records new-code-period as admin decision', () => {
      expect(instructions).toContain('outside automated code scope');
    });
  });

  describe('Sprint 72 scope boundary', () => {
    it('timeline contains Sprint 72 row as Complete', () => {
      expect(timeline).toContain('| 72 ');
      expect(timeline).toContain('| Complete |');
    });

    it('timeline Sprint 72 scope refers to modified files in new-code period', () => {
      expect(timeline).toContain('actually modified in Sprints 60-71');
    });

    it('timeline Sprint 72 describes the hard boundary if no files qualify', () => {
      expect(timeline).toContain('If no qualifying files exist');
    });

    it('instructions Sprint 72 Planned describes hard boundary for eligible files', () => {
      expect(instructions).toContain('document this as a hard boundary');
    });
  });

  describe('Sprint 71 stable snapshot wording', () => {
    it('sprint71 stable confirms no source file changes', () => {
      expect(sprint71Stable).toContain('NO SOURCE FILE CHANGES THIS SPRINT');
    });

    it('sprint71 stable references Sprint 72 evaluation', () => {
      expect(sprint71Stable).toContain('Sprint 72');
    });
  });

  describe('Prior guard files preserved', () => {
    it('sprint70 pipeline guard exists', () => {
      expect(fs.existsSync(sprint70GuardPath)).toBe(true);
    });

    it('sprint71 scope guard exists', () => {
      expect(fs.existsSync(sprint71GuardPath)).toBe(true);
    });
  });

  describe('Coverage and Sonar scripts preserved', () => {
    it('coverage script exists with vitest run --coverage', () => {
      expect(pkg.scripts.coverage).toContain('vitest run --coverage');
    });

    it('sonar:scan script exists', () => {
      expect(Object.prototype.hasOwnProperty.call(pkg.scripts, 'sonar:scan')).toBe(true);
    });

    it('sonar:qualitygate script exists', () => {
      expect(Object.prototype.hasOwnProperty.call(pkg.scripts, 'sonar:qualitygate')).toBe(true);
    });

    it('sonar:preflight script exists', () => {
      expect(Object.prototype.hasOwnProperty.call(pkg.scripts, 'sonar:preflight')).toBe(true);
    });
  });
});
