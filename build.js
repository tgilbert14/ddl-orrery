#!/usr/bin/env node
// DDL Cosmos — single-file concatenation build (the andrewcalebintl model, MITHRIL playbook §2.13).
// node build.js  →  index.html (GitHub Pages) + fragment.html (headless, for artifact redeploys)
// Fails loudly if any __PLACEHOLDER__ survives.
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'src');
const parts = [
  '01-tokens.css',
  '02-hub.css',
  '03-worlds.css',
  '04-body.html',
  '05-core.js',
  '06-worlds.js',
  '07-audio.js',
];

const read = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');

const css = ['01-tokens.css', '02-hub.css', '03-worlds.css'].map(read).join('\n\n');
const body = read('04-body.html');
const js = ['05-core.js', '06-worlds.js', '07-audio.js'].map(read).join('\n\n');

const fragment = `<style>\n${css}\n</style>\n${body}\n<script>\n${js}\n</script>`;

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>The Orrery · a Desert Data Labs experience</title>
<meta name="description" content="Seven worlds, hand-built from code: a desert giant under two suns, a neon metropolis, glyph rain, the hadal deep, a cabinet world, dancing auroras, and one world still unnamed. Travel between them.">
<meta property="og:title" content="The Orrery · Desert Data Labs">
<meta property="og:description" content="Seven worlds. One clock. Everything you see is code. Warp between hand-built universes, each with its own weather, physics, and music.">
<meta property="og:type" content="website">
<meta property="og:url" content="https://tgilbert14.github.io/ddl-orrery/">
<meta property="og:image" content="https://tgilbert14.github.io/ddl-orrery/og-card.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="https://tgilbert14.github.io/ddl-orrery/og-card.png">
<meta name="theme-color" content="#060a18">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Ccircle cx='32' cy='32' r='14' fill='%23f97366'/%3E%3Cellipse cx='32' cy='32' rx='26' ry='8' fill='none' stroke='%234af3ff' stroke-width='3' transform='rotate(-18 32 32)'/%3E%3C/svg%3E">
</head>
<body>
${fragment}
</body>
</html>`;

// Placeholder failsafe (§2.13): a surviving __MARKER__ means a broken inject — fail the build.
const leftover = page.match(/__[A-Z][A-Z0-9_]+__/g);
if (leftover) {
  console.error('BUILD FAILED — surviving placeholders:', [...new Set(leftover)].join(', '));
  process.exit(1);
}

fs.writeFileSync(path.join(__dirname, 'index.html'), page);
fs.writeFileSync(path.join(__dirname, 'fragment.html'), fragment);
const kb = (n) => (Buffer.byteLength(n, 'utf8') / 1024).toFixed(1) + ' KB';
console.log(`built: index.html ${kb(page)} · fragment.html ${kb(fragment)} · css ${kb(css)} · js ${kb(js)}`);
