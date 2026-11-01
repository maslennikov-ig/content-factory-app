'use strict';
const fs=require('node:fs');
const {loadTypeScriptModule}=require('./helpers/load-ts-module.cjs');
const {editorialPresentationInstruction}=loadTypeScriptModule('libraries/nestjs-libraries/src/agent/generator-run-input.ts');
test('auto writing preserves a roundup and combines related updates using the actual channel limit',()=>{
 const auto=editorialPresentationInstruction('auto',4096);
 expect(auto).toContain('Prefer one complete post');
 expect(auto).toContain('smallest coherent series');
 expect(auto).toContain('combine related updates');
 expect(auto).toContain('4096 characters');
 expect(auto).toContain('not a paragraph, opening, outline or alternative wording');
 const series=editorialPresentationInstruction('series',12000);
 expect(series).toContain('explicitly requested a series');expect(series).toContain('12000 characters');
 expect(series).not.toContain('Prefer one complete post');
});
test('the real writer consumes the instruction and its native schema can carry meaningful post titles',()=>{
 const source=fs.readFileSync('libraries/nestjs-libraries/src/agent/agent.graph.service.ts','utf8');
 expect(source).toContain('editorialPresentationInstruction(state.intake.presentation, adaptationHardLimit(state))');
 expect(source).toContain('title: z.string().nullable().optional()');
 expect(source).not.toContain('do not turn the series into an abbreviated digest');
});
test('the current conductor asks known independent questions in one native batch',()=>{
 const source=fs.readFileSync('libraries/nestjs-libraries/src/chat/conductor/conductor.instructions.ts','utf8');
 expect(source).toContain('questions array in one call');expect(source).toContain('do not make each update or comment a separate post');
 expect(source).not.toContain('one focused question at a time');expect(source).not.toContain('never as a multi-question form');
});
test('the existing advisory review receives the publication mode and evaluates series limits per post',()=>{
 const source=fs.readFileSync('libraries/nestjs-libraries/src/agent/agent.graph.service.ts','utf8');
 const {ADAPTATION_COVERAGE_REVIEW_RULES:rules}=loadTypeScriptModule('libraries/nestjs-libraries/src/agent/adaptation-coverage.ts');
 expect(source).toContain("presentation: state.intake?.presentation ?? 'single'");
 expect(rules).toContain('apply character limits');expect(rules).toContain('to each post separately');
 expect(rules).toContain("Do not sum the collection's character counts");
});
