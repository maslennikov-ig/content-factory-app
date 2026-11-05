const {Readable}=require('node:stream');
const {loadWithMocks}=require('./load-ts-with-mocks.cjs');
function youtubeFixture({upload,cover,coverRead}={}){
 const insert=jest.fn(upload??(async()=>({data:{id:'accepted-video'}})));
 const thumbnail=jest.fn(cover??(async()=>({data:{}})));
 const credentials=jest.fn();
 const fetch=jest.fn(async({url})=>{if(url==='https://media.invalid/cover.png'&&coverRead)throw coverRead;return {data:Readable.from(['synthetic-media'])};});
 const {YoutubeProvider}=loadWithMocks('libraries/nestjs-libraries/src/integrations/social/youtube.provider.ts',{
  '@contentfactory/nestjs-libraries/integrations/social/google.sdk':{loadGoogleApis:async()=>({google:{auth:{OAuth2:class{setCredentials=credentials;}},youtube:()=>({videos:{insert},thumbnails:{set:thumbnail}})}})},
  '@contentfactory/nestjs-libraries/integrations/social.abstract':{SocialAbstract:class{async runInConcurrent(fn){return fn();}},BadBody:class extends Error{}},
  '@contentfactory/nestjs-libraries/chat/rules.description.decorator':{Rules:()=>target=>target},
  '@contentfactory/nestjs-libraries/dtos/posts/providers-settings/youtube.settings.dto':{YoutubeSettingsDto:class{}},
  axios:{__esModule:true,default:fetch},
 });
 const details={id:'p1',message:'Saved description',media:[{path:'https://media.invalid/video.mp4'}],settings:{title:'Saved title',type:'public',thumbnail:{path:'https://media.invalid/cover.png'}}};
 return {provider:new YoutubeProvider(),insert,thumbnail,fetch,credentials,details};
}
module.exports={youtubeFixture};
