/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/test"],
  testMatch: ["**/*.test.ts", "**/*.spec.ts"],
  moduleFileExtensions: ["ts", "js", "json"],
  setupFilesAfterEnv: ["<rootDir>/test/jest.setup.ts"],
  clearMocks: true,
  restoreMocks: true,
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/*.d.ts",
    "!src/**/types.ts",
  ],
  coveragePathIgnorePatterns: [
    "/dist/",
    "/artifacts/",
  ],
};
