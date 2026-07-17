# Nireco Editor specification relocation

This standalone repository is a migration source, not the owner of the active Nireco Editor architecture.

The authoritative specification is now:

```text
../comet/src/cs/editor/NIRECO.md
```

The direct integration plan is:

```text
../comet/src/cs/editor/nireco-editor.migration.md
```

The previous standalone, split-repository, package, Contract Bundle, Preview, adapter, Mock Service, and cross-repository Gate specification is retained in Git history only. It must not be used to choose current directories, dependencies, public APIs, test runners, delivery gates, or Comet integration boundaries.

Domain behavior remains applicable only where the Comet-owned specification preserves it and the integrated Comet implementation proves it again.
