'use client';

import { useModals } from '@contentfactory/frontend/components/layout/new-modal';
import {
  cookieName,
  fallbackLng,
  languageDirection,
  languages,
} from '@contentfactory/react/translation/i18n.config';
import i18next from 'i18next';
import useCookie from 'react-use-cookie';
import ReactCountryFlag from 'react-country-flag';
import { List, Box, Group, Text } from '@mantine/core';
import React, { FC, useCallback, useEffect, useRef } from 'react';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { useUser } from '@contentfactory/frontend/components/layout/user.context';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { ModalWrapperComponent } from '../new-launch/modal.wrapper.component';
import {
  getCountryCodeForFlag,
  getLanguageName,
} from '@contentfactory/frontend/components/layout/language.presentation';

import clsx from 'clsx';

/** Everything a language change does to the page it is already on. */
const applyLanguage = (language: string) => {
  i18next.changeLanguage(language);
  document.documentElement.setAttribute('dir', languageDirection(language));
};

/**
 * The language of the account, kept where the account is.
 *
 * `content-factory-next-fn33.53`. This used to set a cookie and stop there, so
 * the choice lived in one browser: `User.language` kept whatever registration
 * wrote, every letter the server sent went out in that language, and a second
 * device came up in English again.
 *
 * The cookie is still set first and never waits on the network — the interface
 * has to change language whether or not the request lands, and on `/auth` there
 * is no account to save to at all. There `useUser()` has no provider above it
 * and answers nothing, which is exactly the signal to skip the door.
 */
export const ChangeLanguageComponent = () => {
  const currentLanguage = i18next.resolvedLanguage || fallbackLng;
  const availableLanguages = languages;
  const [_, setCookie] = useCookie(cookieName, currentLanguage || fallbackLng);
  const modals = useModals();
  const t = useT();
  const fetch = useFetch();
  const user = useUser();

  const handleLanguageChange = (language: string) => {
    setCookie(language);
    applyLanguage(language);
    modals.closeCurrent();

    if (!user?.id) {
      return;
    }

    fetch('/user/language', {
      method: 'POST',
      body: JSON.stringify({ language }),
    }).catch(() => {
      // The page has already changed language. A failed save is worth no
      // interruption: the next change tries again, and the cookie still holds.
    });
  };

  return (
    <div className="relative">
      <div className="grid grid-cols-4 gap-2">
        {availableLanguages.map((language) => (
          <div
            className={clsx(
              'flex items-center flex-col bg-newTableHeader hover:bg-newTableBorder p-[20px] cursor-pointer gap-2',
              language === currentLanguage ? 'border border-textColor' : ''
            )}
            key={language}
            onClick={() => handleLanguageChange(language)}
          >
            <ReactCountryFlag
              countryCode={getCountryCodeForFlag(language)}
              svg
              style={{
                width: '1.5em',
                height: '1.5em',
              }}
              title={getLanguageName(language)}
            />
            <Text weight={language === currentLanguage ? 'bold' : 'normal'}>
              {getLanguageName(language)}
            </Text>
          </div>
        ))}
      </div>
    </div>
  );
};
/**
 * The other half of `content-factory-next-fn33.53`: a browser that has never
 * seen this account picks up the language the account already chose.
 *
 * It runs once, when the profile first arrives, and deliberately not again. A
 * language changed in this browser writes the cookie immediately and the
 * profile a moment later; a sync that kept watching would read the stale
 * profile still in the SWR cache and put the old language back.
 */
export const LanguageFromProfile: FC<{ language?: string | null }> = ({
  language,
}) => {
  const [cookie, setCookie] = useCookie(cookieName, '');
  const applied = useRef(false);

  const sync = useCallback(() => {
    if (applied.current || !language || !languages.includes(language)) {
      return;
    }
    applied.current = true;
    if (cookie === language) {
      return;
    }
    setCookie(language);
    applyLanguage(language);
  }, [language, cookie, setCookie]);

  useEffect(() => {
    sync();
  }, [sync]);

  return null;
};

export const LanguageComponent = () => {
  const modal = useModals();
  const currentLanguage = i18next.resolvedLanguage || fallbackLng;
  const t = useT();
  const openModal = () => {
    modal.openModal({
      title: t('change_language', 'Change Language'),
      withCloseButton: true,
      children: <ChangeLanguageComponent />,
    });
  };
  return (
    <div
      onClick={openModal}
      className="rounded-full overflow-hidden h-[22px] w-[22px] relative cursor-pointer"
    >
      <ReactCountryFlag
        countryCode={getCountryCodeForFlag(currentLanguage)}
        svg
        style={{
          width: '22px',
          height: '22px',
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          objectFit: 'cover',
        }}
        title={getLanguageName(currentLanguage)}
      />
    </div>
  );
};
