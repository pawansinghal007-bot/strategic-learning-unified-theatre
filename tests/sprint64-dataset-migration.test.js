import fs from 'node:fs';
import path from 'node:path';

const dashboardPath = path.resolve('src/ui/provider-dashboard.html');
const dashboardJsPath = path.resolve('src/ui/dashboard.js');

describe('Sprint 64 dataset migration guard', () => {
  let html;
  let jsContent;
  let combinedContent;

  beforeAll(() => {
    html = fs.readFileSync(dashboardPath, 'utf8');
    jsContent = fs.existsSync(dashboardJsPath)
      ? fs.readFileSync(dashboardJsPath, 'utf8')
      : '';
    combinedContent = html + '\n' + jsContent;
  });

  describe('dataset assignments present', () => {
    it('uses dataset for local AI state', () => {
      expect(combinedContent).toContain('dataset.localAiState');
    });

    it('uses dataset for proof panel last action', () => {
      expect(combinedContent).toContain('dataset.lastProofAction');
    });

    it('uses dataset for proof output state', () => {
      expect(combinedContent).toContain('dataset.proofOutput');
    });

    it('uses dataset for walkthrough panel state', () => {
      expect(combinedContent).toContain('dataset.demoMode');
      expect(combinedContent).toContain('dataset.walkthroughStep');
    });

    it('uses dataset for compliance panel state', () => {
      expect(combinedContent).toContain('dataset.driftReviewState');
      expect(combinedContent).toContain('dataset.complianceOutput');
    });

    it('uses dataset for review panel state', () => {
      expect(combinedContent).toContain('dataset.reviewExportState');
      expect(combinedContent).toContain('dataset.reviewPersistenceCheck');
      expect(combinedContent).toContain('dataset.reviewOutput');
    });

    it('uses dataset for release panel state', () => {
      expect(combinedContent).toContain('dataset.releaseTruth');
      expect(combinedContent).toContain('dataset.releaseBlockersState');
    });
  });

  describe('setAttribute removed for migrated data-* keys', () => {
    it('no longer uses setAttribute for data-local-ai-state', () => {
      expect(combinedContent).not.toContain("setAttribute('data-local-ai-state'");
      expect(combinedContent).not.toContain('setAttribute("data-local-ai-state"');
    });

    it('no longer uses setAttribute for data-last-proof-action', () => {
      expect(combinedContent).not.toContain("setAttribute('data-last-proof-action'");
      expect(combinedContent).not.toContain('setAttribute("data-last-proof-action"');
    });

    it('no longer uses setAttribute for data-release-truth', () => {
      expect(combinedContent).not.toContain("setAttribute('data-release-truth'");
      expect(combinedContent).not.toContain('setAttribute("data-release-truth"');
    });

    it('no longer uses setAttribute for data-release-blockers-state', () => {
      expect(combinedContent).not.toContain("setAttribute('data-release-blockers-state'");
      expect(combinedContent).not.toContain('setAttribute("data-release-blockers-state"');
    });

    it('no longer uses setAttribute for data-demo-mode', () => {
      expect(combinedContent).not.toContain("setAttribute('data-demo-mode'");
      expect(combinedContent).not.toContain('setAttribute("data-demo-mode"');
    });

    it('no longer uses setAttribute for data-review-export-state', () => {
      expect(combinedContent).not.toContain("setAttribute('data-review-export-state'");
      expect(combinedContent).not.toContain('setAttribute("data-review-export-state"');
    });
  });

  describe('Sprint 63 zero-indentation guard still satisfied', () => {
    it('setReleaseState closes with newline+brace at column 0', () => {
      const match = combinedContent.match(/function setReleaseState[\s\S]*?\n\}/);
      expect(match).not.toBeNull();
    });
  });

  describe('Sprint 63 compatibility preserved', () => {
    it('executive-release-panel still present', () => {
      expect(html).toContain('data-testid="executive-release-panel"');
    });

    it('blocked truth messaging preserved', () => {
      expect(html).toContain('blocked by a failed Sonar quality gate');
    });

    it('89 open issues count preserved', () => {
      expect(html).toContain('89 open');
    });
  });
});
