module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  parser: '@typescript-eslint/parser',
  plugins: ['import', '@typescript-eslint'],
  settings: {
    'import/resolver': {
      node: {
        extensions: ['.js', '.jsx', '.ts', '.tsx'],
      },
    },
  },
  rules: {
    'import/no-cycle': 'error',
    'no-restricted-imports': ['error', {
      patterns: [
        {
          group: ['../hooks/*', '../../hooks/*', '../components/*', '../../components/*', '../screens/*', '../../screens/*'],
          message: 'Layer violation: src/services may NOT import from src/hooks, src/components, src/screens.'
        },
        {
          group: ['../screens/*', '../../screens/*', '../db/*', '../../db/*'],
          message: 'Layer violation: src/components may NOT import from src/screens or src/db.'
        },
        {
          group: ['../services/*', '../../services/*', '../hooks/*', '../../hooks/*', '../components/*', '../../components/*', '../screens/*', '../../screens/*', '../design/*', '../../design/*'],
          message: 'Layer violation: src/db may NOT import from anything except src/utils.'
        }
      ]
    }]
  },
  overrides: [
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
              group: ['../screens/*', '../../screens/*', 'src/screens/*', '../db/*', '../../db/*', 'src/db/*'],
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
  ]
};
