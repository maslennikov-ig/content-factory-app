# Golos Text provenance

- Upstream project: `https://github.com/googlefonts/golos-text`, distributed as
  `google/fonts` directory `ofl/golostext`.
- Version recorded in the binary: `Version 2.004`.
- Variable font SHA-256: `17bb58fb69aec2dfb047a2ebf52534023e9b688c97a6b7ac795b0a72912c2063`.
- License SHA-256: `ff532f9e8789f09a9fdffc3c0954eedfb0a48be77b2e2eb90f5f82e4f347f50c`.
- License: SIL Open Font License 1.1, stored beside the font file as `OFL.txt`.

**No source commit is pinned here, and that is a real gap rather than an
oversight.** Geologica and JetBrains Mono were taken from a checkout of
`google/fonts` at a known commit, and their notes record it. This file came from
a set of candidate faces already held locally, so the commit it was cut from is
not known. What was checked instead: `OFL.txt` opens with `Copyright 2019 The
Golos Text Project Authors (https://github.com/googlefonts/golos-text)`, and the
binary's own `copyright` name record carries the same line with the same URL,
so the licence beside the file is the licence for the file. Anyone refreshing
this face should re-cut it from `ofl/golostext` at a recorded commit and replace
this paragraph with the hash pair.

## Coverage

Latin and Cyrillic are both native and complete — all 66 Russian letters
including `Ё ё Й й Щ щ Ъ ъ`, plus the em dash, the ellipsis and the guillemets
Russian typography needs. Verified against the font's `cmap`, not assumed.

## Axes

| Axis   | Range   | Used by the product |
| ------ | ------- | ------------------- |
| `wght` | 400–900 | yes — the editor registers the full range |

The lower bound is 400, not 100: that is where this file's axis actually ends,
and declaring more would let the browser synthesise a thinner cut than the font
contains.

## Why this face, and where it may be used

This is **not** a third interface typeface. The interface has exactly two —
Geologica and JetBrains Mono — and the nine typography tokens in `DESIGN.md` do
not change. This face exists for one thing: text a person sets on their own
image in the image editor. That is content, not chrome, and it is a different
decision from what the product's own screens are set in.

It was chosen for contrast. Geologica is technical with narrow apertures, which
is right for dense tables and wrong for a caption meant to be read across a
photograph at a glance. Golos Text is humanist and open, drawn Cyrillic-first,
so Russian captions do not read as an afterthought.

The image editor still lacks an antiqua. None of the vetted faces held locally
is one, and fetching a new file is a separate decision with its own licence
check. The specification that asked for three faces is satisfied by count and by
licence; it is not satisfied in spirit until a serif is available.

The file is vendored so `next build` never depends on the availability or the
current response of Google Fonts. It is loaded through `src/styles/fonts.ts`
using `next/font/local`, and the browser fetches it only when something asks for
the family — so a page that never opens the editor never pays for it.

## Файл переименован при внесении

Upstream отдаёт его как `GolosText[wght].ttf`; здесь он лежит как `GolosText-Variable.ttf`.
Содержимое не изменено — SHA-256 выше считана с этого файла и совпадает.

Причина в скобках. Next переносит имя исходного файла в имя собранного, а
дальше предзагрузка в разметке пишет его закодированным (`%5B`, `%2C`), тогда
как `@font-face src` в CSS пишет скобки буквально. Для браузера это два разных
адреса, и шрифт скачивался дважды. Найдено на боевой 28.08.2026.
