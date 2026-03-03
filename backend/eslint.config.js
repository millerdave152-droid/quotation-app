const js = require('@eslint/js');

module.exports = [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        // Node.js core globals
        console: 'readonly',
        process: 'readonly',
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        setImmediate: 'readonly',
        clearImmediate: 'readonly',
        Promise: 'readonly',
        // Node 18+ globals
        URL: 'readonly',
        URLSearchParams: 'readonly',
        fetch: 'readonly',
        AbortController: 'readonly',
        AbortSignal: 'readonly',
        Blob: 'readonly',
        FormData: 'readonly',
        Headers: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        structuredClone: 'readonly',
        navigator: 'readonly',
        // Jest globals
        jest: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        fail: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'no-console': 'off',
      'semi': ['error', 'always'],
      'quotes': ['warn', 'single', { avoidEscape: true }],
      'no-case-declarations': 'warn',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-prototype-builtins': 'warn',
      'no-useless-catch': 'warn',
      'no-useless-escape': 'warn',
      'no-dupe-keys': 'warn',
      'no-dupe-class-members': 'warn'
    }
  },
  // Scraper/PDF files run code in browser contexts (Puppeteer evaluate, jsPDF)
  {
    files: [
      'services/PdfService.js',
      'services/pdf/**/*.js',
      'scrapers/**/*.js',
      'scripts/whirlpool-*.js'
    ],
    languageOptions: {
      globals: {
        document: 'readonly',
        window: 'readonly'
      }
    }
  },
  {
    ignores: [
      'node_modules/**',
      'coverage/**',
      'build/**',
      'dist/**',
      'tmp-*.js',
      '_*.js',
      'write-test.js',
      'migrations/**'
    ]
  }
];
