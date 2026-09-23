# Generates the *.body.html files of the twelfth-wave canvas.
CH=[('A','AiDevTeam','Telegram','var(--cf-info)'),('Т','Тестовая группа','Telegram','var(--cf-accent)'),('V','Сообщество AiDev','VK','var(--cf-signature)'),('Д','Блог на Дзене','Дзен','var(--cf-warning)'),('L','Igor · LinkedIn','LinkedIn','var(--cf-danger)')]
TXT=['Когда задачи лежат на общей доске, команда меньше пишет в чат…','Созвонов по статусу стало вдвое меньше — и вот почему…','Общая доска: как мы ушли от личных задачников…','Три недели с общей доской. Что изменилось в команде…','Shared board, fewer status calls: what changed…']
ST=[('plan','в плане'),('sched','в очереди'),('plan','в плане'),('draft','черновик'),('pub','вышел')]
def av(i,size=20): c=CH[i]; return f'<span class="av" style="background:{c[3]};width:{size}px;height:{size}px">{c[0]}</span>'
def page(w,h,inner,pad='24px 32px'): return f'<div style="width:{w}px;min-height:{h}px;background:var(--cf-canvas);padding:{pad};display:flex;flex-direction:column;gap:20px;box-sizing:border-box">\n{inner}\n</div>'
def ahead(): return '<span class="chip" style="height:32px;padding:0 10px;gap:8px">%%cal%%<span>впереди 6 дней · до вт 29.09</span></span>'
def calhead(which,date):
  s=open(f'_calhead_{which}.inc').read().replace('%%DATE%%',date)
  return s.replace('<span style="flex:1"></span>', '<span style="flex:1"></span>'+ahead(),1)
def row(i,wide=True):
  k,l=ST[i]
  return f'<div class="card" style="flex-direction:row;align-items:center;gap:12px;padding:8px 12px;background:var(--cf-surface)">{av(i)}<span class="sm" style="width:150px;flex:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{CH[i][1]}</span><span class="pill {k}">{l}</span><span class="sm" style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--cf-ink-muted)">{TXT[i]}</span><span class="cap">cnt-3{2+i%2}</span></div>'
B={}
# ---------- Calendar A: day, one time = one group of rows
B['Main']=page(1440,900,f'''  <div style="display:flex;align-items:center;gap:12px"><span class="h2" style="font-size:20px">Календарь</span></div>
{calhead('day','четверг, 24.09.2026')}
  <div style="display:grid;grid-template-columns:72px minmax(0,1fr);gap:0 20px">
    <span class="mono sm" style="padding-top:14px">09:20</span>
    <div style="padding:6px 0 18px;border-bottom:1px solid var(--cf-border);display:flex;flex-direction:column;gap:6px">
      <div style="display:flex;align-items:center;gap:8px;padding:4px 0"><span class="lab">5 каналов</span><span style="display:inline-flex">{''.join(av(i,18) for i in range(5))}</span><span style="flex:1"></span><span class="cap">свободно: нет</span></div>
      {''.join(row(i) for i in range(5))}
    </div>
    <span class="mono sm muted" style="padding-top:22px">14:10</span>
    <div style="padding:18px 0;border-bottom:1px solid var(--cf-border);display:flex;flex-direction:column;gap:8px">
      {row(0)}
      <div class="slot-empty">%%plus%%<span>Добавить пост на 14:10</span><span style="flex:1"></span><span style="display:inline-flex;gap:4px;align-items:center">{av(1,16)}{av(3,16)}<span class="cap">&nbsp;ещё свободно у 2 каналов</span></span></div>
    </div>
    <span class="mono sm muted" style="padding-top:22px">19:00</span>
    <div style="padding:18px 0"><div class="slot-empty">%%plus%%<span>Добавить пост на 19:00</span><span style="flex:1"></span><span class="cap">слот · AiDevTeam, Тестовая группа</span></div></div>
  </div>''')
# ---------- Calendar B: channel lanes
lanes=''.join(f'<div style="display:flex;align-items:center;gap:8px;padding:10px 12px;border-inline-start:1px solid var(--cf-border)">{av(i)}<span class="sm" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{CH[i][1]}</span></div>' for i in range(5))
def lane_cell(i,t,has):
  if not has: return f'<div style="padding:8px;border-inline-start:1px solid var(--cf-border);border-top:1px solid var(--cf-border)"><div class="slot-empty" style="min-height:64px;justify-content:center">%%plus%%<span>{t}</span></div></div>'
  k,l=ST[i]; return f'<div style="padding:8px;border-inline-start:1px solid var(--cf-border);border-top:1px solid var(--cf-border)"><div class="card" style="background:var(--cf-surface);min-height:64px"><div class="band {k}"></div><div style="padding:6px 8px;display:flex;flex-direction:column;gap:4px"><span class="pill {k}" style="align-self:flex-start">{l}</span><span class="sm" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">{TXT[i]}</span></div></div></div>'
grid=f'<div style="display:grid;grid-template-columns:72px repeat(5,minmax(0,1fr));border:1px solid var(--cf-border);border-radius:8px;background:var(--cf-surface);overflow:hidden"><span></span>{lanes}'
for t,has in [('09:20',[1,1,1,1,1]),('14:10',[1,0,0,0,1]),('19:00',[0,0,1,0,0])]:
  grid+=f'<span class="mono sm" style="padding:12px;border-top:1px solid var(--cf-border)">{t}</span>'+''.join(lane_cell(i,t,has[i]) for i in range(5))
grid+='</div>'
B['CalLanes']=page(1440,760,f'''  <div style="display:flex;align-items:center;gap:12px"><span class="h2" style="font-size:20px">Календарь</span></div>
{calhead('day','четверг, 24.09.2026')}
  {grid}
  <span class="sm muted">Каналов больше шести — дорожки прокручиваются вбок, колонка времени стоит на месте. Порядок дорожек — как в меню каналов.</span>''')
# ---------- Week and month with 5 channels
def wk_group(n): return f'<div class="card" style="background:var(--cf-surface)"><div style="display:flex;height:4px"><i style="flex:2;background:repeating-linear-gradient(90deg,var(--cf-info) 0 6px,transparent 6px 10px)"></i><i style="flex:1;background:var(--cf-accent)"></i><i style="flex:1;background:var(--cf-info)"></i><i style="flex:1;background:var(--cf-signature)"></i></div><div style="padding:6px 8px;display:flex;flex-direction:column;gap:4px"><div style="display:flex;align-items:center;gap:6px"><span class="mono sm">09:20</span><span style="flex:1"></span><span class="cap">{n} кан.</span></div><span style="display:inline-flex">{"".join(av(i,18) for i in range(n))}</span></div></div>'
days=['пн 21','вт 22','ср 23','чт 24','пт 25','сб 26','вс 27']
wk='<div style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px">'+''.join(f'<div style="display:flex;flex-direction:column;gap:6px"><span class="cap" style="padding:4px 2px">{d}</span>'+(wk_group(5) if d in('чт 24','пт 25') else (f'<div class="card" style="background:var(--cf-surface)"><div class="band plan"></div><div style="padding:6px 8px;display:flex;align-items:center;gap:6px">{av(0,16)}<span class="sm" style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Общая доска…</span><span class="cap">09:20</span></div></div>' if d in ('вт 22','сб 26') else '<div class="slot-empty" style="min-height:32px;padding:0 8px">%%plus%%<span class="cap">09:20</span></div>'))+'</div>' for d in days)+'</div>'
expanded='<div class="panel" style="padding:12px;display:flex;flex-direction:column;gap:6px;width:560px"><div style="display:flex;align-items:center;gap:8px"><span class="lab">чт 24.09 · 09:20</span><span style="flex:1"></span><span class="cap">по щелчку по группе</span></div>'+''.join(row(i) for i in range(5))+'</div>'
mon='<div style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px">'+''.join(f'<div class="panel" style="min-height:92px;padding:6px 8px;display:flex;flex-direction:column;gap:6px"><span class="cap">{d}</span>'+(f'<div style="display:flex;align-items:center;gap:6px"><span style="display:inline-flex">{"".join(av(i,16) for i in range(5))}</span><span class="cap">5</span></div><span class="cap" style="color:var(--cf-ink)">09:20 · 14:10</span>' if d in(24,25) else ('<span class="chip" style="height:20px">%%plus%% 2 слота</span>' if d>25 else ''))+'</div>' for d in range(21,28))+'</div>'
B['CalWeekMonth']=page(1440,980,f'''  <div style="display:flex;align-items:center;gap:12px"><span class="h2" style="font-size:20px">Неделя и месяц при пяти каналах</span></div>
  <span class="lab">Неделя · одна карточка на время, внутри — каналы</span>
  {wk}
  {expanded}
  <span class="lab" style="margin-top:8px">Месяц · значки каналов и времена, без текста</span>
  {mon}''')
# ---------- Picker with free/booked marks
def prow(i,code,title,state,sel=False):
  st={'free':'<span class="pill sched" style="background:transparent;border:1px solid var(--cf-accent)">свободна</span>','plan':'<span class="pill plan">в плане · пт 25.09 09:20</span>','queue':'<span class="pill sched">в очереди · сб 26.09 14:10</span>'}[state]
  bg='background:var(--cf-accent-soft);border-color:var(--cf-accent)' if sel else ''
  return f'<div class="card" style="flex-direction:row;align-items:center;gap:12px;padding:10px 12px;background:var(--cf-surface);{bg}">{av(i)}<div style="display:flex;flex-direction:column;gap:2px;flex:1;min-width:0"><span class="sm" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">{title}</span><span class="cap">{code} · {CH[i][1]}</span></div>{st}</div>'
picker=f'''<div style="position:relative;width:1440px;height:860px;background:var(--cf-canvas)"><div class="dim"></div>
<div class="modal" style="left:420px;top:90px;width:600px;padding:20px;display:flex;flex-direction:column;gap:14px">
  <div style="display:flex;align-items:center;gap:8px"><span class="h2">Что публикуем · чт 24.09, 09:20</span><span style="flex:1"></span><span class="btn quiet dense icon">%%x%%</span></div>
  <div class="seg"><span class="on">AiDevTeam</span><span>Тестовая группа</span><span>Все каналы</span></div>
  <div style="display:flex;gap:8px"><span class="chip">все · 4</span><span class="chip new">свободные · 2</span></div>
  {prow(0,'cnt-32','Общая доска задач: команда меньше пишет в чат','free',True)}
  {prow(0,'cnt-31','Исландский эксперимент: меньше часов — та же работа','free')}
  {prow(0,'cnt-30','Стендапы нужны новичкам и командам в кризисе','plan')}
  {prow(0,'cnt-29','Почему мы перестали писать отчёты по пятницам','queue')}
  <div class="note-box">Уже стоящую адаптацию можно поставить и сюда — она переедет, старое время освободится. Мы переспросим.</div>
  <div style="display:flex;align-items:center;gap:8px"><span class="btn quiet">%%plus%%Новая заготовка</span><span style="flex:1"></span><span class="btn secondary">Отмена</span><span class="btn primary">Поставить на 09:20</span></div>
</div></div>'''
B['Picker']=picker
# ---------- Placed A: success inside the window
B['PlacedA']=f'''<div style="position:relative;width:1440px;height:700px;background:var(--cf-canvas)"><div class="dim"></div>
<div class="modal" style="left:420px;top:120px;width:600px;padding:24px;display:flex;flex-direction:column;gap:16px">
  <div style="display:flex;align-items:center;gap:10px;color:var(--cf-accent)">%%ok%%<span class="h2" style="color:var(--cf-ink)">Стоит в плане</span></div>
  <div class="card" style="flex-direction:row;align-items:center;gap:12px;padding:12px;background:var(--cf-surface)">{av(0,28)}<div style="display:flex;flex-direction:column;gap:2px;flex:1"><span class="body" style="font-size:15px">Общая доска задач: команда меньше пишет в чат</span><span class="cap">cnt-32 · AiDevTeam · чт 24.09, 09:20</span></div><span class="pill plan">бронь</span></div>
  <span class="sm muted">Сама не опубликуется: в канале этот режим — «бронь». Накануне напомним, в день публикации можно подтвердить одной кнопкой.</span>
  <div style="display:flex;align-items:center;gap:8px"><span class="btn quiet">Выбрать другую</span><span style="flex:1"></span><span class="btn secondary">Открыть и поправить</span><span class="btn primary">Готово</span></div>
</div></div>'''
# ---------- Placed B: lands on the tab with a banner
B['PlacedB']=page(1440,760,f'''%%INC:_piecehead.inc%%
  <div class="ok-banner"><span style="color:var(--cf-accent)">%%ok%%</span><span><b style="font-weight:650">Стоит в плане на чт 24.09, 09:20.</b> Здесь можно поправить текст — план не собьётся.</span><span style="flex:1"></span><span class="btn quiet dense">Вернуться в календарь</span></div>
  <div class="panel" style="padding:20px;display:flex;flex-direction:column;gap:10px">%%INC:_text.inc%%</div>
  <div style="display:flex;align-items:center;gap:8px;padding-top:8px;border-top:1px solid var(--cf-border)"><span class="btn danger-q">Удалить адаптацию</span><span style="flex:1"></span><span class="pill plan" style="height:28px;padding:0 10px">в плане · чт 24.09 09:20</span><span class="btn secondary">%%cal%%Перенести</span><span class="split"><span>Подтвердить публикацию</span><span>%%chev%%</span></span></div>''')
# ---------- Plan mode on the channel card
def opt(t,d,on=False): return f'<div class="card" style="padding:14px;gap:6px;background:var(--cf-surface);{"border-color:var(--cf-accent);box-shadow:inset 0 0 0 1px var(--cf-accent)" if on else ""}"><div style="display:flex;align-items:center;gap:8px"><span style="width:14px;height:14px;border-radius:50%;border:1.5px solid {"var(--cf-accent)" if on else "var(--cf-border-control)"};box-sizing:border-box;{"box-shadow:inset 0 0 0 3px var(--cf-surface);background:var(--cf-accent)" if on else ""}"></span><span class="sm" style="font-weight:650;color:var(--cf-ink)">{t}</span></div><span class="sm muted">{d}</span></div>'
B['PlanMode']=page(1000,620,f'''  <div class="cap">Каналы / Telegram · AiDevTeam / Как пишем</div>
  <div class="srow" style="grid-template-columns:240px minmax(0,1fr)"><div style="display:flex;flex-direction:column;gap:6px"><span class="h2">Планирование</span><span class="sm muted">Что делать с готовой адаптацией для этого канала. У каждого канала и группы — своё.</span></div>
  <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px">
    {opt('Без плана','Адаптация лежит черновиком. Время выбираете сами.')}
    {opt('Бронь','Встаёт в ближайшее время канала с пометкой «в плане». Выйдет после вашего «Подтвердить».',True)}
    {opt('Автопилот','Встаёт в очередь и выходит сама. Новый вариант заменяет старый до выхода.')}
  </div></div>
  <div class="srow" style="grid-template-columns:240px minmax(0,1fr);border-bottom:0"><div style="display:flex;flex-direction:column;gap:6px"><span class="h2">Время публикаций</span><span class="sm muted">Из него берутся слоты.</span></div><div style="display:flex;gap:8px;flex-wrap:wrap"><span class="chip">09:20</span><span class="chip">14:10</span><span class="chip">19:00</span><span class="chip new">%%plus%% время</span></div></div>''')
# ---------- Split button
def sb(label,sec=False,w=''): return f'<span class="split{" sec" if sec else ""}" {w}><span>{label}</span><span>%%chev%%</span></span>'
B['Split']=page(1100,720,f'''  <span class="h2">Кнопка с выбором — одна на весь продукт</span>
  <div style="display:grid;grid-template-columns:260px minmax(0,1fr);gap:20px 32px;align-items:center">
    <span class="lab">Было (скриншот B4)</span><span style="display:inline-flex;height:40px;align-items:center;padding:0 16px;gap:60px;border-radius:0 8px 8px 0;background:var(--cf-accent);color:var(--cf-accent-ink);font-weight:500;width:max-content">Запланировать %%chev%%</span>
    <span class="lab">A · одна плашка, черта перед стрелкой</span><div style="display:flex;gap:12px;flex-wrap:wrap">{sb('Запланировать')}{sb('Переписать с этим',True)}{sb('Опубликовать',False)}</div>
    <span class="lab">B · две кнопки встык с зазором 2px</span><div style="display:flex;gap:12px;flex-wrap:wrap"><span style="display:inline-flex;gap:2px"><span class="btn primary" style="border-radius:8px 4px 4px 8px">Запланировать</span><span class="btn primary icon" style="border-radius:4px 8px 8px 4px">%%chev%%</span></span><span style="display:inline-flex;gap:2px"><span class="btn secondary" style="border-radius:8px 4px 4px 8px">Переписать с этим</span><span class="btn secondary icon" style="border-radius:4px 8px 8px 4px">%%chev%%</span></span></div>
    <span class="lab">Меню открыто (A)</span><div style="position:relative;height:170px"><div class="panel" style="position:absolute;left:0;top:0;width:300px;padding:6px;display:flex;flex-direction:column;box-shadow:0 12px 32px rgba(0,0,0,.35)"><div style="padding:8px 10px;border-radius:6px;background:var(--cf-surface-subtle)"><div class="sm" style="font-weight:650">Запланировать</div><div class="cap">на выбранное время</div></div><div style="padding:8px 10px"><div class="sm" style="font-weight:650;color:var(--cf-warning)">Опубликовать сейчас</div><div class="cap">уйдёт в канал сразу</div></div></div><span style="position:absolute;left:0;top:130px">{sb('Запланировать')}</span></div>
    <span class="lab">Стрелки у всех выпадашек</span><div style="display:flex;gap:10px;flex-wrap:wrap"><span class="input val" style="width:200px">Все этапы<span style="flex:1"></span>%%chev%%</span><span class="input val" style="width:200px">Тестовая группа<span style="flex:1"></span>%%chev%%</span><span class="btn secondary">Ещё канал %%chev%%</span></div>
  </div>
  <div class="note-box">Везде одна стрелка 14px, один радиус 8px, черта — цвета текста кнопки на 35%. Выбор: A или B. Заменит «Запланировать» во вкладке, в окне поста, «Переписать с этим» и все меню с выбором.</div>''')
# ---------- Emoji amount + emoji in editor
EM='😀 😅 🙂 😉 🤔 🙌 👏 🔥 💡 ✅ ⚡ 📌 📈 🚀 🧩 🎯 👀 💬 📣 🛠️ 📝 ⏱️ 🤝 ❤️'.split()
grid=''.join(f'<span class="emo">{e}</span>' for e in EM)
B['Emoji']=page(1440,900,f'''  <span class="h2">Эмодзи: сколько и как вставить</span>
  <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px">
   <div class="panel" style="padding:16px;display:flex;flex-direction:column;gap:14px"><span class="lab">A · бегунок с числом</span>
     <div style="display:flex;align-items:center;gap:12px"><span class="cap" style="width:70px">Эмодзи</span><div class="range" style="flex:1"><i style="width:60%"></i><b style="left:60%"></b></div><span class="mono sm" style="width:110px;text-align:right">до 6</span></div>
     <div style="display:flex;justify-content:space-between" class="cap"><span>нет</span><span>1</span><span>3</span><span>6</span><span>10</span><span>без предела</span></div>
     <span class="sm muted">Модель получает точное «не больше 6». Отметка канала — серой рисочкой.</span></div>
   <div class="panel" style="padding:16px;display:flex;flex-direction:column;gap:14px"><span class="lab">B · шаги с числами</span>
     <div class="seg" style="align-self:flex-start"><span>нет</span><span>1–3</span><span class="on">4–6</span><span>7–10</span><span>сколько уместно</span></div>
     <span class="sm muted">Те же пять значений в «Как пишем в канале» и «Для этого поста». «Много» исчезает — вместо него числа.</span></div>
  </div>
  <span class="lab">Редактор: кнопка эмодзи в панели</span>
  <div style="display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:24px;align-items:start">
   <div class="frame"><div style="display:flex;align-items:center;gap:4px;padding:6px 8px;border-bottom:1px solid var(--cf-border)"><span class="btn quiet dense icon" style="font-weight:650">Ж</span><span class="btn quiet dense icon">%%link%%</span><span class="btn quiet dense icon" style="background:var(--cf-surface-subtle)">%%smile%%</span><span style="width:1px;height:20px;background:var(--cf-border);margin:0 4px"></span><span class="cap">Telegram: жирный, ссылка, эмодзи</span><span style="flex:1"></span><span class="cap">618 из 4096</span><span class="btn secondary dense" style="margin-inline-start:8px">Готово</span></div><div style="padding:16px 18px" class="body">Когда задачи лежат на общей доске, команда меньше пишет в чат 📌 Вопросов «кто это делает» почти не осталось, а созвонов по статусу стало <b>вдвое</b> меньше.|</div></div>
   <div class="panel" style="padding:10px;display:flex;flex-direction:column;gap:8px;box-shadow:0 12px 32px rgba(0,0,0,.35)"><span class="input" style="height:32px">Найти: доска, огонь…</span><span class="cap">недавние</span><div style="display:flex;gap:2px">{''.join(f'<span class="emo">{e}</span>' for e in ['📌','🔥','✅','💡','🚀','🙌','👀','📈'])}</div><span class="cap">все</span><div style="display:grid;grid-template-columns:repeat(8,32px);gap:2px">{grid}</div></div>
  </div>
  <div class="note-box">Кнопки панели зависят от формата канала: у Telegram — жирный, ссылка, эмодзи; у формата с заголовком добавится заголовок, у видео текстового редактора не будет. Эмодзи вставляются туда, где стоит курсор; поиск по-русски и по-английски; библиотека уже есть в проекте.</div>''')
# ---------- Keys in two columns
def fld(l,v,muted=False): return f'<div class="field"><span class="cap">{l}</span><span class="input{"" if muted else " val"}">{v}</span></div>'
roles=[('Разбор','extract'),('Черновик','draft'),('Проверка','review'),('Поиск','research'),('Оценка','judge'),('Картинка','image')]
rolesA=''.join(fld(n,'как основная','muted') for n,_ in roles)
rolesB=''.join(f'<span class="sm">{n}</span><span class="input" style="height:32px">как основная</span><span class="cap">{k}</span>' for n,k in roles)
B['Keys']=page(1440,980,f'''  <span class="h2">Глобальные настройки → ИИ · свой ключ</span>
  <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px">
  <div class="panel" style="padding:20px;display:flex;flex-direction:column;gap:14px"><span class="lab">A · поля парами, роли сеткой 3×2</span>
    <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px">{fld('Провайдер','OpenRouter')}{fld('Ключ','•••••••• задан')}{fld('Модель текста','openai/gpt-6-luna')}{fld('Модель картинок','openai/gpt-5-image-mini')}</div>
    <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px">{fld('Режим','Flex, при сбое — обычный')}{fld('Запасная модель','z-ai/glm-5.3')}</div>
    <span class="lab" style="margin-top:6px">Модель на роль</span>
    <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px">{rolesA}</div></div>
  <div class="panel" style="padding:20px;display:flex;flex-direction:column;gap:14px"><span class="lab">B · главное парами, роли таблицей</span>
    <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px">{fld('Провайдер','OpenRouter')}{fld('Ключ','•••••••• задан')}{fld('Модель текста','openai/gpt-6-luna')}{fld('Модель картинок','openai/gpt-5-image-mini')}{fld('Режим','Flex, при сбое — обычный')}{fld('Запасная модель','z-ai/glm-5.3')}</div>
    <div style="display:grid;grid-template-columns:120px minmax(0,1fr) 70px;gap:8px 12px;align-items:center;border-top:1px solid var(--cf-border);padding-top:14px">{rolesB}</div>
    <span class="sm muted">Роли свёрнуты по умолчанию: «Модель на роль · все как основная ▸».</span></div>
  </div>
  <div class="note-box">Подсказки под каждым полем уходят в «?» рядом с названием. Раздел целиком — не шире 960, как сейчас.</div>''')
# ---------- Ahead + motion
frames=lambda a,b,c:''.join(f'<div class="frame" style="height:120px;padding:10px;display:flex;flex-direction:column;gap:6px;opacity:{o};transform:translateY({y}px)"><div class="bar" style="width:40%"></div><div class="bar" style="width:80%"></div><div class="bar" style="width:65%"></div><span class="cap" style="margin-top:auto">{t}</span></div>' for o,y,t in [a,b,c])
B['Ahead']=page(1440,760,f'''  <span class="h2">«Сколько вперёд» и движение</span>
  <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px">
   <div class="panel" style="padding:16px;display:flex;flex-direction:column;gap:12px"><span class="lab">1 · В шапке календаря (на всех видах)</span><div style="display:flex;gap:8px;align-items:center">{ahead()}<span class="cap">по наведению: по каналам</span></div>
     <div class="kv" style="width:360px"><span>AiDevTeam</span><span>6 дней · до 29.09</span><span>Тестовая группа</span><span>2 дня · до 25.09</span><span>Сообщество AiDev</span><span>пусто с 24.09</span></div></div>
   <div class="panel" style="padding:16px;display:flex;flex-direction:column;gap:12px"><span class="lab">2 · Аналитика → Производство, карточка</span><div style="display:flex;align-items:baseline;gap:10px"><span class="h1 mono">6</span><span class="sm">дней впереди</span></div><div style="display:flex;gap:3px">{''.join(f'<i style="flex:1;height:18px;border-radius:3px;background:{"var(--cf-accent)" if d<6 else "var(--cf-surface-subtle)"}"></i>' for d in range(14))}</div><span class="cap">следующие 14 дней · закрашено — есть пост в плане или в очереди</span></div>
  </div>
  <span class="lab">Переходы между страницами: 180 мс, ease-out, без движения при «уменьшить движение»</span>
  <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px">{frames((0.25,8,'0 мс · новая страница'),(0.7,3,'90 мс'),(1,0,'180 мс · на месте'))}</div>
  <div class="note-box">Меню и шапка не двигаются — проявляется только содержимое. Вкладки заготовки: сменяются плавным наплывом 150 мс. Окна: появление с лёгким подъёмом 180 мс. Списки: без «прыжков» при загрузке — заглушки того же размера.</div>''')
for k,v in B.items(): open(f'{k}.body.html','w').write(v+'\n')
print('bodies',len(B))
