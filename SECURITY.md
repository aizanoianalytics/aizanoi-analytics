# Security Policy

Aizanoi is a public, static-first web project. Security fixes target the current `main` branch and the production deployment at [aizanoianalytics.com](https://aizanoianalytics.com). Older commits, abandoned branches, local modifications and third-party forks are unsupported.

## Reporting a vulnerability

Do not publish exploit details, credentials, private server information or proof-of-concept payloads in a normal public issue.

1. Prefer GitHub's private **Report a vulnerability** flow when available.
2. Otherwise open a minimal issue titled **`Security contact requested`** with no sensitive technical details so a private channel can be established.

Include the affected URL/component, realistic impact, minimal reproduction, browser/platform, required user interaction, suggested mitigation and whether production or source is affected. There is no guaranteed response SLA.

## Public security boundary

```text
Internet
   |
   +-- HTTPS / Nginx
           |
           +-- static HTML / CSS / JavaScript / JSON / assets
```

There is no public Aizanoi Node/Express backend, no public remote shell, no terminal WebSocket and no general visitor API. Historical `/api/chat` returns `410 Gone`; other `/api/*` paths return `404`.

The former browser research Workbench is retired. Its local archive, notes, data tools, source reader, artifact viewer, projects, virtual terminal and monitor are absent from the supported frontend. Reports should be evaluated against current reachable code, while any change that accidentally restores these removed surfaces is security-relevant.

The service worker is same-origin, ignores `/api/*`, removes superseded Aizanoi caches, bounds runtime entries and provides static offline fallback. It is not a data synchronization mechanism.

## In scope

Useful reports include:

- XSS in a normal user flow or a meaningful CSP bypass;
- path traversal or unintended file exposure;
- secrets committed to the repository;
- service worker behavior that escapes same-origin/static-delivery boundaries;
- a frontend change that restores a public backend, remote shell or retired Workbench surface;
- dependency or GitHub Actions compromise with practical impact;
- deployment examples that encourage unsafe configuration.

## Generally out of scope

Without concrete impact, self-XSS requiring DevTools paste, browser extensions, modified local environments, unrealistic client-only denial of service, findings against third-party forks and generic scanner output are usually out of scope. Missing-header reports must account for headers emitted by production Nginx rather than the simple local static server.

## Secrets and production configuration

Never commit `.env` files, credentials, API tokens, passwords, SSH/TLS private keys, production backups, server snapshots or sensitive operational logs. Production TLS keys and server-specific configuration remain outside this repository. `infra/` contains sanitized examples, not live configuration.

## Security-sensitive changes

Extra review and regression coverage are required for:

- service worker install, activation, fetch and cache behavior;
- untrusted-string HTML rendering;
- `/api/*` routing;
- CSP and other security headers;
- GitHub Actions permissions or third-party actions;
- any proposal for a visitor-facing backend;
- any reintroduction of retired local-tool or shell behavior.

Prefer removing unnecessary attack surface over protecting an unnecessary server component.
