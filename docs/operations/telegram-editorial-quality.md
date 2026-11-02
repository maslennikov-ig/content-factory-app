# Telegram editorial quality and generation settings

The generator follows the channel writing profile by default. A model-proposed
change to length, emoji, hashtags, link placement or call to action pauses
`piece.adapt` on an editable native `writing-settings` card before generation.
The card shows the channel baseline, proposal, reason and platform limit. The
person can edit and apply it or keep channel settings. A model argument, ordinary
wish, or generic MCP confirmation is not an answer to this card. MCP callers
without the card must omit overrides or complete the proposal in the web chat.

The accepted values affect this post/material only. For `auto` or `series`
presentation the card explicitly includes all parts of this material. Saving
channel defaults remains a separate explicit request through `channel.writing`.
Native checkpoints preserve accepted settings through later author questions and
separate autopilot consent. A changed profile or material requires a fresh
proposal. The persisted confirmation event retains before/proposed/accepted values
in chat history even if a later generation or autopilot step does not complete.

Telegram canonical draft text supports `#`–`######` headings, flat `-`/`*` lists,
sequential numbered lists starting at `1.`, blank-line paragraphs and single line
breaks. The post editor and preparation sanitizer preserve those blocks. Text-only
posts containing headings or lists use Telegram Bot API `sendRichMessage` with
sanitized `rich_message.html`. Ordinary posts retain the existing sendMessage path.
Media retain the existing caption path: headings become bold and list markers
remain readable. The adaptation preview follows the same choice; its source
editor displays the stored block markers. Nested/custom-start lists and a complete
replica of Telegram's client editor are outside this subset.

The existing product limits remain 4096 characters for text and 1024 for a media
caption. Telegram rich messages allow a larger maximum, but this change does not
increase product limits. Explicit approved ranges cannot exceed the current
provider maximum. No second send is attempted as a fallback after an uncertain
request outcome.

Research passes source publication and fetch dates separately from event-date
provenance, with the supporting passage preserved in the brief and core. A dated
primary announcement saying availability starts “today” can establish that
specific launch scope; publication metadata alone cannot. A later platform release
does not replace the product launch date. Partial research must retain confirmed
availability and attach uncertainty only to the unresolved claim.

The existing advisory review checks practical audience benefit, a useful supported
next step/access conditions where appropriate to the genre, and unsupported claims.
Visible-length findings are also computed independently of the review model against
the resolved per-post range. Findings are shown with the saved draft; they do not
trigger paid retries or automatic rewrites. Generated factual accuracy still needs
editorial judgment; a saved draft or passing stubbed test is not live-model acceptance.

API references: [sendRichMessage](https://core.telegram.org/bots/api#sendrichmessage),
[rich formatting](https://core.telegram.org/bots/api#rich-message-formatting-options).
