#!/usr/bin/env python3
"""Canvas «Экран „Агент“ и карточки» (content-factory-next-kcxz.9).

Reference, not product source. Builds from src/*.body.html:
  * one *.dc.html per artboard (Claude Design canvas format, same as eleventh-wave),
  * canvas.json for those artboards,
  * agent-canvas.html — one self-contained file with every artboard, both themes.
Colours come from ../tokens.css; nothing here defines a colour of its own.
Run: python3 build.py
"""
import html, json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'src')
TOKENS = open(os.path.join(HERE, '..', 'tokens.css'), encoding='utf-8').read()
STYLE = open(os.path.join(SRC, '_style.css'), encoding='utf-8').read()
FONTS = 'https://fonts.googleapis.com/css2?family=Geologica:wght@400;500;650&family=JetBrains+Mono:wght@400;500;600&display=swap'


def token_block(selector):
    body = re.search(re.escape(selector) + r'\s*\{(.*?)\}', TOKENS, re.S).group(1)
    body = re.sub(r'/\*.*?\*/', '', body, flags=re.S)
    return ';'.join(f'{k}:{v.strip()}' for k, v in re.findall(r'(--cf-[\w-]+)\s*:\s*([^;]+);', body))


LIGHT, DARK = token_block(':root'), token_block('.dark')

_s = 'width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"'
def svg(d, size=16, extra=''):
    return f'<svg {_s.replace("16", str(size), 2)}{extra}>{d}</svg>'

I = {
    'chev': svg('<path d="M4.5 6.5 8 10l3.5-3.5"/>', 14),
    'right': svg('<path d="M6 4l4 4-4 4"/>'),
    'left': svg('<path d="M10 4 6 8l4 4"/>'),
    'plus': svg('<path d="M8 4v8M4 8h8"/>'),
    'x': svg('<path d="M4 4l8 8M12 4l-8 8"/>'),
    'dots': svg('<path d="M4 8h.01M8 8h.01M12 8h.01"/>'),
    'menu': svg('<path d="M3 4.5h10M3 8h10M3 11.5h10"/>'),
    'pen': svg('<path d="M3 13l.6-2.6L10.8 3.2a1.2 1.2 0 011.7 0l.3.3a1.2 1.2 0 010 1.7L5.6 12.4 3 13z"/>'),
    'check': svg('<path d="M3.5 8.5l3 3 6-6.5"/>', 12),
    'ext': svg('<path d="M6.5 3.5h-3v9h9v-3M9 3.5h3.5V7M12.5 3.5 7 9"/>', 14),
    'img': svg('<rect x="2.5" y="3" width="11" height="10" rx="1.5"/><circle cx="6" cy="6.5" r="1"/><path d="M13.5 10.5 10.5 7.5 4 13"/>'),
    'chat': svg('<path d="M3 4.5A1.5 1.5 0 014.5 3h7A1.5 1.5 0 0113 4.5v5a1.5 1.5 0 01-1.5 1.5H7l-3 2.5V11h.5"/>'),
    'plug': svg('<path d="M6 2.5v3M10 2.5v3M4.5 5.5h7v2.5a3.5 3.5 0 01-7 0zM8 11.5v2"/>'),
    'info': svg('<circle cx="8" cy="8" r="5.5"/><path d="M8 7.2v3.3M8 5.2h.01"/>'),
    'gear': svg('<circle cx="8" cy="8" r="2"/><path d="M8 2.5v1.5M8 12v1.5M2.5 8H4M12 8h1.5M4.1 4.1l1 1M10.9 10.9l1 1M4.1 11.9l1-1M10.9 5.1l1-1"/>'),
    'gauge': svg('<path d="M3 11.5a5 5 0 1110 0"/><path d="M8 11.5 10.5 7"/>', 14),
    'user': svg('<circle cx="8" cy="5.5" r="2.5"/><path d="M3.5 13.5a4.5 4.5 0 019 0"/>'),
    'cal': svg('<rect x="2.5" y="3.5" width="11" height="10" rx="1.5"/><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3"/>'),
    'doc': svg('<path d="M4 2.5h5l3 3v8H4z"/><path d="M9 2.5v3h3M6 8.5h4M6 11h4"/>', 14),
    'list': svg('<path d="M6 4.5h7M6 8h7M6 11.5h7M3 4.5h.01M3 8h.01M3 11.5h.01"/>', 14),
    'ask': svg('<circle cx="8" cy="8" r="5.5"/><path d="M6.4 6.3a1.7 1.7 0 013.2.6c0 1.1-1.6 1.4-1.6 2.3M8 11.2h.01"/>', 14),
    'bolt': svg('<path d="M8.8 2 4 9h3.5L7 14l5-7H8.5z"/>', 14),
    'spark': svg('<path d="M8 2.5v3M8 10.5v3M2.5 8h3M10.5 8h3M4.3 4.3l1.6 1.6M10.1 10.1l1.6 1.6M4.3 11.7l1.6-1.6M10.1 5.9l1.6-1.6"/>', 14),
    'stop': svg('<rect x="4.5" y="4.5" width="7" height="7" rx="1"/>', 14),
    'lock': svg('<rect x="3.5" y="7" width="9" height="6.5" rx="1.5"/><path d="M5.5 7V5.5a2.5 2.5 0 015 0V7"/>', 12),
    'alert': svg('<path d="M8 2.5 14 13H2z"/><path d="M8 6.5v3M8 11.2h.01"/>', 14),
    'copy': svg('<rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 5.5v-2h-8v8h2"/>', 14),
    'clip': svg('<path d="M12.5 7.5 7.8 12.2a3 3 0 01-4.2-4.2L8.5 3.1a2 2 0 012.8 2.8L6.7 10.5a1 1 0 01-1.4-1.4L9.5 5"/>'),
    'send': svg('<path d="M8 13V3.5M4 7l4-4 4 4"/>'),
    'search': svg('<circle cx="7" cy="7" r="4"/><path d="M13 13l-3.2-3.2"/>', 14),
    'nothing': '',
    'tgp': '<svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M14 2.5 1.8 7.2c-.8.3-.8.8 0 1l3 .9 1.2 3.7c.2.5.3.6.7.6.3 0 .5-.1.7-.3l1.5-1.4 3.1 2.3c.6.3 1 .2 1.1-.5l2-9.4c.2-.9-.3-1.2-.9-.9z"/></svg>',
}


def render(name):
    t = open(os.path.join(SRC, name), encoding='utf-8').read()
    for _ in range(4):
        t = re.sub(r'%%INC:([\w.]+)%%', lambda m: open(os.path.join(SRC, m.group(1)), encoding='utf-8').read(), t)
    sets = dict(re.findall(r'%%SET:(\w+)=([^%]*)%%', t))
    t = re.sub(r'%%SET:\w+=[^%]*%%\n?', '', t)
    t = re.sub(r'%%(\w+)%%', lambda m: sets.get(m.group(1)) or I[m.group(1)], t)
    assert '%%' not in t, name
    return t


# id, page, title, w, h (h = measured height of the built artboard)
ARTBOARDS = [
    ('AStart', 'page-1', 'A · Классика — пустое пространство', 1440, 900),
    ('AFlow', 'page-1', 'A · Классика — разговор целиком', 1440, 2130),
    ('BStart', 'page-1', 'B · Одна лента — пустое пространство', 1440, 900),
    ('BDrawer', 'page-1', 'B · Одна лента — список разговоров открыт', 1440, 900),
    ('BFlow', 'page-1', 'B · Одна лента — разговор целиком', 1440, 2134),
    ('CStart', 'page-1', 'C · Чат и рабочая панель — пустое пространство', 1440, 900),
    ('CFlow', 'page-1', 'C · Чат и рабочая панель — адаптация открыта справа', 1440, 1238),
    ('AMobile', 'page-2', 'A · 390 — идёт работа', 390, 844),
    ('BMobile', 'page-2', 'B · 390 — разговор целиком', 390, 2789),
    ('CMobile', 'page-2', 'C · 390 — панель листом снизу', 390, 844),
    ('Cards', 'page-3', 'Карточки — общий набор', 1440, 2390),
]
AB = {a[0]: a for a in ARTBOARDS}

PAGES = [
    ('page-1', 'Экран: три варианта'),
    ('page-2', 'Телефон 390'),
    ('page-3', 'Карточки'),
]

NOTES = {
    'A': 'ВАРИАНТ A — классика. Слева личный список разговоров, в центре разговор шириной 760, карточки во всю его ширину. Пустое пространство — «С чего начнём?» и четыре плитки, первая отмечена «начать отсюда».\n'
         'Цена: три колонки подряд — меню, разговоры, чат; на ноутбуке 1280 разговору остаётся около 700.',
    'B': 'ВАРИАНТ B — одна лента. Разговоры в выдвижном списке (кнопка «Разговоры»), колонка шире — 820, карточки крупнее. Над полем ввода строка «Дальше»: один рекомендуемый шаг и пара других — решаем за человека, что делать следующим. Телефон — тот же экран без перестройки.\n'
         'Цена: к прошлому разговору — лишний щелчок.',
    'C': 'ВАРИАНТ C — чат и рабочая панель. В чате вещь сворачивается в строку, а сама она — заготовка, адаптация, бронь — открыта справа так же, как на своём экране: превью, правка, «Отменить бронь», «Подтвердить…». Пустое пространство — справа пять шагов с «Сделать в чате».\n'
         'Цена: чат узкий (520); панель повторяет экран заготовки — два места, где правится одна вещь; на телефоне панель — лист снизу.',
    'phone': 'Телефон, 390. A — момент, когда идёт работа: шаги появляются по одному, поле ввода можно занять, «Остановить» рядом. B — весь разговор одной лентой, карточки во всю ширину. C — строка «Адаптация» открывает лист снизу с превью и бронью.',
    'cards': 'Карточки общие для всех вариантов (в C вещи в чате ещё и сворачиваются в строку). Вопрос всегда с «Решите за меня», кроме согласия на аватар — его даёт только человек. Бронь ставится без вопроса; «Подтвердить», удаление и подключение — через «Нужно ваше „да“». Ключ уходит в настройки мимо чата. Строка остатка — всегда над полем ввода, карточка остатка — только когда не хватает.',
}

DC_HEAD = f'''<!doctype html>
<html>
<head>
<meta charset="utf-8">
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <link href="{FONTS}" rel="stylesheet">
  <style>
    body {{ margin: 0; }}
{STYLE}  </style>
</helmet>
'''
DC_TAIL = f'''
</x-dc>
<script data-dc-script data-props='{{"dark":{{"editor":"boolean","default":true}}}}'>
const DARK = "{DARK}";
const LIGHT = "{LIGHT}";
class Component extends DCLogic {{
  renderVals() {{
    const dark = this.props.dark ?? true;
    return {{ themeVars: (dark ? DARK : LIGHT) + ";font-family:Geologica,system-ui,sans-serif;color:var(--cf-ink);background:var(--cf-canvas)" }};
  }}
}}
</script>
</body>
</html>
'''

bodies = {}
for f in sorted(os.listdir(SRC)):
    if f.endswith('.body.html'):
        key = f[:-len('.body.html')]
        assert key in AB, f'{f} has no artboard entry'
        bodies[key] = render(f)
        with open(os.path.join(HERE, key + '.dc.html'), 'w', encoding='utf-8') as out:
            out.write(DC_HEAD + '<div style="{{ themeVars }}">\n' + bodies[key] + '\n</div>\n' + DC_TAIL)
        print('built', key + '.dc.html')

# canvas.json: A, B, C in three columns; phones side by side; card sheet alone.
pos, col_x = {}, {'A': 0, 'B': 1540, 'C': 3080}
for letter, ids in (('A', ['AStart', 'AFlow']), ('B', ['BStart', 'BDrawer', 'BFlow']), ('C', ['CStart', 'CFlow'])):
    y = 0
    for i in ids:
        pos[i] = (col_x[letter], y)
        y += AB[i][4] + 120
for n, i in enumerate(['AMobile', 'BMobile', 'CMobile']):
    pos[i] = (n * 490, 0)
pos['Cards'] = (0, 0)
canvas = {
    'pages': [{'id': p, 'name': n} for p, n in PAGES],
    'artboards': [{'file': a[0] + '.dc.html', 'x': pos[a[0]][0], 'y': pos[a[0]][1], 'w': a[3], 'h': a[4], 'title': a[2], 'page': a[1]} for a in ARTBOARDS],
    'annotations': [
        {'id': 'varA', 'page': 'page-1', 'x': 0, 'y': -260, 'w': 1440, 'text': NOTES['A']},
        {'id': 'varB', 'page': 'page-1', 'x': 1540, 'y': -260, 'w': 1440, 'text': NOTES['B']},
        {'id': 'varC', 'page': 'page-1', 'x': 3080, 'y': -260, 'w': 1440, 'text': NOTES['C']},
        {'id': 'phone', 'page': 'page-2', 'x': 0, 'y': -200, 'w': 1370, 'text': NOTES['phone']},
        {'id': 'cards', 'page': 'page-3', 'x': 0, 'y': -200, 'w': 1440, 'text': NOTES['cards']},
    ],
    'launch': {'view': 'canvas', 'page': 'page-1'},
}
with open(os.path.join(HERE, 'canvas.json'), 'w', encoding='utf-8') as out:
    json.dump(canvas, out, ensure_ascii=False, indent=1)
print('built canvas.json')

# ---------------------------------------------------------------- single file
tokens_css = TOKENS.replace(':root {', ':root, .light {', 1)


def board(key, theme='follow'):
    a = AB[key]
    cls = 'dark' if theme in ('follow', 'dark') else 'light'
    follow = ' data-follow' if theme == 'follow' else ''
    tag = '' if theme == 'follow' else f' <span class="cv-tag">{"тёмная" if theme == "dark" else "светлая"}</span>'
    return (f'<figure class="cv-ab" id="ab-{key}{"" if theme == "follow" else "-" + theme}">'
            f'<figcaption>{html.escape(a[2])}{tag}</figcaption>'
            f'<div class="ab {cls}"{follow} style="width:{a[3]}px">{bodies[key]}</div></figure>')


def note(text):
    return '<div class="cv-note">' + '<br>'.join(html.escape(l) for l in text.split('\n')) + '</div>'


def col(letter, keys):
    return f'<div class="cv-col">{note(NOTES[letter])}' + ''.join(board(k) for k in keys) + '</div>'


sections = [
    ('p1', 'Экран: три варианта', '<div class="cv-row">' + col('A', ['AStart', 'AFlow']) + col('B', ['BStart', 'BDrawer', 'BFlow']) + col('C', ['CStart', 'CFlow']) + '</div>'),
    ('p2', 'Телефон 390 — обе темы', note(NOTES['phone']) + '<div class="cv-row">' + ''.join(board(k, 'dark') + board(k, 'light') for k in ['AMobile', 'BMobile', 'CMobile']) + '</div>'),
    ('p3', 'Карточки', note(NOTES['cards']) + '<div class="cv-row">' + board('Cards') + '</div>'),
    ('p4', 'Светлая тема', note('Те же артборды в светлой теме — независимо от переключателя сверху.') + '<div class="cv-row">' + ''.join(board(k, 'light') for k in ['AFlow', 'BFlow', 'CStart', 'CFlow', 'Cards']) + '</div>'),
]

CHROME = '''
    html, body { margin: 0; }
    body.cv { background: var(--cf-navigation); color: var(--cf-ink); font-family: Geologica, system-ui, sans-serif; }
    .cv-bar { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; gap: 16px; flex-wrap: wrap; padding: 10px 24px; background: var(--cf-surface); border-bottom: 1px solid var(--cf-border-strong); }
    .cv-bar b { font-size: 14px; font-weight: 650; }
    .cv-bar nav { display: flex; gap: 4px; flex-wrap: wrap; }
    .cv-bar nav a { padding: 6px 10px; border-radius: 6px; font-size: 13px; color: var(--cf-ink); }
    .cv-bar nav a:hover { background: var(--cf-surface-raised); }
    .cv-ctl { display: inline-flex; gap: 2px; padding: 3px; border-radius: 8px; background: var(--cf-surface-subtle); border: 1px solid var(--cf-border); }
    .cv-ctl button { border: 1px solid transparent; background: transparent; color: var(--cf-ink-muted); font: 500 13px/1.3 Geologica, system-ui, sans-serif; padding: 5px 10px; border-radius: 6px; cursor: pointer; }
    .cv-ctl button[aria-pressed="true"] { background: var(--cf-surface-raised); color: var(--cf-ink); border-color: var(--cf-border-strong); }
    .cv-ctl button:focus-visible, .cv-bar a:focus-visible { outline: 2px solid var(--cf-focus); outline-offset: 2px; }
    .cv-stage { padding: 32px 40px 120px; zoom: var(--cv-zoom, .5); }
    .cv-page { margin-bottom: 160px; }
    .cv-page > h2 { font-size: 48px; font-weight: 650; letter-spacing: -0.02em; margin: 0 0 32px; color: var(--cf-ink); }
    .cv-row { display: flex; gap: 100px; align-items: flex-start; }
    .cv-col { display: flex; flex-direction: column; gap: 100px; width: 1440px; flex: none; }
    .cv-note { width: 100%; max-width: 1440px; font-size: 22px; line-height: 1.5; padding: 24px 28px; border-radius: 12px; background: var(--cf-surface); border: 1px solid var(--cf-border-strong); margin-bottom: 40px; box-sizing: border-box; }
    .cv-col .cv-note { margin-bottom: 0; }
    .cv-ab { margin: 0; flex: none; }
    .cv-ab figcaption { font: 600 20px/1.3 'JetBrains Mono', ui-monospace, monospace; color: var(--cf-ink-muted); margin-bottom: 14px; display: flex; gap: 12px; align-items: center; }
    .cv-tag { font-size: 14px; padding: 2px 8px; border-radius: 4px; border: 1px solid var(--cf-border-strong); }
    .ab { box-shadow: var(--cf-overlay-shadow); outline: 1px solid var(--cf-border-strong); color: var(--cf-ink); background: var(--cf-canvas); }
'''

SCRIPT = '''
<script>
(function () {
  var themeBtns = document.querySelectorAll('[data-theme]');
  themeBtns.forEach(function (b) {
    b.addEventListener('click', function () {
      var dark = b.dataset.theme === 'dark';
      document.querySelectorAll('.ab[data-follow]').forEach(function (el) {
        el.classList.toggle('dark', dark); el.classList.toggle('light', !dark);
      });
      document.body.classList.toggle('dark', dark); document.body.classList.toggle('light', !dark);
      themeBtns.forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
    });
  });
  var zoomBtns = document.querySelectorAll('[data-zoom]');
  zoomBtns.forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelector('.cv-stage').style.setProperty('--cv-zoom', b.dataset.zoom);
      zoomBtns.forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
    });
  });
})();
</script>
'''

page = f'''<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Холст «Агент»</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="{FONTS}" rel="stylesheet">
<style>
{tokens_css}
{STYLE}
{CHROME}
</style>
</head>
<body class="cv dark">
<header class="cv-bar">
  <b>Агент · холст · референс, не исходник продукта</b>
  <nav aria-label="Листы">{''.join(f'<a href="#{i}">{html.escape(t)}</a>' for i, t, _ in sections)}</nav>
  <span style="flex:1"></span>
  <div class="cv-ctl" role="group" aria-label="Тема"><button data-theme="dark" aria-pressed="true">Тёмная</button><button data-theme="light" aria-pressed="false">Светлая</button></div>
  <div class="cv-ctl" role="group" aria-label="Масштаб"><button data-zoom=".35" aria-pressed="false">35%</button><button data-zoom=".5" aria-pressed="true">50%</button><button data-zoom=".75" aria-pressed="false">75%</button><button data-zoom="1" aria-pressed="false">100%</button></div>
</header>
<main class="cv-stage">
{''.join(f'<section class="cv-page" id="{i}"><h2>{html.escape(t)}</h2>{c}</section>' for i, t, c in sections)}
</main>
{SCRIPT}
</body>
</html>
'''
with open(os.path.join(HERE, 'agent-canvas.html'), 'w', encoding='utf-8') as out:
    out.write(page)
print('built agent-canvas.html', len(page) // 1024, 'KB')
