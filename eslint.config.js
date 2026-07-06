// ESLint flat config (2026-07 audit §1.5). Intentionally lenient to start —
// catches real bugs (undefined vars, broken hooks deps, unreachable code)
// without drowning the repo in style nits. Tighten over time.
import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  { ignores: ['dist/', 'node_modules/', '_MOVE_TO_DRIVE/', 'seed-index.html', 'stress-test/'] },

  // Frontend (browser)
  {
    files: ['src/**/*.{js,jsx}'],
    ...js.configs.recommended,
    plugins: { react, 'react-hooks': reactHooks },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: 'detect' } },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/jsx-uses-vars': 'error',
      'react/jsx-uses-react': 'error',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'react-hooks/exhaustive-deps': 'warn',
      // ERROR, not warn: referencing a const before its declaration compiles
      // fine but throws a TDZ ReferenceError at runtime — this exact bug
      // white-screened production on 2026-07-05 (setView used in a hook deps
      // array above its declaration in Dashboard.jsx).
      'no-use-before-define': ['error', { functions: false, classes: false, variables: true }],
    },
  },

  // Netlify functions (node)
  {
    files: ['netlify/functions/**/*.js', 'scripts/**/*.mjs'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },
];
