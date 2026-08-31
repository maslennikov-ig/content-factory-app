---
title: Privacy Notice
updated: 2026-08-27
language: en
---

# Privacy Notice

This page says what personal data Content Factory (factory.aidevteam.ru)
collects, why it needs it, who else sees it, and how to get rid of it. It is
short because there is not much data.

## 1. Who is responsible and how to reach them

The operator of personal data is OOO «МЕГАКАМПУС» (LLC MEGAKAMPUS), OGRN
1107746107204, INN 7719743262, registered at 105318, Moscow, ul. Izmaylovskiy
val 2, floor 3, premises I, room 12G, Russia. The operator decides why and how
personal data is processed in Content Factory at factory.aidevteam.ru and is
responsible for that processing.

The quickest channel is the Telegram bot [@content_factory_adtbot](https://t.me/content_factory_adtbot); the same bot is support. A formal
request about your rights as a data subject goes to info@megacampus.com, or by
post to the address above. A request about whether your data is processed is
answered within 10 working days of arrival; that term may be extended by no more
than 5 working days, and we will tell you why.

## 2. What is collected

### 2.1 Registration and account

When you create an account, the following is stored:

- your email address;
- your password — not the password itself, but a bcrypt hash of it. The
  password cannot be recovered from the hash, and we do not know it;
- how you sign in: a password, or an external service such as Telegram together
  with the identifier that service issues;
- the IP address and browser User-Agent string seen at the moment of
  registration;
- the workspace name, if you gave one;
- a time zone;
- a record that you agreed to the newsletter, and when, if you ticked the box.

Later you can add a first name, last name, a short description and a profile
picture. None of that is required.

Registration is open, but a new account does not work until an administrator
approves it. Before approval the account exists and can do nothing: no session
is issued, no activation email is sent, and every API request is refused.

### 2.2 Using the service

While you use the service, the database holds what you put into it: post text,
uploaded files, publishing schedules, comments, settings. If you connect a
social network channel, the access token that network issued is stored too —
without it the service cannot publish on your behalf. AI provider keys, if you
enter any, are stored encrypted.

There is a separate log of AI use. It records only which operation was allowed
to run: the organisation, the mode, the operation name, the provider, the model
and the admission result. No prompts, no post text and no model output go into
it.

To tell your text apart from machine-written text, the service compares it with
texts by other authors who work in the service. A server-side job does this: it
reads such texts, computes numbers from them and passes only numbers outward —
a distribution of scores and two boundaries. No sentence belonging to somebody
else reaches your workspace: not on screen, not in a model prompt, not in a
log. Your own texts take part in the same comparison for other authors.

When the service proposes a draft and you send your own version, the pair is
stored: what the model proposed and what you sent. It is used so that the
likeness check learns to tell machine text from yours. The pair lives as long
as the avatar it was collected for: delete the avatar and the edits are deleted
with it.

### 2.3 Public pages and the demo

The public pages and the product demo count how often things happen. Exactly
five fields are sent:

- the event name — one of four: landing page viewed, demo started, demo
  finished, sign-up started;
- the page language — `ru` or `en`;
- a window width bucket — one of four words, never the actual size;
- an interface version;
- a demo step.

Nothing else. No IP address, no User-Agent, no referring page, no cookie, no
visitor identifier, no email address. All of it is added into daily counters:
one row per day and set of values, holding a number. Nothing in that data can
tell one visitor from another.

Two more events — a completed registration and a workspace activation — are
recorded by the server itself. It stores a receipt: the event name and the
result of a one-way cryptographic transformation. The receipt exists so the same
event is not counted twice. It carries no address, no name and no IP.

To stop anyone flooding the counters, there is a rate limit. It counts requests
against a temporary key derived from the IP address by a one-way transformation
with a random key. That key lives for one minute and only in the memory of the
running process. The IP address itself is never written down.

### 2.4 Cookies

The cookies this service sets:

- `auth` — your session. Appears after you sign in, lasts up to a year. Sign-in
  does not work without it;
- `showorg` — which workspace to open. Appears when there is more than one;
- `org` — an invitation to someone else's workspace. Lives 15 minutes;
- `oauth_state` — a short check that a sign-in through an external service came
  back to the browser that started it. Lives 5 minutes;
- `i18next` — the interface language you chose.

There are no advertising cookies. There are no third-party analytics cookies.
None of the cookies above follows you to other sites.

### 2.5 Error reports

When something breaks, the service sends an error report to its own collector,
running on the same host. The report contains an event identifier, the time, a
level, the environment, the build version, the service name, the error type and
stack frames — file path relative to the repository root, function name, line
and column.

No user, no request, no headers, no cookies, no IP address, no User-Agent and
none of the text you were writing. The event is rebuilt from an allowed list of
fields rather than forwarded as it came.

### 2.6 What this product does not have

This is worth saying plainly, because it is unusual. The product carries no
third-party product analytics at all. PostHog, Plausible, Google Tag Manager,
dub, datafa.st, the Facebook pixel, hosted Sentry and the Chatbase chat widget
were all removed along with their dependencies, and bringing any of them back
fails an automated check. Live pages load no external script. Fonts are served
from our own server, not from a font CDN.

There is no profiling. There is no automated decision-making about you based on
your data. Your data is not sold.

## 3. Why this data is used

- Address and password — so you can sign in and we can tell your account from
  someone else's.
- IP address and User-Agent at registration — to deal with registration abuse
  and password guessing.
- Workspace content — so the service does the thing you came for.
- Connected channel tokens — to publish posts where you told it to.
- Public page counters — to know whether the product works, without watching
  people.
- Error reports — to fix what breaks.
- Address for the newsletter — only if you ticked the box.

Almost everything above is processed because it is needed to deliver what you
asked for when you created the account. The newsletter is different: it runs on
your consent, and you can withdraw that consent at any time.

## 4. Who else receives data

The full list of recipients, and what reaches each of them, is in a separate
document, "Data recipients". In short:

- the mail delivery service Resend receives the recipient address, subject and
  body of a service email: account activation, password reset, address
  confirmation. No post content and no platform tokens;
- the newsletter system Listmonk runs on our own host and receives your address
  only after explicit consent. It does not leave the host;
- our own error collector, on our own host, receives what section 2.5
  describes;
- Telegram is involved if you sign in through Telegram;
- OpenAI, OpenRouter and Tavily receive prompts, post text and search queries —
  but only if a workspace configures AI itself. One organisation's keys are
  never used for another;
- social network APIs receive post content and files — when you have connected
  a channel and asked to publish;
- an address of your choosing receives a whole post, if you set up a webhook
  pointing at it.

Data goes to a public authority only where the law requires it.

We do not sell data and do not hand it to advertisers.

## 5. Where data is processed

The server is in the Netherlands. The database, the files, the newsletter
system and the error collector all run on it.

Some service email leaves through Resend, a company in the United States, which
sends this product's mail from the `eu-west-1` region. That means your email
address and the text of a service message leave the Netherlands. Nothing else
does, unless you connect AI, a social network channel or a webhook yourself.

## 6. How long data is kept

- Account data and workspace content — as long as the account exists.
- Pairs of proposed draft and sent text — as long as the avatar they were
  collected for exists. Deleting the avatar deletes them at once.
- Registration receipts and the AI usage log — 90 days. After that a daily job
  deletes them.
- Daily counters from the public pages — kept indefinitely. They contain nothing
  that relates to a person: a date, an event name, a language, a width bucket,
  an interface version, a step and a number.
- Error reports — for the period configured in the collector.
- Database backups have their own schedule. Deleted data disappears from them as
  the backups rotate.

## 7. Your rights

You can:

- ask whether your data is being processed, and what is held;
- get a copy of your data;
- have inaccurate data corrected;
- ask for deletion;
- withdraw your consent to the newsletter;
- object to processing;
- complain to the data protection authority in your country.

To use any of these, write to [@content_factory_adtbot](https://t.me/content_factory_adtbot). We may ask you to prove the
message came from the owner of the account — otherwise we hand someone else's
data to whoever knows their address.

## 8. How to delete your account and data

There is no "delete account" button in the interface yet. Write to the Telegram
bot [@content_factory_adtbot](https://t.me/content_factory_adtbot) and tell us
the email address the account uses. We may ask for additional proof of identity.
We will then delete the account and its contents.

What you can do yourself, without asking us:

- disconnect a social network channel. Publishing to it stops at once and the
  channel disappears from the interface. The record is marked as deleted but
  stays in the database until the account data is removed;
- delete posts, files, signatures, sets and webhooks;
- delete any AI provider keys you entered;
- unsubscribe from the newsletter using the link in the email itself.

## 9. Age

The service is meant for adults. We do not knowingly collect children's data.
If it turns out a child created an account, we will delete it — write to us.

## 10. How data is protected

- Passwords are stored only as bcrypt hashes.
- A sign-in password must be at least 12 characters.
- AI provider keys and the organisation API key are stored encrypted.
- The connection runs over HTTPS, the session cookie is marked `secure` and
  `httpOnly`, and its scope is limited to the exact address of the service.
- Registration, sign-in, password reset and resending an activation email are
  all rate-limited.
- Registration needs an administrator's approval, so a stranger's account does
  not appear on the server by itself.

Perfect security does not exist and we do not promise it. We promise to fix what
we learn about.

## 11. Open source

Content Factory is licensed under AGPL-3.0. That means we must give the source
code of the running service to anyone who uses it, and we do: the site carries a
"Source" link, and `/api/public/source` serves a page with an archive of exactly
the version now running. The archive holds no configuration files, no keys and
no commit history.

You do not have to take this document's word for anything. You can read the
code.

## 12. Changes to this notice

We may change this notice. The date at the top always shows when it last
changed. Account holders will be told by email about changes that matter.
