'use client';

import { FC, useCallback, useState } from 'react';
import clsx from 'clsx';
import { useUser } from '@contentfactory/frontend/components/layout/user.context';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { Button } from '@contentfactory/react/form/button';
import { sourceHref } from '@contentfactory/frontend/components/layout/source.link';
const useFaqList = () => {
  const user = useUser();
  const { backendUrl } = useVariables();
  const t = useT();
  // These answers are rendered as HTML, so the anchor is built here rather than
  // frozen into sixteen translation files with an address in it.
  const sourceAnswer = (sentence: string) =>
    !backendUrl
      ? sentence
      : `${sentence} <a href="${sourceHref(
          backendUrl
        )}" target="_blank" rel="noreferrer">${t(
          'faq_download_the_source',
          'Download the source of this version'
        )}</a>.`;
  return [
    ...(user?.allowTrial
      ? [
          {
            title: t(
              'faq_am_i_going_to_be_charged',
              'Am I going to be charged by Content Factory?'
            ),
            description: t(
              'faq_to_confirm_credit_card_information_we_will_hold',
              'To confirm credit card information Content Factory will hold $2 and release it immediately, you can cancel your subscription anytime from settings without talking to a person'
            ),
          },
        ]
      : []),
    {
      title: t('faq_can_i_trust_this_product', 'Can I trust Content Factory?'),
      description: sourceAnswer(
        t(
          'faq_we_are_proudly_open_source',
          'Content Factory is an AGPL-3.0 open-source product, and the licence entitles everyone who uses it over a network to its complete source. You can read and rebuild the exact version running here.'
        )
      ),
    },
    {
      title: t('faq_what_are_channels', 'What are channels?'),
      description: t(
        'faq_the_product_allows_you_to_schedule_posts',
        `Content Factory allows you to schedule your posts between different channels.
A channel is a publishing platform where you can schedule your posts.
For example, you can schedule your posts on X, Facebook, Instagram, TikTok, YouTube, Reddit, Linkedin, Dribbble, Threads and Pinterest.`
      ),
    },
    {
      title: t('faq_what_are_team_members', 'What are team members?'),
      description: t(
        'faq_if_you_have_a_team_with_multiple_members',
        'If you have a team with multiple members, you can invite them to your workspace to collaborate on your posts and add their personal channels'
      ),
    },
  ];
};
export const FAQSection: FC<{
  title: string;
  description: string;
}> = (props) => {
  const { title, description } = props;
  const [show, setShow] = useState(false);
  const changeShow = useCallback(() => {
    setShow(!show);
  }, [show]);
  return (
    <div className="bg-cf-surface border border-cf-border rounded-[8px] flex flex-col">
      <Button
        variant="quiet"
        type="button"
        onClick={changeShow}
        aria-expanded={show}
        layout="content"
        className="text-[16px] font-[650] text-start cursor-pointer flex items-center gap-[12px] p-[16px] w-full"
      >
        <span className="flex-1">{title}</span>
        <span
          aria-hidden
          className="flex items-center justify-center w-[24px] shrink-0 text-cf-ink-muted"
        >
          {!show ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
            >
              <path
                d="M18 12.75H6C5.59 12.75 5.25 12.41 5.25 12C5.25 11.59 5.59 11.25 6 11.25H18C18.41 11.25 18.75 11.59 18.75 12C18.75 12.41 18.41 12.75 18 12.75Z"
                fill="currentColor"
              />
              <path
                d="M12 18.75C11.59 18.75 11.25 18.41 11.25 18V6C11.25 5.59 11.59 5.25 12 5.25C12.41 5.25 12.75 5.59 12.75 6V18C12.75 18.41 12.41 18.75 12 18.75Z"
                fill="currentColor"
              />
            </svg>
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="32"
              height="32"
              viewBox="0 0 32 32"
              fill="none"
            >
              <path
                d="M24 17H8C7.45333 17 7 16.5467 7 16C7 15.4533 7.45333 15 8 15H24C24.5467 15 25 15.4533 25 16C25 16.5467 24.5467 17 24 17Z"
                fill="currentColor"
              />
            </svg>
          )}
        </span>
      </Button>
      {show && (
        <div
          className="px-[16px] pb-[16px] w-full text-[14px] leading-[1.55] text-cf-ink-muted select-text max-w-[65ch] [text-wrap:pretty] [&_a]:text-cf-accent [&_a]:underline"
          dangerouslySetInnerHTML={{
            __html: description,
          }}
        />
      )}
    </div>
  );
};
export const FAQComponent: FC = () => {
  const t = useT();
  const list = useFaqList();
  return (
    <div>
      {/*<h3 className="text-[24px] mt-[48px] mb-[40px] tablet:mt-[80px]">*/}
      {/*  {t('frequently_asked_questions', 'Frequently Asked Questions')}*/}
      {/*</h3>*/}
      <div className="gap-[8px] flex-col flex mt-[32px] mb-[32px]">
        {list.map((item, index) => (
          <FAQSection key={index} {...item} />
        ))}
      </div>
    </div>
  );
};
