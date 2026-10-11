const fs=require('node:fs'),cp=require('node:child_process'),crypto=require('node:crypto');
const roles=[];
for(const pid of fs.readdirSync('/proc').filter(x=>/^\d+$/.test(x))){
 try{
  const command=fs.readFileSync('/proc/'+pid+'/cmdline','utf8');
  const role=command.includes('apps/backend/src/main')?'backend':command.includes('apps/orchestrator/src/main')?'orchestrator':command.includes('next-server')?'frontend':command.startsWith('nginx:')?'nginx':null;
  if(!role)continue;
  const paths=[...new Set(fs.readFileSync('/proc/'+pid+'/maps','utf8').split('\n').map(x=>x.trim().split(/\s+/).slice(5).join(' ')).filter(x=>x.startsWith('/') && (x.includes('.so')||x==='/usr/local/bin/node')))];
  roles.push({role,pid:Number(pid),nativePaths:paths});
 }catch{}
}
const fileFacts={};
for(const name of ['/etc/nginx/nginx.conf','/app/var/docker/ecosystem.config.js','/app/var/docker/entrypoint.sh','/app/var/docker/healthcheck.sh','/app/libraries/nestjs-libraries/src/database/prisma/schema.prisma']){
 const b=fs.readFileSync(name);fileFacts[name]={sha256:crypto.createHash('sha256').update(b).digest('hex'),bytes:b.length};
}
let db;
try{
 require('/app/node_modules/dotenv').config({path:'/app/.env',quiet:true});
 const u=new URL(process.env.DATABASE_URL);db={scheme:u.protocol,internalPostgresHost:u.hostname==='cf-next-postgres',sslmode:u.searchParams.get('sslmode'),tlsOptionsPresent:[...u.searchParams.keys()].filter(k=>/ssl|tls/i.test(k))};
}catch{db={status:'unclassified'};}
const fstab=fs.readFileSync('/etc/fstab','utf8').split('\n').filter(x=>x.trim()&&!x.trim().startsWith('#'));
const status=fs.readFileSync('/proc/self/status','utf8'),cap=BigInt('0x'+status.match(/^CapEff:\s*(\w+)/m)[1]);
const facts={node:process.version,nodeSharedOpenSsl:process.config.variables.node_shared_openssl,nodeOpenSsl:process.versions.openssl,arch:process.arch,locale:process.env.LC_ALL||process.env.LANG||'unset',capSysAdmin:!!(cap&(1n<<21n)),fstabEntries:fstab.length,roles,fileFacts,database:db,dpkg:cp.execFileSync('dpkg-query',['-W','-f=${Package}\t${Version}\t${source:Package}\t${source:Version}\n'],{encoding:'utf8'})};
console.log(JSON.stringify(facts));
