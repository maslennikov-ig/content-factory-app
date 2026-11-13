'use strict';
const { execFileSync } = require('node:child_process');
const path = require('node:path');

test('real MCP SDK: private widget ticket, validated upload/status/preview/attachment and authorization', () => {
  const output = execFileSync(process.execPath,[path.join(__dirname,'helpers/mcp-media-upload.runner.cjs')],{encoding:'utf8',timeout:60000,env:{...process.env,REDIS_URL:'',MCP_URL:''}});
  const report=JSON.parse(output.split('\n').find(line=>line.startsWith('REPORT ')).slice(7));
  expect(report).toEqual({resource:true,privateEnvelope:true,uploadStatusPreview:true,ownership:true,validation:true,authorization:true,attachmentAndInput:true,expiryAndSingleFile:true,widget:true,diskSpool:true,directPhoto:true});
},90000);
