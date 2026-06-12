import parser from '@typescript-eslint/parser';

export default [
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    languageOptions: {
      parser,
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module'
      }
    },
    rules: {}
  },
  {
    files: ['src/services/**'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['../hooks/*', '../../hooks/*', 'src/hooks/*', '../components/*', '../../components/*', 'src/components/*', '../screens/*', '../../screens/*', 'src/screens/*'],
            message: 'Layer violation: src/services may NOT import from src/hooks, src/components, src/screens.'
          }
        ]
      }]
    }
  },
  {
    files: ['src/components/**'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['../screens/*', '../../screens/*', 'src/screens/*', '../db/database', '../../db/database', 'src/db/database', '../db/sync-adapter', '../../db/sync-adapter', 'src/db/sync-adapter'],
            message: 'Layer violation: src/components may NOT import from src/screens or src/db.'
          }
        ]
      }]
    }
  },
  {
    files: ['src/db/**'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['../services/*', '../../services/*', 'src/services/*', '../hooks/*', '../../hooks/*', 'src/hooks/*', '../components/*', '../../components/*', 'src/components/*', '../screens/*', '../../screens/*', 'src/screens/*', '../design/*', '../../design/*', 'src/design/*'],
            message: 'Layer violation: src/db may NOT import from anything except src/utils.'
          }
        ]
      }]
    }
  }
];
