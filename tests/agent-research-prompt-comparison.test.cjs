const path = require('node:path');
const {execFileSync} = require('node:child_process');
test('the same native research evidence path drops JSON discovery turns and reduces provider input without dropping selected sources', () => {
  const text=execFileSync(process.execPath,[path.join(__dirname,'helpers/agent-research-prompt-comparison.probe.cjs')],{encoding:'utf8',timeout:30000,stdio:['ignore','pipe','pipe']});
  const result=JSON.parse(text.trim().split('\n').at(-1));
  expect(result.before.jsonDiscoveryReads).toBe(5);
  expect(result.after.jsonDiscoveryReads).toBe(0);
  expect(result.before.sourceReads).toBe(8);
  expect(result.after.sourceReads).toBe(8);
  expect(result.after.totalInputBytes).toBeLessThan(result.before.totalInputBytes);
  expect(result.after.estimatedInputTokens).toBeLessThan(result.before.estimatedInputTokens);
  expect(result.after.rawInputTokens).toBeNull();
});
