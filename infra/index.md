# Infrastructure Index

Scope: sanitized deployment and infrastructure references.

## Before changing infrastructure

- GitHub remains the source of truth.
- Read `../ARCHITECTURE.md`, `../SECURITY.md` and `../docs/HERMES_OPERATIONS.md` when deployment/operator behavior is involved.
- Production rollout must use an approved exact Git SHA and a known rollback point.

## Boundary

Never commit secrets, credentials, private keys, TLS material, backups or personal data here. Infrastructure references must remain safe to store in Git.

Do not use this area to introduce a general visitor-facing backend unless the owner explicitly changes the architecture contract.