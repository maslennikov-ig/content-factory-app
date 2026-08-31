export function assertInterfaceReviewEnvironment(
  environment: string | undefined,
  unavailable: () => unknown
): void {
  if (environment === 'development' || environment === 'test') return;

  unavailable();
  throw new Error('Interface review is unavailable outside local development');
}
