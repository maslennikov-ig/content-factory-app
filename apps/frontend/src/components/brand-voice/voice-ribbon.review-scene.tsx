'use client';

import { defineVoiceScene } from './voice.review-scenes';
import { VoiceRibbon, type RibbonState } from './voice-ribbon';
import type { AvatarRow } from './voice-avatars.screen';

/**
 * Screen 10: the strip that says what is writing this text.
 *
 * Four product states mapped onto nine review states, and the mapping is the
 * interesting part: `empty` is "no profile", which must not look like the
 * failure that `error` is. Reviewing them side by side is the only way to see
 * whether the difference actually reads.
 */

const DETAILS = {
  versionLabel: 'v3',
  currentVersionLabel: 'v4',
  profileLabel: 'voice-0071',
  contextLabel: 'партия 08-2026',
  contextAgeDays: 2,
  factCount: 6,
  evidenceCount: 4,
  avatarId: 'avt-01',
  avatarName: 'Алексей Ким',
  avatarKind: 'PERSON' as const,
};

/**
 * Who the strip can hand the draft to.
 *
 * The unanalysed one is in the fixture on purpose: it must not appear in the
 * menu, and a fixture with only writable avatars would never show that.
 */
const AVATARS: readonly AvatarRow[] = [
  {
    id: 'avt-01',
    name: 'Алексей Ким',
    kind: 'PERSON',
    isDefault: true,
    analysed: true,
    versionLabel: 'v3',
    createdAt: '12.06.2026',
  },
  {
    id: 'avt-02',
    name: 'Служба новостей завода',
    kind: 'BRAND',
    isDefault: false,
    analysed: true,
    versionLabel: 'v1',
    createdAt: '03.07.2026',
  },
  {
    id: 'avt-03',
    name: null,
    kind: 'PERSON',
    isDefault: false,
    analysed: false,
    createdAt: '25.08.2026',
  },
];

const STATE: Record<string, RibbonState> = {
  loading: 'no-profile',
  empty: 'no-profile',
  default: 'fresh',
  selected: 'fresh',
  success: 'fresh',
  error: 'stale-context',
  restricted: 'voice-moved',
  disabled: 'no-profile',
  'long-content': 'voice-moved',
};

export const { scene, Scene } = defineVoiceScene({
  id: 'brand-voice/ribbon',
  fixture: { screen: '10', states: 4 },
  notes: {
    default: {
      ru: 'Свежий контекст: версия, партия, возраст. Одно действие — «Сменить».',
      en: 'Fresh context: version, batch, age. One action — "Change".',
    },
    empty: {
      ru: 'Без профиля. Намеренно не похоже на ошибку: ни роли alert, ни цвета опасности.',
      en: 'No profile. Deliberately unlike an error: no alert role, no danger colour.',
    },
    selected: {
      ru: 'Ленточка раскрыта: версия голоса, снимок контекста, свежесть, число фактов и доказательств.',
      en: 'Expanded: voice version, context snapshot, freshness, facts and evidence counts.',
    },
    error: {
      ru: 'Контекст устарел — 63 дня. Сказано, чем это грозит, и предложено обновить.',
      en: 'The context is 63 days old. It says what that risks and offers to refresh.',
    },
    restricted: {
      ru: 'Голос обновился после сборки: собрано на v3, действует v4. Пересборка тронет только этот черновик.',
      en: 'The voice moved after assembly: built on v3, v4 in force. Rebuilding touches only this draft.',
    },
    'long-content': {
      ru: 'На 390 ленточка занимает две строки и остаётся в пределах цели нажатия.',
      en: 'At 390 the strip takes two rows and stays within the touch target.',
    },
    success: {
      ru: 'Выбор аватара для этого черновика. Аватара без разбора в списке нет: он писать не может.',
      en: 'Picking the avatar for this draft. The unanalysed one is absent: it cannot write.',
    },
  },
  render: ({ state, locale }) => (
    <VoiceRibbon
      locale={locale}
      state={STATE[state] ?? 'fresh'}
      avatars={AVATARS}
      defaultAvatarId="avt-01"
      expanded={state === 'selected'}
      pickerOpen={state === 'success'}
      details={
        state === 'error'
          ? { ...DETAILS, contextLabel: 'контекст от 06-2026', contextAgeDays: 63 }
          : state === 'long-content'
          ? {
              ...DETAILS,
              profileLabel:
                'Служба новостей завода — люди, которые сами стоят у линии',
            }
          : DETAILS
      }
    />
  ),
});
