export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
  testTimeout: 30000,
  modulePathIgnorePatterns: ['<rootDir>/dist/'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      diagnostics: {
        // Suprime aviso ts151002: "não é possível compilar namespaces quando module=CommonJS"
        ignoreDiagnostics: [151002]
      }
    }]
  }
};
