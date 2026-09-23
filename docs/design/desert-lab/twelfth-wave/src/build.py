import re,os,sys
d=os.path.dirname(os.path.abspath(__file__)); out=os.path.dirname(d)
head=open(f'{d}/_head.html').read(); tail=open(f'{d}/_tail.html').read()
extra=open(f'{d}/_extra.css').read()
head=head.replace('  </style>\n</helmet>', extra+'  </style>\n</helmet>')
I={
 'chev':'<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 6.5 8 10l3.5-3.5"></path></svg>',
 'clock':'<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="5.5"></circle><path d="M8 5v3.2l2.2 1.3"></path></svg>',
 'plus':'<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 4v8M4 8h8"></path></svg>',
 'pen':'<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 13l.6-2.6L10.8 3.2a1.2 1.2 0 011.7 0l.3.3a1.2 1.2 0 010 1.7L5.6 12.4 3 13z"></path></svg>',
 'dots':'<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h.01M8 8h.01M12 8h.01"></path></svg>',
 'link':'<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.8 9.2a2.6 2.6 0 003.7 0l2-2a2.6 2.6 0 00-3.7-3.7l-.6.6"></path><path d="M9.2 6.8a2.6 2.6 0 00-3.7 0l-2 2a2.6 2.6 0 003.7 3.7l.6-.6"></path></svg>',
 'img':'<svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="3" width="11" height="10" rx="1.5"></rect><circle cx="6" cy="6.5" r="1"></circle><path d="M13.5 10.5 10.5 7.5 4 13"></path></svg>',
 'list':'<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 4.5h7M6 8h7M6 11.5h7M3 4.5h.01M3 8h.01M3 11.5h.01"></path></svg>',
 'x':'<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"></path></svg>',
 'check':'<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 8.5l3 3 6-6.5"></path></svg>',
 'tgp':'<svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M14 2.5 1.8 7.2c-.8.3-.8.8 0 1l3 .9 1.2 3.7c.2.5.3.6.7.6.3 0 .5-.1.7-.3l1.5-1.4 3.1 2.3c.6.3 1 .2 1.1-.5l2-9.4c.2-.9-.3-1.2-.9-.9z"></path></svg>',
 'left':'<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 4 6 8l4 4"></path></svg>',
 'smile':'<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="5.5"></circle><path d="M5.8 9.4a2.8 2.8 0 004.4 0M6 6.5h.01M10 6.5h.01"></path></svg>',
 'cal':'<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="3.5" width="11" height="10" rx="1.5"></rect><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3"></path></svg>',
 'ok':'<svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="8" r="6"></circle><path d="M5.3 8.2l1.9 1.9 3.6-3.8"></path></svg>',
 'pin':'<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="10" height="9" rx="1.5"></rect><path d="M3 7h10"></path></svg>',
 'right':'<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 4l4 4-4 4"></path></svg>',
}
def sub(t):
  for _ in range(3):
    t=re.sub(r'%%INC:([\w.]+)%%',lambda m:open(f'{d}/{m.group(1)}').read(),t)
  return re.sub(r'%%(\w+)%%',lambda m:I[m.group(1)],t)
for f in sorted(os.listdir(d)):
  if f.endswith('.body.html'):
    body=sub(open(f'{d}/{f}').read())
    assert '%%' not in body, f
    open(f'{out}/{f.replace(".body.html",".dc.html")}','w').write(head+'<div style="{{ themeVars }}">\n'+body+'\n</div>\n'+tail)
    print('built',f)
