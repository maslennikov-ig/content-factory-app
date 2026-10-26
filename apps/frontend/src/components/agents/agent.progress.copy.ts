/** Assistant-owned live status copy for every interface locale. */
export const agentProgressCopy = {
  ru: {
    thinking: 'Думаю…', kind: 'Работаю', working: 'Работаю…',
    leaveNote: 'Можно уйти с экрана — я продолжу работу',
    stages: {
      started: 'Читаю…', brief: 'Собираю бриф…', claims: 'Разбираю утверждения…',
      search: 'Ищу недостающие факты…', writing: 'Пишу…',
      measuring: 'Считаю длину фраз, пунктуацию и повторы…',
      proposing: 'Составляю предложение голоса…', retrying: 'Связь мигнула — повторяю шаг…',
      fallback: 'Переключаюсь на резервный ИИ…',
    },
  },
  en: {
    thinking: "I'm thinking…", kind: "I'm working", working: "I'm working…",
    leaveNote: "You can leave the screen — I'll keep working.",
    stages: {
      started: "I'm reading…", brief: "I'm filling in the brief…", claims: "I'm reviewing the claims…",
      search: "I'm looking for missing facts…", writing: "I'm writing…",
      measuring: "I'm checking sentence length, punctuation and repetition…",
      proposing: "I'm drafting a voice proposal…", retrying: "Connection hiccup — I'm retrying the step…",
      fallback: "I'm switching to the backup AI…",
    },
  },
  de: {
    thinking: 'Ich denke nach…', kind: 'Ich arbeite', working: 'Ich arbeite…',
    leaveNote: 'Du kannst den Bildschirm verlassen — ich arbeite weiter.',
    stages: {
      started: 'Ich lese…', brief: 'Ich erstelle das Briefing…', claims: 'Ich prüfe die Aussagen…',
      search: 'Ich suche nach fehlenden Fakten…', writing: 'Ich schreibe…',
      measuring: 'Ich prüfe Satzlänge, Zeichensetzung und Wiederholungen…',
      proposing: 'Ich formuliere einen Vorschlag für die Markenstimme…', retrying: 'Verbindung unterbrochen — ich wiederhole diesen Schritt…',
      fallback: 'Ich wechsle zur Ersatz-KI…',
    },
  },
  fr: {
    thinking: 'Je réfléchis…', kind: 'Je travaille', working: 'Je travaille…',
    leaveNote: 'Vous pouvez quitter cet écran — je continue à travailler.',
    stages: {
      started: 'Je lis…', brief: 'Je prépare le brief…', claims: 'J’examine les affirmations…',
      search: 'Je cherche les faits manquants…', writing: 'J’écris…',
      measuring: 'Je vérifie la longueur des phrases, la ponctuation et les répétitions…',
      proposing: 'Je prépare une proposition de ton…', retrying: 'La connexion a été interrompue — je réessaie cette étape…',
      fallback: 'Je passe à l’IA de secours…',
    },
  },
  es: {
    thinking: 'Estoy pensando…', kind: 'Estoy trabajando', working: 'Estoy trabajando…',
    leaveNote: 'Puedes salir de esta pantalla — seguiré trabajando.',
    stages: {
      started: 'Estoy leyendo…', brief: 'Estoy preparando el brief…', claims: 'Estoy revisando las afirmaciones…',
      search: 'Estoy buscando los datos que faltan…', writing: 'Estoy escribiendo…',
      measuring: 'Estoy comprobando la longitud de las frases, la puntuación y las repeticiones…',
      proposing: 'Estoy preparando una propuesta de voz…', retrying: 'Se interrumpió la conexión — vuelvo a intentar este paso…',
      fallback: 'Estoy cambiando a la IA de respaldo…',
    },
  },
  it: {
    thinking: 'Sto pensando…', kind: 'Sto lavorando', working: 'Sto lavorando…',
    leaveNote: 'Puoi lasciare questa schermata — continuerò a lavorare.',
    stages: {
      started: 'Sto leggendo…', brief: 'Sto preparando il brief…', claims: 'Sto esaminando le affermazioni…',
      search: 'Sto cercando i fatti mancanti…', writing: 'Sto scrivendo…',
      measuring: 'Sto controllando la lunghezza delle frasi, la punteggiatura e le ripetizioni…',
      proposing: 'Sto preparando una proposta di voce…', retrying: 'Connessione interrotta — riprovo questo passaggio…',
      fallback: 'Passo all’IA di riserva…',
    },
  },
  pt: {
    thinking: 'Estou pensando…', kind: 'Estou trabalhando', working: 'Estou trabalhando…',
    leaveNote: 'Você pode sair desta tela — vou continuar trabalhando.',
    stages: {
      started: 'Estou lendo…', brief: 'Estou preparando o briefing…', claims: 'Estou analisando as afirmações…',
      search: 'Estou buscando os fatos que faltam…', writing: 'Estou escrevendo…',
      measuring: 'Estou verificando o tamanho das frases, a pontuação e as repetições…',
      proposing: 'Estou preparando uma proposta de voz…', retrying: 'A conexão falhou — vou tentar esta etapa de novo…',
      fallback: 'Estou mudando para a IA reserva…',
    },
  },
  tr: {
    thinking: 'Düşünüyorum…', kind: 'Çalışıyorum', working: 'Çalışıyorum…',
    leaveNote: 'Ekrandan ayrılabilirsin — çalışmaya devam edeceğim.',
    stages: {
      started: 'Okuyorum…', brief: 'Brifi hazırlıyorum…', claims: 'İddiaları inceliyorum…',
      search: 'Eksik bilgileri arıyorum…', writing: 'Yazıyorum…',
      measuring: 'Cümle uzunluğunu, noktalama işaretlerini ve tekrarları kontrol ediyorum…',
      proposing: 'Marka sesi önerisi hazırlıyorum…', retrying: 'Bağlantı kesildi — bu adımı yeniden deniyorum…',
      fallback: 'Yedek yapay zekâya geçiyorum…',
    },
  },
  vi: {
    thinking: 'Tôi đang suy nghĩ…', kind: 'Tôi đang làm việc', working: 'Tôi đang làm việc…',
    leaveNote: 'Bạn có thể rời màn hình này — tôi sẽ tiếp tục làm việc.',
    stages: {
      started: 'Tôi đang đọc…', brief: 'Tôi đang chuẩn bị bản tóm tắt…', claims: 'Tôi đang xem xét các nhận định…',
      search: 'Tôi đang tìm thông tin còn thiếu…', writing: 'Tôi đang viết…',
      measuring: 'Tôi đang kiểm tra độ dài câu, dấu câu và nội dung lặp…',
      proposing: 'Tôi đang soạn đề xuất về giọng điệu…', retrying: 'Kết nối bị gián đoạn — tôi đang thử lại bước này…',
      fallback: 'Tôi đang chuyển sang AI dự phòng…',
    },
  },
  ja: {
    thinking: '私は考えています…', kind: '私は作業中です', working: '私は作業しています…',
    leaveNote: 'この画面を離れても大丈夫です — 私が作業を続けます。',
    stages: {
      started: '私は読んでいます…', brief: '私は概要をまとめています…', claims: '私は主張を確認しています…',
      search: '私は不足している事実を探しています…', writing: '私は執筆しています…',
      measuring: '私は文の長さ、句読点、繰り返しを確認しています…',
      proposing: '私は文体の提案を作成しています…', retrying: '接続が途切れました — 私はこの手順を再試行しています…',
      fallback: '私は予備のAIに切り替えています…',
    },
  },
  ko: {
    thinking: '저는 생각하고 있어요…', kind: '저는 작업 중이에요', working: '저는 작업하고 있어요…',
    leaveNote: '화면을 나가셔도 돼요 — 제가 계속 작업할게요.',
    stages: {
      started: '저는 읽고 있어요…', brief: '저는 개요를 정리하고 있어요…', claims: '저는 주장을 검토하고 있어요…',
      search: '저는 부족한 사실을 찾고 있어요…', writing: '저는 글을 쓰고 있어요…',
      measuring: '저는 문장 길이, 문장 부호, 반복을 확인하고 있어요…',
      proposing: '저는 문체 제안을 작성하고 있어요…', retrying: '연결이 끊겼어요 — 제가 이 단계를 다시 시도하고 있어요…',
      fallback: '저는 예비 AI로 전환하고 있어요…',
    },
  },
  zh: {
    thinking: '我正在思考…', kind: '我正在处理', working: '我正在处理…',
    leaveNote: '你可以离开此页面 — 我会继续处理。',
    stages: {
      started: '我正在阅读…', brief: '我正在整理简报…', claims: '我正在检查各项说法…',
      search: '我正在查找缺失的事实…', writing: '我正在撰写…',
      measuring: '我正在检查句子长度、标点和重复内容…',
      proposing: '我正在拟定语气建议…', retrying: '连接中断 — 我正在重试此步骤…',
      fallback: '我正在切换到备用 AI…',
    },
  },
  ar: {
    thinking: 'أفكر…', kind: 'أعمل', working: 'أعمل…',
    leaveNote: 'يمكنك مغادرة هذه الشاشة — سأواصل العمل.',
    stages: {
      started: 'أقرأ…', brief: 'أعدّ الموجز…', claims: 'أراجع الادعاءات…',
      search: 'أبحث عن الحقائق الناقصة…', writing: 'أكتب…',
      measuring: 'أتحقق من طول الجمل وعلامات الترقيم والتكرار…',
      proposing: 'أعدّ اقتراحًا لنبرة العلامة…', retrying: 'انقطع الاتصال — أعيد هذه الخطوة…',
      fallback: 'أنتقل إلى الذكاء الاصطناعي الاحتياطي…',
    },
  },
  he: {
    thinking: 'אני חושב…', kind: 'אני עובד', working: 'אני עובד…',
    leaveNote: 'אפשר לצאת מהמסך — אמשיך לעבוד.',
    stages: {
      started: 'אני קורא…', brief: 'אני מכין את הבריף…', claims: 'אני בודק את הטענות…',
      search: 'אני מחפש עובדות חסרות…', writing: 'אני כותב…',
      measuring: 'אני בודק את אורך המשפטים, סימני הפיסוק והחזרות…',
      proposing: 'אני מכין הצעה לקול המותג…', retrying: 'החיבור נותק — אני מנסה שוב את השלב הזה…',
      fallback: 'אני עובר לבינה המלאכותית החלופית…',
    },
  },
  bn: {
    thinking: 'আমি ভাবছি…', kind: 'আমি কাজ করছি', working: 'আমি কাজ করছি…',
    leaveNote: 'আপনি এই পর্দা থেকে চলে যেতে পারেন — আমি কাজ চালিয়ে যাব।',
    stages: {
      started: 'আমি পড়ছি…', brief: 'আমি সংক্ষিপ্ত বিবরণ তৈরি করছি…', claims: 'আমি দাবিগুলো পর্যালোচনা করছি…',
      search: 'আমি অনুপস্থিত তথ্য খুঁজছি…', writing: 'আমি লিখছি…',
      measuring: 'আমি বাক্যের দৈর্ঘ্য, যতিচিহ্ন ও পুনরাবৃত্তি যাচাই করছি…',
      proposing: 'আমি লেখার ভঙ্গির প্রস্তাব তৈরি করছি…', retrying: 'সংযোগ বিচ্ছিন্ন হয়েছে — আমি এই ধাপটি আবার চেষ্টা করছি…',
      fallback: 'আমি বিকল্প AI-তে চলে যাচ্ছি…',
    },
  },
  ka_ge: {
    thinking: 'ვფიქრობ…', kind: 'ვმუშაობ', working: 'ვმუშაობ…',
    leaveNote: 'შეგიძლიათ დატოვოთ ეს ეკრანი — მუშაობას გავაგრძელებ.',
    stages: {
      started: 'ვკითხულობ…', brief: 'ბრიფს ვამზადებ…', claims: 'მტკიცებებს ვამოწმებ…',
      search: 'აკლებული ფაქტების მოძებნას ვცდილობ…', writing: 'ვწერ…',
      measuring: 'წინადადებების სიგრძეს, პუნქტუაციასა და გამეორებებს ვამოწმებ…',
      proposing: 'ბრენდის ხმის შეთავაზებას ვამზადებ…', retrying: 'კავშირი გაწყდა — ამ ნაბიჯს ხელახლა ვასრულებ…',
      fallback: 'სარეზერვო AI-ზე გადავდივარ…',
    },
  },
} as const;

export type AgentProgressLocale = keyof typeof agentProgressCopy;
export type AgentProgressWords = (typeof agentProgressCopy)[AgentProgressLocale];

export const agentProgressWordsFor = (language?: string | null): AgentProgressWords => {
  const tag = (language ?? 'en').toLowerCase().replace('-', '_');
  return agentProgressCopy[tag as AgentProgressLocale]
    ?? agentProgressCopy[tag.split('_')[0] as AgentProgressLocale]
    ?? agentProgressCopy.en;
};
