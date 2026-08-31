/**
 * Whether an account created through self-service registration has to be
 * approved by an administrator before it can be used.
 *
 * The comparison is strict on purpose. `CONTENT_FACTORY_REQUIRE_APPROVAL="false"`
 * is a value, not an absence, and reading it as truthy is exactly how an
 * instance ends up open while its owner believes it is gated.
 */
export function registrationRequiresApproval() {
  return process.env.CONTENT_FACTORY_REQUIRE_APPROVAL === 'true';
}

export interface NewUserContext {
  /** Sign-up route: `LOCAL` for email and password, otherwise the provider. */
  provider: string;
  /** Whether the deployment can actually deliver an activation email. */
  hasEmailProvider: boolean;
  /** Whether this registration creates the first organization on the instance. */
  firstOrganization: boolean;
}

export interface NewUserAccess {
  activated: boolean;
  isSuperAdmin: boolean;
}

/**
 * Decides what a newly created account is allowed to do at the moment it is
 * written to the database.
 *
 * The first public request is deliberately not a bootstrap path. An operator
 * must create the administrator account before public traffic is enabled.
 */
export function resolveNewUserAccess({
  provider,
  hasEmailProvider,
}: NewUserContext): NewUserAccess {
  if (registrationRequiresApproval()) {
    return { activated: false, isSuperAdmin: false };
  }

  // Upstream behaviour: only an email and password sign-up waits, and only
  // when there is a provider able to send the activation link.
  return {
    activated: provider !== 'LOCAL' || !hasEmailProvider,
    isSuperAdmin: false,
  };
}
