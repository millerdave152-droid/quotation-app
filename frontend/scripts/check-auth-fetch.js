const fs = require('fs');
const path = require('path');

const SRC_ROOT = path.join(__dirname, '..', 'src');

const ALLOWLIST = new Set([
  path.join(SRC_ROOT, 'services', 'authFetch.js'),
  path.join(SRC_ROOT, 'services', 'apiCache.js'),
  path.join(SRC_ROOT, 'serviceWorkerRegistration.js'),
]);

const EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx']);

const shouldScan = (filePath) => {
  if (!EXTENSIONS.has(path.extname(filePath))) return false;
  if (filePath.includes('.test.')) return false;
  return true;
};

const walk = (dir) => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
    } else if (shouldScan(fullPath)) {
      files.push(fullPath);
    }
  }
  return files;
};

const hasDirectFetch = (content) => /(^|[^\w.])fetch\(/m.test(content);

const run = () => {
  const files = walk(SRC_ROOT);
  const violations = [];

  for (const filePath of files) {
    if (ALLOWLIST.has(filePath)) continue;
    const content = fs.readFileSync(filePath, 'utf8');
    if (hasDirectFetch(content)) {
      violations.push(path.relative(path.join(__dirname, '..'), filePath));
    }
  }

  if (violations.length > 0) {
    console.error('Direct fetch usage detected. Use authFetch instead:');
    for (const file of violations) {
      console.error(`- ${file}`);
    }
    process.exit(1);
  }

  console.log('Auth fetch check passed.');
};

run();
