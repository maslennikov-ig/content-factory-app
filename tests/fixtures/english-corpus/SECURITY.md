# Security Policy

## Status of this product

Content Factory is in development. The repository is private, there is no
public deployment, and no version has been released to users. This policy
describes what to do with a finding today; it will be replaced by a fuller one
when the product is actually reachable over a network.

## Scope

This policy covers the code in this repository.

Content Factory is a fork of [Postiz](https://github.com/gitroomhq/postiz-app).
A vulnerability that also exists upstream is best reported to the upstream
project as well, through
[their advisory system](https://github.com/gitroomhq/postiz-app/security/advisories/new)
— they maintain the code most of this fork still shares.

Out of scope: third-party dependencies, unless this product's own use of the
dependency is independently exploitable, and any infrastructure operated by
someone running their own copy.

## Reporting

Report privately through this repository's
[GitHub Security Advisory system](https://github.com/maslennikov-ig/content-factory-next/security/advisories/new).
Please do not open a public issue for a security finding.

A useful report includes a clear description of the weakness, a proof of
concept where one is possible, the steps to reproduce it, and what an attacker
gains.

## Disclosure

We follow coordinated disclosure: a finding stays private until a fix or a
mitigation exists. Because the product has no users yet, there is no release
timeline to promise and no embargo to negotiate — a fix lands when it is
written.

Content Factory is not a CVE Numbering Authority and does not assign CVE
identifiers. A vulnerability that turns out to be an upstream one may receive a
CVE from the upstream project, which does hold that role.
