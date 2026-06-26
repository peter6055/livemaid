# Pre-Push Validation

Before commit or push, run:

```bash
npm run prepush
```

Steps: `typecheck` → `lint` → `format:check` → `test` → `build`.

Fix all failures before pushing. Do not bypass.
