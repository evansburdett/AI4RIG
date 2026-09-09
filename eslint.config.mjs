import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      'data/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-console': 'off',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
    },
  },

  // --- Project rules that back the PR review checklist -------------------
  // These exist so a reviewer does not have to catch them by eye.

  // The API address lives in .env and is read in exactly one module.
  // Anywhere else, a literal localhost / 127.0.0.1 / :3001 is the bug that
  // breaks host mode at RIG.
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    ignores: ['apps/web/src/api.ts'],
    languageOptions: {
      globals: { ...globals.browser },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "Literal[value=/localhost|127\\.0\\.0\\.1|0\\.0\\.0\\.0|:3001/]",
          message:
            'Do not hardcode the API address. Import the client from src/api.ts, which reads VITE_API_BASE_URL.',
        },
        {
          selector: "MemberExpression[object.type='MetaProperty'] > Identifier[name='env']",
          message:
            'Read import.meta.env only in src/api.ts so there is one place that knows where the API lives.',
        },
      ],
    },
  },

  // The calculation engine is pure: no database, no network, no filesystem.
  // A caller reads the data and passes it in.
  {
    files: ['packages/engine/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@ai4rig/db',
                'better-sqlite3',
                'node:fs',
                'node:fs/*',
                'fs',
                'fs/*',
                'node:http',
                'node:https',
                'http',
                'https',
                'node:net',
                'net',
                'express',
              ],
              message:
                'The engine does no I/O — no database, no network, no filesystem. Callers read data and pass it in. See docs/decisions/0005-engine-does-no-io.md',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'The engine does no I/O. See docs/decisions/0005-engine-does-no-io.md' },
      ],
    },
  },

  // Plain Node scripts — no TypeScript program behind them.
  {
    files: ['scripts/**/*.mjs', '*.config.mjs'],
    ...tseslint.configs.disableTypeChecked,
  },
);
