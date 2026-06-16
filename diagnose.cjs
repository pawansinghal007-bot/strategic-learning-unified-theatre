const fs = require('fs');
const html = fs.readFileSync('src/ui/provider-dashboard.html', 'utf8');

console.log('--- File stats ---');
console.log('Total length:', html.length);
console.log('DOMContentLoaded count:', (html.match(/DOMContentLoaded/g) || []).length);
console.log('</script> count:', (html.match(/<\/script>/g) || []).length);
console.log('</body> count:', (html.match(/<\/body>/g) || []).length);

// Show everything after the last </script>
const lastScriptClose = html.lastIndexOf('</script>');
const afterScript = html.slice(lastScriptClose);
console.log('\n--- Content after last </script> ---');
console.log(JSON.stringify(afterScript.slice(0, 500)));

// Show 200 chars before </script>
const beforeScript = html.slice(Math.max(0, lastScriptClose - 300), lastScriptClose);
console.log('\n--- 300 chars before last </script> ---');
console.log(beforeScript);

// Check for JS syntax errors by looking for unmatched braces after </script>
const afterBody = html.slice(html.lastIndexOf('</body>'));
console.log('\n--- Content after last </body> ---');
console.log(JSON.stringify(afterBody));
