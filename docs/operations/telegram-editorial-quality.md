# Telegram editorial quality and generation settings

Manual generation follows the channel writing profile by default. In native agent
chat, length is chosen for the current request and material: the agent proposes
2–3 concrete ranges with tradeoffs and one recommendation before generation.
These choices can exceed the manual channel range, within the technical provider
limit. There is no fixed size table. An explicit numeric author request can use
one proposed range; explicitly delegated size can use `auto`.

The existing editable native `writing-settings` card shows these options first.
Selecting an option updates actual numeric values; the person can edit them and
apply once. Channel defaults remain an explicit secondary choice. Emoji,
hashtags, link placement and CTA remain editable in the same card. Accepted
values are shown in history. A model argument, ordinary wish, or generic MCP
confirmation is not an answer to this card. MCP callers without the card must
omit overrides or complete the proposal in web chat. Legacy pending runs without
the server-owned original-author-request record remain resumable.

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
the resolved per-post range. Telegram hard-limit checks use the same visible text,
including the headline; raw markup length is diagnostic, not a second overflow.

The 2 November follow-up supersedes the earlier no-correction rule **only for
generated, not-yet-saved Telegram drafts**. The existing review call can return one
corrected candidate plus its final findings. It adds no model call or retry loop;
the output budget can grow to carry the corrected text, so equal cost is not
promised. Missing/invalid/unavailable corrections retain the original paid draft.
The server retains post count/order, media metadata and citation bindings, checks
URL preservation, rechecks length/copying, and keeps unresolved provenance findings.
Applied `corrections` and remaining findings travel separately in the native tool
result/history. The assistant reports actual corrections rather than superseded
warnings. Edits to already saved posts retain their ordinary human acceptance.

Before generation, the conductor estimates task-specific sizes including the
headline, useful detail, links and closing. A channel numeric default is neither
the primary agent proposal nor its ceiling. The estimate is not a measured count.
If overflow remains, it must resolve the length/format decision rather than
merely offer to shorten. No instruction guarantees model adherence; paid live
evaluation remains separate from passing deterministic tests.

## Common Telegram editorial rules

These defaults are shared by the hook writer, body writer and pre-save editor in
`agent/telegram-editorial-policy.ts`; they are not a mandatory identical template
for every genre. Explicit author choices and the resolved writing profile win.

1. **In-post headline.** A digest, explainer or substantial list opens with a short,
   informative heading naming its subject and useful angle. The card title is
   metadata and does not substitute for a heading in the published text. A brief
   conversational note, poem or explicitly title-free format may omit it.
2. **Immediate relevance.** Follow with the essential context or point. A digest's
   opening describes the selection, not just the first vendor. Avoid repeating
   the title, production commentary and clickbait promises.
3. **Readable structure.** Short paragraphs, blank separation, consistent bullet
   or numbered news items with descriptive labels. Emoji support the structure
   according to the chosen setting. Do not invent a ban on permitted emoji.
4. **Reader value.** Explain what changed and why it matters to the actual
   audience. Include a supported application, decision or next step where useful.
   A suggested experiment is not a verified result. Do not invent experience or
   append a generic benefit to every item.
5. **Evidence and availability.** Separate publication, event, preview, release
   and future plan. Compare conflicting claims with original primary evidence.
   Missing proof is not proof of falsity. An explicit dated launch announcement
   takes precedence over vague relative wording in a later article. Omit only
   incidental unsupported precision; retain important uncertainty honestly.
6. **Sources and ending.** Preserve required links and follow link placement and
   CTA settings. Finish with a useful synthesis, action or question when suitable;
   do not force the same engagement formula on every post.
7. **Length and editorial finish.** Count the complete post, including its title
   and closing. Compress secondary details without losing required topics or
   author meaning. Propose a larger budget before generation when appropriate;
   only the person changes that budget. Correct safe defects before saving.

For a news digest this normally yields **headline → period/context → news blocks
(change + relevance/access) → useful closing → sources in the chosen position**.
An instruction instead uses **task/result → prerequisites → ordered steps →
verification/caveat**. A personal opinion uses **position → reasons/examples →
implication**, preserving the author's actual views. These are editorial defaults,
not invented quotations or universal optimal lengths.

## Research basis and limits

The read-only donor's May 2026 research lives under
`/home/me/code/content-factory/docs/research/channel-playbooks/telegram/raw/`:
`compass-artifact-2026-05-telegram-playbook.md` and
`deep-research-report-2026-05-telegram-playbook.md`. Existing channel defaults
already reference those reports. This follow-up independently synthesizes their
ideas; no donor code or report prose is copied. Their length/emoji/preview numbers
are heuristics, not verified universal platform or audience laws.

Current external checks (2 November 2026):

- [Nielsen Norman Group: How Users Read on the Web](https://www.nngroup.com/articles/how-users-read-on-the-web/)
  supports meaningful headings, one thought per paragraph, lists and leading
  with the conclusion. It is web-reading research, not proof of Telegram growth.
- [ONS: Structuring content](https://service-manual.ons.gov.uk/content/writing-for-users/structuring-content)
  supports front-loading, descriptive headings and prioritizing user needs.
  We apply those principles to Telegram as an editorial inference.
- [MSU: Structural elements of news posts in Telegram and VK](https://vestnik.journ.msu.ru/books/2023/5/strukturnye-elementy-postov-novostnykh-kanalov-v-telegram-i-vk/)
  describes recurring structures and visual emphasis in sampled channels. It
  does not establish one optimal pattern or a causal engagement uplift.

Generated factual accuracy still needs editorial judgment; a saved draft or
passing stubbed test is not live-model acceptance.

API references: [sendRichMessage](https://core.telegram.org/bots/api#sendrichmessage),
[rich formatting](https://core.telegram.org/bots/api#rich-message-formatting-options).
