import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const OUT_DIR = join(import.meta.dirname, '..', 'src', 'frontend', 'out');

function findHtmlFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...findHtmlFiles(full));
    } else if (entry.endsWith('.html')) {
      files.push(full);
    }
  }
  return files;
}

for (const htmlPath of findHtmlFiles(OUT_DIR)) {
  let html = readFileSync(htmlPath, 'utf-8');

  // Find all <link rel="stylesheet" href="...css" ...> and inline them
  const cssLinkRe = /<link\s+rel="stylesheet"\s+href="([^"]+\.css)"[^>]*\/>/g;
  let match;
  while ((match = cssLinkRe.exec(html)) !== null) {
    const cssHref = match[1];
    const cssPath = join(OUT_DIR, cssHref);
    try {
      const css = readFileSync(cssPath, 'utf-8');
      html = html.replace(match[0], `<style>${css}</style>`);
      console.log(`Inlined ${cssHref} into ${htmlPath.replace(OUT_DIR, '')}`);
    } catch {
      console.warn(`Could not read ${cssPath}, skipping`);
    }
  }

  writeFileSync(htmlPath, html);
}
