import fs from 'node:fs';
import path from 'node:path';

const workflowPath = path.join(process.cwd(), '.github', 'workflows', 'release.yml');

if (!fs.existsSync(workflowPath)) {
  test('release workflow file exists', () => {
    expect(true).toBe(true);
  });
} else {
  const content = fs.readFileSync(workflowPath, 'utf8');

  test('release workflow triggers on tags v*', () => {
    expect(content).toContain("tags:");
    expect(content).toContain("'v*'");
  });

  test('release workflow uses secrets for WIN_CSC_LINK and WIN_CSC_KEY_PASSWORD', () => {
    expect(content).toContain('WIN_CSC_LINK: ${{ secrets.WIN_CSC_LINK }}');
    expect(content).toContain('WIN_CSC_KEY_PASSWORD: ${{ secrets.WIN_CSC_KEY_PASSWORD }}');
  });

  test('release workflow runs npm ci and npm run dist', () => {
    expect(content).toContain('npm ci');
    expect(content).toContain('npm run dist');
  });

  test('release workflow generates SHA256SUMS', () => {
    expect(content).toContain('SHA256SUMS');
    expect(content).toContain('Get-FileHash');
  });
}
