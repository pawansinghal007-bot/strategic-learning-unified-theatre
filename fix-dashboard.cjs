const fs = require('fs');
let html = fs.readFileSync('src/ui/provider-dashboard.html', 'utf8');

// Replace DOMContentLoaded listener with an immediately-invoked function
// so init code runs even if the event already fired (Electron timing issue)
html = html.replace(
  'document.addEventListener("DOMContentLoaded", function () {',
  '(function () {'
);

// Find the closing of the DOMContentLoaded listener: `});` on its own line
// It appears as `      });` after all the button wiring
// We need to match the specific one that closes addEventListener
// Strategy: replace the last `      });` before the const workspaceIdInput line
const anchor = '      const workspaceIdInput = document.getElementById("workspace-id");';
const anchorIdx = html.indexOf(anchor);
if (anchorIdx === -1) {
  console.error('ERROR: anchor not found');
  process.exit(1);
}

// Find the `});` immediately before the anchor
const beforeAnchor = html.slice(0, anchorIdx);
const lastDCLClose = beforeAnchor.lastIndexOf('      });');
if (lastDCLClose === -1) {
  console.error('ERROR: closing }); not found before anchor');
  process.exit(1);
}

html = html.slice(0, lastDCLClose) + '      }());' + html.slice(lastDCLClose + '      });'.length);

fs.writeFileSync('src/ui/provider-dashboard.html', html);
console.log('FIXED: DOMContentLoaded replaced with IIFE');

// Verify
console.log('DOMContentLoaded remaining:', (html.match(/DOMContentLoaded/g) || []).length, '(should be 0)');
console.log('IIFE present:', html.includes('(function () {') ? 'PASS' : 'FAIL');
console.log('IIFE close present:', html.includes('}());') ? 'PASS' : 'FAIL');
console.log('setReviewState init present:', html.includes('Executive review initialized') ? 'PASS' : 'FAIL');
console.log('proof flow init present:', html.includes('Executive proof flow initialized') ? 'PASS' : 'FAIL');
