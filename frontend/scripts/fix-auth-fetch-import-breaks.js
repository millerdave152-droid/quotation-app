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

    const brokenPattern = /import\s+\{\s*\r?\nimport\s+\{\s*authFetch[^;]*;\r?\n/;
    if (!brokenPattern.test(content)) continue;

    // Remove the broken authFetch import line
    content = content.replace(brokenPattern, 'import {\n');

    const lines = content.split(/\r?\n/);
    let insertIndex = 0;
    while (insertIndex < lines.length) {
      const line = lines[insertIndex];
      if (line.startsWith('import ') || line.trim() === '') {
        insertIndex += 1;
        continue;
      }
      break;
    }

    const relPath = path
      .relative(path.dirname(filePath), AUTH_FETCH)
      .replace(/\\/g, '/')
      .replace(/\.js$/, '');
    const importLine = `import { authFetch } from '${relPath.startsWith('.') ? relPath : `./${relPath}`}';`;
    lines.splice(insertIndex, 0, importLine);

    const next = lines.join('\n');
    if (next !== content) {
      fs.writeFileSync(filePath, next, 'utf8');
      changed += 1;
    } else {
      // Always write if we already edited the content via replace above
      fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
      changed += 1;
    }
  }

  console.log(`[fix-auth-fetch-import-breaks] Updated ${changed} file(s).`);
};

run();
