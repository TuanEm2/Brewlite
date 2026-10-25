const nextJest = require('next/jest');

const createJestConfig = nextJest({
  dir: __dirname,
});

module.exports = createJestConfig({
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testMatch: ['<rootDir>/**/*.test.ts', '<rootDir>/**/*.test.tsx'],
  clearMocks: true,
});