import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

const typedFiles = ['src/**/*.ts', 'tests/**/*.ts', 'vitest.config.ts'];
const nodeScriptFiles = ['*.config.{js,mjs,cjs}', 'scripts/**/*.{js,mjs,cjs}'];
const browserSpikeFiles = ['spikes/**/*.js'];

const typeCheckedConfigs = [
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
].map((config) => ({
  ...config,
  files: typedFiles,
}));

const forbiddenRuntimeImports = [
  '@comet/*',
  '@langchain/*',
  '@openai/agents*',
  'block-suite*',
  'blocksuite*',
  'ckeditor*',
  'langchain*',
  'lexical*',
  'openai',
  'prosemirror*',
  'slate*',
  'textbus*',
];

const forbiddenCoreImports = [
  ...forbiddenRuntimeImports,
  'assert',
  'assert/*',
  'buffer',
  'buffer/*',
  'child_process',
  'child_process/*',
  'cluster',
  'cluster/*',
  'crypto',
  'crypto/*',
  'dgram',
  'dgram/*',
  'dns',
  'dns/*',
  'fs',
  'fs/*',
  'http',
  'http/*',
  'https',
  'https/*',
  'module',
  'module/*',
  'net',
  'net/*',
  'node:*',
  'os',
  'os/*',
  'path',
  'path/*',
  'perf_hooks',
  'perf_hooks/*',
  'process',
  'process/*',
  'stream',
  'stream/*',
  'timers',
  'timers/*',
  'tls',
  'tls/*',
  'url',
  'url/*',
  'util',
  'util/*',
  'worker_threads',
  'worker_threads/*',
  'zlib',
  'zlib/*',
];

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/.vitest/**',
      '**/generated/**',
      '**/generated-types/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  {
    ...eslint.configs.recommended,
    files: nodeScriptFiles,
    languageOptions: {
      ecmaVersion: 'latest',
      globals: {
        Buffer: 'readonly',
        URL: 'readonly',
        clearInterval: 'readonly',
        clearTimeout: 'readonly',
        console: 'readonly',
        process: 'readonly',
        setInterval: 'readonly',
        setTimeout: 'readonly',
        structuredClone: 'readonly',
      },
      sourceType: 'module',
    },
    rules: {
      ...eslint.configs.recommended.rules,
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-warning-comments': [
        'error',
        {
          location: 'anywhere',
          terms: ['fixme', 'todo'],
        },
      ],
    },
  },
  {
    ...eslint.configs.recommended,
    files: browserSpikeFiles,
    languageOptions: {
      ecmaVersion: 'latest',
      globals: {
        ClipboardEvent: 'readonly',
        CompositionEvent: 'readonly',
        DataTransfer: 'readonly',
        DOMParser: 'readonly',
        Error: 'readonly',
        HTMLButtonElement: 'readonly',
        HTMLElement: 'readonly',
        HTMLOListElement: 'readonly',
        InputEvent: 'readonly',
        JSON: 'readonly',
        MutationObserver: 'readonly',
        Node: 'readonly',
        Number: 'readonly',
        Object: 'readonly',
        Promise: 'readonly',
        String: 'readonly',
        document: 'readonly',
        fetch: 'readonly',
        navigator: 'readonly',
        queueMicrotask: 'readonly',
        setTimeout: 'readonly',
        window: 'readonly',
      },
      sourceType: 'module',
    },
    rules: {
      ...eslint.configs.recommended.rules,
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-warning-comments': [
        'error',
        {
          location: 'anywhere',
          terms: ['fixme', 'todo'],
        },
      ],
    },
  },
  ...typeCheckedConfigs,
  {
    files: typedFiles,
    languageOptions: {
      parserOptions: {
        project: [
          './tsconfig.core.json',
          './tsconfig.node.json',
          './tsconfig.browser.json',
          './tsconfig.test.json',
        ],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-exports': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          fixStyle: 'separate-type-imports',
          prefer: 'type-imports',
        },
      ],
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-import-type-side-effects': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-unnecessary-type-arguments': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/only-throw-error': 'error',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        {
          allowNumber: true,
        },
      ],
      '@typescript-eslint/switch-exhaustiveness-check': [
        'error',
        {
          allowDefaultCaseForExhaustiveSwitch: false,
          considerDefaultExhaustiveForUnions: false,
          requireDefaultForNonUnion: true,
        },
      ],
      complexity: ['error', 12],
      '@typescript-eslint/no-empty-function': [
        'error',
        {
          allow: ['methods'],
        },
      ],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-restricted-imports': [
        'error',
        {
          patterns: forbiddenRuntimeImports,
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          message: 'Double assertions hide an unvalidated boundary.',
          selector: 'TSAsExpression > TSAsExpression',
        },
      ],
      'no-warning-comments': [
        'error',
        {
          location: 'anywhere',
          terms: ['fixme'],
        },
      ],
    },
  },
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-console': 'error',
    },
  },
  {
    files: [
      'src/base/**/*.ts',
      'src/model/**/*.ts',
      'src/proposal/**/*.ts',
      'src/workspace/**/*.ts',
    ],
    rules: {
      'no-restricted-globals': [
        'error',
        {
          message: 'Core receives time through an injected Clock.',
          name: 'Date',
        },
        {
          message: 'Core must not access ambient randomness.',
          name: 'crypto',
        },
        {
          message: 'Core must not access the network.',
          name: 'fetch',
        },
        {
          message: 'Core must not access browser networking.',
          name: 'WebSocket',
        },
        {
          message: 'Core must not access browser networking.',
          name: 'XMLHttpRequest',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: forbiddenCoreImports,
        },
      ],
      'no-restricted-properties': [
        'error',
        {
          message: 'Core receives randomness through an injected allocator.',
          object: 'Math',
          property: 'random',
        },
        {
          message: 'Core receives monotonic time through an injected Clock.',
          object: 'performance',
          property: 'now',
        },
        {
          message: 'Environment access belongs in a composition root.',
          object: 'process',
          property: 'env',
        },
      ],
    },
  },
];
