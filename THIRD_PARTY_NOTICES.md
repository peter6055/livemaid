# Third-Party Notices

This repository may include third-party software components, code snippets,
assets, or dependencies that are licensed separately from the LiveMaid Source
Available License 1.0 (LSAL-1.0).

## License precedence for third-party components

Third-party code included in or distributed with this repository remains owned
by its original authors and is governed exclusively by its original license
terms. In the event of any conflict between the LSAL-1.0 and a third-party
component's license for that component, the third-party license terms prevail
for that component.

## Third-party components

The table below lists third-party components used directly in this repository.
Maintainers: please keep this list up to date as dependencies are added or
updated.

| Component | Source | Version | License | Copyright |
|-----------|--------|---------|---------|-----------|
| _(none listed yet — see `package.json` and `package-lock.json` for npm dependencies)_ | | | | |

### How to add an entry

For each directly bundled third-party component (not npm transitive
dependencies, which are tracked separately via `package-lock.json`), add a row
to the table above with:

- **Component**: library or asset name.
- **Source**: upstream URL (e.g., GitHub repository).
- **Version**: version number or commit SHA.
- **License**: SPDX license identifier (e.g., `MIT`, `Apache-2.0`).
- **Copyright**: the copyright line from the component's own license or
  `NOTICE` file.

## npm dependencies

Runtime and development dependencies are declared in `package.json` and locked
in `package-lock.json`. Each package is distributed under its own license as
declared in its `package.json` `"license"` field. You can review all
dependency licenses by running:

```bash
npx license-checker --summary
```
