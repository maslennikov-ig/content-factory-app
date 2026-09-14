/**
 * Seventh-walk core prompt. Earlier prompt modules stay unchanged so receipts
 * can still identify the exact contract that produced an older core.
 */

export const CORE_WRITE_PROMPT_VERSION = 'core-write/v3' as const;

export const coreWriteSystemV3 = (
  language: 'ru' | 'en',
  forbiddenPhrases: string
): string =>
  language === 'ru'
    ? [
        'Ты пишешь СУТЬ: нейтральный текст о том, что человек хочет рассказать, без площадки и без манеры. Это не пост и не пересказ брифа — это опора, из которой потом сделают тексты под разные площадки.',
        'Правила, все обязательные:',
        '1) числа, имена, примеры и характерные фразы человека переноси дословно; его ответы интерпретируй по смыслу и грамматически связывай с текстом, не вставляй их отдельной квитанцией;',
        '2) ничего не добавляй сверх брифа и фактов с пометкой «подтверждено»; строки «взято из ресерча» — это внешние опоры, а не подтверждение: сохраняй их осторожный статус и не выдавай их за проверенные факты; число, которого нет во входе, не пиши; пример, которого не было, не выдумывай;',
        '3) запрещены сглаживание, вводные обороты, обобщения вместо частностей, выводы «в итоге» и «таким образом», призывы и вопросы читателю;',
        '4) если слов человека мало — суть короткая; короткая правда лучше длинного пересказа; три предложения — нормальная суть;',
        '5) начинай с мысли человека, которая ближе всего к тезису, но сделай начало целым грамматически связанным предложением; выбранный вариант ответа пиши от первого лица автора;',
        '6) адреса, фразы «вот ссылка», «см.», вопросы к модели и фразы «я бы хотел написать о…» — служебный материал: адрес и формулировка запроса в текст не идут, их тема и прочитанный источник используются только по смыслу;',
        '7) вопросы человека — тема текста, а не цитаты и не вопросы читателю;',
        '8) «хочу написать о…», «я бы хотел в этот раз написать об…», «давай про…» — служебное намерение автора: извлеки тему и мысль, но не переноси эту рамку в суть;',
        '9) без разметки, эмодзи, заголовков и списков; абзацы через пустую строку; язык — язык ввода; фрагмент на другом языке внутри входа — материал для пересказа на языке ввода, а не строка для копирования;',
        `10) ${forbiddenPhrases}`,
      ].join('\n')
    : [
        'You are writing the CORE: a neutral text about what this person wants to tell, with no platform and no manner. It is not a post and not a retelling of the brief — it is the ground that texts for different platforms will later be made from.',
        'Rules, all of them binding:',
        "1) carry over the person's numbers, names, examples, and distinctive phrases verbatim; interpret answers by meaning and connect them grammatically instead of inserting them as a separate receipt;",
        '2) add nothing beyond the brief and facts marked «confirmed»; lines marked «taken from research» are outside support, not verification: keep their uncertainty and never present them as confirmed facts; a number that is not in the input is not written; an example that was not there is not invented;',
        '3) smoothing over, introductory turns of phrase, generalities in place of particulars, «in the end» and «thus» conclusions, calls to action and questions to the reader are forbidden;',
        '4) if the person gave few words, the core is short; a short truth beats a long retelling; three sentences is a normal core;',
        "5) begin with the person's thought that stands closest to the claim, but make the opening a complete grammatically connected sentence; write a selected answer option in the author's first person;",
        '6) URLs, phrases such as “here is the link” and “see”, questions to the model, and “I would like to write about…” are service material: do not put the address or request wording into the text; use only their topic and the read source by meaning;',
        "7) the person's questions are topics for the text, not quotations or questions to the reader;",
        '8) “I want to write about…” and “let us write about…” are writing instructions: extract the subject and thought but never include the instruction framing in the core;',
        '9) no markup, no emoji, no headings, no lists; paragraphs separated by a blank line; the language is the language of the input; a fragment in another language inside the input is material to retell in the input language, never a line to copy;',
        `10) ${forbiddenPhrases}`,
      ].join('\n');

export const CORE_WRITE_BLOCK_TITLES_V3 = {
  ru: {
    person: 'СЛОВА ЧЕЛОВЕКА (дословно)',
    answers: 'ОТВЕТЫ НА ВОПРОСЫ (интерпретировать по смыслу)',
    brief: 'БРИФ (что модель поняла)',
    thesis: 'тезис',
    position: 'позиция',
    disagreement: 'возражение',
    audience: 'адресат',
    confirmed: 'факты подтверждённые',
    research: 'взято из ресерча (не подтверждено)',
    borrowed: 'материал по ссылке (не подтверждено)',
    topic: 'тема чужого поста',
    angle: 'угол чужого поста',
    structure: 'строение чужого поста',
    claims: 'что чужой пост утверждает (пересказ, не его слова)',
  },
  en: {
    person: 'THE PERSON’S WORDS (verbatim)',
    answers: 'ANSWERS TO QUESTIONS (interpret by meaning)',
    brief: 'BRIEF (what the model understood)',
    thesis: 'claim',
    position: 'position',
    disagreement: 'objection',
    audience: 'written for',
    confirmed: 'confirmed facts',
    research: 'taken from research (not verified)',
    borrowed: 'linked material (not verified)',
    topic: 'topic of the pasted post',
    angle: 'angle of the pasted post',
    structure: 'structure of the pasted post',
    claims: 'what the pasted post claims (a retelling, not its words)',
  },
} as const;

export const CORE_WRITE_REPAIR_V3 = {
  ru: 'Эти отрезки перенесены из чужого текста дословно и в сути стоять не могут. Перепишите их своими словами, ничего не добавляя: ',
  en: 'These runs were carried over from somebody else’s text verbatim and cannot stand in the core. Rewrite them in your own words, adding nothing: ',
} as const;
