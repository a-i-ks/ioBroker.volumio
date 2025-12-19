import config from '@iobroker/eslint-config';

export default [
    ...config,

    {
        // Ignore patterns (migrated from .eslintignore)
        ignores: [
            'build/',
            '**/.eslintrc.js',
            'admin/words.js',
        ],
    },

    {
        languageOptions: {
            parserOptions: {
                projectService: {
                    allowDefaultProject: ['*.js', '*.mjs'],
                },
                tsconfigRootDir: import.meta.dirname,
            },
        },

        rules: {
            // Custom rules
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-unused-vars': [
                'error',
                {
                    ignoreRestSiblings: true,
                    argsIgnorePattern: '^_',
                    caughtErrorsIgnorePattern: '^_',
                },
            ],
            // Disable rules that are too strict for ioBroker adapters
            '@typescript-eslint/no-floating-promises': 'off',
            '@typescript-eslint/require-await': 'off',
            '@typescript-eslint/restrict-template-expressions': 'off',
            'jsdoc/require-param-description': 'off',
        },
    },

    {
        files: ['**/*.test.ts'],
        rules: {
            '@typescript-eslint/explicit-function-return-type': 'off',
        },
    },
];
