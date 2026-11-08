import { useMemo } from 'react';
import { useInterfaceLanguage } from '@contentfactory/react/translation/use-interface-language';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';

const reviewCopy = {
  en: {
    discussions: 'Discussion', add: 'Add comment', reply: 'Reply', send: 'Send comment', sending: 'Sending comment',
    name: 'Your name', unverified: 'Guest · name not verified', team: 'Team member',
    guestNotice: 'You can read and discuss this current preview. Your name is not verified.',
    noApproval: 'Comments and resolved discussions do not approve publication.',
    empty: 'No discussion yet. Select a passage or leave a general comment.',
    loading: 'Loading discussion', error: 'The request failed. Your text is still here. Try again.',
    rate: 'Too many requests. Wait a minute and try again.',
    restricted: 'Sign in or ask the team for a new review link.', retry: 'Try again', signIn: 'Sign in',
    resolve: 'Resolve', reopen: 'Reopen', resolved: 'Resolved', open: 'Open',
    stale: 'The text changed. This quote belongs to an earlier revision.',
    unanchored: 'General comment · no selected passage', legacy: 'Earlier comment · no selected passage',
    select: 'Select text with the pointer or keyboard to discuss a passage.',
    selected: 'Selected passage', discussSelection: 'Discuss selected passage', clear: 'Clear selection',
    selectedTooLong: 'Select up to 2,000 characters.', changed: 'The post changed. Reload the preview and select the passage again.',
    share: 'Share for review', links: 'Review links', linkHelp: 'A link shows the current preview for 7 days. Anyone with it can read and comment. You can revoke it at any time.',
    createLink: 'Create link', creatingLink: 'Creating link', copy: 'Copy link', copied: 'Link copied',
    linkOnce: 'Copy this link now. For security, it will not be shown again after closing.',
    revoke: 'Revoke', reissue: 'Replace link', active: 'Active', revoked: 'Revoked', expired: 'Expired',
    expires: 'Expires', close: 'Close', noLinks: 'No review links yet.', mediaFailed: 'Attachment could not be loaded.',
    loadingPreview: 'Loading preview', previewFailed: 'Preview could not be loaded.', previewEmpty: 'Post not found.',
  },
  ru: {
    discussions: 'Обсуждение', add: 'Добавить комментарий', reply: 'Ответить', send: 'Отправить комментарий', sending: 'Отправляем комментарий',
    name: 'Ваше имя', unverified: 'Гость · имя не проверено', team: 'Участник команды',
    guestNotice: 'Вы можете читать и обсуждать текущий предпросмотр. Ваше имя не проверено.',
    noApproval: 'Комментарии и закрытые обсуждения не означают согласование публикации.',
    empty: 'Обсуждений пока нет. Выделите фрагмент или оставьте общий комментарий.',
    loading: 'Загружаем обсуждение', error: 'Не удалось выполнить запрос. Ваш текст сохранён в поле. Попробуйте ещё раз.',
    rate: 'Слишком много запросов. Подождите минуту и попробуйте снова.',
    restricted: 'Войдите или попросите команду выдать новую ссылку для обсуждения.', retry: 'Повторить', signIn: 'Войти',
    resolve: 'Закрыть обсуждение', reopen: 'Открыть снова', resolved: 'Закрыто', open: 'Открыто',
    stale: 'Текст изменился. Эта цитата относится к прежней версии.',
    unanchored: 'Общий комментарий · без выделенного фрагмента', legacy: 'Прежний комментарий · без выделенного фрагмента',
    select: 'Выделите фрагмент мышью или с клавиатуры, чтобы обсудить его.',
    selected: 'Выделенный фрагмент', discussSelection: 'Обсудить выделенное', clear: 'Снять выделение',
    selectedTooLong: 'Выделите не больше 2 000 знаков.', changed: 'Публикация изменилась. Обновите предпросмотр и выделите фрагмент заново.',
    share: 'Поделиться для обсуждения', links: 'Ссылки для обсуждения', linkHelp: 'Ссылка открывает текущий предпросмотр на 7 дней. Каждый, у кого она есть, может читать и комментировать. Ссылку можно отозвать в любой момент.',
    createLink: 'Создать ссылку', creatingLink: 'Создаём ссылку', copy: 'Копировать ссылку', copied: 'Ссылка скопирована',
    linkOnce: 'Скопируйте ссылку сейчас. В целях безопасности после закрытия она больше не появится.',
    revoke: 'Отозвать', reissue: 'Заменить ссылку', active: 'Действует', revoked: 'Отозвана', expired: 'Истекла',
    expires: 'Действует до', close: 'Закрыть', noLinks: 'Ссылок для обсуждения пока нет.', mediaFailed: 'Не удалось загрузить вложение.',
    loadingPreview: 'Загружаем предпросмотр', previewFailed: 'Не удалось загрузить предпросмотр.', previewEmpty: 'Публикация не найдена.',
  },
};

export const useReviewCopyV1 = () => {
  const language = useInterfaceLanguage();
  const t = useT();
  const base = reviewCopy[language.startsWith('ru') ? 'ru' : 'en'];
  const add = t('add_comment', base.add);
  return useMemo(() => ({ ...base, add }), [base, add]);
};
