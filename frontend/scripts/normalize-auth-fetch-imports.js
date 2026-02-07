const fs = require('fs');
const path = require('path');

const SRC_ROOT = path.join(__dirname, '..', 'src');
const AUTH_FETCH = path.join(SRC_ROOT, 'services', 'authFetch.js');
const EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx']);

const walk = (dir) => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
};

const isSourceFile = (filePath) => {
  if (!EXTENSIONS.has(path.extname(filePath))) return false;
  if (filePath.includes('.test.')) return false;
  return true;
};

const run = () => {
  const files = walk(SRC_ROOT).filter(isSourceFile);
  let changed = 0;

  for (const filePath of files) {
    let content = fs.readFileSync(filePath, 'utf8');
    if (!content.includes('import { authFetch')) continue;

    const lines = content.split(/\r?\n/);
    let removed = false;
    const filtered = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('import { authFetch') && trimmed.endsWith(';')) {
        removed = true;
        continue;
      }
      filtered.push(line);
    }

    if (!removed) continue;

    let insertIndex = 0;
    while (insertIndex < filtered.length) {
      const line = filtered[insertIndex];
      if (line.startsWith('import ') || line.trim() === '') {
        insertIndex += 1;
        continue;
      }
      break;
    }

    let relPath = path
      .relative(path.dirname(filePath), AUTH_FETCH)
      .replace(/\\/g, '/')
      .replace(/\.js$/, '');
    if (!relPath.startsWith('.') && !relPath.startsWith('/')) {
      relPath = `./${relPath}`;
    }
    filtered.splice(insertIndex, 0, `import { authFetch } from '${relPath}';`);

    const next = filtered.join('\n');
    if (next !== content) {
      fs.writeFileSync(filePath, next, 'utf8');
      changed += 1;
    }
  }

  console.log(`[normalize-auth-fetch-imports] Updated ${changed} file(s).`);
};

run();
