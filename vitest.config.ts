import ts from 'typescript';
import { defineConfig, type Plugin } from 'vitest/config';

/**
 * Vite's transformer (oxc) cannot lower TC39 decorators yet. Transpiling with tsc gives tests
 * the same output as `pnpm build`.
 */
function typescriptTranspile(): Plugin {
  return {
    name: 'typescript-transpile',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('.ts') || id.includes('/node_modules/')) return null;
      const { outputText, sourceMapText } = ts.transpileModule(code, {
        fileName: id,
        compilerOptions: {
          target: ts.ScriptTarget.ES2025,
          module: ts.ModuleKind.ESNext,
          verbatimModuleSyntax: true,
          sourceMap: true,
        },
      });
      return { code: outputText, map: sourceMapText ?? null };
    },
  };
}

export default defineConfig({
  plugins: [typescriptTranspile()],
  test: {
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
    },
  },
});
