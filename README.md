# create-stackpress

Developer tool for starting Stackpress applications.

`@cdsiats/create-stackpress` is a TypeScript CLI that scaffolds Stackpress projects from selectable project types and databases.

## Status

Implementation in progress. The product design and implementation contract are frozen in the project agent workspace:

- [Spec index](.agents/specs/00001-create-stackpress-cli/index.md)
- [CLI contract](.agents/specs/00001-create-stackpress-cli/cli-contract.md)
- [Template architecture](.agents/specs/00001-create-stackpress-cli/architecture.md)

## Requirements

- Node.js 22 or newer

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
node dist/cli.js --version
```
