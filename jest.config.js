/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  moduleNameMapper: {
    '^azle$': '<rootDir>/tests/mocks/azle.mock.ts',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/gm-icp-canister.did',
  ],
  coverageDirectory: 'coverage',
  verbose: true,
  transform: {
    // Use ts-jest for TypeScript files
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        target: 'ES2020',
        module: 'CommonJS',
        moduleResolution: 'node',
        esModuleInterop: true,
        strict: false,
        skipLibCheck: true,
      },
    }],
    // Use babel-jest for ESM packages (noble, micro-eth-signer, etc.)
    'node_modules/(@noble|micro-eth-signer|micro-packed|@scure)/.+\\.js$': 'babel-jest',
  },
  // Transform ESM packages to CJS
  transformIgnorePatterns: [
    'node_modules/(?!(@noble|micro-eth-signer|micro-packed|@scure)/)',
  ],
};
