# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in SF Boost, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, please email: **nocebov@users.noreply.github.com**

Include:
- A description of the vulnerability
- Steps to reproduce
- Potential impact

You should receive a response within 48 hours. We will work with you to understand and address the issue before any public disclosure.

## Scope

SF Boost interacts with:
- The Salesforce session cookie (`sid`) for API authentication
- Salesforce REST and Tooling APIs
- `chrome.storage.sync` and `chrome.storage.local`

Security concerns related to any of these areas are in scope.

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.3.x   | Yes       |
| < 0.3   | No        |
