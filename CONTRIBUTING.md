# Contributing to EmSeePee Gateway

Thanks for your interest in contributing! This guide helps you set up your environment and open high-quality pull requests.

## Development workflow
1. Fork and clone the repository.
2. Install dependencies with [pnpm](https://pnpm.io/):
   ```bash
   pnpm install --frozen-lockfile
   ```
3. Build the project:
   ```bash
   pnpm run build
   ```
4. Run the test suite:
   ```bash
   pnpm test
   ```
5. Create a feature branch, commit your changes, and open a pull request.

## Coding standards
- This repository uses TypeScript and Vitest; prefer small, focused modules with clear interfaces.
- Keep code formatted with the default Node/TypeScript conventions (see `.editorconfig`).
- Add unit tests for any new code paths and update existing tests when behavior changes.

## Pull request checklist
- Include a clear description of the change and motivation.
- Add or update documentation in `README.md` or `docs/` when behavior changes.
- Ensure `pnpm run build` and `pnpm test` succeed locally.
- Avoid committing secrets or sensitive data; use environment variables and `.env.example` for placeholders.

## Reporting security issues
Please **do not** open public issues for security problems. Instead, email [security@emseepee.dev](mailto:security@emseepee.dev) with details so we can respond quickly.
