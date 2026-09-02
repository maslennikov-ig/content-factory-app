import { defineSignal } from '@temporalio/workflow';

export type SendEmail = {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  addTo: 'top' | 'bottom';
  // Additive: absent on any signal a caller from before this field existed
  // still sends, and on any already-queued item a running workflow carries
  // across a deploy. The activity treats it the same as an unrecognised
  // value — English footer copy.
  language?: string;
};
export const sendEmailSignal = defineSignal<[SendEmail]>('sendEmail');
