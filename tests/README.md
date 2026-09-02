# Behavioral test rules

Behavioral tests must enter through the production call path. Build fixtures at a real system boundary, such as a raw snake_case PostgREST row, OCR text with line geometry, route parameters, an HTTP request, or a database role. Do not hand a scorer, resolver, or screen a polished object that bypasses the mapper responsible for producing it.

Mock only external boundaries that a deterministic local test cannot own, including the network, native camera APIs, and third-party SDKs. Do not mock Woof policy functions such as `catalogVerificationState`, product normalization, scoring, resolver comparison, quota authorization, or redaction.

Every regression test records the bad commit or file version in `docs/QUALITY_REPORT_<date>.md`. A required device, credential, service, or fixture that is unavailable is `NOT-RUN(reason)` or `BLOCKED(reason)`, never a pass.

Test groups:

- `contracts`: deterministic production-module contracts that replace source-string checks.
- `regression`: one test for every shipped defect, including screen-level interaction tests.
- `property`: generated adversarial inputs and invariants.
- `database`: SQL executed against a disposable Postgres cluster created by `npm run test:db`.
- `e2e`: Maestro flows for installed development or release builds.
