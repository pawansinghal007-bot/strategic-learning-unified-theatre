const fs = require('fs');
const html = fs.readFileSync('src/ui/provider-dashboard.html', 'utf8');

// Show the DOMContentLoaded block opening
const dcl = html.indexOf('DOMContentLoaded');
console.log('--- DOMContentLoaded context ---');
console.log(html.slice(dcl - 50, dcl + 200));

// Show setReviewState init call inside DOMContentLoaded
const reviewInit = html.indexOf('setReviewState(\n           "Ready"');
const reviewInit2 = html.indexOf('"Executive review initialized');
console.log('\n--- setReviewState init call ---');
console.log(reviewInit2 !== -1 ? html.slice(reviewInit2 - 100, reviewInit2 + 100) : 'NOT FOUND');

// Show setProofAction init call
const proofInit = html.indexOf('Executive proof flow initialized');
console.log('\n--- proof flow init text ---');
console.log(proofInit !== -1 ? html.slice(proofInit - 100, proofInit + 100) : 'NOT FOUND');

// Show what text the review-output is initialized with
const reviewOutputInit = html.indexOf('"Executive review initialized');
const reviewOutputInit2 = html.indexOf('Executive review initialized');
console.log('\n--- review-output init text search ---');
console.log('found:', reviewOutputInit2 !== -1 ? html.slice(reviewOutputInit2 - 50, reviewOutputInit2 + 80) : 'NOT FOUND');

// Show loadReleaseReadiness button handler
const lrr = html.indexOf('loadReleaseReadinessBtn');
console.log('\n--- loadReleaseReadiness handler ---');
console.log(lrr !== -1 ? html.slice(lrr - 20, lrr + 400) : 'NOT FOUND');

// Check what release-readiness-output contains on load
const rro = html.indexOf('release-readiness-output');
console.log('\n--- release-readiness-output HTML ---');
console.log(rro !== -1 ? html.slice(rro - 10, rro + 300) : 'NOT FOUND');
