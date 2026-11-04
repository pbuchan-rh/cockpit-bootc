// ESLint flat config (ESLint 10). It replaces .eslintrc.json and keeps the
// same effective rules, checked rule by rule with --print-config before and
// after the switch (see the commit message):
//
//   eslint:recommended
//   + eslint-config-standard 17.1.0, standard-jsx 11.0.0, standard-react 13.0.0
//   + this project's own settings (last block of rules below)
//
// The three standard configs exist only in eslintrc form, need eslint 8 as a
// peer, and are no longer developed (their successor, neostandard, changes
// the rules), so their rule sets are copied here verbatim from those
// versions. Plugins: eslint-plugin-n, -promise, -react and -react-hooks as
// before; eslint-plugin-import-x stands in for eslint-plugin-import, which
// pins minimatch 3 (see "overrides" in package.json).
//
// minimatch: package.json overrides it to ^11.0.1 everywhere, the first
// release with the GHSA-g3hv-75wg-m249 fix. Two consequences:
//   - Only the six import rules standard uses are loaded, one module each,
//     under the same "import/" names. Loading the whole of import-x would
//     load its no-internal-modules rule, which imports makeRe, a name
//     minimatch 11 no longer exports, and that fails at config load.
//   - eslint-plugin-react 7.37.5 expects minimatch 3's callable export. Its
//     rules call it only to match user-given glob options (jsx-pascal-case
//     "ignore", jsx-handler-names "ignoreComponentNames", ...), and none of
//     the rules below are given any.
//
// eslint-plugin-react 7.37.5 predates ESLint 10. Each of its 38 rules enabled
// here was run alone over src/ under ESLint 10: 36 work, and two crash on
// sourceCode.isSpaceBetweenTokens(), which ESLint 10 removed. Those two,
// jsx-equals-spacing and jsx-tag-spacing, come from @stylistic instead (its
// forks of the same rules, same options); see the end of the rules block.
import stylistic from "@stylistic/eslint-plugin";
import js from "@eslint/js";
import globals from "globals";
import importExport from "eslint-plugin-import-x/rules/export";
import importFirst from "eslint-plugin-import-x/rules/first";
import importNoAbsolutePath from "eslint-plugin-import-x/rules/no-absolute-path";
import importNoDuplicates from "eslint-plugin-import-x/rules/no-duplicates";
import importNoNamedDefault from "eslint-plugin-import-x/rules/no-named-default";
import importNoWebpackLoaderSyntax from "eslint-plugin-import-x/rules/no-webpack-loader-syntax";
import n from "eslint-plugin-n";
import promise from "eslint-plugin-promise";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

// eslint-config-standard 17.1.0
const standardRules = {
    "no-var": "warn",
    "object-shorthand": [
        "warn",
        "properties"
    ],
    "accessor-pairs": [
        "error",
        {
            "setWithoutGet": true,
            "enforceForClassMembers": true
        }
    ],
    "array-bracket-spacing": [
        "error",
        "never"
    ],
    "array-callback-return": [
        "error",
        {
            "allowImplicit": false,
            "checkForEach": false
        }
    ],
    "arrow-spacing": [
        "error",
        {
            "before": true,
            "after": true
        }
    ],
    "block-spacing": [
        "error",
        "always"
    ],
    "brace-style": [
        "error",
        "1tbs",
        {
            "allowSingleLine": true
        }
    ],
    "camelcase": [
        "error",
        {
            "allow": [
                "^UNSAFE_"
            ],
            "properties": "never",
            "ignoreGlobals": true
        }
    ],
    "comma-dangle": [
        "error",
        {
            "arrays": "never",
            "objects": "never",
            "imports": "never",
            "exports": "never",
            "functions": "never"
        }
    ],
    "comma-spacing": [
        "error",
        {
            "before": false,
            "after": true
        }
    ],
    "comma-style": [
        "error",
        "last"
    ],
    "computed-property-spacing": [
        "error",
        "never",
        {
            "enforceForClassMembers": true
        }
    ],
    "constructor-super": "error",
    "curly": [
        "error",
        "multi-line"
    ],
    "default-case-last": "error",
    "dot-location": [
        "error",
        "property"
    ],
    "dot-notation": [
        "error",
        {
            "allowKeywords": true
        }
    ],
    "eol-last": "error",
    "eqeqeq": [
        "error",
        "always",
        {
            "null": "ignore"
        }
    ],
    "func-call-spacing": [
        "error",
        "never"
    ],
    "generator-star-spacing": [
        "error",
        {
            "before": true,
            "after": true
        }
    ],
    "indent": [
        "error",
        2,
        {
            "SwitchCase": 1,
            "VariableDeclarator": 1,
            "outerIIFEBody": 1,
            "MemberExpression": 1,
            "FunctionDeclaration": {
                "parameters": 1,
                "body": 1
            },
            "FunctionExpression": {
                "parameters": 1,
                "body": 1
            },
            "CallExpression": {
                "arguments": 1
            },
            "ArrayExpression": 1,
            "ObjectExpression": 1,
            "ImportDeclaration": 1,
            "flatTernaryExpressions": false,
            "ignoreComments": false,
            "ignoredNodes": [
                "TemplateLiteral *",
                "JSXElement",
                "JSXElement > *",
                "JSXAttribute",
                "JSXIdentifier",
                "JSXNamespacedName",
                "JSXMemberExpression",
                "JSXSpreadAttribute",
                "JSXExpressionContainer",
                "JSXOpeningElement",
                "JSXClosingElement",
                "JSXFragment",
                "JSXOpeningFragment",
                "JSXClosingFragment",
                "JSXText",
                "JSXEmptyExpression",
                "JSXSpreadChild"
            ],
            "offsetTernaryExpressions": true
        }
    ],
    "key-spacing": [
        "error",
        {
            "beforeColon": false,
            "afterColon": true
        }
    ],
    "keyword-spacing": [
        "error",
        {
            "before": true,
            "after": true
        }
    ],
    "lines-between-class-members": [
        "error",
        "always",
        {
            "exceptAfterSingleLine": true
        }
    ],
    "multiline-ternary": [
        "error",
        "always-multiline"
    ],
    "new-cap": [
        "error",
        {
            "newIsCap": true,
            "capIsNew": false,
            "properties": true
        }
    ],
    "new-parens": "error",
    "no-array-constructor": "error",
    "no-async-promise-executor": "error",
    "no-caller": "error",
    "no-case-declarations": "error",
    "no-class-assign": "error",
    "no-compare-neg-zero": "error",
    "no-cond-assign": "error",
    "no-const-assign": "error",
    "no-constant-condition": [
        "error",
        {
            "checkLoops": false
        }
    ],
    "no-control-regex": "error",
    "no-debugger": "error",
    "no-delete-var": "error",
    "no-dupe-args": "error",
    "no-dupe-class-members": "error",
    "no-dupe-keys": "error",
    "no-duplicate-case": "error",
    "no-useless-backreference": "error",
    "no-empty": [
        "error",
        {
            "allowEmptyCatch": true
        }
    ],
    "no-empty-character-class": "error",
    "no-empty-pattern": "error",
    "no-eval": "error",
    "no-ex-assign": "error",
    "no-extend-native": "error",
    "no-extra-bind": "error",
    "no-extra-boolean-cast": "error",
    "no-extra-parens": [
        "error",
        "functions"
    ],
    "no-fallthrough": "error",
    "no-floating-decimal": "error",
    "no-func-assign": "error",
    "no-global-assign": "error",
    "no-implied-eval": "error",
    "no-import-assign": "error",
    "no-invalid-regexp": "error",
    "no-irregular-whitespace": "error",
    "no-iterator": "error",
    "no-labels": [
        "error",
        {
            "allowLoop": false,
            "allowSwitch": false
        }
    ],
    "no-lone-blocks": "error",
    "no-loss-of-precision": "error",
    "no-misleading-character-class": "error",
    "no-prototype-builtins": "error",
    "no-useless-catch": "error",
    "no-mixed-operators": [
        "error",
        {
            "groups": [
                [
                    "==",
                    "!=",
                    "===",
                    "!==",
                    ">",
                    ">=",
                    "<",
                    "<="
                ],
                [
                    "&&",
                    "||"
                ],
                [
                    "in",
                    "instanceof"
                ]
            ],
            "allowSamePrecedence": true
        }
    ],
    "no-mixed-spaces-and-tabs": "error",
    "no-multi-spaces": "error",
    "no-multi-str": "error",
    "no-multiple-empty-lines": [
        "error",
        {
            "max": 1,
            "maxBOF": 0,
            "maxEOF": 0
        }
    ],
    "no-new": "error",
    "no-new-func": "error",
    "no-new-object": "error",
    "no-new-symbol": "error",
    "no-new-wrappers": "error",
    "no-obj-calls": "error",
    "no-octal": "error",
    "no-octal-escape": "error",
    "no-proto": "error",
    "no-redeclare": [
        "error",
        {
            "builtinGlobals": false
        }
    ],
    "no-regex-spaces": "error",
    "no-return-assign": [
        "error",
        "except-parens"
    ],
    "no-self-assign": [
        "error",
        {
            "props": true
        }
    ],
    "no-self-compare": "error",
    "no-sequences": "error",
    "no-shadow-restricted-names": "error",
    "no-sparse-arrays": "error",
    "no-tabs": "error",
    "no-template-curly-in-string": "error",
    "no-this-before-super": "error",
    "no-throw-literal": "error",
    "no-trailing-spaces": "error",
    "no-undef": "error",
    "no-undef-init": "error",
    "no-unexpected-multiline": "error",
    "no-unmodified-loop-condition": "error",
    "no-unneeded-ternary": [
        "error",
        {
            "defaultAssignment": false
        }
    ],
    "no-unreachable": "error",
    "no-unreachable-loop": "error",
    "no-unsafe-finally": "error",
    "no-unsafe-negation": "error",
    "no-unused-expressions": [
        "error",
        {
            "allowShortCircuit": true,
            "allowTernary": true,
            "allowTaggedTemplates": true
        }
    ],
    "no-unused-vars": [
        "error",
        {
            "args": "none",
            "caughtErrors": "none",
            "ignoreRestSiblings": true,
            "vars": "all"
        }
    ],
    "no-use-before-define": [
        "error",
        {
            "functions": false,
            "classes": false,
            "variables": false
        }
    ],
    "no-useless-call": "error",
    "no-useless-computed-key": "error",
    "no-useless-constructor": "error",
    "no-useless-escape": "error",
    "no-useless-rename": "error",
    "no-useless-return": "error",
    "no-void": "error",
    "no-whitespace-before-property": "error",
    "no-with": "error",
    "object-curly-newline": [
        "error",
        {
            "multiline": true,
            "consistent": true
        }
    ],
    "object-curly-spacing": [
        "error",
        "always"
    ],
    "object-property-newline": [
        "error",
        {
            "allowMultiplePropertiesPerLine": true
        }
    ],
    "one-var": [
        "error",
        {
            "initialized": "never"
        }
    ],
    "operator-linebreak": [
        "error",
        "after",
        {
            "overrides": {
                "?": "before",
                ":": "before",
                "|>": "before"
            }
        }
    ],
    "padded-blocks": [
        "error",
        {
            "blocks": "never",
            "switches": "never",
            "classes": "never"
        }
    ],
    "prefer-const": [
        "error",
        {
            "destructuring": "all"
        }
    ],
    "prefer-promise-reject-errors": "error",
    "prefer-regex-literals": [
        "error",
        {
            "disallowRedundantWrapping": true
        }
    ],
    "quote-props": [
        "error",
        "as-needed"
    ],
    "quotes": [
        "error",
        "single",
        {
            "avoidEscape": true,
            "allowTemplateLiterals": false
        }
    ],
    "rest-spread-spacing": [
        "error",
        "never"
    ],
    "semi": [
        "error",
        "never"
    ],
    "semi-spacing": [
        "error",
        {
            "before": false,
            "after": true
        }
    ],
    "space-before-blocks": [
        "error",
        "always"
    ],
    "space-before-function-paren": [
        "error",
        "always"
    ],
    "space-in-parens": [
        "error",
        "never"
    ],
    "space-infix-ops": "error",
    "space-unary-ops": [
        "error",
        {
            "words": true,
            "nonwords": false
        }
    ],
    "spaced-comment": [
        "error",
        "always",
        {
            "line": {
                "markers": [
                    "*package",
                    "!",
                    "/",
                    ",",
                    "="
                ]
            },
            "block": {
                "balanced": true,
                "markers": [
                    "*package",
                    "!",
                    ",",
                    ":",
                    "::",
                    "flow-include"
                ],
                "exceptions": [
                    "*"
                ]
            }
        }
    ],
    "symbol-description": "error",
    "template-curly-spacing": [
        "error",
        "never"
    ],
    "template-tag-spacing": [
        "error",
        "never"
    ],
    "unicode-bom": [
        "error",
        "never"
    ],
    "use-isnan": [
        "error",
        {
            "enforceForSwitchCase": true,
            "enforceForIndexOf": true
        }
    ],
    "valid-typeof": [
        "error",
        {
            "requireStringLiterals": true
        }
    ],
    "wrap-iife": [
        "error",
        "any",
        {
            "functionPrototypeMethods": true
        }
    ],
    "yield-star-spacing": [
        "error",
        "both"
    ],
    "yoda": [
        "error",
        "never"
    ],
    "import/export": "error",
    "import/first": "error",
    "import/no-absolute-path": [
        "error",
        {
            "esmodule": true,
            "commonjs": true,
            "amd": false
        }
    ],
    "import/no-duplicates": "error",
    "import/no-named-default": "error",
    "import/no-webpack-loader-syntax": "error",
    "n/handle-callback-err": [
        "error",
        "^(err|error)$"
    ],
    "n/no-callback-literal": "error",
    "n/no-deprecated-api": "error",
    "n/no-exports-assign": "error",
    "n/no-new-require": "error",
    "n/no-path-concat": "error",
    "n/process-exit-as-throw": "error",
    "promise/param-names": "error"
};

// eslint-config-standard-jsx 11.0.0
const standardJsxRules = {
    "jsx-quotes": [
        "error",
        "prefer-single"
    ],
    "react/jsx-boolean-value": "error",
    "react/jsx-closing-bracket-location": [
        "error",
        "tag-aligned"
    ],
    "react/jsx-closing-tag-location": "error",
    "react/jsx-curly-brace-presence": [
        "error",
        {
            "props": "never",
            "children": "never"
        }
    ],
    "react/jsx-curly-newline": [
        "error",
        {
            "multiline": "consistent",
            "singleline": "consistent"
        }
    ],
    "react/jsx-curly-spacing": [
        "error",
        {
            "attributes": {
                "when": "never",
                "allowMultiline": true
            },
            "children": {
                "when": "never",
                "allowMultiline": true
            }
        }
    ],
    "react/jsx-equals-spacing": [
        "error",
        "never"
    ],
    "react/jsx-first-prop-new-line": [
        "error",
        "multiline-multiprop"
    ],
    "react/jsx-fragments": [
        "error",
        "syntax"
    ],
    "react/jsx-handler-names": "error",
    "react/jsx-indent": [
        "error",
        2,
        {
            "checkAttributes": false,
            "indentLogicalExpressions": true
        }
    ],
    "react/jsx-indent-props": [
        "error",
        2
    ],
    "react/jsx-key": [
        "error",
        {
            "checkFragmentShorthand": true
        }
    ],
    "react/jsx-no-comment-textnodes": "error",
    "react/jsx-no-duplicate-props": "error",
    "react/jsx-no-target-blank": [
        "error",
        {
            "enforceDynamicLinks": "always"
        }
    ],
    "react/jsx-no-undef": [
        "error",
        {
            "allowGlobals": true
        }
    ],
    "react/jsx-pascal-case": [
        "error",
        {
            "allowAllCaps": false
        }
    ],
    "react/jsx-props-no-multi-spaces": "error",
    "react/jsx-tag-spacing": [
        "error",
        {
            "closingSlash": "never",
            "beforeSelfClosing": "always",
            "afterOpening": "never",
            "beforeClosing": "never"
        }
    ],
    "react/jsx-uses-react": "error",
    "react/jsx-uses-vars": "error",
    "react/jsx-wrap-multilines": [
        "error",
        {
            "declaration": "parens-new-line",
            "assignment": "parens-new-line",
            "return": "parens-new-line",
            "arrow": "ignore",
            "condition": "ignore",
            "logical": "ignore",
            "prop": "ignore"
        }
    ],
    "react/no-children-prop": "error",
    "react/no-danger-with-children": "error",
    "react/no-deprecated": "error",
    "react/no-direct-mutation-state": "error",
    "react/no-find-dom-node": "error",
    "react/no-is-mounted": "error",
    "react/no-string-refs": [
        "error",
        {
            "noTemplateLiterals": true
        }
    ],
    "react/no-unescaped-entities": [
        "error",
        {
            "forbid": [
                ">",
                "}"
            ]
        }
    ],
    "react/no-render-return-value": "error",
    "react/require-render-return": "error",
    "react/self-closing-comp": "error"
};

// eslint-config-standard-react 13.0.0
const standardReactRules = {
    "react/jsx-no-bind": [
        "error",
        {
            "allowArrowFunctions": true,
            "allowBind": false,
            "ignoreRefs": true
        }
    ],
    "react/no-did-update-set-state": "error",
    "react/no-unknown-property": "error",
    "react/no-unused-prop-types": "error",
    "react/prop-types": "error",
    "react/react-in-jsx-scope": "error",
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "warn"
};

// This project (formerly .eslintrc.json "rules").
const projectRules = {
    "indent": [
        "error",
        4,
        {
            "ObjectExpression": "first",
            "CallExpression": {
                "arguments": "first"
            },
            "MemberExpression": 2,
            "ignoredNodes": [
                "JSXAttribute"
            ]
        }
    ],
    "newline-per-chained-call": [
        "error",
        {
            "ignoreChainWithDepth": 2
        }
    ],
    "no-var": "error",
    "lines-between-class-members": [
        "error",
        "always",
        {
            "exceptAfterSingleLine": true
        }
    ],
    "prefer-promise-reject-errors": [
        "error",
        {
            "allowEmptyReject": true
        }
    ],
    "react/jsx-indent": [
        "error",
        4
    ],
    "semi": [
        "error",
        "always",
        {
            "omitLastInOneLineBlock": true
        }
    ],
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "error",
    "camelcase": "off",
    "comma-dangle": "off",
    "curly": "off",
    "jsx-quotes": "off",
    "key-spacing": "off",
    "no-console": "off",
    "quotes": "off",
    "react/jsx-curly-spacing": "off",
    "react/jsx-indent-props": "off",
    "react/jsx-no-useless-fragment": "error",
    "react/jsx-no-bind": "off",
    "react/jsx-curly-newline": "off",
    "no-template-curly-in-string": "off",
    "react/prop-types": "off",
    "space-before-function-paren": "off"
};

const tsFiles = ["**/*.ts", "**/*.tsx"];

// The import rules standard enables, from eslint-plugin-import-x (see top).
const importRules = {
    meta: { name: "eslint-plugin-import-x (standard's rules)" },
    rules: {
        export: importExport,
        first: importFirst,
        "no-absolute-path": importNoAbsolutePath,
        "no-duplicates": importNoDuplicates,
        "no-named-default": importNoNamedDefault,
        "no-webpack-loader-syntax": importNoWebpackLoaderSyntax,
    },
};

export default [
    js.configs.recommended,
    {
        files: ["**/*.js", "**/*.jsx", "**/*.ts", "**/*.tsx"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            parserOptions: { ecmaFeatures: { jsx: true } },
            globals: {
                ...globals.browser,
                ...globals.node,
                ...globals.es2021,
                document: "readonly",
                navigator: "readonly",
                window: "readonly",
                require: "readonly",
                module: "readonly",
            },
        },
        plugins: {
            import: importRules,
            n,
            promise,
            react,
            "react-hooks": reactHooks,
            "@stylistic": stylistic,
        },
        settings: {
            // "detect" calls context.getFilename(), which ESLint 10 removed;
            // this is the version it detected under ESLint 8 (package.json).
            react: { version: "18.3.1" },
            linkComponents: ["Link"],
        },
        rules: {
            // In ESLint 8's eslint:recommended, dropped from it since; kept.
            "no-extra-semi": "error",
            "no-inner-declarations": "error",
            ...standardRules,
            ...standardJsxRules,
            ...standardReactRules,
            ...projectRules,
            // ESLint 10: from @stylistic, with standard-jsx's options (see top).
            "react/jsx-equals-spacing": "off",
            "react/jsx-tag-spacing": "off",
            "@stylistic/jsx-equals-spacing": standardJsxRules["react/jsx-equals-spacing"],
            "@stylistic/jsx-tag-spacing": standardJsxRules["react/jsx-tag-spacing"],
        },
    },
    // TypeScript files (none in src/ today): typescript-eslint's recommended
    // set, type-aware through tsconfig.json, as the old "overrides" block had.
    ...tseslint.configs.recommended.map(config => ({ ...config, files: tsFiles })),
    {
        files: tsFiles,
        languageOptions: {
            parserOptions: { project: ["./tsconfig.json"] },
        },
    },
];
