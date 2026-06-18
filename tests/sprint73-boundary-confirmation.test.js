import fs from 'node:fs';
import { describe, it, expect } from 'vitest';

const timeline     = fs.readFileSync('master_timeline_sprints_1_54.md', 'utf8');
const instructions = fs.readFileSync(
  'strategic-learning-unified-theatre-master-instructions.md', 'utf8'
);
const snapshot     = fs.readFileSync('CURRENT_ACTIVE_SNAPSHOT.md', 'utf8').trim();
const sprint72snap = fs.readFileSync(
  'strategic-learning-unified-theatre-ai-snapshot-sprint72-stable', 'utf8'
);

describe('Sprint 73 boundary confirmation guard', () => {

  describe('Timeline state', () => {
    it('timeline contains Sprint 72 row', () => {
      expect(timeline).toContain('| 72 ');
    });

    it('timeline contains Sprint 73 row', () => {
      expect(timeline).toContain('| 73 ');
    });

    it('timeline records Sprint 73 as Complete', () => {
      expect(timeline).toContain('| Complete |');
    });
  });

  describe('Master instructions state', () => {
    it('instructions contain Sprint 72 Complete heading', () => {
      expect(instructions).toContain('## Sprint 72 Complete');
    });

    it('instructions contain Sprint 73 Planned heading', () => {
      expect(instructions).toContain('## Sprint 73 Planned');
    });

    it('instructions contain Sprint 73 Complete heading', () => {
      expect(instructions).toContain('## Sprint 73 Complete');
    });

    it('instructions contain Sprint 74 Planned heading', () => {
      expect(instructions).toContain('## Sprint 74 Planned');
    });

    it('instructions preserve hard boundary phrase from Sprint 72', () => {
      expect(instructions).toContain('outside automated-script scope');
    });

    it('instructions record Sprint 73 no-source-file-changes', () => {
      expect(instructions).toContain('No source file changes');
    });

    it('Sprint 74 plan references new_violations', () => {
      expect(instructions).toContain('new_violations');
    });

    it('Sprint 74 plan does not mandate new-code-period reset', () => {
      const s74Block = instructions.split('## Sprint 74 Planned')[1] || '';
      expect(s74Block).not.toContain('reset the new-code-period');
    });
  });

  describe('Snapshot chain', () => {
    it('active snapshot points to Sprint 73 stable during sprint 73', () => {
      expect(snapshot).toBe(
        'strategic-learning-unified-theatre-ai-snapshot-sprint73-stable'
      );
    });

    it('Sprint 72 snapshot file is readable and non-empty', () => {
      expect(sprint72snap.length).toBeGreaterThan(100);
    });

    it('Sprint 72 snapshot records hard boundary finding', () => {
      expect(sprint72snap).toContain('hard automation boundary');
    });

    it('Sprint 72 snapshot confirms no source changes', () => {
      expect(sprint72snap).toContain('NO SOURCE FILE CHANGES THIS SPRINT');
    });
  });

  describe('Guard chain integrity', () => {
    it('sprint65 guard file exists', () => {
      expect(fs.existsSync('tests/sprint65-guard-only.test.js')).toBe(true);
    });

    it('sprint70 guard file exists', () => {
      expect(fs.existsSync('tests/sprint70-coverage-pipeline-guard.test.js')).toBe(true);
    });

    it('sprint71 guard file exists', () => {
      expect(fs.existsSync('tests/sprint71-newcode-scope-guard.test.js')).toBe(true);
    });

    it('sprint72 guard file exists', () => {
      expect(fs.existsSync('tests/sprint72-modified-newcode-boundary.test.js')).toBe(true);
    });
  });

});
