import { createHash } from 'node:crypto';
import type { CampaignItemV1, SocialFactoryKindV1, SocialFactoryStoreV1 } from '../contracts/social-factory.v1';
import { SocialFactoryError } from '../social-factory.repository';

export function requireValue(condition: unknown, code: string, message = code): asserts condition {
  if (!condition) throw new SocialFactoryError(code, message, 400);
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().filter(key => (value as any)[key] !== undefined).map(key => `${JSON.stringify(key)}:${canonical((value as any)[key])}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
export function digest(value: unknown): string { return createHash('sha256').update(canonical(value)).digest('hex'); }
export function identity(prefix: string, ...parts: string[]): string { return `${prefix}_${digest(parts).slice(0, 40)}`; }
export async function mustRead<T>(store: SocialFactoryStoreV1, org: string, kind: SocialFactoryKindV1, id: string) {
  const record = await store.read<T>(org, kind, id);
  if (!record) throw new SocialFactoryError('SOCIAL_FACTORY_NOT_FOUND', `${kind} not found.`, 404);
  return record;
}
export function revisionContent(item: CampaignItemV1) {
  return { id: item.id, campaignId: item.campaignId, channelId: item.channelId, platform: item.platform, format: item.format,
    scheduledAt: item.scheduledAt, sequenceId: item.sequenceId, slideCount: item.slideCount,
    contentRevision: item.contentRevision, material: item.material };
}
export function approvalDigest(item: CampaignItemV1): string { return digest(revisionContent(item)); }
export function validApproval(item: CampaignItemV1): boolean {
  return !!item.approval && item.approval.revision === item.contentRevision && item.approval.digest === approvalDigest(item);
}
export function validInstant(value: string): boolean { return typeof value === 'string' && Number.isFinite(Date.parse(value)); }
export function validTimeZone(timeZone: string): boolean {
  try { new Intl.DateTimeFormat('en', { timeZone }).format(); return true; } catch { return false; }
}
/** UTC instants remain instants; date-only boundaries mean the beginning/end of that local calendar day. */
export function localInstant(date: string, timeZone: string, end = false): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    requireValue(validInstant(date) && /(?:Z|[+-]\d{2}:\d{2})$/.test(date), 'CAMPAIGN_INVALID_DATE');
    return new Date(date).toISOString();
  }
  const wanted = Date.parse(`${date}T${end ? '23:59:59.999' : '00:00:00.000'}Z`);
  requireValue(Number.isFinite(wanted) && new Date(wanted).toISOString().slice(0, 10) === date, 'CAMPAIGN_INVALID_DATE');
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  let candidate = wanted;
  for (let i = 0; i < 4; i++) {
    const p = Object.fromEntries(fmt.formatToParts(new Date(candidate)).map(part => [part.type, part.value]));
    const represented = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second, end ? 999 : 0);
    const next = candidate + wanted - represented;
    if (next === candidate) return new Date(candidate).toISOString();
    candidate = next;
  }
  throw new SocialFactoryError('CAMPAIGN_INVALID_LOCAL_DATE', 'Local day boundary cannot be represented.', 400);
}

/** Date-only plans use channel slots or an explicit tentative local midday; instants remain untouched. */
export function initialCampaignSlot(proposed:number,timeZone:string,from:number,to:number,minutesUtc:readonly number[]=[]):string{
 const dayOf=(at:number)=>new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(at));
 const day=dayOf(proposed);let noon=Date.parse(localInstant(day,timeZone))+12*3600000;
 for(let i=0;i<2;i++){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(noon)).map(p=>[p.type,p.value]));
  noon+=(12-Number(parts.hour))*3600000-Number(parts.minute)*60000;
 }
 const utcDay=Math.floor(noon/86400000)*86400000;
 const options=[-1,0,1].flatMap(offset=>minutesUtc.filter(minute=>Number.isInteger(minute)&&minute>=0&&minute<1440).map(minute=>utcDay+offset*86400000+minute*60000)).filter(at=>dayOf(at)===day&&at>=from&&at<=to).sort((a,b)=>Math.abs(a-noon)-Math.abs(b-noon));
 return new Date(options[0]??Math.max(from,Math.min(to,noon))).toISOString();
}
