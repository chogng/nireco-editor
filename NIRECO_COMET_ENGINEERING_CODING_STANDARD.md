# Nireco engineering standard relocation

The standalone Nireco coding standard is retired. It does not govern code integrated into Comet.

Comet's root `AGENTS.md`, applicable nested `AGENTS.md` files, `.github/instructions/**`, package scripts, TypeScript configuration, lint rules, test hosts, and repository verification are the only engineering rules for:

```text
../comet/src/cs/editor/**
../comet/src/cs/platform/storage/**
../comet/src/cs/workbench/contrib/draftEditor/**
```

The previous two-space formatting, kebab-case naming, pnpm/Vitest workflow, standalone layer graph, package code generation, Contract Bundle, Mock/Adapter conformance, and ProseMirror prohibition are retained in Git history only and must not be applied to Comet.
