# JetBrains Mono provenance

- Source: official GitHub release `JetBrains/JetBrainsMono`, asset
  `JetBrainsMono-2.304.zip`.
- Release tag: `v2.304`, published 2023-01-14.
- Download URL:
  `https://github.com/JetBrains/JetBrainsMono/releases/download/v2.304/JetBrainsMono-2.304.zip`.
- Archive SHA-256:
  `6f6376c6ed2960ea8a963cd7387ec9d76e3f629125bc33d1fdcd7eb7012f7bbf`.
- Variable font SHA-256 (`fonts/variable/JetBrainsMono[wght].ttf` in the
  archive): `662a196d58f1183bf2d77428b6d5283fe3f45161ab021bea4036bc98e5cac016`.
- License SHA-256 (`OFL.txt` in the archive):
  `30f0c136e3c88e422d0791acd97238870f9054a9729bc34cf2ff0d4ed8cac4ad`.
- License: SIL Open Font License 1.1, stored beside the font file as `OFL.txt`.
  It opens with `Copyright 2020 The JetBrains Mono Project Authors
  (https://github.com/JetBrains/JetBrainsMono)`, which matches the binary.

Only the upright variable face is vendored. The archive also ships
`JetBrainsMono-Italic[wght].ttf`; the interface uses no italic, so it is left
out for the same reason Geologica registers a single normal face.

## Axes

| Axis   | Range   | Used by the product |
| ------ | ------- | ------------------- |
| `wght` | 100–800 | yes — 500 and 600   |

This is the whole axis list: unlike Geologica there is no `CRSV`, `SHRP` or
`slnt` to pin. Note the upper bound is **800, not 900** — the `localFont`
declaration says `weight: '100 800'` so the browser never synthesises a heavier
cut than the file actually contains.

## Scripts

Checked in the binary's `cmap`, not taken from the release notes: 92 of the 96
code points in `U+0400–U+045F` are present and the whole basic Russian range
`U+0410–U+044F` plus `Ё`/`ё` is covered. Cyrillic is native, so the two
monospaced typography tokens do not fall back to a system font on Russian text.

## Numerals

The design system asks for tabular figures and a slashed zero.

- **Slashed zero** is the OpenType feature `zero`, which this font ships and the
  product requests explicitly.
- **Tabular figures** need no feature here. `tnum` is *not* in the font's
  feature list, and correctly so: the face is monospaced, so every glyph —
  including every digit — already advances by the same width. Requesting `tnum`
  would be a silently ignored no-op, so the product does not ask for it. On
  Geologica, which is proportional, numeric columns still need their own
  treatment.

## Why this face

The product's working information — publication and batch identifiers, dates and
times, numeric table columns, channel labels, stencil markers — has to read as a
measurement rather than as a caption. Two of the nine typography tokens
(`label-sm` and `caption`) carry that load; the other seven stay on Geologica.

JetBrains Mono is under the same licence as Geologica, has native Cyrillic and a
variable `wght` axis, and is vendored here so `next build` never depends on an
external font host. It is loaded once through `src/styles/fonts.ts` using
`next/font/local`.

## Файл переименован при внесении

Upstream отдаёт его как `JetBrainsMono[wght].ttf`; здесь он лежит как `JetBrainsMono-Variable.ttf`.
Содержимое не изменено — SHA-256 выше считана с этого файла и совпадает.

Причина в скобках. Next переносит имя исходного файла в имя собранного, а
дальше предзагрузка в разметке пишет его закодированным (`%5B`, `%2C`), тогда
как `@font-face src` в CSS пишет скобки буквально. Для браузера это два разных
адреса, и шрифт скачивался дважды. Найдено на боевой 28.08.2026.
