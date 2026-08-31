'use client';

import { createContext, FC, ReactNode, useContext, useEffect } from 'react';
interface VariableContextInterface {
  stripeClient: string;
  billingEnabled: boolean;
  isGeneral: boolean;
  genericOauth: boolean;
  oauthLogoUrl: string;
  oauthDisplayName: string;
  mcpUrl?: string;
  cloudflareUrl: string;
  mainUrl: string;
  frontEndUrl: string;
  storageProvider: 'local' | 'cloudflare';
  backendUrl: string;
  environment: string;
  /**
   * Where the support button sends people. It was `discordUrl` and it pointed
   * at the upstream project's Discord; the product's own channel has not been
   * chosen yet, so the variable is unset and no button renders.
   */
  supportUrl: string;
  uploadDirectory: string;
  telegramBotName: string;
  /** Telegram sign-in is offered only when both OIDC credentials exist. */
  telegramLoginEnabled?: boolean;
  neynarClientId: string;
  isSecured: boolean;
  disableImageCompression: boolean;
  disableXAnalytics: boolean;
  language: string;
  transloadit: string[];
  extensionId: string;
  /** Google sign-in is only offered when the deployment really configured it. */
  googleAuthEnabled?: boolean;
  /** Content Factory legal pages; links stay hidden until they are configured. */
  termsUrl?: string;
  privacyUrl?: string;
  /** Product documentation base URL; help links stay hidden until configured. */
  docsUrl?: string;
}
const VariableContext = createContext({
  stripeClient: '',
  billingEnabled: false,
  isGeneral: true,
  genericOauth: false,
  oauthLogoUrl: '',
  oauthDisplayName: '',
  mcpUrl: '',
  cloudflareUrl: '',
  mainUrl: '',
  frontEndUrl: '',
  storageProvider: 'local',
  backendUrl: '',
  supportUrl: '',
  uploadDirectory: '',
  isSecured: false,
  telegramBotName: '',
  telegramLoginEnabled: false,
  neynarClientId: '',
  disableImageCompression: false,
  disableXAnalytics: false,
  language: '',
  transloadit: [],
  extensionId: '',
  googleAuthEnabled: false,
  termsUrl: '',
  privacyUrl: '',
  docsUrl: '',
} as VariableContextInterface);
export const VariableContextComponent: FC<
  VariableContextInterface & {
    children: ReactNode;
  }
> = (props) => {
  const { children, ...otherProps } = props;
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // @ts-ignore
      window.vars = otherProps;
    }
  }, []);
  return (
    <VariableContext.Provider value={otherProps}>
      {children}
    </VariableContext.Provider>
  );
};
export const useVariables = () => {
  return useContext(VariableContext);
};
export const loadVars = () => {
  // @ts-ignore
  return window.vars as VariableContextInterface;
};
