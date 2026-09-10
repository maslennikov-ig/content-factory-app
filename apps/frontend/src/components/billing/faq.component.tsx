'use client';

import { FC } from 'react';
import clsx from 'clsx';
import { useUser } from '@contentfactory/frontend/components/layout/user.context';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { Disclosure } from '@contentfactory/frontend/components/ui/disclosure';
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
  return (
    <Disclosure
      summary={title}
      className="flex flex-col rounded-[8px] border border-cf-border bg-cf-surface"
      triggerClassName="p-[16px] cf-heading-md text-cf-ink"
      contentClassName="w-full max-w-[65ch] select-text px-[16px] pb-[16px] cf-body-md text-cf-ink-muted [text-wrap:pretty] [&_a]:text-cf-accent [&_a]:underline"
    >
      <div dangerouslySetInnerHTML={{ __html: description }} />
    </Disclosure>
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
