import { Input } from '@contentfactory/react/form/input';
import {
  ChangeEventHandler,
  FC,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import EventEmitter from 'events';
import useSWR, { useSWRConfig } from 'swr';
import useCookie from 'react-use-cookie';
import clsx from 'clsx';
import { useFetch } from '@contentfactory/helpers/utils/custom.fetch';
import { useUser } from '@contentfactory/frontend/components/layout/user.context';
import { Select } from '@contentfactory/react/form/select';
import { pricing } from '@contentfactory/nestjs-libraries/database/prisma/subscriptions/pricing';
import { deleteDialog } from '@contentfactory/react/helpers/delete.dialog';
import { useVariables } from '@contentfactory/react/helpers/variable.context';
import { setCookie } from '@contentfactory/frontend/components/layout/layout.context';
import { useT } from '@contentfactory/react/translation/get.transation.service.client';
import { useModals } from '@contentfactory/frontend/components/layout/new-modal';
import { useToaster } from '@contentfactory/react/toaster/toaster';
import { Button } from '@contentfactory/react/form/button';
import { Textarea } from '@contentfactory/react/form/textarea';
import { ImportDebugPostModal } from '@contentfactory/frontend/components/launches/import-debug-post.modal';
import { useForm, FormProvider } from 'react-hook-form';
import { classValidatorResolver } from '@hookform/resolvers/class-validator';
import { AdminAddTeamMemberDto } from '@contentfactory/nestjs-libraries/dtos/settings/admin.add.team.member.dto';

interface Charge {
  id: string;
  amount: number;
  currency: string;
  created: number;
  status: string;
  refunded: boolean;
  amount_refunded: number;
  description: string | null;
  receipt_url: string | null;
  invoice_pdf: string | null;
}

const ensureSuccessfulResponse = async (response: Response) => {
  if (response.ok) return response;
  throw new Error(await response.text().catch(() => ''));
};

/**
 * Whether the superadmin bar is folded away, kept where the sidebar keeps its
 * own state: a cookie, so the choice survives a reload and does not need a
 * round trip to be remembered.
 */
const ADMIN_BAR_COOKIE = 'admin-bar';

/**
 * Свёрнута полоса или нет, знают двое, и узнать друг о друге им больше нечем.
 *
 * `useCookie` держит своё состояние в каждом вызове отдельно: значок в шапке и
 * сама полоса — разные ветки дерева, и запись куки одним из них второго не
 * перерисовывает. До перезагрузки значок показывал бы «свёрнута» над раскрытой
 * полосой. Тот же приём и по той же причине уже стоит в `mode.component.tsx`
 * для переключателя темы — здесь он повторён, а не выдуман.
 */
export const adminBarEmitter = new EventEmitter();

/**
 * Свёрнутость как общее состояние двух далёких друг от друга кнопок.
 *
 * @returns текущее значение и функцию, которая пишет куку **и** сообщает
 *   второму, что значение сменилось
 */
const useAdminBarFolded = (): [boolean, (folded: boolean) => void] => {
  const [cookie, setCookie] = useCookie(ADMIN_BAR_COOKIE, 'open');
  const [folded, setLocal] = useState(cookie === 'folded');

  useEffect(() => setLocal(cookie === 'folded'), [cookie]);
  useEffect(() => {
    const listen = (next: boolean) => setLocal(next);
    adminBarEmitter.on('folded', listen);
    return () => {
      adminBarEmitter.off('folded', listen);
    };
  }, []);

  const change = useCallback(
    (next: boolean) => {
      setCookie(next ? 'folded' : 'open');
      setLocal(next);
      adminBarEmitter.emit('folded', next);
    },
    [setCookie]
  );

  return [folded, change];
};

const ShieldIcon: FC = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 22 22"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="M11 1.75 3.75 4.5v5.25c0 4.5 3.05 8.55 7.25 10 4.2-1.45 7.25-5.5 7.25-10V4.5L11 1.75Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="m8.25 10.75 1.9 1.9 3.6-3.6"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * Панель администратора, свёрнутая в значок рядом с темой и языком.
 *
 * Прежде свёрнутая полоса оставляла за собой кнопку во всю строку — над тем,
 * ради чего человек пришёл, и ровно с тем же весом, что у самой полосы. Это
 * половина решения: полосу убрали, место осталось. Значок стоит там, где живут
 * остальные переключатели раскладки, и строки не занимает.
 *
 * Переключает в обе стороны, а не только раскрывает: у полосы есть своя
 * стрелка, чтобы её сложить, но человек, свернувший её однажды, ищет то же
 * место, чтобы вернуть, — и находит здесь.
 *
 * Во время работы под чужим именем значка нет, как нет и сворачивания: полоса
 * в этот момент единственное на экране, что говорит, под кем вы действуете.
 */
export const AdminBarToggle: FC = () => {
  const t = useT();
  const user = useUser();
  const [folded, setFolded] = useAdminBarFolded();

  if (user?.impersonate) return null;

  /**
   * Имя у значка своё, а не «скрыть панель».
   *
   * У раскрытой полосы есть собственная стрелка с именно этим именем, и два
   * контрола с одинаковым именем на одном экране — задача для того, кто читает
   * экран вслух: какую из двух «Скрыть панель администратора» он назовёт
   * первой, зависит от порядка в разметке. Значок называет вещь, а состояние
   * сообщает `aria-pressed`; подсказка при наведении говорит действие.
   */
  const name = t('admin_bar', 'Admin bar');
  const action = folded
    ? t('show_admin_bar', 'Show the admin bar')
    : t('hide_admin_bar', 'Hide the admin bar');

  return (
    <Button
      iconOnly
      size={32}
      variant="quiet"
      type="button"
      onClick={() => setFolded(!folded)}
      aria-pressed={!folded}
      aria-label={name}
      title={action}
      className="select-none cursor-pointer flex items-center justify-center rounded-[8px] transition-colors duration-state"
    >
      <ShieldIcon />
    </Button>
  );
};

const ChevronIcon: FC<{ open: boolean }> = ({ open }) => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    aria-hidden
    className={clsx('transition-transform duration-state', !open && 'rotate-180')}
  >
    <path
      d="M3 10l5-5 5 5"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const AdminToolbarLink: FC<{ href: string; children: ReactNode }> = ({
  href,
  children,
}) => (
  <a
    href={href}
    className="cf-label-md inline-flex h-[32px] items-center whitespace-nowrap rounded-[8px] border border-cf-border-control bg-cf-surface px-[10px] text-cf-ink transition-colors duration-state hover:bg-cf-surface-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cf-focus"
  >
    {children}
  </a>
);

const useCharges = () => {
  const fetch = useFetch();
  return useSWR<Charge[]>(
    '/billing/charges',
    async () => {
      return (
        await ensureSuccessfulResponse(await fetch('/billing/charges'))
      ).json();
    },
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      revalidateIfStale: false,
    }
  );
};

const ChargesModal: FC<{ close: () => void }> = ({ close }) => {
  const fetch = useFetch();
  const t = useT();
  const { data: charges, mutate } = useCharges();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [refunding, setRefunding] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const toaster = useToaster();

  const toggleCharge = useCallback((chargeId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(chargeId)) {
        next.delete(chargeId);
      } else {
        next.add(chargeId);
      }
      return next;
    });
  }, []);

  const handleRefund = useCallback(async () => {
    if (!selected.size) return;
    if (
      !(await deleteDialog(
        t(
          'refund_selected_confirm',
          'Refund the selected charges ({{count}})? This cannot be undone.',
          { count: selected.size }
        ),
        t('yes_refund', 'Yes, refund'),
        t('confirm_refund', 'Confirm Refund'),
        t('no_cancel', 'No, cancel')
      ))
    ) {
      return;
    }
    setRefunding(true);
    try {
      await ensureSuccessfulResponse(
        await fetch('/billing/refund-charges', {
          method: 'POST',
          body: JSON.stringify({ chargeIds: Array.from(selected) }),
        })
      );
      setSelected(new Set());
      await mutate();
    } catch {
      toaster.show(t('action_failed', 'Action failed'), 'warning');
    } finally {
      setRefunding(false);
    }
  }, [fetch, mutate, selected, t, toaster]);

  const handleCancel = useCallback(async () => {
    if (
      !(await deleteDialog(
        t(
          'cancel_subscription_confirm',
          'This will immediately cancel the subscription. The user will be downgraded to the FREE plan. This cannot be undone.'
        ),
        t('yes_cancel_subscription', 'Yes, cancel subscription'),
        t('cancel_subscription_title', 'Cancel Subscription?'),
        t('no_go_back', 'No, go back')
      ))
    ) {
      return;
    }
    setCancelling(true);
    try {
      await ensureSuccessfulResponse(
        await fetch('/billing/cancel-subscription', {
          method: 'POST',
        })
      );
      close();
      window.location.reload();
    } catch {
      setCancelling(false);
      toaster.show(t('action_failed', 'Action failed'), 'warning');
    }
  }, [close, fetch, t, toaster]);

  return (
    <div className="flex w-full min-w-0 flex-col gap-[16px] sm:min-w-[500px]">
      <div className="max-h-[400px] overflow-auto">
        {!charges?.length ? (
          <div className="py-[20px] text-center text-cf-ink-muted">
            {t('no_charges', 'No charges found')}
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-cf-border text-start">
                <th className="p-[8px] w-[40px]" />
                <th className="p-[8px]">{t('date', 'Date')}</th>
                <th className="p-[8px]">{t('amount', 'Amount')}</th>
                <th className="p-[8px]">{t('status', 'Status')}</th>
                <th className="p-[8px] w-[50px]" />
              </tr>
            </thead>
            <tbody>
              {charges.map((charge) => (
                <tr
                  key={charge.id}
                  className="cursor-pointer border-b border-cf-border hover:bg-cf-surface-subtle"
                  onClick={() => !charge.refunded && toggleCharge(charge.id)}
                >
                  <td className="p-[8px]">
                    <div
                      className={`w-[20px] h-[20px] rounded-[4px] border-2 flex items-center justify-center ${
                        charge.refunded
                          ? 'border-cf-border opacity-40'
                          : selected.has(charge.id)
                          ? 'border-cf-accent bg-cf-accent text-cf-accent-ink'
                          : 'border-cf-border-control'
                      }`}
                    >
                      {(selected.has(charge.id) || charge.refunded) && (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          width="14"
                          height="14"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </div>
                  </td>
                  <td className="p-[8px]">
                    {new Date(charge.created * 1000).toLocaleDateString()}
                  </td>
                  <td className="p-[8px]">
                    ${(charge.amount / 100).toFixed(2)}{' '}
                    {charge.currency.toUpperCase()}
                  </td>
                  <td className="p-[8px]">
                    {charge.refunded ? (
                      <span className="text-cf-danger">
                        {t('refunded', 'Refunded')}
                      </span>
                    ) : (
                      <span className="text-cf-accent">
                        {t('paid', 'Paid')}
                      </span>
                    )}
                  </td>
                  <td className="p-[8px]">
                    {(charge.invoice_pdf || charge.receipt_url) && (
                      <a
                        href={charge.invoice_pdf || charge.receipt_url!}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex h-[28px] w-[28px] items-center justify-center rounded-[4px] transition-colors duration-state hover:bg-cf-surface-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cf-focus"
                        title={
                          charge.invoice_pdf
                            ? t('download_invoice', 'Download Invoice')
                            : t('view_receipt', 'View Receipt')
                        }
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          width="16"
                          height="16"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="flex flex-col justify-end gap-[8px] sm:flex-row sm:gap-[12px]">
        <Button
          onClick={handleRefund}
          loading={refunding}
          disabled={!selected.size}
          className="rounded-[4px]"
        >
          {t('refund_selected', 'Refund Selected')}
          {selected.size > 0 && ` (${selected.size})`}
        </Button>
        <Button
          onClick={handleCancel}
          loading={cancelling}
          variant="destructive"
          className="rounded-[4px]"
        >
          {t('cancel_subscription', 'Cancel Subscription')}
        </Button>
      </div>
    </div>
  );
};

const ManageBilling = () => {
  const { openModal } = useModals();
  const t = useT();

  const handleClick = useCallback(() => {
    openModal({
      title: t('manage_billing', 'Manage Billing'),
      children: (close) => <ChargesModal close={close} />,
    });
  }, [openModal, t]);

  return (
    <Button
      density="dense"
      variant="destructive"
      className="cf-label-md rounded-[8px]"
      onClick={handleClick}
    >
      {t('manage_billing', 'Manage Billing')}
    </Button>
  );
};

export const Subscription = () => {
  const fetch = useFetch();
  const t = useT();
  const toaster = useToaster();

  const addSubscription: ChangeEventHandler<HTMLSelectElement> = useCallback(
    async (e) => {
      const value = e.target.value;
      if (!value) return;
      if (
        await deleteDialog(
          t(
            'add_subscription_confirm',
            'Add the selected subscription to this user?'
          ),
          t('add', 'Add'),
          t('are_you_sure', 'Are you sure?'),
          t('cancel', 'Cancel')
        )
      ) {
        try {
          await ensureSuccessfulResponse(
            await fetch('/billing/add-subscription', {
              method: 'POST',
              body: JSON.stringify({
                subscription: value,
              }),
            })
          );
          window.location.reload();
        } catch {
          toaster.show(t('action_failed', 'Action failed'), 'warning');
        }
      }
    },
    [fetch, t, toaster]
  );
  return (
    <Select
      onChange={addSubscription}
      hideErrors={true}
      disableForm={true}
      name="sub"
      label=""
      value=""
    >
      <option value="">
        {t('add_free_subscription', '-- ADD FREE SUBSCRIPTION --')}
      </option>
      {Object.keys(pricing)
        .filter((f) => !f.includes('FREE'))
        .map((key) => (
          <option key={key} value={key}>
            {key}
          </option>
        ))}
    </Select>
  );
};
const colorOptions = [
  {
    value: 'INFO',
    labelKey: 'announcement_color_info',
    fallback: 'Information',
    swatchClassName: 'bg-cf-info',
  },
  {
    value: 'WARNING',
    labelKey: 'announcement_color_warning',
    fallback: 'Warning',
    swatchClassName: 'bg-cf-warning',
  },
  {
    value: 'ERROR',
    labelKey: 'announcement_color_error',
    fallback: 'Error',
    swatchClassName: 'bg-cf-danger',
  },
];

const AddAnnouncementModal: FC<{ close: () => void }> = ({ close }) => {
  const fetch = useFetch();
  const { mutate } = useSWRConfig();
  const t = useT();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('INFO');
  const [saving, setSaving] = useState(false);
  const toaster = useToaster();

  const handleSubmit = useCallback(async () => {
    if (!title.trim() || !description.trim()) return;
    setSaving(true);
    try {
      await ensureSuccessfulResponse(
        await fetch('/announcements', {
          method: 'POST',
          body: JSON.stringify({ title, description, color }),
        })
      );
      await mutate('/announcements');
      close();
    } catch {
      toaster.show(t('action_failed', 'Action failed'), 'warning');
    } finally {
      setSaving(false);
    }
  }, [close, color, description, fetch, mutate, t, title, toaster]);

  return (
    <div className="flex w-full min-w-0 flex-col gap-[16px] sm:min-w-[500px]">
      <Input
        label={t('announcement_title', 'Title')}
        name="title"
        disableForm={true}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t('announcement_title_placeholder', 'Announcement title')}
      />
      <div className="flex flex-col gap-[6px]">
        <label className="cf-label-md text-cf-ink">
          {t('announcement_description', 'Description')}
        </label>
        <Textarea
          standalone
          layout="content"
          className="resize-y"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t(
            'announcement_description_placeholder',
            'Announcement description'
          )}
        />
      </div>
      <div className="flex flex-col gap-[6px]">
        <label className="cf-label-md text-cf-ink">
          {t('announcement_color', 'Color')}
        </label>
        <div className="flex flex-col gap-[8px] sm:flex-row">
          {colorOptions.map((opt) => (
            <Button
              type="button"
              density="dense"
              variant="secondary"
              key={opt.value}
              onClick={() => setColor(opt.value)}
              aria-pressed={color === opt.value}
              className="cf-label-md w-full min-w-0 rounded-[8px] sm:flex-1"
            >
              <span
                aria-hidden
                className={`h-[8px] w-[8px] shrink-0 rounded-full ${opt.swatchClassName}`}
              />
              {t(opt.labelKey, opt.fallback)}
            </Button>
          ))}
        </div>
      </div>
      <div className="flex justify-end">
        <Button
          onClick={handleSubmit}
          loading={saving}
          disabled={!title.trim() || !description.trim()}
          className="rounded-[4px]"
        >
          {t('create_announcement', 'Create Announcement')}
        </Button>
      </div>
    </div>
  );
};

const AddAnnouncement = () => {
  const { openModal } = useModals();
  const t = useT();

  const handleClick = useCallback(() => {
    openModal({
      title: t('add_announcement', 'Add Announcement'),
      children: (close) => <AddAnnouncementModal close={close} />,
    });
  }, [openModal, t]);

  return (
    <Button
      density="dense"
      className="cf-label-md rounded-[8px]"
      onClick={handleClick}
    >
      {t('add_announcement', 'Add Announcement')}
    </Button>
  );
};

const AddTeamMemberModal: FC<{ close: () => void }> = ({ close }) => {
  const fetch = useFetch();
  const toast = useToaster();
  const t = useT();
  const [saving, setSaving] = useState(false);
  const resolver = useMemo(() => {
    return classValidatorResolver(AdminAddTeamMemberDto);
  }, []);
  const form = useForm({
    values: {
      email: '',
      role: '',
    },
    resolver,
    mode: 'onChange',
  });

  const submit = useCallback(
    async (values: { email: string; role: string }) => {
      setSaving(true);
      try {
        const response = await fetch('/settings/team/add', {
          method: 'POST',
          body: JSON.stringify(values),
        });
        if (!response.ok) {
          toast.show(
            (await response.json()).message ||
              t('could_not_add_member', 'Could not add the member'),
            'warning'
          );
          return;
        }
        toast.show(t('member_added', 'Member added'));
        close();
      } finally {
        setSaving(false);
      }
    },
    [close, fetch, t, toast]
  );

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(submit)}>
        <div className="flex w-full min-w-0 flex-col gap-[10px] sm:min-w-[400px]">
          <Input
            label={t('label_email', 'Email')}
            placeholder={t('enter_email', 'Enter email')}
            name="email"
          />
          <Select label={t('label_role', 'Role')} name="role">
            <option value="">{t('select_role', 'Select Role')}</option>
            <option value="USER">{t('user', 'User')}</option>
            <option value="EDITOR">{t('role_editor', 'Editor')}</option>
            <option value="ADMIN">{t('admin', 'Admin')}</option>
          </Select>
          <Button type="submit" loading={saving} className="rounded-[4px]">
            {t('add_team_member', 'Add Team Member')}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
};

const AddTeamMember = () => {
  const { openModal } = useModals();
  const t = useT();

  const handleClick = useCallback(() => {
    openModal({
      title: t('add_team_member', 'Add Team Member'),
      children: (close) => <AddTeamMemberModal close={close} />,
    });
  }, [openModal, t]);

  return (
    <Button
      density="dense"
      className="cf-label-md rounded-[8px]"
      onClick={handleClick}
    >
      {t('add_team_member', 'Add Team Member')}
    </Button>
  );
};

const ViewErrors = () => {
  const t = useT();
  return (
    <AdminToolbarLink href="/admin/errors">
      {t('view_errors', 'View Errors')}
    </AdminToolbarLink>
  );
};

const ViewAccounts = () => {
  const t = useT();
  return (
    <AdminToolbarLink href="/admin/users">
      {t('accounts', 'Accounts')}
    </AdminToolbarLink>
  );
};

const ViewStats = () => {
  const t = useT();
  return (
    <AdminToolbarLink href="/admin/stats">
      {t('view_stats', 'View Stats')}
    </AdminToolbarLink>
  );
};

const ViewProductEvents = () => {
  const t = useT();
  return (
    <AdminToolbarLink href="/admin/product-events">
      {t('product_events', 'Product Events')}
    </AdminToolbarLink>
  );
};

const ImportDebugPost = () => {
  const { openModal } = useModals();
  const t = useT();

  const handleClick = useCallback(() => {
    openModal({
      title: t('import_debug_post', 'Import Debug Post'),
      maxSize: 800,
      children: (close) => <ImportDebugPostModal close={close} />,
    });
  }, [openModal, t]);

  return (
    <Button
      density="dense"
      variant="secondary"
      className="cf-label-md rounded-[8px]"
      onClick={handleClick}
    >
      {t('import_debug_post', 'Import Debug Post')}
    </Button>
  );
};

const SwitchUser = () => {
  const fetch = useFetch();
  const t = useT();
  const toaster = useToaster();
  const currentUser = useUser();
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<{
    id: string;
    name: string;
    email: string;
  } | null>(null);
  const [switching, setSwitching] = useState(false);

  const load = useCallback(async () => {
    if (!name) {
      return [];
    }
    return await (
      await ensureSuccessfulResponse(
        await fetch(`/user/impersonate?name=${encodeURIComponent(name)}`)
      )
    ).json();
  }, [fetch, name]);

  const { data, error } = useSWR(`/switch-search-${name}`, load, {
    refreshWhenHidden: false,
    revalidateOnMount: true,
    revalidateOnReconnect: false,
    revalidateOnFocus: false,
    refreshWhenOffline: false,
    revalidateIfStale: false,
    refreshInterval: 0,
  });

  const mapData = useMemo(() => {
    // one row per user-organization: dedupe by user id, drop the impersonated user
    const seen = new Set<string>();
    return (data || [])
      .filter((curr: any) => curr.user.id !== currentUser?.id)
      .filter((curr: any) => {
        if (seen.has(curr.user.id)) {
          return false;
        }
        seen.add(curr.user.id);
        return true;
      })
      .map((curr: any) => ({
        id: curr.user.id,
        name: curr.user.name,
        email: curr.user.email,
      }));
  }, [data, currentUser?.id]);

  const pick = useCallback(
    (item: { id: string; name: string; email: string }) => () => {
      setSelected(item);
      setName('');
    },
    []
  );

  const doSwitch = useCallback(async () => {
    if (!selected) {
      return;
    }
    if (
      !(await deleteDialog(
        t(
          'switch_user_confirm',
          "This will replace the current account's login with {{email}}. All data and the subscription stay with the account — only the login changes, and the new login gains its full access. Switch back to revert.",
          { email: selected.email }
        ),
        t('yes_switch', 'Yes, switch'),
        t('switch_user_title', 'Switch User?'),
        t('no_cancel', 'No, cancel')
      ))
    ) {
      return;
    }
    setSwitching(true);
    try {
      await ensureSuccessfulResponse(
        await fetch('/user/switch', {
          method: 'POST',
          body: JSON.stringify({ id: selected.id }),
        })
      );
      window.location.reload();
    } catch {
      setSwitching(false);
      toaster.show(
        t(
          'switch_user_failed',
          'The user switch failed and nothing was changed'
        ),
        'warning'
      );
    }
  }, [fetch, selected, t, toaster]);

  return (
    <div className="relative flex w-full min-w-0 flex-col items-stretch gap-[8px] sm:flex-row sm:items-center">
      <div className="relative min-w-0 flex-1 sm:min-w-[220px]">
        <Input
          autoComplete="off"
          placeholder={t(
            'select_user_to_switch_to',
            'Select user to switch to'
          )}
          name="switchUser"
          disableForm={true}
          label=""
          removeError={true}
          fieldClassName="w-full min-w-0"
          value={
            selected
              ? `${selected.name ? `${selected.name} - ` : ''}${selected.email}`
              : name
          }
          onChange={(e) => {
            setSelected(null);
            setName(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setName('');
          }}
        />
        {!!mapData?.length && !selected && (
          <>
            <div
              aria-hidden="true"
              className="fixed inset-0 z-40 bg-cf-ink/40"
              onMouseDown={() => setName('')}
            />
            <div className="absolute start-0 top-[calc(100%+4px)] z-50 flex max-h-[280px] w-full flex-col overflow-auto rounded-[8px] border border-cf-border bg-cf-surface p-[4px] text-cf-ink shadow-menu">
              {mapData.map((item: any) => (
                <Button
                  variant="quiet"
                  layout="content"
                  onClick={pick(item)}
                  key={item.id}
                  className="w-full rounded-[4px] px-[10px] text-start"
                  innerClassName="justify-start"
                >
                  {t('user_1', 'user:')}
                  {item.id.split('-').at(-1)} -{' '}
                  {item.name ? `${item.name} - ` : ''}
                  {item.email}
                </Button>
              ))}
            </div>
          </>
        )}
        {error && (
          <p role="alert" className="cf-label-sm mt-[4px] text-cf-danger">
            {t('action_failed', 'Action failed')}
          </p>
        )}
      </div>
      <Button
        density="dense"
        onClick={doSwitch}
        loading={switching}
        disabled={!selected}
        className="cf-label-md w-full rounded-[8px] sm:w-auto"
      >
        {t('switch_user', 'Switch User')}
      </Button>
    </div>
  );
};

export const Impersonate = () => {
  const fetch = useFetch();
  const [name, setName] = useState('');
  const { isSecured, billingEnabled } = useVariables();
  const user = useUser();
  const t = useT();
  const toaster = useToaster();
  const load = useCallback(async () => {
    if (!name) {
      return [];
    }
    return await (
      await ensureSuccessfulResponse(
        await fetch(`/user/impersonate?name=${encodeURIComponent(name)}`)
      )
    ).json();
  }, [fetch, name]);
  const stopImpersonating = useCallback(async () => {
    try {
      if (!isSecured) {
        setCookie('impersonate', '', -10);
      } else {
        await ensureSuccessfulResponse(
          await fetch(`/user/impersonate`, {
            method: 'POST',
            body: JSON.stringify({
              id: '',
            }),
          })
        );
      }
      window.location.reload();
    } catch {
      toaster.show(t('action_failed', 'Action failed'), 'warning');
    }
  }, [fetch, isSecured, t, toaster]);

  const setUser = useCallback(
    (userId: string) => async () => {
      try {
        await ensureSuccessfulResponse(
          await fetch(`/user/impersonate`, {
            method: 'POST',
            body: JSON.stringify({
              id: userId,
            }),
          })
        );
        window.location.reload();
      } catch {
        toaster.show(t('action_failed', 'Action failed'), 'warning');
      }
    },
    [fetch, t, toaster]
  );
  const { data, error } = useSWR(`/impersonate-${name}`, load, {
    refreshWhenHidden: false,
    revalidateOnMount: true,
    revalidateOnReconnect: false,
    revalidateOnFocus: false,
    refreshWhenOffline: false,
    revalidateIfStale: false,
    refreshInterval: 0,
  });
  const mapData = useMemo(() => {
    return data?.map(
      (curr: any) => ({
        id: curr.id,
        name: curr.user.name,
        email: curr.user.email,
      }),
      []
    );
  }, [data]);
  /**
   * Folded away, and the one case where it may not be.
   *
   * The bar is a permanent strip of administrative errands above whatever the
   * person actually came to do, and there was no way to put it down. Now there
   * is, and it leaves a tab behind rather than vanishing — a control that
   * disappears completely is a control nobody finds again.
   *
   * While impersonating it stays open and the fold is not offered. That row is
   * not an errand: it is the only thing on the screen saying you are acting as
   * somebody else, and «Stop» is the only way back. A superadmin who folded it
   * away and forgot would go on making changes under a name they cannot see.
   */
  const [foldedState, setFolded] = useAdminBarFolded();
  const impersonating = Boolean(user?.impersonate);
  const folded = !impersonating && foldedState;
  const label = t('super_admin', 'Super Admin');

  /**
   * Свёрнутая — значит её нет, а не «она стала кнопкой во всю строку».
   *
   * Прежде здесь оставался ярлык шириной с экран, и он занимал ровно то место,
   * ради освобождения которого полосу и складывают. Вернуть её можно значком
   * `AdminBarToggle` в шапке — там, где живут тема и язык.
   */
  if (folded) return null;

  return (
    <section
      aria-label={label}
      className="flex min-w-0 items-center gap-[8px] rounded-[8px] border border-cf-border bg-cf-surface-subtle px-[12px] py-[10px] text-cf-ink"
    >
      {user?.impersonate ? (
        <div className="flex w-full min-w-0 flex-wrap items-center justify-center gap-[8px]">
          <span className="cf-label-md whitespace-nowrap">
            {t('currently_impersonating', 'Currently Impersonating')}
          </span>
          <Button
            density="dense"
            variant="destructive"
            className="cf-label-md rounded-[8px]"
            onClick={stopImpersonating}
          >
            {t('stop', 'Stop')}
          </Button>
          {user?.tier?.current === 'FREE' && <Subscription />}
          {user?.tier?.team_members && <AddTeamMember />}
          {billingEnabled && <ManageBilling />}
          <div className="min-w-0 flex-[1_1_360px]">
            <SwitchUser />
          </div>
        </div>
      ) : (
        <div className="flex w-full min-w-0 flex-wrap items-center gap-[8px]">
          <div className="relative w-full min-w-0 flex-[1_1_320px] sm:min-w-[240px]">
            <Input
              autoComplete="off"
              placeholder={t('search_by_email_or_name', 'Email or name')}
              name="impersonate"
              disableForm={true}
              label=""
              removeError={true}
              fieldClassName="w-full min-w-0"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setName('');
              }}
            />
            {!!data?.length && (
              <>
                <div
                  aria-hidden="true"
                  className="fixed inset-0 z-40 bg-cf-ink/40"
                  onMouseDown={() => setName('')}
                />
                <div className="absolute start-0 top-[calc(100%+4px)] z-50 flex max-h-[320px] w-full flex-col overflow-auto rounded-[8px] border border-cf-border bg-cf-surface p-[4px] text-cf-ink shadow-menu">
                  {mapData?.map((result: any) => (
                    <Button
                      variant="quiet"
                      layout="content"
                      onClick={setUser(result.id)}
                      key={result.id}
                      className="w-full rounded-[4px] px-[10px] text-start"
                      innerClassName="justify-start"
                    >
                      {t('user_1', 'user:')}
                      {result.id.split('-').at(-1)} - {result.name} -{' '}
                      {result.email}
                    </Button>
                  ))}
                </div>
              </>
            )}
            {error && (
              <p role="alert" className="cf-label-sm mt-[4px] text-cf-danger">
                {t('action_failed', 'Action failed')}
              </p>
            )}
          </div>
          <div className="flex min-w-0 flex-[1_1_auto] flex-wrap items-center justify-end gap-[8px]">
            <ImportDebugPost />
            <AddAnnouncement />
            <ViewAccounts />
            <ViewErrors />
            <ViewStats />
            <ViewProductEvents />
          </div>
        </div>
      )}
      {!impersonating && (
        <Button
          type="button"
          iconOnly
          density="dense"
          variant="quiet"
          aria-expanded
          aria-label={t('hide_admin_bar', 'Hide the admin bar')}
          title={t('hide_admin_bar', 'Hide the admin bar')}
          onClick={() => setFolded(true)}
          className="shrink-0 self-start rounded-[8px]"
        >
          <ChevronIcon open />
        </Button>
      )}
    </section>
  );
};
