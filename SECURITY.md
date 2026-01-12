# Security Policy

We take security seriously and appreciate your help in responsibly disclosing vulnerabilities.

## Reporting a vulnerability
- Email [security@emseepee.dev](mailto:security@emseepee.dev) with a detailed description of the issue, steps to reproduce, and potential impact.
- Please do not open public GitHub issues for security problems.
- We aim to acknowledge new reports within 72 hours.

## Supported versions
- The `main` branch and the latest tagged release receive security fixes.

## Safe configuration defaults
- No tokens or API keys are committed to the repository. Use environment variables and `.env.example` placeholders.
- Disable optional integrations by default in `config.json` unless credentials are provided.
- Use the least-privilege tokens for third-party services when testing.
