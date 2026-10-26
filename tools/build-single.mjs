// Inline the SINGLE=1 Vite build into one HTML page body (no external requests at all).
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'dist-single';
const html = readFileSync(join(dir, 'index.html'), 'utf8');
const assets = readdirSync(join(dir, 'assets'));
const js = assets.filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(dir, 'assets', f), 'utf8')).join('\n');
const css = assets.filter((f) => f.endsWith('.css')).map((f) => readFileSync(join(dir, 'assets', f), 'utf8')).join('\n');
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>')).replace(/<script[^>]*src=[^>]*><\/script>/g, '').trim();
const safeJs = js.replace(/<\/script/gi, '<\\/script');
const out = `<title>Breach Club</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="theme-color" content="#202638">
<style>
:root { color-scheme: dark; }
${css}
</style>
${body}
<script type="module">
${safeJs}
</script>
`;
writeFileSync(join(dir, 'breach-club.html'), out);
console.log(`breach-club.html: ${(out.length / 1024 / 1024).toFixed(2)} MB`);
