# Geologica provenance

- Source: `google/fonts`, directory `ofl/geologica`.
- Source commit: `a60a77e14f28abd4ef243a1b5dfc48df0cec5205`.
- Upstream project: `https://github.com/googlefonts/geologica`.
- Variable font SHA-256: `9124d9e88ac6c11d761f35241713a51d68e2c4ebedce0edaca834717a00959ec`.
- License SHA-256: `778186245840aea0e60bec6a46e7fb1442e0cd78e41afeadffcd3e8824b379e0`.
- License: SIL Open Font License 1.1, stored beside the font file as `OFL.txt`.

`OFL.txt` opens with `Copyright 2020 The Geologisk Project Authors
(https://github.com/monokromskriftforlag/geologisk)`, while the font binary's
own copyright record names `The Geologica Project Authors
(https://github.com/googlefonts/geologica)`. That looks like the wrong licence
file sitting next to the font, and it is not: both were checked against
`ofl/geologica` at the source commit above and the licence matches it byte for
byte. Geologica descends from Monokrom's Geologisk and upstream carries the
ancestor's copyright line in the licence while the build stamps the Google
Fonts project into the binary. Nothing here needs correcting; this note exists
so the next reader does not re-investigate it.

## Axes

| Axis   | Range      | Used by the product |
| ------ | ---------- | ------------------- |
| `wght` | 100–900    | yes — 400/500/650 |
| `CRSV` | 0–1        | no — stays at 0 (upright, non-cursive letterforms) |
| `SHRP` | 0–100      | no — stays at 0 (softest corners) |
| `slnt` | −12–0      | no — the interface uses no italic |

Only `wght` is varied. The remaining axes keep their default instance, which is
the calm upright cut the editorial system asks for. The interface contains no
italic text, so a single normal face is registered; if italic is ever needed,
declare it against the `slnt` axis rather than letting the browser synthesise a
slant.

## Why this face

Latin and Cyrillic are both native, so Russian and English render in the same
typeface instead of falling back to a system font. Numbers, dates and statuses
stay tight in dense tables and in the calendar, which is what the product spends
most of its screen on.

The files are vendored so `next build` never depends on the availability or the
current response of Google Fonts. They are loaded once through
`src/styles/fonts.ts` using `next/font/local`.

## Файл переименован при внесении

Upstream отдаёт его как `Geologica[CRSV,SHRP,slnt,wght].ttf`; здесь он лежит как `Geologica-Variable.ttf`.
Содержимое не изменено — SHA-256 выше считана с этого файла и совпадает.

Причина в скобках. Next переносит имя исходного файла в имя собранного, а
дальше предзагрузка в разметке пишет его закодированным (`%5B`, `%2C`), тогда
как `@font-face src` в CSS пишет скобки буквально. Для браузера это два разных
адреса, и шрифт скачивался дважды. Найдено на боевой 28.08.2026.
