# Security Policy

Aizanoi Analytics is a public, static-first web project. Security reports are welcome, especially when they identify a way for public frontend behavior to escape the project's intended browser-only boundaries.

## Supported version

Security fixes target the current `main` branch and the production deployment at [aizanoianalytics.com](https://aizanoianalytics.com).

Older commits, abandoned branches, local modifications and third-party forks are not maintained as supported releases.

## Reporting a vulnerability

Please **do not publish exploit details, credentials, private server information or proof-of-concept payloads in a normal public issue**.

Preferred reporting order:

1. Use GitHub's private **Report a vulnerability** flow if it is available for this repository.
2. If private reporting is not available, open a minimal public issue titled **`Security contact requested`** with no sensitive technical details. A private channel can then be established before disclosure.

A useful private report should include:

- affected URL, file or component;
- impact and realistic attack scenario;
- minimal reproduction steps;
- browser / platform where relevant;
- whether exploitation requires user interaction;
- any suggested mitigation;
- whether the issue appears to affect production or source only.

There is no guaranteed response SLA, but actionable reports will be triaged against the current production architecture.

## Current public security boundary

The production website is intentionally designed to have a small visitor-facing attack surface:

```text
Internet
   |
   +-- HTTPS / Nginx
           |
           +-- static HTML / CSS / JavaScript / assets
```

There is intentionally no public Aizanoi Node/Express application backend.

### Field Terminal

The Field Terminal is a **browser-only virtual shell**:

- fixed in-memory virtual filesystem;
- fixed command set;
- no arbitrary process execution;
- no host or server filesystem access;
- no terminal WebSocket;
- no `/api/terminal/exec` dependency;
- no network primitive required for command execution.

A report showing that Terminal input can execute server commands, access host files or introduce a real application backend would be high priority.

### Local workspace data

Field Archive, Field Notes, Data Lab and related workspace state are designed to stay in browser storage unless the user explicitly exports data.

A report showing unintended exfiltration of local workspace contents is in scope.

### Historical API paths

The public production contract intentionally fails closed:

- historical `/api/chat` → `410 Gone`;
- other historical or unknown `/api/*` paths → `404`;
- the public app does not require a visitor-facing application service.

## In-scope examples

Examples of useful security reports include:

- XSS that executes in a normal user flow;
- CSP bypass with meaningful impact;
- path traversal or unintended file exposure;
- secrets committed to the repository;
- unsafe service-worker behavior that crosses intended origin boundaries;
- unintended external transmission of local Archive / Notes / Data Lab data;
- Terminal behavior that escapes the virtual in-browser environment;
- a frontend change that silently restores a public backend/API dependency;
- dependency or GitHub Actions compromise with a practical repository impact;
- production configuration examples that encourage unsafe deployment.

## Generally out of scope

Unless there is a concrete impact, the following are usually not treated as vulnerabilities:

- self-XSS requiring users to paste arbitrary code into DevTools;
- browser extensions or locally modified browser environments;
- denial-of-service claims that require unrealistic client-side resource use only;
- missing headers that are already provided by production Nginx but cannot be represented by a static development server;
- findings against third-party forks or unofficial deployments;
- generic automated-scanner output without a reproducible security consequence.

## Secrets and production configuration

Never commit:

- `.env` files;
- API keys or access tokens;
- passwords;
- SSH private keys;
- TLS private keys or certificates with private material;
- production backups;
- server snapshots;
- private operational logs containing credentials or sensitive identifiers.

Production TLS keys and server-specific configuration stay outside this public repository. Files under `infra/` are sanitized examples, not the complete live server configuration.

## Security-sensitive contribution rules

Changes touching any of the following require extra review and regression coverage:

- service worker behavior;
- HTML sanitization / rendering of untrusted strings;
- local file import and archive handling;
- virtual terminal execution;
- routing of `/api/*` paths;
- CSP / security headers in deployment examples;
- GitHub Actions permissions or third-party actions;
- any proposal to introduce a visitor-facing backend.

The project prefers **removing unnecessary attack surface** over adding complexity to protect an unnecessary server component.
