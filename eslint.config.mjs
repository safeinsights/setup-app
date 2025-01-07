import unusedImports from 'eslint-plugin-unused-imports'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import js from '@eslint/js'
import { FlatCompat } from '@eslint/eslintrc'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all,
})

export default [
    ...compat.extends('eslint:recommended'),
    {
        plugins: {
            'unused-imports': unusedImports,
        },

        languageOptions: {
            globals: {},
        },

        rules: {
            'no-console': [
                'error',
                {
                    allow: ['warn', 'error', 'log'],
                },
            ],

            'no-unused-vars': [
                'error',
                {
                    ignoreRestSiblings: true,
                    varsIgnorePattern: '_+',
                    argsIgnorePattern: '^_',
                },
            ],

            semi: ['error', 'never'],
            'unused-imports/no-unused-imports': 'error',
        },
    },
]
