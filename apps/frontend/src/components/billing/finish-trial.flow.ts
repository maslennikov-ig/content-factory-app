/**
 * Finishing the trial, without the screen (review F6 of the fifteenth walk).
 *
 * `POST /billing/finish-trial` answers 403 to a non-administrator since
 * `zg8w`. The dialog used to ignore that answer and poll
 * `/billing/is-trial-finished` every two seconds for as long as it was open,
 * so the spinner never stopped. Now any refusal or failure ends the flow and
 * says which one it was; the dialog shows a plain message instead.
 */
export type FinishTrialOutcome = 'finished' | 'forbidden' | 'failed' | 'stopped';

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

const refusal = (response: Response): FinishTrialOutcome =>
  response.status === 403 ? 'forbidden' : 'failed';

export const runFinishTrial = async (
  fetch: FetchLike,
  options: {
    /** Waits between checks; the dialog passes a two-second timer. */
    wait: () => Promise<unknown>;
    /** False once the dialog is closed: the checks stop with it. */
    active: () => boolean;
  }
): Promise<FinishTrialOutcome> => {
  try {
    const started = await fetch('/billing/finish-trial', { method: 'POST' });
    if (!started.ok) return refusal(started);
    while (options.active()) {
      const response = await fetch('/billing/is-trial-finished');
      if (!response.ok) return refusal(response);
      const { finished } = await response.json();
      if (finished) return 'finished';
      await options.wait();
    }
    return 'stopped';
  } catch {
    return 'failed';
  }
};

/** The plain message for a flow that did not finish, RU and EN. */
export const finishTrialFailureText = (
  outcome: 'forbidden' | 'failed',
  ru: boolean
): string =>
  outcome === 'forbidden'
    ? ru
      ? 'Завершить пробный период может только администратор пространства. Попросите администратора.'
      : 'Only a workspace administrator can finish the trial. Ask an administrator.'
    : ru
    ? 'Не получилось завершить пробный период. Закройте окно и попробуйте позже.'
    : 'The trial could not be finished. Close this window and try again later.';

/** The dialog's own words, RU and EN (review of the fifteenth walk). */
export const finishTrialCopy = (ru: boolean) =>
  ru
    ? {
        title: 'Завершаем пробный период',
        close: 'Закрыть',
        finished: 'Пробный период завершён, оплата по тарифу списана.',
        closeWindow: 'Закрыть вкладку',
        closeDialog: 'Закрыть окно',
      }
    : {
        title: 'Finishing the trial',
        close: 'Close',
        finished: 'Your trial has finished and the plan has been charged.',
        closeWindow: 'Close the tab',
        closeDialog: 'Close the dialog',
      };
