/** Navigation chrome follows all16 interface languages; transcript language is independent. */
const keys = ['label', 'newThread', 'untitled', 'empty', 'failed', 'rename', 'renameLabel', 'renameSave', 'remove', 'removeArmed', 'actionFailed', 'loading', 'more', 'older', 'close', 'retry', 'historyLoading', 'historyFailedTitle', 'historyFailedBody'] as const;
export type ChatWords = Record<(typeof keys)[number], string>;
const rows: Record<string, string[]> = {
  ru: ['Чаты', 'Новый чат', 'Без названия', 'Чатов пока нет. Напишите первое сообщение.', 'Список чатов не загрузился.', 'Переименовать', 'Название чата', 'Сохранить', 'Удалить чат', 'Удалить насовсем?', 'Не получилось. Попробуйте ещё раз.', 'Загружаем чаты…', 'Ещё чаты', 'Предыдущие сообщения', 'Закрыть', 'Попробовать снова'],
  en: ['Chats', 'New chat', 'Untitled', 'No chats yet. Write your first message.', 'Chats could not be loaded.', 'Rename', 'Chat name', 'Save', 'Delete chat', 'Delete permanently?', 'That did not work. Try again.', 'Loading chats…', 'More chats', 'Earlier messages', 'Close', 'Try again'],
  de: ['Chats', 'Neuer Chat', 'Ohne Titel', 'Noch keine Chats. Schreiben Sie Ihre erste Nachricht.', 'Chats konnten nicht geladen werden.', 'Umbenennen', 'Chatname', 'Speichern', 'Chat löschen', 'Endgültig löschen?', 'Das hat nicht funktioniert. Erneut versuchen.', 'Chats werden geladen…', 'Weitere Chats', 'Frühere Nachrichten', 'Schließen', 'Erneut versuchen'],
  fr: ['Discussions', 'Nouvelle discussion', 'Sans titre', 'Aucune discussion. Écrivez votre premier message.', 'Impossible de charger les discussions.', 'Renommer', 'Nom de la discussion', 'Enregistrer', 'Supprimer la discussion', 'Supprimer définitivement ?', 'Échec. Réessayez.', 'Chargement des discussions…', 'Plus de discussions', 'Messages précédents', 'Fermer', 'Réessayer'],
  es: ['Chats', 'Nuevo chat', 'Sin título', 'Aún no hay chats. Escribe tu primer mensaje.', 'No se pudieron cargar los chats.', 'Renombrar', 'Nombre del chat', 'Guardar', 'Eliminar chat', '¿Eliminar para siempre?', 'No funcionó. Inténtalo de nuevo.', 'Cargando chats…', 'Más chats', 'Mensajes anteriores', 'Cerrar', 'Reintentar'],
  it: ['Chat', 'Nuova chat', 'Senza titolo', 'Nessuna chat. Scrivi il tuo primo messaggio.', 'Impossibile caricare le chat.', 'Rinomina', 'Nome della chat', 'Salva', 'Elimina chat', 'Eliminare definitivamente?', 'Operazione non riuscita. Riprova.', 'Caricamento chat…', 'Altre chat', 'Messaggi precedenti', 'Chiudi', 'Riprova'],
  pt: ['Conversas', 'Nova conversa', 'Sem título', 'Ainda não há conversas. Escreva sua primeira mensagem.', 'Não foi possível carregar as conversas.', 'Renomear', 'Nome da conversa', 'Salvar', 'Excluir conversa', 'Excluir permanentemente?', 'Não funcionou. Tente novamente.', 'Carregando conversas…', 'Mais conversas', 'Mensagens anteriores', 'Fechar', 'Tentar novamente'],
  tr: ['Sohbetler', 'Yeni sohbet', 'Başlıksız', 'Henüz sohbet yok. İlk mesajınızı yazın.', 'Sohbetler yüklenemedi.', 'Yeniden adlandır', 'Sohbet adı', 'Kaydet', 'Sohbeti sil', 'Kalıcı olarak silinsin mi?', 'İşlem başarısız. Tekrar deneyin.', 'Sohbetler yükleniyor…', 'Diğer sohbetler', 'Önceki mesajlar', 'Kapat', 'Tekrar dene'],
  vi: ['Cuộc trò chuyện', 'Trò chuyện mới', 'Chưa có tiêu đề', 'Chưa có cuộc trò chuyện. Hãy viết tin nhắn đầu tiên.', 'Không tải được cuộc trò chuyện.', 'Đổi tên', 'Tên cuộc trò chuyện', 'Lưu', 'Xóa cuộc trò chuyện', 'Xóa vĩnh viễn?', 'Không thành công. Hãy thử lại.', 'Đang tải cuộc trò chuyện…', 'Thêm cuộc trò chuyện', 'Tin nhắn trước', 'Đóng', 'Thử lại'],
  ja: ['チャット', '新しいチャット', '無題', 'チャットはまだありません。最初のメッセージを書いてください。', 'チャットを読み込めませんでした。', '名前を変更', 'チャット名', '保存', 'チャットを削除', '完全に削除しますか？', '失敗しました。もう一度お試しください。', 'チャットを読み込み中…', 'さらに表示', '以前のメッセージ', '閉じる', '再試行'],
  ko: ['채팅', '새 채팅', '제목 없음', '아직 채팅이 없습니다. 첫 메시지를 작성하세요.', '채팅을 불러오지 못했습니다.', '이름 변경', '채팅 이름', '저장', '채팅 삭제', '영구 삭제할까요?', '실패했습니다. 다시 시도하세요.', '채팅 불러오는 중…', '채팅 더 보기', '이전 메시지', '닫기', '다시 시도'],
  zh: ['聊天', '新建聊天', '未命名', '暂无聊天。请发送第一条消息。', '无法加载聊天。', '重命名', '聊天名称', '保存', '删除聊天', '永久删除？', '操作失败，请重试。', '正在加载聊天…', '更多聊天', '更早的消息', '关闭', '重试'],
  ar: ['المحادثات', 'محادثة جديدة', 'بلا عنوان', 'لا توجد محادثات بعد. اكتب رسالتك الأولى.', 'تعذر تحميل المحادثات.', 'إعادة تسمية', 'اسم المحادثة', 'حفظ', 'حذف المحادثة', 'حذف نهائيًا؟', 'لم تنجح العملية. حاول مجددًا.', 'جارٍ تحميل المحادثات…', 'مزيد من المحادثات', 'الرسائل السابقة', 'إغلاق', 'حاول مجددًا'],
  he: ['שיחות', 'שיחה חדשה', 'ללא כותרת', 'אין שיחות עדיין. כתבו את ההודעה הראשונה.', 'לא ניתן לטעון את השיחות.', 'שינוי שם', 'שם השיחה', 'שמירה', 'מחיקת שיחה', 'למחוק לצמיתות?', 'הפעולה נכשלה. נסו שוב.', 'טוען שיחות…', 'שיחות נוספות', 'הודעות קודמות', 'סגירה', 'ניסיון נוסף'],
  bn: ['চ্যাট', 'নতুন চ্যাট', 'শিরোনামহীন', 'এখনও কোনো চ্যাট নেই। প্রথম বার্তা লিখুন।', 'চ্যাট লোড করা যায়নি।', 'নাম পরিবর্তন', 'চ্যাটের নাম', 'সংরক্ষণ', 'চ্যাট মুছুন', 'স্থায়ীভাবে মুছবেন?', 'কাজটি হয়নি। আবার চেষ্টা করুন।', 'চ্যাট লোড হচ্ছে…', 'আরও চ্যাট', 'আগের বার্তা', 'বন্ধ করুন', 'আবার চেষ্টা করুন'],
  ka_ge: ['ჩატები', 'ახალი ჩატი', 'უსათაურო', 'ჩატები ჯერ არ არის. დაწერეთ პირველი შეტყობინება.', 'ჩატები ვერ ჩაიტვირთა.', 'სახელის შეცვლა', 'ჩატის სახელი', 'შენახვა', 'ჩატის წაშლა', 'სამუდამოდ წაიშალოს?', 'ვერ შესრულდა. სცადეთ ხელახლა.', 'ჩატები იტვირთება…', 'მეტი ჩატი', 'წინა შეტყობინებები', 'დახურვა', 'ხელახლა ცდა'],
};
const historyRows: Record<string, [string, string, string]> = {
  ru: ['Загружаем сообщения…', 'Чат не загрузился', 'Сообщения сохранены. Попробуйте ещё раз.'],
  en: ['Loading messages…', 'The chat could not be loaded', 'Your messages are saved. Try again.'],
  de: ['Nachrichten werden geladen…', 'Der Chat konnte nicht geladen werden', 'Ihre Nachrichten sind gespeichert. Erneut versuchen.'],
  fr: ['Chargement des messages…', 'Impossible de charger la discussion', 'Vos messages sont enregistrés. Réessayez.'],
  es: ['Cargando mensajes…', 'No se pudo cargar el chat', 'Tus mensajes están guardados. Inténtalo de nuevo.'],
  it: ['Caricamento messaggi…', 'Impossibile caricare la chat', 'I messaggi sono salvati. Riprova.'],
  pt: ['Carregando mensagens…', 'Não foi possível carregar a conversa', 'Suas mensagens estão salvas. Tente novamente.'],
  tr: ['Mesajlar yükleniyor…', 'Sohbet yüklenemedi', 'Mesajlarınız kayıtlı. Tekrar deneyin.'],
  vi: ['Đang tải tin nhắn…', 'Không tải được cuộc trò chuyện', 'Tin nhắn của bạn đã được lưu. Hãy thử lại.'],
  ja: ['メッセージを読み込み中…', 'チャットを読み込めませんでした', 'メッセージは保存されています。再試行してください。'],
  ko: ['메시지 불러오는 중…', '채팅을 불러오지 못했습니다', '메시지가 저장되어 있습니다. 다시 시도하세요.'],
  zh: ['正在加载消息…', '无法加载聊天', '消息已保存，请重试。'],
  ar: ['جارٍ تحميل الرسائل…', 'تعذر تحميل المحادثة', 'رسائلك محفوظة. حاول مجددًا.'],
  he: ['טוען הודעות…', 'לא ניתן לטעון את השיחה', 'ההודעות שלך שמורות. נסו שוב.'],
  bn: ['বার্তা লোড হচ্ছে…', 'চ্যাট লোড করা যায়নি', 'আপনার বার্তা সংরক্ষিত আছে। আবার চেষ্টা করুন।'],
  ka_ge: ['შეტყობინებები იტვირთება…', 'ჩატი ვერ ჩაიტვირთა', 'თქვენი შეტყობინებები შენახულია. სცადეთ ხელახლა.'],
};
for (const [locale, values] of Object.entries(historyRows)) rows[locale].push(...values);
export const chatWordsFor = (language?: string | null): ChatWords => {
  const tag = (language ?? 'en').toLowerCase().replace('-', '_');
  const row = rows[tag] ?? rows[tag.split('_')[0]] ?? rows.en;
  return Object.fromEntries(keys.map((key, i) => [key, row[i]])) as ChatWords;
};
