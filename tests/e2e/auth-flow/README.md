# E2E Auth Flow Tests

This directory contains end-to-end integration tests for the complete multi-tenant authorization flow.

## Test Coverage

- **Complete Auth Flow**: login → JWT issuance → middleware resolution → route handler → permission check → RLS query → response
- **Role-Based Access**: PLATFORM_ADMIN, RT_ADMIN, RESIDENT user flows
- **Context Switching**: Tenant and OrgUnit context switches
- **Token Lifecycle**: Token version invalidation, refresh token rotation
- **Suspended Membership**: Access to safety vs. normal routes

## Directory Structure

```
tests/e2e/auth-flow/
├── README.md                 # This file
├── test-helpers.ts           # Test helper utilities
├── suspended-membership.test.ts  # Suspended membership access tests
├── setup/
│   ├── test-database.ts      # Test database utilities
│   ├── auth-token-helper.ts  # JWT token generation helpers
│   ├── test-fixtures.ts      # User and membership fixtures
│   └── cleanup.ts            # Test isolation utilities
├── flows/
│   ├── platform-admin.test.ts
│   ├── rt-admin.test.ts
│   ├── resident.test.ts
│   ├── context-switch.test.ts
│   ├── token-invalidation.test.ts
│   ├── refresh-token.test.ts
│   └── suspended-membership.test.ts
└── helpers/
    └── request-builder.ts    # HTTP request builders
```

## Requirements Validated

- **Requirement 13.1**: E2E test infrastructure setup
- **Requirement 13.2**: PLATFORM_ADMIN role flow test
- **Requirement 13.3**: RT_ADMIN role flow test
- **Requirement 13.4**: RESIDENT role flow test
- **Requirement 13.5**: Context switch tests (tenant)
- **Requirement 13.6**: Context switch tests (OrgUnit)
- **Requirement 13.7**: Token version invalidation test
- **Requirement 13.8**: Refresh token rotation test
- **Requirement 13.9**: Suspended membership access tests

## Running Tests

```bash
# Run all auth flow E2E tests
npm run test:e2e -- tests/e2e/auth-flow

# Run specific test file
npm run test:e2e -- tests/e2e/auth-flow/flows/platform-admin.test.ts

# Run with coverage
npm run test:e2e -- --coverage tests/e2e/auth-flow
```

## Test Data

Tests use isolated test data that does not interfere with development data.
All test data is prefixed with `test-e2e-` to ensure isolation.

See `setup/test-fixtures.ts` for available fixtures.
