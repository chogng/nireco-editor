# Gate 0 Conformance Runner

From a clean repository checkout, run:

```sh
pnpm install --frozen-lockfile
pnpm contract:conformance
```

The runner:

- compiles all Draft 2020-12 schemas with Ajv strict validation;
- registers Nireco canonical URI formats;
- validates every golden fixture and its payload schema;
- recomputes canonical SHA-256 fixture and document hashes;
- validates sample integration traces and catalog/schema enum alignment;
- checks canonical URI negative vectors and ordered manuscript grammar;
- executes the Mock handshake, fixed-Revision read, proposal creation and
  Semantic Edit staging flow against the contract request/result definitions;
- checks capability, scope, policy, idempotency, expiry, and Agent no-bypass
  behavior.

Generated declaration drift is a separate deterministic check:

```sh
pnpm contract:check
```
