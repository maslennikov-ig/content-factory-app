# План стадии: эксплуатационная готовность

**Цель:** закрыть `wui`, `rpt` и `6er` одной fail-closed приёмкой.

**Не входит:** production scripts/host, deploy, credentials, paid services,
реальные сообщения и `content-factory-next-cxd`.

## Поток 1: Docker-backed CI

- [x] Зафиксировать RED: обязательный job может пройти без Docker-backed proof.
- [x] Добавить отдельный Docker-capable job с fail-closed preflight.
- [x] Поимённо выполнить Mastra migration и PostgreSQL restore scripts.
- [x] Сохранить точную локальную причину skip вне обязательного job.

## Поток 2: browser-error relay

- [x] Зафиксировать RED: один источник исчерпывает общий bucket.
- [x] Выбрать ограниченный privacy-safe ключ и threat model.
- [x] Доказать независимые бюджеты и неизменный закрытый payload.

## Поток 3: YouTube provenance

- [x] Проверить текущие asset bytes, resolver и gates.
- [x] Найти immutable первичный источник либо доказать невозможность точной
  воспроизводимости.
- [x] Закрепить SVG с hash/source или явное raster-решение без redraw/recolour.

## Корневая приёмка

- [x] Проверить stream artifacts, write zones и отсутствие production changes.
- [x] Выполнить focused интеграционный набор.
- [x] Обновить поведенческую документацию и локальный Graphify; итоговые
  handoff/project index обновить после release-closeout.
- [x] Выполнить один release closeout и сохранить stage receipt.
