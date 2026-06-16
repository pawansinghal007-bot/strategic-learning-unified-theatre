import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Load both provider-dashboard.html and dashboard.js, concatenated.
 * Handles the case where dashboard logic was split into a separate .js file.
 * @returns {string} Combined HTML + JS content
 */
export function loadDashboardSurface() {
  const dashboardPath = join(process.cwd(), 'src/ui/provider-dashboard.html');
  const jsPath = join(process.cwd(), 'src/ui/dashboard.js');

  const htmlContent = readFileSync(dashboardPath, 'utf8');
  const jsContent = existsSync(jsPath) ? readFileSync(jsPath, 'utf8') : '';

  return htmlContent + '\n' + jsContent;
}
