# Quality gate

A feature is not complete until TypeScript, ESLint, domain tests, RTL/LTR task flow, offline persistence and parity against `offline-conta` have been checked.

The first CI attempt failed before dependency installation because setup-node npm caching requires a lockfile. Caching was removed until the first lockfile is generated and committed.
