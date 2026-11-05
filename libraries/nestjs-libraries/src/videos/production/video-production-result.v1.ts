import { createHash } from 'node:crypto';

export interface MeasuredVideoMetadataV1 {
  source: 'mp4_bytes'; sha256: string; width: number; height: number; durationSeconds: number;
  videoTrackId: number; audio: boolean; rotationDegrees: 0 | 90 | 180 | 270;
}
export interface VideoSubtitleResultV1 {
  id: string; mediaId: string; name: string; path: string; type: 'subtitle';
  mimeType: 'text/vtt' | 'application/x-subrip'; role: 'captions'; sha256: string; cueCount: number;
  source: 'provider_subtitle_file' | 'authored_timed_cues';
}
export interface VideoCaptionEvidenceV1 {
  burned: 'provider_confirmed' | 'authored_timed_cues' | 'retained_scene_lineage' | 'unverified';
  sourceJobIds: string[];
}
export interface VideoProductionResultV1 {
  id: string; name: string; path: string; type: 'video'; metadataStatus: 'measured' | 'unavailable';
  width?: number; height?: number; durationSeconds?: number; metadata?: MeasuredVideoMetadataV1;
  captions: VideoCaptionEvidenceV1; subtitles: VideoSubtitleResultV1[];
}
export interface StoredSubtitleV1 {
  name: string; path: string; size: number; mimeType: VideoSubtitleResultV1['mimeType'];
  sha256: string; cueCount: number; source: VideoSubtitleResultV1['source'];
}
export interface CaptionCueV1 { startSeconds: number; endSeconds: number; text: string }
const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const unavailable = (): never => { throw new Error('VIDEO_METADATA_UNAVAILABLE'); };
type Atom = {type: string; start: number; end: number; data: number};

/** mvhd payload only. Shared by full-file measurement and bounded owned-file inspection. */
export function measureMp4MovieHeaderDurationV1(header: Buffer): number {
  if (!Buffer.isBuffer(header) || !header.length) unavailable();
  const version = header.readUInt8(0);
  if (version !== 0 && version !== 1 || header.length < (version === 1 ? 32 : 20)) unavailable();
  const scale = header.readUInt32BE(version === 1 ? 20 : 12);
  const raw = version === 1 ? header.readBigUInt64BE(24) : BigInt(header.readUInt32BE(16));
  if (!scale || raw === BigInt(0) || raw === BigInt('0xffffffff') || raw === BigInt('0xffffffffffffffff') || raw > BigInt(Number.MAX_SAFE_INTEGER)) unavailable();
  const seconds = Number(raw) / scale;
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 86400) unavailable();
  return seconds;
}

/** Read only bounded ISO-BMFF headers. No decoder, external binary, rendering or request settings. */
export function measureMp4VideoV1(bytes: Buffer): MeasuredVideoMetadataV1 {
  let count = 0;
  const atoms = (start: number, end: number): Atom[] => {
    const result: Atom[] = [];
    for (let p = start; p < end;) {
      if (++count > 10000 || p + 8 > end) unavailable();
      const size32 = bytes.readUInt32BE(p); let size = size32; let header = 8;
      if (size32 === 1) {
        if (p + 16 > end) unavailable();
        const wide = bytes.readBigUInt64BE(p + 8);
        if (wide > BigInt(Number.MAX_SAFE_INTEGER)) unavailable();
        size = Number(wide); header = 16;
      } else if (size32 === 0) size = end - p;
      if (size < header || p + size > end) unavailable();
      result.push({type: bytes.toString('ascii', p + 4, p + 8), start: p, data: p + header, end: p + size});
      p += size;
    }
    return result;
  };
  const need = (box: Atom, offset: number, length: number) => {
    if (box.data + offset + length > box.end) unavailable();
    return box.data + offset;
  };
  const one = (list: Atom[], type: string) => {const found = list.filter(a => a.type === type); if (found.length !== 1) unavailable(); return found[0];};
  const duration = (box: Atom) => measureMp4MovieHeaderDurationV1(bytes.subarray(box.data, box.end));
  const top = atoms(0, bytes.length);
  if (!top.some(a => a.type === 'ftyp') || !top.some(a => a.type === 'mdat')) unavailable();
  const moov = one(top, 'moov'); const movie = atoms(moov.data, moov.end);
  // mvhd uses the movie timeline, including edits and the longest enabled audio/video track.
  const durationSeconds = duration(one(movie, 'mvhd'));
  const videos: Array<{header: Atom; id: number}> = []; let audio = false;
  for (const track of movie.filter(a => a.type === 'trak')) {
    const children = atoms(track.data, track.end); const header = one(children, 'tkhd');
    const version = bytes.readUInt8(need(header, 0, 1)); if (version !== 0 && version !== 1) unavailable();
    const flags = bytes.readUIntBE(need(header, 1, 3), 3); if (!(flags & 1)) continue;
    const mdia = one(children, 'mdia'); const media = atoms(mdia.data, mdia.end); const handler = one(media, 'hdlr');
    const kind = bytes.toString('ascii', need(handler, 8, 4), handler.data + 12);
    if (kind === 'soun') audio = true;
    if (kind === 'vide') videos.push({header, id: bytes.readUInt32BE(need(header, version === 1 ? 20 : 12, 4))});
  }
  // Ambiguous/multi-angle movies stay unknown rather than picking a convenient track.
  if (videos.length !== 1) unavailable();
  const {header, id} = videos[0]; const extended = bytes.readUInt8(header.data) === 1;
  const matrix = extended ? 52 : 40;
  const a = bytes.readInt32BE(need(header, matrix, 4)); const b = bytes.readInt32BE(need(header, matrix + 4, 4));
  const c = bytes.readInt32BE(need(header, matrix + 12, 4)); const d = bytes.readInt32BE(need(header, matrix + 16, 4));
  const rotations = [[65536,0,0,65536], [0,65536,-65536,0], [-65536,0,0,-65536], [0,-65536,65536,0]];
  const rotation = rotations.findIndex(r => r.every((v, index) => Math.abs(v - [a,b,c,d][index]) <= 1));
  if (rotation < 0) unavailable();
  const fixedWidth = bytes.readUInt32BE(need(header, extended ? 88 : 76, 4)) / 65536;
  const fixedHeight = bytes.readUInt32BE(need(header, extended ? 92 : 80, 4)) / 65536;
  const width = Math.round(rotation % 2 ? fixedHeight : fixedWidth); const height = Math.round(rotation % 2 ? fixedWidth : fixedHeight);
  if (!Number.isInteger(fixedWidth)||!Number.isInteger(fixedHeight))unavailable();
  if (!id || width <= 0 || height <= 0 || width > 16384 || height > 16384) unavailable();
  return {source:'mp4_bytes',sha256:digest(bytes),width,height,durationSeconds,videoTrackId:id,audio,rotationDegrees:(rotation * 90) as MeasuredVideoMetadataV1['rotationDegrees']};
}

function validateCues(cues: CaptionCueV1[], durationSeconds: number) {
  if (!cues.length || cues.length > 10000 || !Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new Error('VIDEO_SUBTITLES_INVALID');
  for (const cue of cues) if (!Number.isFinite(cue.startSeconds) || !Number.isFinite(cue.endSeconds) || cue.startSeconds < 0 || cue.endSeconds <= cue.startSeconds || cue.endSeconds > durationSeconds + 0.1 || !cue.text.trim()) throw new Error('VIDEO_SUBTITLES_INVALID');
}
export function authoredCaptionFileV1(cues: CaptionCueV1[], durationSeconds: number) {
  validateCues(cues, durationSeconds);
  const time = (s:number) => {const n=Math.round(s*1000);return `${String(Math.floor(n/3600000)).padStart(2,'0')}:${String(Math.floor(n/60000)%60).padStart(2,'0')}:${String(Math.floor(n/1000)%60).padStart(2,'0')}.${String(n%1000).padStart(3,'0')}`;};
  const escape = (s:string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const bytes = Buffer.from('WEBVTT\n\n'+cues.map((c,i)=>`${i+1}\n${time(c.startSeconds)} --> ${time(c.endSeconds)}\n${escape(c.text).replace(/\r/g,'')}\n`).join('\n'),'utf8');
  if (bytes.length > 2 * 1024 * 1024) throw new Error('VIDEO_SUBTITLES_INVALID');
  return {bytes,mimeType:'text/vtt' as const,sha256:digest(bytes),cueCount:cues.length};
}
export function inspectSubtitleFileV1(bytes:Buffer,durationSeconds:number) {
  if (bytes.length > 2 * 1024 * 1024) throw new Error('VIDEO_SUBTITLES_INVALID');
  let text:string;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes).replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');}catch{throw new Error('VIDEO_SUBTITLES_INVALID');}
  const vtt=/^WEBVTT(?:\s|$)/.test(text); const cues:CaptionCueV1[]=[];
  const toSeconds=(s:string)=>{const p=s.replace(',','.').split(':').map(Number);if(p.slice(0,-1).some(n=>!Number.isInteger(n))||p[p.length-1]>=60||p[p.length-2]>=60)throw new Error('VIDEO_SUBTITLES_INVALID');return p.length===3?p[0]*3600+p[1]*60+p[2]:p[0]*60+p[1];};
  for(const block of text.trim().split(/\n{2,}/)){
    if(vtt&&/^(WEBVTT|NOTE|STYLE|REGION)(?:\s|$)/.test(block))continue;
    const lines=block.split('\n');const index=lines.findIndex(line=>line.includes('-->'));
    if(index<0)throw new Error('VIDEO_SUBTITLES_INVALID');
    const match=/^(\d{2,}:\d{2}:\d{2}[.,]\d{3}|\d{2}:\d{2}\.\d{3})\s+-->\s+(\d{2,}:\d{2}:\d{2}[.,]\d{3}|\d{2}:\d{2}\.\d{3})(?:\s+[^\n]*)?$/.exec(lines[index]);
    if(!match||(vtt&&(match[1].includes(',')||match[2].includes(',')))||(!vtt&&(!/^\d{2,}:\d{2}:\d{2},\d{3}$/.test(match[1])||!/^\d{2,}:\d{2}:\d{2},\d{3}$/.test(match[2]))))throw new Error('VIDEO_SUBTITLES_INVALID');
    cues.push({startSeconds:toSeconds(match[1]),endSeconds:toSeconds(match[2]),text:lines.slice(index+1).join('\n')});
  }
  validateCues(cues,durationSeconds);
  return {mimeType:(vtt?'text/vtt':'application/x-subrip') as VideoSubtitleResultV1['mimeType'],sha256:digest(bytes),cueCount:cues.length};
}

/** Evidence follows a completed provider receipt or exact submitted render input, never manifest wishes. */
export function productionCaptionPlanV1(finalJob:any, sceneJobs:any[], measured:MeasuredVideoMetadataV1):{
  evidence:VideoCaptionEvidenceV1; cues?:CaptionCueV1[]; subtitleUrl?:string;
}{
  const unverified={evidence:{burned:'unverified' as const,sourceJobIds:[] as string[]}};
  const actual=finalJob.providerResult;
  if(['heygen-avatar','heygen-studio'].includes(finalJob.model)&&actual?.captionsBurned===true){
    return {evidence:{burned:'provider_confirmed',sourceJobIds:[finalJob.id]},...(typeof actual.subtitleUrl==='string'?{subtitleUrl:actual.subtitleUrl}:{})};
  }
  const input=finalJob.request?.composition?.input;
  if(finalJob.model!=='hyperframes'||actual?.state!=='succeeded'||!input?.captions||!Array.isArray(input.scenes)||
    !Number.isFinite(input.durationSeconds)||Math.abs(input.durationSeconds-measured.durationSeconds)>0.1)return unverified;
  const mappings=finalJob.snapshot?.details?.sourceJobs??[];
  let offset=0;let spoken=0;let timed=0;let retained=0;const cues:CaptionCueV1[]=[];const ids:string[]=[];
  for(const scene of input.scenes){
    if(!Number.isFinite(scene.durationSeconds)||scene.durationSeconds<=0)return unverified;
    if(typeof scene.script==='string'&&scene.script.trim()){
      spoken++;
      const local=scene.captionCues;
      if(Array.isArray(local)&&local.length){
        if(local.map(c=>c.text).join(' ').replace(/\s+/g,' ').trim()!==scene.script.replace(/\s+/g,' ').trim())return unverified;
        try{validateCues(local,scene.durationSeconds);}catch{return unverified;}
        cues.push(...local.map(c=>({startSeconds:c.startSeconds+offset,endSeconds:c.endSeconds+offset,text:c.text})));timed++;
      }else if(scene.sourceCaptions==='burned'&&scene.retainSourceAudio===true){
        const source=sceneJobs.find(job=>mappings.some((m:any)=>m.sceneId===scene.id&&m.jobId===job.id));
        if(!source||source.state!=='completed'||!['heygen-avatar','heygen-studio'].includes(source.model)||source.providerResult?.captionsBurned!==true)return unverified;
        retained++;ids.push(source.id);
      }else return unverified;
    }
    offset+=scene.durationSeconds;
  }
  if(!spoken||Math.abs(offset-measured.durationSeconds)>0.1)return unverified;
  if(timed===spoken)return {evidence:{burned:'authored_timed_cues',sourceJobIds:[finalJob.id]},cues};
  if(timed+retained===spoken)return {evidence:{burned:'retained_scene_lineage',sourceJobIds:[...new Set(ids)]}};
  return unverified;
}
