// Builds dist/preview.html: one self-contained file with the engine running in the browser.
// For showing the product without a server. Payments and AI tailoring are absent from it.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const shim = `
window.DunwellAPI = (function () {
  var E = window.DunwellEngine, off = { status: 503, data: { error: 'Not available in the preview build.' } };
  return {
    config: function () { return Promise.resolve({ status: 200, data: { pro: true, preview: true, billing: false, ai: false, rates: E.currentRates() } }); },
    chase: function (b) { var r = E.chase(b, { pro: true }); return Promise.resolve({ status: r.ok ? 200 : 422, data: r }); },
    tailor: function () { return Promise.resolve(off); }, unlock: function () { return Promise.resolve(off); },
    restore: function () { return Promise.resolve(off); }, portal: function () { return Promise.resolve(off); }
  };
})();`;
let html = read('public/index.html')
  .replace('<link rel="icon" href="/favicon.svg" type="image/svg+xml">', '')
  .replace('<link rel="stylesheet" href="/styles.css">', () => `<style>\n${read('public/styles.css')}\n</style>`)
  .replace('<script src="/app.js" defer></script>', () => `<script>\n${read('lib/engine.js')}\n${shim}\n${read('public/app.js')}\n</script>`)
  .replace(/href="\/(privacy|terms)"/g, 'href="#"').replace('href="/" aria-label', 'href="#" aria-label');
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/preview.html'), html);
console.log('dist/preview.html', (html.length / 1024).toFixed(0) + ' KB');
