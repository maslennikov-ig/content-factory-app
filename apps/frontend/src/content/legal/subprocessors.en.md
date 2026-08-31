---
title: Data Recipients
updated: 2026-08-20
language: en
---

# Data Recipients

## 1. What this list is

This lists everyone Content Factory can send data to, and says what reaches
each of them. It was written by reading the code, not by going through service
names, and it changes when the product changes.

If a recipient is not on this list, nothing goes to them.

## 2. How to read the list

Recipients fall into three groups:

- **always active** — involved in running the service without anything from
  you;
- **switched on by your decision** — silent until you or an administrator of
  your workspace configures them;
- **what this product does not have** — things a product like this usually
  carries and this one does not.

Each entry says who they are, what goes to them, why, and where it is processed.

## 3. Always active

### 3.1 Resend — service email delivery

**Who.** An email delivery service, a company in the United States. This
product's mail is sent from the `eu-west-1` region.

**What goes.** The recipient's address, the subject and the body of a service
email. There are three kinds: account activation, password reset, and address
confirmation when a password sign-in is added. The newsletter's own confirmation
emails go through the same key.

**What does not go.** Post content, uploaded files, tokens for connected
platforms, organisation data.

**Why.** Without mail delivery, password reset does not work and an address
cannot become a way to sign in: it only becomes one after the link in the email
is followed. We have no mail server of our own, and a confirmation email sent
from our host would land in spam silently.

### 3.2 Listmonk — the newsletter

**Who.** A newsletter system. It runs on our own host. It is not an outside
company.

**What goes.** The email address of a new account — and only after you
explicitly ticked the box at registration. Without the tick, nothing goes.

**Where.** The address does not leave our host's network. Listmonk sends its
subscription confirmation emails through the same Resend.

**How to unsubscribe.** Using the link in the email itself.

### 3.3 Our own error collector

**Who.** Our error collector, on our own host. Not Sentry.io and not any other
external service.

**What goes.** An event identifier, the time, a level, the environment, the
build version, the service name, the error type and stack frames: file path
relative to the repository root, function name, line and column.

**What does not go.** The user, the request, headers, cookies, IP address,
User-Agent, breadcrumbs, model text, arbitrary fields. The event is rebuilt from
an allowed list of fields rather than forwarded as it came. The browser sends it
to the site's own address, not straight to the collector.

### 3.4 Telegram — sign-in

**Who.** Telegram, if you sign in through it.

**What goes.** The OpenID Connect exchange during sign-in. The button only
appears when Telegram sign-in is configured on this server.

## 4. Switched on by your decision

### 4.1 AI models: OpenAI and OpenRouter

**What goes.** Prompts and post text.

**When.** Only if a workspace configures AI itself: either by entering its own
key, or by being given a quota on a server-managed key by the administrator.
There is no crossing between those two modes: one organisation's keys are never
used for another, and the shared key is never substituted for a missing own key.

**Where the keys live.** An organisation's own keys are stored encrypted in the
database.

### 4.2 Tavily — web search

**What goes.** The search queries the product builds while preparing material.

**When.** Under the same rules as the AI models: only after a workspace
configures it.

### 4.3 Social network APIs

**What goes.** Post content and attached files.

**When.** After you connect a channel and schedule or publish a post.

**Where exactly.** To the network whose channel you connected: Facebook,
Instagram, Threads, LinkedIn, TikTok, Pinterest, Reddit, Slack, Discord,
Telegram, VK, Mastodon, X and other supported platforms. What happens to the
data after that is governed by that platform's rules.

### 4.4 Webhooks and links you supply

**What goes.** If you set up a webhook — the whole post object, to the address
you gave. If you give the product a link to pull content from, the server
fetches it on its own behalf.

**When.** Only on your direct action. You choose the address.

## 5. What this product does not have

The product carries no third-party product analytics at all. Removed along with
their dependencies: PostHog, Plausible, Google Tag Manager, dub, datafa.st, the
Facebook pixel and Facebook server-side events, hosted Sentry, the Chatbase chat
widget, the Polotno image editor, Beehiiv.

Bringing any of them back — as a dependency, an import or a hard-coded address —
fails an automated build check. Live pages load no external script. Fonts are
local. The frontend makes no direct external requests: everything goes through
our own backend.

There are no ad networks. No data is sold. Nothing is shared with data brokers.

## 6. Hosting

The server is in the Netherlands. The database, the files, the newsletter
system and the error collector all run on it. We do not name the hosting
company.

The only recipient outside the Netherlands involved in running the service
without any action from you is Resend. Everything in section 4 is switched on
by your own decision.

## 7. Changes to this list

The list changes as the product changes. The date at the top shows when it last
changed. A new recipient appears on this list before the first data reaches
them.

## 8. Contact

Questions about this list: Telegram bot [@content_factory_adtbot](https://t.me/content_factory_adtbot).
