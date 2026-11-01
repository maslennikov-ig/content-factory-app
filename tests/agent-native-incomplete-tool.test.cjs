const {execFileSync} = require('node:child_process');
const path = require('node:path');
test('native incomplete tool streams use the configured repair budget and never finish silently or execute partial arguments', () => {
  const output=execFileSync(process.execPath,[path.join(__dirname,'helpers/agent-native-incomplete-tool.probe.cjs')],{encoding:'utf8',timeout:30000,stdio:['ignore','pipe','pipe']});
  const result=JSON.parse(output.trim().split('\n').at(-1));
  expect(result.map(({mode,calls,writes,finish})=>({mode,calls,writes,finish}))).toEqual([
    {mode:'incomplete',calls:2,writes:0,finish:'stop'},
    {mode:'zero-retry',calls:1,writes:0,finish:'tripwire'},
    {mode:'exhausted',calls:2,writes:0,finish:'tripwire'},
    {mode:'mixed',calls:1,writes:1,finish:'tripwire'},
    {mode:'unknown',calls:2,writes:0,finish:'stop'},
    {mode:'invalid',calls:2,writes:0,finish:'stop'},
  ]);
});
