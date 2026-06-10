import pluginReactHooks from 'eslint-plugin-react-hooks';

import { kaho } from 'eslint-config-kaho';

export default kaho(
  { ts: false, sorting: true },
  {
    plugins: {
      'react-hooks': pluginReactHooks
    },
    rules: {
      ...pluginReactHooks.configs.recommended.rules,
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
      'sukka/prefer-fetch': 'off',
      'no-restricted-imports': 'off'
    }
  }
);
