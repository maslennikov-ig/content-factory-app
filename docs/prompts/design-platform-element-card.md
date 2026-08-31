Target: Claude Design skill — a design pass, not an implementation pass.
Audience: Manual handoff. A person will paste this into the design skill and bring back comps.

Goal: Design the platform element card for Content Factory — the object that represents a social platform everywhere it appears, from the picker where you choose platforms down to the badge sitting on a channel avatar. One object at several sizes, not several unrelated elements.

## The idea, and why it is not decoration

Content Factory's own mark is a chemical element card: symbol `Cf`, atomic number `98`, mass `251`. The name is the element Californium; the symbol is the product's initials. The periodic table is public domain, and this is already the product's identity — it is in `docs/design/desert-lab/mark.md` and it ships.

That device has never been extended to the thing it fits best: the platforms. Today a picker is a grid of thirty-five third-party logos, each with its own silhouette, density and colour, and the whole composition is held together by somebody else's artwork. Making each platform an element card gives the grid a frame it currently lacks — and it gives it structure, which matters more:

- **Groups.** The periodic table's columns are families, colour-coded. We have exactly that and never show it: messengers, social networks, blogs, video, professional. Thirty-five tiles in a row today, eight legible families tomorrow. The families are named in Appendix B; they are the product's decision, not yours to invent, though you may argue against a placement you think reads wrong.
- **The atomic number slot**, top-left of a card, takes the number of channels already connected on that platform. A platform you use and a platform you have never touched stop looking identical, with no extra badge.
- **The name below the symbol** is the platform name, exactly as an element's name sits below its symbol.
- **Selection** becomes a marker on a card rather than a highlight washing over a tile.

## The one hard constraint

**The platform logo is not redrawn, recoloured, or restyled.** It is a third-party trademark; the brand guidelines of most platforms permit using the mark to identify the service and forbid altering it. It is also the only thing that stays legible when the card gets small.

So the logo occupies the *symbol* position inside the card — where `Cf` sits in our own mark — and everything around it is ours: container, border, fill, radius, padding, the number slot, the name, the family colour, and every state. That division is the whole design problem. Our style arrives through the frame and the system, never through the glyph.

Keep clear space around each logo. Do not place a logo on a fill that reduces its contrast below legibility, and do not tint it to match the family colour.

## Inherit the scaling rule that already exists

`docs/design/desert-lab/mark.md` specifies our own card at 128, 48, 24 and 16 px, and — this is the part to reuse — **at 24px and below the atomic number and the mass are dropped, leaving only the border and the symbol, so the strokes do not merge.** The full table is reproduced in Appendix A so you do not need the repository to work from it.

Apply the same shedding logic to the platform card. That is what makes this one object rather than two:

| Where it appears | Size | What it carries |
|---|---|---|
| Platform picker, agent setup | large | family colour, channel count, logo, platform name |
| Dense lists, compact pickers | medium | logo, name; count if it fits |
| Badge on a channel avatar | small | border and logo only — number and name shed, exactly as our mark sheds them |

The badge on the avatar today is 20px, with one instance at `18.41px` — an inherited value nobody designed. **Treat its size as open.** If the card reads better at a different size, change it, and change the avatar with it if that is what the composition needs; say what you chose and why. The only real constraint is density: in the calendar and post previews several channels sit in a row, so propose a size that survives being repeated, and say where you would let it grow because there is room.

## The system it must live in

Dark theme is primary; light is a second, fully-supported theme, not an afterthought.

- Dark: canvas `#14150F`, accent `#7FB03A` (acid green).
- Light: canvas `#EFE9DB` (sand), surface `#FBF8F0`, ink `#22231A`, ink-muted `#5C5D4C`, border `#D3CAB3`, border-strong `#B0A68A`.
- Signature across both: rusty ochre `#C8922A` — the colour of our own card's border and atomic number.
- Type: Geologica throughout, except `label-sm` and `caption` which are JetBrains Mono. The atomic-number slot and the channel count are working information and therefore monospace; the platform name is not.
- Rhythm 4px, working step 8px. Radius follows the mark spec above.
- Depth is built with plane, border and space. A panel does not combine two ways of saying the same thing — a card that has a border does not also get a shadow.
- Contrast: 4.5:1 for text, 3:1 for a selection marker, in **both** themes. The light theme deliberately does not use a dark navigation rail because the accent measures 2.69:1 on it and fails the marker threshold — that is the standard of rigour expected here.

The values above and the two appendices are everything you need; `DESIGN.md` and `docs/design/desert-lab/mark.md` in the product repository are their source, quoted here because this brief travels without the repository. Do not invent new colour roles; if you need one that does not exist, say so and argue for it rather than adding it quietly.

## States to cover, all of them, in both themes

Default, hover, focus-visible, selected, selected+hover, disabled, and the case of a platform with zero connected channels versus one with several. Focus must be visible from the keyboard and must not rely on colour alone. Selection must be distinguishable without colour — a keyboard user and a colour-blind user both have to see which card is chosen.

## Deliverables

1. The element card at each size, both themes, all states.
2. The picker grid: the thirty-five platforms of Appendix B arranged so the families read, with the family colour treatment shown. Show it at desktop and at 390px width — below 768px the layout has to work without horizontal overflow or hidden required actions.
3. The badge on a channel avatar, in place, at your proposed size, shown repeated in a dense row so the density claim is testable.
4. The family palette: the eight families of Appendix B, each colour checked against both canvases, with the contrast figures stated. If eight distinct colours cannot all clear the threshold and stay distinguishable from one another, say so and propose the merge you would make rather than shipping two families nobody can tell apart.
5. A short written rationale: what sheds at which size and why, what you changed about the badge size and why, and anything in `DESIGN.md` you had to push against.

## Out of scope

Do not design a replacement for any platform logo. Do not propose a monogram system — that was tried and failed on collision: `linkedin`, `linkedin-page` and `listmonk` all reduce to `LI`. Do not restyle the channel avatar itself beyond what the badge requires. Do not produce implementation code; this is a design pass and a separate task builds it.

## Appendix A — the mark's own size table

Our card, as it ships. The platform card descends from it, so these are the numbers to step down from, not to copy blindly: the platform card carries a logo where this one carries `Cf`, and it carries no mass number at all.

| Size | Border and radius | Symbol | Atomic number | Mass |
|---|---|---|---|---|
| 128 | 2px, radius 8 | 56px / 600 / −0.02em, `ink`, centred | 14px / 600, `signature`, inset 10 top, 12 left | 12px, `ink-muted`, inset 10 bottom, 12 left |
| 48 | 1.5px, radius 8 | 21px / 600 / −0.02em, `ink`, centred | 8px / 600, `signature`, inset 4 top, 5 left | 7px, `ink-muted`, inset 4 bottom, 5 left |
| 24 | 1px, radius 4, padding 2px 3px | 11px / 600, `ink`, bottom | 7px, `signature`, top | shed |
| 16 | 1px, radius 4 | 9px / 600, `ink`, centred | shed | shed |

The border is `signature` — the rusty ochre `#C8922A`. Radius is 8 from 48px up and 4 at 24px and below. **From 24px down only the border and the symbol remain**, so the strokes do not merge; that is the rule the platform card inherits.

## Appendix B — the thirty-five platforms and their families

These are the platform identifiers as the product uses them, grouped as the product groups them. The grouping is a product decision; treat it as given, and argue in writing if a placement reads wrong to you rather than silently regrouping.

| Family | Platforms | Count |
|---|---|---|
| Messengers | `telegram`, `discord`, `slack` | 3 |
| Social networks | `facebook`, `instagram`, `instagram-standalone`, `x`, `threads`, `vk`, `mewe` | 7 |
| Open networks | `bluesky`, `mastodon`, `mastodon-custom`, `nostr`, `lemmy`, `wrapcast` | 6 |
| Communities | `reddit`, `moltbook`, `skool`, `whop` | 4 |
| Video and streaming | `youtube`, `tiktok`, `twitch`, `kick` | 4 |
| Publishing | `medium`, `devto`, `hashnode`, `wordpress`, `tumblr` | 5 |
| Professional | `linkedin`, `linkedin-page`, `gmb` | 3 |
| Visual | `dribbble`, `pinterest` | 2 |
| Own mailing | `listmonk` | 1 |

Two of these need saying out loud, because they are the cases a grid design usually breaks on.

**A family of one is not a mistake.** `listmonk` is the only destination that goes to our own infrastructure rather than to somebody else's service, so it sits alone. The periodic table has such columns; do not pad it and do not fold it into a neighbour for the sake of symmetry.

**Near-duplicate pairs must stay legible.** `instagram` and `instagram-standalone`, `mastodon` and `mastodon-custom`, `linkedin` and `linkedin-page` are different destinations with the same or nearly the same logo. Whatever distinguishes them has to live in the frame — the name, the number slot, something in the container — because it cannot live in the mark. Show these three pairs side by side in your comps; if a user cannot tell them apart at picker size, the design has not solved its hardest case.
