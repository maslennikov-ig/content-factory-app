const {randomUUID,createHash,createCipheriv,createDecipheriv}=require('node:crypto');
const {loadTypeScriptModule:load}=require('./helpers/load-ts-module.cjs');
const ROOT='libraries/nestjs-libraries/src/videos/subscriptions/';
const contract=load(`${ROOT}video-heygen-voice-setup.v1.ts`);
const {HeygenVoiceSetupServiceV1}=load(`${ROOT}video-heygen-voice-setup.service.v1.ts`,{
  '../../content-intelligence/social-factory/social-factory.repository':{SocialFactoryRepository:class{}},
  './video-connection.service':{VideoConnectionService:class{}},
});
const ORG='workspace-a',ACTOR='person-a',ACCOUNT='a'.repeat(64),CONNECTION=randomUUID(),PROFILE=randomUUID();
const code=value=>({response:{code:value}}),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const ORIGINAL=randomUUID(),TEXT='Привет! В таблице [А] указано 25%.\nНе пропустите 20 ноября.';

/** Synthetic adapters exercise persistence/authority. Their invented responses do not qualify a live provider. */
function fixture(){
  let rows=new Map(),serial=Promise.resolve(),receiptFailure=false,decisionFailure=false;
  const key=(org,kind,id)=>`${org}:${kind}:${id}`;
  const store={
    read:async(org,kind,id)=>structuredClone(rows.get(key(org,kind,id))??null),
    put:async input=>{
      const k=key(input.organizationId,input.kind,input.id),before=rows.get(k);
      if((before?.revision??0)!==input.expectedRevision)throw new Error('CAS conflict');
      if(before&&input.kind==='decision')throw new Error('immutable decision');
      if(decisionFailure&&input.kind==='decision')throw new Error('decision storage failed');
      if(receiptFailure&&input.payload.operations?.some(op=>op.state==='receipt_saved'))throw new Error('receipt storage failed');
      const row={organizationId:input.organizationId,kind:input.kind,id:input.id,revision:(before?.revision??0)+1,payload:structuredClone(input.payload),parentId:input.parentId??null,sourceIds:input.sourceIds??[],
        createdAt:new Date('2030-01-01'),updatedAt:new Date('2030-01-01'),deletedAt:null,invalidatedAt:null,expiresAt:null};
      rows.set(k,row);return structuredClone(row);
    },
    transact:work=>{
      const run=serial.then(async()=>{const before=structuredClone(rows);try{return await work(store);}catch(e){rows=before;throw e;}});
      serial=run.catch(()=>{});return run;
    },
  };
  const account={connectionId:CONNECTION,subjectDigest:ACCOUNT,accountGeneration:3,billingType:'subscription'};
  const connection={provider:'heygen',ownerId:ACTOR,state:'connected',generation:3,walletDigest:ACCOUNT};
  const repository={db:{},member:async(org,actor)=>{if(org!==ORG||![ACTOR,'person-b'].includes(actor))throw new Error('not member');},
    connection:async(org,actor,id)=>{if(org!==ORG||actor!==ACTOR||id!==CONNECTION)throw new Error('not owner');return {...connection};}};
  const media=new Map(),bytes=Buffer.from('synthetic original speech bytes');
  const original={mediaId:ORIGINAL,organizationId:ORG,actorId:ACTOR,origin:'original_upload',label:'Original recording',contentDigest:hash(bytes),bytes:bytes.length,
    mimeType:'audio/wav',container:'wav',codec:'pcm_s16le',durationSeconds:30,sampleRate:44100,channels:1,playable:true,
    quality:{speech:'present',speakers:'one',clipping:'not_detected',noise:'unknown',language:'ru'}};
  media.set(ORIGINAL,original);
  const voices=new Map([['voice_one',{voiceId:'voice_one',name:'Personal voice',owned:true,ready:true,origin:'personal_clone',originSourceDigest:original.contentDigest,
    speechSupport:'qualified',engines:['elevenlabs','starfish','heygen_voice'],models:['eleven_v3'],localeStrategy:'regional_locale'}]]);
  const calls=[],trusted=new Set(),imports=new Map(),keyBytes=Buffer.alloc(32,1),iv=Buffer.alloc(16,2);
  let mode='success',receiptQualified=true,saveFailure=false,forceUnknown=false;
  const adapter={
    currentAccount:async()=>({...account}),readOwnedAudio:async(_scope,id)=>structuredClone(media.get(id)),
    readVoice:async(_scope,id,pin)=>{expect(pin).toBe(contract.HEYGEN_VOICE_TOOL_SCHEMAS_V1.get_voice);return structuredClone(voices.get(id));},
    qualifyOperation:async(_scope,tool)=>({toolSchemaDigest:contract.HEYGEN_VOICE_TOOL_SCHEMAS_V1[tool],entitlement:'qualified',receiptContract:receiptQualified?'qualified':'unknown',
      ownedOriginalAssetId:'uploaded_original',sourceRights:'confirmed',consent:'confirmed'}),
    assertNativeApproval:async(_scope,_op,proof)=>{if(proof?.nativeActionId!=='actual-action')throw new Error('native approval missing');},
    verifyHumanDecision:async(_scope,proof)=>trusted.has(proof.decisionId),
    encryptReceipt:raw=>{const c=createCipheriv('aes-256-cbc',keyBytes,iv);return Buffer.concat([c.update(JSON.stringify(raw)),c.final()]).toString('base64');},
    decryptReceipt:value=>{const d=createDecipheriv('aes-256-cbc',keyBytes,iv);return JSON.parse(Buffer.concat([d.update(Buffer.from(value,'base64')),d.final()]).toString());},
    decodeCloneReceipt:raw=>raw.synthetic==='clone'?{voiceId:raw.ownedClone}:null,
    decodeSpeechReceipt:raw=>raw.synthetic==='speech'&&!forceUnknown?{resultRef:raw.syntheticAudioRef}:null,
    importSpeechResult:async(scope,result,opId)=>{
      if(saveFailure)throw new Error('owned Media temporarily unavailable');
      if(imports.has(opId))return structuredClone(imports.get(opId));
      const data=Buffer.from(`synthetic generated audition ${opId}`),audio={...original,mediaId:randomUUID(),origin:'generated_preview',label:'Voice audition',contentDigest:hash(data),bytes:data.length,durationSeconds:8};
      media.set(audio.mediaId,audio);imports.set(opId,audio);return structuredClone(audio);
    },
    dispatch:async(_scope,request,hooks)=>{
      await hooks.beforeDispatch();calls.push(structuredClone(request));
      if(mode==='lost')throw new Error('synthetic lost response');
      await hooks.afterResponse(mode==='malformed'?{unknownResult:true}:request.tool==='clone_voice'?{synthetic:'clone',ownedClone:'new_clone'}:
        {synthetic:'speech',syntheticAudioRef:`private-result:${calls.length}`,privateUrl:'https://private.test/audio?signature=private'});
    },
  };
  const service=new HeygenVoiceSetupServiceV1(store,{repository});
  const input=(extra={})=>({setupId:randomUUID(),connectionId:CONNECTION,intent:'reproduce_person',originalMediaId:ORIGINAL,profileId:PROFILE,audition:{text:TEXT,locale:'ru-RU'},...extra});
  const proof=(digest,extra={})=>{const p={decisionId:randomUUID(),organizationId:ORG,actorId:ACTOR,source:'confirmed_chat_action',approvedDigest:digest,at:'2030-01-01T00:00:00.000Z',...extra};trusted.add(p.decisionId);return p;};
  async function intake(value=input()){
    const approved=proof(contract.heygenVoiceIntentDigestV1(ORG,ACTOR,value,ACCOUNT,value.originalMediaId?media.get(value.originalMediaId):undefined));
    return {value,approved,view:await service.intake(ORG,ACTOR,value,adapter,approved)};
  }
  async function auditions(count=2){
    const initial=await intake(),specs=[{candidateId:randomUUID(),voiceId:'voice_one',engine:'elevenlabs',speed:1,modelId:'eleven_v3'},
      {candidateId:randomUUID(),voiceId:'voice_one',engine:'starfish',speed:1.1},{candidateId:randomUUID(),voiceId:'voice_one',engine:'heygen_voice',speed:0.9}].slice(0,count);
    const view=await service.prepareAuditions(ORG,ACTOR,{setupId:initial.view.setupId,expectedRevision:initial.view.revision,candidates:specs},adapter);
    return {...initial,specs,view};
  }
  async function selection(view,candidate=view.candidates[0],decision='select'){
    const payload=(await store.read(ORG,'heygen_voice_setup',view.setupId)).payload;
    const selected={setupId:view.setupId,expectedRevision:view.revision,decision,...(decision==='select'?{candidateId:candidate.candidateId,candidateRevision:candidate.revision}:{})};
    return {selected,proof:proof(contract.heygenVoiceSelectionDigestV1(payload,selected))};
  }
  return {service,store,adapter,media,original,bytes,account,connection,voices,calls,trusted,input,proof,intake,auditions,selection,
    row:async id=>(await store.read(ORG,'heygen_voice_setup',id)).payload,mode:value=>{mode=value;},unknown:value=>{forceUnknown=value;},
    receiptQualified:value=>{receiptQualified=value;},saveFailure:value=>{saveFailure=value;},receiptFailure:value=>{receiptFailure=value;},decisionFailure:value=>{decisionFailure=value;}};
}
const nativeApproval={nativeActionId:'actual-action'};

test('intake preserves original Media fingerprint/quality and rejects transcript-only or generated-preview originals',async()=>{
  const f=fixture(),before=Buffer.from(f.bytes),saved=await f.intake();
  expect(saved.view.original).toEqual(f.original);expect(f.bytes).toEqual(before);expect(saved.view.original.quality.noise).toBe('unknown');expect(f.calls).toEqual([]);
  expect(await f.service.read(ORG,ACTOR,saved.view.setupId,f.adapter)).toEqual(saved.view);
  const missing=f.input({originalMediaId:undefined});
  await expect(f.service.intake(ORG,ACTOR,missing,f.adapter,f.proof('a'.repeat(64)))).rejects.toMatchObject(code('VIDEO_VOICE_ORIGINAL_REQUIRED'));
  f.media.set(ORIGINAL,{...f.original,origin:'generated_preview'});
  await expect(f.intake()).rejects.toMatchObject(code('VIDEO_VOICE_AUDIO_UNAVAILABLE'));
});
test('protected intent requires persisted native human proof; model/expert flags and forged source labels do not qualify',async()=>{
  const f=fixture(),value=f.input(),digest=contract.heygenVoiceIntentDigestV1(ORG,ACTOR,value,ACCOUNT,f.original),proof=f.proof(digest);
  f.trusted.delete(proof.decisionId);
  await expect(f.service.intake(ORG,ACTOR,value,f.adapter,proof)).rejects.toMatchObject(code('VIDEO_VOICE_HUMAN_DECISION_REQUIRED'));
  await expect(f.service.intake(ORG,ACTOR,value,f.adapter,f.proof(digest,{source:'expert'}))).rejects.toMatchObject(code('VIDEO_VOICE_HUMAN_DECISION_REQUIRED'));
  await expect(f.service.intake(ORG,ACTOR,{...value,humanApproved:true},f.adapter,proof)).rejects.toMatchObject(code('VIDEO_VOICE_SETUP_INPUT_INVALID'));
});
test('only actual candidates are prepared; two real imported audition players share exact wording and requested language',async()=>{
  const f=fixture(),prepared=await f.auditions(2);
  expect(prepared.view.candidates).toHaveLength(2);expect(prepared.view.candidates.every(c=>c.state==='prepared'&&!c.audio)).toBe(true);expect(f.calls).toEqual([]);
  let current;
  for(const spec of prepared.specs)current=await f.service.execute(ORG,ACTOR,{setupId:prepared.view.setupId,operationId:spec.candidateId},f.adapter,nativeApproval);
  expect(current.candidates).toHaveLength(2);expect(current.candidates.every(c=>c.state==='ready'&&c.audio.playable&&c.audio.origin==='generated_preview')).toBe(true);
  expect(f.calls.map(c=>c.arguments.text)).toEqual([TEXT,TEXT]);expect(f.calls.every(c=>c.arguments.inputType==='text'&&c.arguments.forceRegenerate===false&&c.arguments.language==='ru')).toBe(true);
  expect(f.calls[0].arguments).not.toHaveProperty('locale');expect(f.calls[1].arguments.locale).toBe('ru-RU');
  expect(current.candidates[0].localeStrategy).toBe('language_only');expect(current.candidates[0].voiceId).toBe(current.candidates[1].voiceId);
  expect(JSON.stringify(current)).not.toMatch(/private\.test|signature=|rawReceiptEncrypted|subjectDigest/);
  expect((await f.row(current.setupId)).original).toEqual(f.original);
});
test('same source/account/candidate revision binds a persistent human choice; same-account renewal reuses it without generation',async()=>{
  const f=fixture(),prepared=await f.auditions(1),view=await f.service.execute(ORG,ACTOR,{setupId:prepared.view.setupId,operationId:prepared.specs[0].candidateId},f.adapter,nativeApproval);
  const choice=await f.selection(view),forged={...choice.proof,decisionId:randomUUID()};
  await expect(f.service.selectHumanConfirmed(ORG,ACTOR,choice.selected,f.adapter,forged)).rejects.toMatchObject(code('VIDEO_VOICE_HUMAN_DECISION_REQUIRED'));
  const selected=await f.service.selectHumanConfirmed(ORG,ACTOR,choice.selected,f.adapter,choice.proof);
  expect(await f.service.selectHumanConfirmed(ORG,ACTOR,choice.selected,f.adapter,choice.proof)).toEqual(selected);
  expect((await f.service.selectedVoice(ORG,ACTOR,selected.setupId,f.adapter))).toMatchObject({voiceId:'voice_one',engine:'elevenlabs',baseline:{locale:'ru-RU',speed:1},generationAuthorized:false});
  f.account.accountGeneration++;f.connection.generation++;
  expect((await f.service.selectedVoice(ORG,ACTOR,selected.setupId,f.adapter)).voiceId).toBe('voice_one');expect(f.calls).toHaveLength(1);
  const retained=await f.row(selected.setupId);f.account.subjectDigest='b'.repeat(64);
  await expect(f.service.selectedVoice(ORG,ACTOR,selected.setupId,f.adapter)).rejects.toThrow();expect(await f.row(selected.setupId)).toEqual(retained);
});
test('lost clone/speech responses and ambiguous receipts retain one attempt; response recovery/import never creates again',async()=>{
  const f=fixture(),prepared=await f.auditions(1),action={setupId:prepared.view.setupId,operationId:prepared.specs[0].candidateId};
  f.mode('lost');const lost=await f.service.execute(ORG,ACTOR,action,f.adapter,nativeApproval);
  expect(lost.operations[0]).toMatchObject({state:'uncertain',blocker:'VIDEO_VOICE_OPERATION_UNCERTAIN'});
  await f.service.execute(ORG,ACTOR,action,f.adapter,nativeApproval);await f.service.recover(ORG,ACTOR,action,f.adapter);expect(f.calls).toHaveLength(1);
  const g=fixture(),other=await g.auditions(1),next={setupId:other.view.setupId,operationId:other.specs[0].candidateId};g.unknown(true);
  const ambiguous=await g.service.execute(ORG,ACTOR,next,g.adapter,nativeApproval);expect(ambiguous.operations[0].blocker).toBe('VIDEO_VOICE_RECEIPT_UNRECOGNIZED');
  expect((await g.row(next.setupId)).operations[0].rawReceiptEncrypted).toEqual(expect.any(String));g.unknown(false);g.saveFailure(true);
  expect((await g.service.recover(ORG,ACTOR,next,g.adapter)).operations[0].blocker).toBe('VIDEO_VOICE_RESULT_SAVE_PENDING');g.saveFailure(false);
  expect((await g.service.recover(ORG,ACTOR,next,g.adapter)).candidates[0].state).toBe('ready');expect(g.calls).toHaveLength(1);
  const h=fixture(),third=await h.auditions(1),attempt={setupId:third.view.setupId,operationId:third.specs[0].candidateId};h.receiptFailure(true);
  expect((await h.service.execute(ORG,ACTOR,attempt,h.adapter,nativeApproval)).operations[0].state).toBe('uncertain');h.receiptFailure(false);
  await h.service.execute(ORG,ACTOR,attempt,h.adapter,nativeApproval);expect(h.calls).toHaveLength(1);expect((await h.row(attempt.setupId)).original).toEqual(h.original);
});
test('native approval, current account generation, current voice compatibility and qualified receipts gate physical send',async()=>{
  const f=fixture(),prepared=await f.auditions(1),action={setupId:prepared.view.setupId,operationId:prepared.specs[0].candidateId};
  expect((await f.service.execute(ORG,ACTOR,action,f.adapter,{})).blockers).toContain('VIDEO_VOICE_OPERATION_NOT_DISPATCHED');expect(f.calls).toEqual([]);
  f.account.accountGeneration++;f.connection.generation++;
  await expect(f.service.execute(ORG,ACTOR,action,f.adapter,nativeApproval)).rejects.toMatchObject(code('VIDEO_VOICE_APPROVAL_STALE'));expect(f.calls).toEqual([]);
  const g=fixture(),initial=await g.intake();g.receiptQualified(false);
  await expect(g.service.prepareAuditions(ORG,ACTOR,{setupId:initial.view.setupId,expectedRevision:1,candidates:[{candidateId:randomUUID(),voiceId:'voice_one',engine:'starfish',speed:1}]},g.adapter))
    .rejects.toMatchObject(code('VIDEO_VOICE_RECEIPT_CONTRACT_UNQUALIFIED'));expect(g.calls).toEqual([]);
  const h=fixture(),ready=await h.auditions(1);h.voices.get('voice_one').ready=false;
  await h.service.execute(ORG,ACTOR,{setupId:ready.view.setupId,operationId:ready.specs[0].candidateId},h.adapter,nativeApproval);expect(h.calls).toEqual([]);
});
test('one approved clone uses original uploaded asset and is not assumed to produce three voices or retried after loss',async()=>{
  const f=fixture(),initial=await f.intake(),op=randomUUID();
  const prepared=await f.service.prepareClone(ORG,ACTOR,{setupId:initial.view.setupId,expectedRevision:1,operationId:op,voiceName:'Personal voice',removeBackgroundNoise:true},f.adapter);
  expect(prepared.operations).toHaveLength(1);expect(prepared.candidates).toEqual([]);expect(f.calls).toEqual([]);
  const view=await f.service.execute(ORG,ACTOR,{setupId:initial.view.setupId,operationId:op},f.adapter,nativeApproval);
  expect(view.operations[0]).toMatchObject({state:'completed',voiceId:'new_clone'});expect(f.calls[0].arguments).toEqual({audio:{type:'asset_id',asset_id:'uploaded_original'},voiceName:'Personal voice',removeBackgroundNoise:true,language:'ru'});
  await expect(f.service.prepareClone(ORG,ACTOR,{setupId:view.setupId,expectedRevision:view.revision,operationId:randomUUID(),voiceName:'Again',removeBackgroundNoise:false},f.adapter)).rejects.toThrow();
  expect(f.calls).toHaveLength(1);expect((await f.row(view.setupId)).original).toEqual(f.original);
  const g=fixture(),other=await g.intake(),clone=randomUUID();await g.service.prepareClone(ORG,ACTOR,{setupId:other.view.setupId,expectedRevision:1,operationId:clone,voiceName:'Voice',removeBackgroundNoise:true},g.adapter);g.mode('lost');
  await g.service.execute(ORG,ACTOR,{setupId:other.view.setupId,operationId:clone},g.adapter,nativeApproval);await g.service.execute(ORG,ACTOR,{setupId:other.view.setupId,operationId:clone},g.adapter,nativeApproval);expect(g.calls).toHaveLength(1);
});
test('plain exact speech and intent rules reject SSML/tags, unsupported controls, duplicate/fake options and narrator substitution',async()=>{
  const f=fixture(),voice=f.voices.get('voice_one'),spec={candidateId:randomUUID(),voiceId:'voice_one',engine:'elevenlabs',modelId:'eleven_v3',speed:1};
  for(const text of ['Hello [warm].','<speak>Hi.</speak>','<break time="1s"/>'])expect(()=>contract.heygenSpeechRequestV1(spec,{text,locale:'en-US'},voice)).toThrow();
  expect(contract.heygenSpeechRequestV1(spec,{text:'Literal [A], 2 < 3.',locale:'en-US'},voice).arguments.text).toBe('Literal [A], 2 < 3.');
  for(const changed of [{speed:2},{pitch:3},{modelId:'eleven_flash_v2'},{engine:'elevenlabs_v3'},{ssml:true}])expect(()=>contract.heygenSpeechRequestV1({...spec,...changed},{text:TEXT,locale:'ru-RU'},voice)).toThrow();
  const initial=await f.intake(),a={candidateId:randomUUID(),voiceId:'voice_one',engine:'starfish',speed:1};
  await expect(f.service.prepareAuditions(ORG,ACTOR,{setupId:initial.view.setupId,expectedRevision:1,candidates:[a,{...a,candidateId:randomUUID()}]},f.adapter)).rejects.toMatchObject(code('VIDEO_VOICE_CANDIDATES_DUPLICATE'));
  f.voices.get('voice_one').origin='owned_narrator';
  await expect(f.service.prepareAuditions(ORG,ACTOR,{setupId:initial.view.setupId,expectedRevision:1,candidates:[a]},f.adapter)).rejects.toMatchObject(code('VIDEO_VOICE_IDENTITY_UNVERIFIED'));
});
test('direct recorded speech preserves the original player and human choice without cloning or synthesized candidates',async()=>{
  const f=fixture(),initial=await f.intake(f.input({intent:'recorded_speech',audition:undefined}));
  expect(initial.view.candidates).toHaveLength(1);expect(initial.view.candidates[0].audio.mediaId).toBe(ORIGINAL);
  const choice=await f.selection(initial.view),selected=await f.service.selectHumanConfirmed(ORG,ACTOR,choice.selected,f.adapter,choice.proof);
  expect(await f.service.selectedVoice(ORG,ACTOR,selected.setupId,f.adapter)).toMatchObject({sourceMode:'audio_asset',originalMediaId:ORIGINAL,generationAuthorized:false});
  expect(f.calls).toEqual([]);
});
test('private actor/source fences, decision transaction rollback and concurrent execution preserve retained state',async()=>{
  const f=fixture(),prepared=await f.auditions(1),action={setupId:prepared.view.setupId,operationId:prepared.specs[0].candidateId};
  await Promise.all([f.service.execute(ORG,ACTOR,action,f.adapter,nativeApproval),f.service.execute(ORG,ACTOR,action,f.adapter,nativeApproval)]);expect(f.calls).toHaveLength(1);
  await expect(f.service.read(ORG,'person-b',action.setupId,f.adapter)).rejects.toMatchObject(code('VIDEO_VOICE_SETUP_UNAVAILABLE'));
  const view=await f.service.read(ORG,ACTOR,action.setupId,f.adapter),choice=await f.selection(view);f.decisionFailure(true);
  await expect(f.service.selectHumanConfirmed(ORG,ACTOR,choice.selected,f.adapter,choice.proof)).rejects.toThrow('decision storage failed');
  expect((await f.row(action.setupId)).humanSelection).toBeUndefined();f.decisionFailure(false);
  f.media.set(ORIGINAL,{...f.original,contentDigest:'c'.repeat(64)});
  await expect(f.service.selectHumanConfirmed(ORG,ACTOR,choice.selected,f.adapter,choice.proof)).rejects.toMatchObject(code('VIDEO_VOICE_ORIGINAL_CHANGED'));
});
test('prospective source declaration and native review digests contain measured content without claiming uploader identity',async()=>{
  const f=fixture(),input=f.input({intent:'recorded_speech',audition:undefined});
  f.adapter.inspectAccessibleAudio=async()=>{const {origin,...measurement}=f.original;return measurement;};
  const proposed=await f.service.proposeIntake(ORG,ACTOR,input,f.adapter);
  expect(proposed.original.origin).toBe('original_recording_selected_by_person');expect(proposed.review.sourceDeclaration).toBe('requires_human_confirmation');
  expect(await f.store.read(ORG,'heygen_voice_setup',input.setupId)).toBeNull();
  f.media.set(ORIGINAL,{...f.original,origin:'original_recording_selected_by_person'});
  const saved=await f.service.intake(ORG,ACTOR,input,f.adapter,f.proof(proposed.approvedDigest));
  const choice={setupId:saved.setupId,expectedRevision:saved.revision,decision:'select',candidateId:saved.candidates[0].candidateId,candidateRevision:1};
  const selection=await f.service.proposeSelection(ORG,ACTOR,choice,f.adapter);
  expect(selection.review.candidate.audio.mediaId).toBe(ORIGINAL);
  expect(selection.approvedDigest).toBe(contract.heygenVoiceSelectionDigestV1(await f.row(saved.setupId),choice));
});
test('independent prepared auditions can finish concurrently while all receipts and players survive',async()=>{
  const f=fixture(),prepared=await f.auditions(3);
  const approval=await f.service.operationApproval(ORG,ACTOR,{setupId:prepared.view.setupId,operationId:prepared.specs[0].candidateId},f.adapter);
  expect(approval.approvedDigest).toBe(contract.heygenVoiceOperationApprovalDigestV1(approval.scope,approval.operation));
  expect(approval.review).toMatchObject({allowedAttempts:1,cost:null,costStatus:'unknown',audition:{text:TEXT,locale:'ru-RU'}});
  await Promise.all(prepared.specs.map(spec=>f.service.execute(ORG,ACTOR,{setupId:prepared.view.setupId,operationId:spec.candidateId},f.adapter,nativeApproval)));
  const final=await f.service.read(ORG,ACTOR,prepared.view.setupId,f.adapter);
  expect(f.calls).toHaveLength(3);expect(final.operations.every(op=>op.state==='completed')).toBe(true);expect(final.candidates.every(c=>c.state==='ready')).toBe(true);
});
