// The Nest injection token for the public-growth service, kept in a file of
// its own because it now has three consumers: the no-auth integrations
// controller that records `workspace_activated`, the admin controller that
// reads the aggregate report, and the module that binds the token to the real
// service.
//
// It lived beside the first consumer while there was only one. A second
// consumer had to either import that whole controller — which drags its entire
// dependency graph into any harness that loads a single file — or retype the
// string, which keeps compiling after a rename and fails only when Nest builds
// the controller. Neither is a token's problem to have, so the token moved
// here, where importing it costs nothing.
export const PUBLIC_GROWTH_SERVICE = 'PUBLIC_GROWTH_SERVICE';
