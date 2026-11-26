import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const firebaseRulesPlugin = require('@firebase/eslint-plugin-security-rules');

export default [
  {
    ...firebaseRulesPlugin.flatRecommended,
    files: ['**/*.rules'],
  },
];
