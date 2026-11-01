/** Shared navigation copy; question wording and post counts come from native data. */
const labels = {
  ru: ['Серия', 'Черновики', 'Пост', 'Вопрос', 'Назад', 'Дальше', 'Пропустить', 'Пропустить оставшиеся', 'Проверьте ответы', 'Отправить ответы', 'Изменить', 'Пропущено'],
  en: ['Series', 'Drafts', 'Post', 'Question', 'Back', 'Next', 'Skip', 'Skip remaining', 'Review your answers', 'Submit answers', 'Edit', 'Skipped'],
  de: ['Serie', 'Entwürfe', 'Beitrag', 'Frage', 'Zurück', 'Weiter', 'Überspringen', 'Rest überspringen', 'Antworten prüfen', 'Antworten senden', 'Ändern', 'Übersprungen'],
  fr: ['Série', 'Brouillons', 'Publication', 'Question', 'Retour', 'Suivant', 'Passer', 'Passer le reste', 'Vérifiez vos réponses', 'Envoyer les réponses', 'Modifier', 'Ignoré'],
  es: ['Serie', 'Borradores', 'Publicación', 'Pregunta', 'Atrás', 'Siguiente', 'Omitir', 'Omitir restantes', 'Revisa tus respuestas', 'Enviar respuestas', 'Editar', 'Omitida'],
  it: ['Serie', 'Bozze', 'Post', 'Domanda', 'Indietro', 'Avanti', 'Salta', 'Salta le rimanenti', 'Controlla le risposte', 'Invia risposte', 'Modifica', 'Saltata'],
  pt: ['Série', 'Rascunhos', 'Publicação', 'Pergunta', 'Voltar', 'Seguinte', 'Ignorar', 'Ignorar restantes', 'Reveja as respostas', 'Enviar respostas', 'Editar', 'Ignorada'],
  tr: ['Seri', 'Taslaklar', 'Gönderi', 'Soru', 'Geri', 'İleri', 'Atla', 'Kalanları atla', 'Yanıtları gözden geçir', 'Yanıtları gönder', 'Düzenle', 'Atlandı'],
  ar: ['سلسلة', 'مسودات', 'منشور', 'سؤال', 'السابق', 'التالي', 'تخطي', 'تخطي الباقي', 'راجع إجاباتك', 'إرسال الإجابات', 'تعديل', 'تم التخطي'],
  he: ['סדרה', 'טיוטות', 'פוסט', 'שאלה', 'הקודם', 'הבא', 'דלג', 'דלג על השאר', 'בדיקת התשובות', 'שליחת תשובות', 'עריכה', 'דולג'],
  ka: ['სერია', 'მონახაზები', 'პოსტი', 'კითხვა', 'უკან', 'შემდეგი', 'გამოტოვება', 'დანარჩენის გამოტოვება', 'გადაამოწმეთ პასუხები', 'პასუხების გაგზავნა', 'შეცვლა', 'გამოტოვებულია'],
  bn: ['সিরিজ', 'খসড়া', 'পোস্ট', 'প্রশ্ন', 'পেছনে', 'পরবর্তী', 'এড়িয়ে যান', 'বাকিগুলি এড়িয়ে যান', 'উত্তর পর্যালোচনা করুন', 'উত্তর পাঠান', 'সম্পাদনা', 'এড়ানো হয়েছে'],
  ja: ['シリーズ', '下書き', '投稿', '質問', '戻る', '次へ', 'スキップ', '残りをスキップ', '回答を確認', '回答を送信', '編集', 'スキップ済み'],
  ko: ['시리즈', '초안', '게시물', '질문', '이전', '다음', '건너뛰기', '나머지 건너뛰기', '답변 확인', '답변 제출', '수정', '건너뜀'],
  vi: ['Loạt bài', 'Bản nháp', 'Bài viết', 'Câu hỏi', 'Quay lại', 'Tiếp theo', 'Bỏ qua', 'Bỏ qua phần còn lại', 'Kiểm tra câu trả lời', 'Gửi câu trả lời', 'Sửa', 'Đã bỏ qua'],
  zh: ['系列', '草稿', '帖子', '问题', '上一步', '下一步', '跳过', '跳过剩余问题', '检查回答', '提交回答', '编辑', '已跳过'],
} as const;

const artifactLabels = {
  ru: ['Открыть', 'открыто', 'Замечания к серии', 'Общая проверка ИИ всех постов при создании серии. Замечания стоит оценить при редактуре.'],
  en: ['Open', 'opened', 'Series review notes', 'AI review of all posts when the series was created. Consider these notes while editing.'],
  de: ['Öffnen', 'geöffnet', 'Hinweise zur Serie', 'KI-Prüfung aller Beiträge bei Erstellung der Serie. Berücksichtigen Sie die Hinweise bei der Bearbeitung.'],
  fr: ['Ouvrir', 'ouvert', 'Remarques sur la série', 'Vérification par IA de tous les articles lors de la création de la série. Évaluez ces remarques pendant la révision.'],
  es: ['Abrir', 'abierto', 'Observaciones de la serie', 'Revisión por IA de todas las publicaciones al crear la serie. Valora estas notas al editar.'],
  it: ['Apri', 'aperto', 'Note sulla serie', 'Revisione IA di tutti i post alla creazione della serie. Valuta queste note durante la modifica.'],
  pt: ['Abrir', 'aberto', 'Observações da série', 'Revisão por IA de todas as publicações ao criar a série. Avalie estas notas durante a edição.'],
  tr: ['Aç', 'açık', 'Seri inceleme notları', 'Seri oluşturulurken tüm gönderiler yapay zekâ ile incelendi. Düzenlerken bu notları değerlendirin.'],
  ar: ['فتح', 'مفتوح', 'ملاحظات مراجعة السلسلة', 'مراجعة بالذكاء الاصطناعي لجميع المنشورات عند إنشاء السلسلة. قيّم هذه الملاحظات أثناء التحرير.'],
  he: ['פתיחה', 'פתוח', 'הערות לבדיקת הסדרה', 'בדיקת כל הפוסטים בבינה מלאכותית בעת יצירת הסדרה. יש לשקול את ההערות בזמן העריכה.'],
  ka: ['გახსნა', 'გახსნილია', 'სერიის შემოწმების შენიშვნები', 'ხელოვნურმა ინტელექტმა სერიის შექმნისას ყველა პოსტი შეამოწმა. გაითვალისწინეთ შენიშვნები რედაქტირებისას.'],
  bn: ['খুলুন', 'খোলা', 'সিরিজ পর্যালোচনার নোট', 'সিরিজ তৈরির সময় সব পোস্ট এআই দিয়ে পর্যালোচনা করা হয়েছে। সম্পাদনার সময় নোটগুলি বিবেচনা করুন।'],
  ja: ['開く', '表示中', 'シリーズのレビュー', 'シリーズ作成時に全投稿をAIで確認した結果です。編集時に各指摘を検討してください。'],
  ko: ['열기', '열림', '시리즈 검토 의견', '시리즈 생성 당시 모든 게시물을 AI로 검토한 결과입니다. 편집할 때 의견을 검토하세요.'],
  vi: ['Mở', 'đã mở', 'Ghi chú đánh giá loạt bài', 'AI đánh giá tất cả bài viết khi tạo loạt bài. Hãy cân nhắc các ghi chú khi biên tập.'],
  zh: ['打开', '已打开', '系列审阅意见', '这是创建系列时对所有帖子的 AI 审阅结果。编辑时请评估这些意见。'],
} as const;

export function batchSeriesWordsFor(language: string | null | undefined) {
  const locale = (language ?? 'en').toLowerCase().split(/[-_]/)[0] as keyof typeof labels;
  const [series, drafts, post, question, back, next, skip, skipRest, review, submit, edit, skipped] = labels[locale] ?? labels.en;
  const [open, opened, seriesSummary, seriesSaved] = artifactLabels[locale] ?? artifactLabels.en;
  return {
    artifact: { open, opened, seriesSummary, seriesSaved },
    series: (count: number) => `${series} · ${drafts}: ${count}`,
    seriesPart: (index: number, total: number) => `${post} ${index}/${total}`,
    batch: { back, next, skip, skipRest, review, submit, edit, skipped,
      progress: (index: number, total: number) => `${question} ${index}/${total}` },
  };
}
