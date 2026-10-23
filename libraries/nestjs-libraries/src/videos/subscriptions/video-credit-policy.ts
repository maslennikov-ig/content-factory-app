import { Prisma } from '@prisma/client';
import { videoErrorV1 } from '../video-brief.v1';
export const creditPeriod = (now: Date) => now.toISOString().slice(0, 7);
export async function creditExposure(db: any, connectionId: string, now: Date): Promise<Prisma.Decimal> {
  const jobs = await db.videoSubscriptionJob.findMany({where: {connectionId, OR: [{actualCost: null}, {period: creditPeriod(now)}]}, select: {reserved: true, actualCost: true}});
  return jobs.reduce((sum: Prisma.Decimal, row: any) => sum.plus(row.actualCost ?? row.reserved), new Prisma.Decimal(0));
}
export function assertCreditPolicy(connection: any, quote: any) {
  if (!connection.perJob || !connection.perMonth || connection.perJob.lte(0) || connection.perMonth.lte(0)) return videoErrorV1('VIDEO_CREDIT_LIMITS_UNSET', 409);
  if (quote.unit !== connection.unit) return videoErrorV1('VIDEO_PRICE_UNAVAILABLE', 409);
  if (connection.perJob.lt(quote.amount) || (quote.upperBound !== null && connection.perJob.lt(quote.upperBound))) return videoErrorV1('VIDEO_JOB_CREDIT_LIMIT_EXCEEDED', 409);
}
