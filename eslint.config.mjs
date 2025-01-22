import unusedImports from 'eslint-plugin-unused-imports'
import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
    eslint.configs.recommended,
    tseslint.configs.recommended,
    {
        plugins: {
            'unused-imports': unusedImports,
        },
        languageOptions: {
            globals: {},
        },

        rules: {

            '@typescript-eslint/no-unused-vars': [
                'error',
                {
                    ignoreRestSiblings: true,
                    varsIgnorePattern: '^_',
                    argsIgnorePattern: '^_',
                },
            ],

            semi: ['error', 'never'],
            'unused-imports/no-unused-imports': 'error',
            '@typescript-eslint/no-explicit-any': 'off',
        },
    }
)
