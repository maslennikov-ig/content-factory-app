'use client';

import { createContext, FC, ReactNode, useContext } from 'react';
import { User } from '@prisma/client';
import {
  pricing,
  PricingInnerInterface,
} from '@contentfactory/nestjs-libraries/database/prisma/subscriptions/pricing';
import type { OrganizationRole } from '@contentfactory/nestjs-libraries/user/organization.roles';
/**
 * The profile picture as `/user/self` sends it: the relation, not the id. The
 * shell's avatar reads `path` from here, and it read `undefined` until
 * 04.09.2026 — the query did not ask for the relation and the type did not
 * name it, so nothing complained.
 */
export interface UserPicture {
  id: string;
  path: string;
}

export const UserContext = createContext<
  | undefined
  | (User & {
      picture: UserPicture | null;
      orgId: string;
      tier: PricingInnerInterface;
      publicApi: string;
      role: OrganizationRole;
      totalChannels: number;
      isLifetime?: boolean;
      impersonate: boolean;
      allowTrial: boolean;
      isTrailing: boolean;
      streakSince: string | null;
    })
>(undefined);
export const ContextWrapper: FC<{
  user: User & {
    picture?: UserPicture | null;
    orgId: string;
    tier: 'FREE' | 'STANDARD' | 'PRO' | 'ULTIMATE' | 'TEAM';
    role: OrganizationRole;
    publicApi: string;
    totalChannels: number;
  };
  children: ReactNode;
}> = ({ user, children }) => {
  const values = user
    ? {
        ...user,
        tier: pricing[user.tier],
      }
    : ({} as any);
  return <UserContext.Provider value={values}>{children}</UserContext.Provider>;
};
export const useUser = () => useContext(UserContext);
