# Reference corpus identity history

This directory is append-only. When the active corpus profile or generator version
changes, copy the previous `performance/reference-corpus-lock.json` here without
changing its bytes. The required filename is:

```text
<profileId>--generator-<generatorVersion>.json
```

CI compares every previously committed JSON artifact byte-for-byte with the pull
request base. Rewriting or deleting an old corpus identity fails
`pnpm check:reference-corpus-history`.
