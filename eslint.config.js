import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores([
    'dist/**',
    '.claude/**',
    '.backups/**',
    '.vercel/**',
    'node_modules/**',
    'test-supabase-vite/**',
    'tmp/**',
    'output/**',
    'android-payment-companion/**',
  ]),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      // Existing debt remains visible but does not make the baseline unusable.
      // `npm run lint:ci` pins the current warning count so new debt fails CI.
      'no-unused-vars': ['warn', { varsIgnorePattern: '^[A-Z_]' }],
      'no-empty': 'warn',
      'no-case-declarations': 'warn',
      'no-useless-escape': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': 'warn',
    },
  },
  {
    files: ['main.js', 'vite.config.js', 'src/tailwind.config.js', 'scripts/**/*.{js,mjs}'],
    languageOptions: { globals: globals.node },
  },
])
