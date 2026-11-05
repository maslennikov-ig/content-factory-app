export const dynamic='force-dynamic';
import { SocialFactoryCampaign } from '@contentfactory/frontend/components/social-factory/campaign';
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <SocialFactoryCampaign campaignId={id}/>;}
