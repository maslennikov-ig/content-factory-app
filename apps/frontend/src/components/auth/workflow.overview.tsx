import { FC } from 'react';

type Step = {
  title: string;
  body: string;
};

/**
 * The second half of the auth screen: what the product does, in three lines.
 *
 * It used to be a tabbed tour of the inherited loop — «30+ платформ для одного
 * запуска», analytics, a roadmap row naming the brand voice as coming next
 * while it had shipped as «Аватар». A first-time blogger with one Telegram
 * channel read an agency tool there (2q28.17). Now it says what she gets:
 * the avatar writes in her voice, one thought is adapted per channel, the
 * posts go into the channel's calendar. No testimonials, counts or invented
 * metrics — the space explains the work instead of selling it.
 */
export const WorkflowOverview: FC<{
  heading: string;
  steps: Step[];
}> = ({ heading, steps }) => (
  <section className="w-full max-w-[520px]">
    <h2 className="cf-heading-lg text-cf-ink [text-wrap:balance]">{heading}</h2>
    <ol className="mt-[24px] divide-y divide-cf-border border-y border-cf-border">
      {steps.map((step, index) => (
        <li
          key={`${step.title}-${index}`}
          className="grid grid-cols-[32px_minmax(0,1fr)] gap-[12px] py-[16px]"
        >
          <span aria-hidden className="cf-caption text-cf-ink-muted tabular-nums">
            {String(index + 1).padStart(2, '0')}
          </span>
          <div className="min-w-0">
            <h3 className="cf-label-md text-cf-ink [text-wrap:balance]">
              {step.title}
            </h3>
            <p className="cf-body-md mt-[4px] max-w-[65ch] text-cf-ink-muted [text-wrap:pretty]">
              {step.body}
            </p>
          </div>
        </li>
      ))}
    </ol>
  </section>
);
