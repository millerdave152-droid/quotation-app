const fs = require('fs');
const path = require('path');

const SRC_ROOT = path.join(__dirname, '..', 'src');
const AUTH_FETCH_PATH = path.join(SRC_ROOT, 'services', 'authFetch.js');

const EXCLUDE_FILES = new Set([
  path.join(SRC_ROOT, 'services', 'authFetch.js'),
  path.join(SRC_ROOT, 'services', 'authGuards.js'),
  path.join(SRC_ROOT, 'services', 'apiCache.js'),
  path.join(SRC_ROOT, 'serviceWorkerRegistration.js'),
]);

const EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx']);

const shouldSkip = (filePath) => {
  if (EXCLUDE_FILES.has(filePath)) return true;
  if (!EXTENSIONS.has(path.extname(filePath))) return true;
  if (filePath.includes('.test.')) return true;
  return false;
};

const walk = (dir) => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
    } else if (!shouldSkip(fullPath)) {
      files.push(fullPath);
    }
  }
  return files;
};

const hasAuthFetchImport = (content) => {
  return /from\s+['"][^'"]*authFetch['"]/.test(content);
};

const replaceFetchCalls = (content) => {
  return content.replace(/(^|[^\w.])fetch\(/g, '$1authFetch(');
};

const insertAuthFetchImport = (content, importPath) => {
  const importLine = `import { authFetch } from '${importPath}';`;
  if (hasAuthFetchImport(content)) {
    return content;
  }

  const lines = content.split(/\r?\n/);
  let insertIndex = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.startsWith('import ')) {
      insertIndex = i + 1;
      continue;
    }
    break;
  }
  lines.splice(insertIndex, 0, importLine);
  return lines.join('\n');
};

const toImportPath = (filePath) => {
  const relativePath = path.relative(path.dirname(filePath), AUTH_FETCH_PATH);
  return relativePath.replace(/\\/g, '/').replace(/\.js$/, '');
};

const run = () => {
  const files = walk(SRC_ROOT);
  let changed = 0;

  for (const filePath of files) {
    const original = fs.readFileSync(filePath, 'utf8');
    if (!original.includes('fetch(')) {
      continue;
    }

    const replaced = replaceFetchCalls(original);
    if (replaced === original) {
      continue;
    }

    const importPath = toImportPath(filePath);
    const updated = insertAuthFetchImport(replaced, importPath);

    if (updated !== original) {
      fs.writeFileSync(filePath, updated, 'utf8');
      changed += 1;
    }
  }

  console.log(`[codemod-auth-fetch] Updated ${changed} file(s).`);
};

run();
