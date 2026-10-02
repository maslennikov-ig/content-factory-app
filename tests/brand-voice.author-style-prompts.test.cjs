'use strict';

require('reflect-metadata');

const { loadTypeScriptModule } = require('./helpers/load-ts-module.cjs');
const base = 'libraries/nestjs-libraries/src/content-intelligence/brand-voice';
const pipeline = loadTypeScriptModule(`${base}/assist.pipeline.ts`);
const contract = loadTypeScriptModule(`${base}/assist.contract.ts`);

// New, fictional excerpts; the private eight-text live corpus is never loaded
// by this suite. A recorded answer proves wiring, not the model's judgement.
const excerpts = [
  'Я назначил себя министром порядка. Министерство потеряло список ещё до обеда.',
  'Мой внутренний прогнозист обещал лёгкий день. Пришлось уволить его до вечера.',
  'Я торжественно открыл архив решений. Первым экспонатом оказалась забытая записка.',
  'Я объявил себя мастером коротких встреч. Через час всё ещё объяснял повестку.',
  'Я выдал себе медаль за точность. Дату на медали пришлось исправить.',
  'Мой внутренний диспетчер развёл задачи по полкам. Одну полку я тут же забыл.',
  'Я стал главным хранителем плана. План спрятался от хранителя в соседней папке.',
  'Я записал себя в клуб ранних финишей. На первое заседание опять опоздал.',
];
const samples = excerpts.map((text, index) => ({
  code: `smp-${index + 1}`,
  text: `${text} Потом записал, что именно помешало, и пересобрал рабочий план.`,
  language: 'ru',
  contentHash: `fictional-style-${index + 1}`,
}));
const measurement = { scales: {}, postHabits: null, postLayout: null };
const styleObservation = (index) => ({
  field: 'TONE',
  metric: null,
  quote: excerpts[index],
  claim: `В эпизоде ${index + 1} автор шутит над собственной претензией на порядок, а не над читателем.`,
});
const portrait =
  'Он рассказывает о рабочих планах через собственные промахи. Сначала присваивает себе важную должность, ' +
  'а затем показывает, как сам с ней не справился: так появляется самоирония. Читателя не высмеивает и не ' +
  'поучает; после шутки возвращается к тому, что сделал и что решил поправить.';
const reduced = (text = 'Говорит с самоиронией о собственных промахах.', refs = ['smp-1#1', 'smp-2#1']) => ({
  portrait: { text: portrait, observationRefs: refs },
  fields: [{ field: 'TONE', text, observationRefs: refs }],
  pointOfView: 'first_person',
  formality: 'conversational',
  emojiPolicy: 'none',
  hashtagPolicy: 'none',
  neverSay: [],
});

describe('V2 author style has qualitative, quoted evidence', () => {
  test('the existing observation contract accepts self-irony without inventing a metric', () => {
    expect(contract.observationSchemaV2.parse(styleObservation(0)))
      .toEqual(styleObservation(0));
  });

  test('V2 removes the metric-only demand, preserves numbers and leaves exported V1 stable', () => {
    const counted = { ...measurement, scales: {
      firstPerson: { raw: 71, low: 60, high: 85, observations: 40 },
    } };
    const prompt = pipeline.mapPromptV2(samples[0], counted, 'ru');
    expect(prompt).not.toContain('Every observation must quote a phrase from this text verbatim and name the metric');
    expect(prompt).not.toContain('Do not judge, praise, or describe with adjectives.');
    expect(prompt).toContain('For qualitative observations, set metric to null');
    expect(prompt).toContain('self-irony');
    expect(prompt).toContain('who or what the joke targets');
    expect(prompt).toContain('Do not invent humour');
    expect(prompt).toContain('firstPerson: 71');
    expect(prompt).toContain('at most one TOPICS');
    expect(prompt).toContain('Write every claim in Russian');
    expect(pipeline.mapPrompt(samples[0], counted, 'en'))
      .toContain('Every observation must quote a phrase from this text verbatim and name the metric');
  });

  test('reduce retains recurring expressive habits and requests ordinary prose with missing matters omitted', () => {
    const observations = [0, 1].map((index) => ({
      ...styleObservation(index), sampleCode: samples[index].code, ref: `${samples[index].code}#1`,
    }));
    const prompt = pipeline.reducePromptV2(observations, 'ru');
    expect(prompt).toContain('Preserve recurring quote-grounded expressive habits');
    expect(prompt).toContain('Do not turn TONE into sentence, paragraph or list statistics');
    expect(prompt).toContain('omit it instead of adding an analyst');
    expect(prompt).toContain('Keep metric keys, counts, percentages and reference IDs out of the portrait');
    expect(prompt).toContain('[smp-1#1] TONE -');
    expect(prompt).toContain(excerpts[1]);
    expect(prompt).toContain('cite at least two');
    expect(prompt).toContain('Write every field, every topic and the portrait in Russian');
    expect(pipeline.reducePrompt(observations, 'en'))
      .not.toContain('Preserve recurring quote-grounded expressive habits');
  });

  test('the actual service passes both prompts through its normal extract ledger in exactly eight maps and one reduce', async () => {
    const requests = [];
    const ledger = [];
    const routedOrganizations = [];
    const { VoiceAssistService } = loadTypeScriptModule(`${base}/voice-assist.service.ts`, {
      'openai/helpers/zod': { zodResponseFormat: (_schema, name) => ({ name }) },
      '@contentfactory/nestjs-libraries/openai/ai.clients': {
        getModelForRole: async (organizationId) => {
          routedOrganizations.push(organizationId);
          return 'offline-recorded-extract-model';
        },
        getOpenAiClient: async (organizationId) => {
          expect(organizationId).toBe('owned-fictional-org');
          return { chat: { completions: { parse: async (input) => {
            requests.push(input);
            const prompt = input.messages[1].content;
            const code = /\nSAMPLE (smp-\d+)/u.exec(prompt)?.[1];
            const answer = code
              ? { sampleCode: code, observations: [styleObservation(samples.findIndex((one) => one.code === code))] }
              : reduced();
            return { choices: [{ message: { parsed: answer } }] };
          } } } };
        },
      },
      '@contentfactory/nestjs-libraries/openai/ai.usage.service': { AiUsageService: class {} },
    });
    const service = new VoiceAssistService({
      executeAiOperation: async (org, operation, action, role) => {
        ledger.push({ org, operation, role });
        return action();
      },
    });
    const result = await service.propose({ organizationId: 'owned-fictional-org', samples, measurement, locale: 'ru' });
    expect(requests).toHaveLength(9);
    expect(result.calls).toHaveLength(9);
    expect(result.calls.every((call) => call.ok)).toBe(true);
    expect(ledger).toEqual(Array.from({ length: 9 }, () => ({
      org: 'owned-fictional-org', operation: 'text_generation', role: 'extract',
    })));
    expect(routedOrganizations).toEqual(Array(9).fill('owned-fictional-org'));
    expect(result.observations).toHaveLength(8);
    expect(result.observations.every((one) => one.metric === null)).toBe(true);
    expect(result.proposal.portrait).toEqual(reduced().portrait);
    expect(result.proposal.fields[0]).toEqual(reduced().fields[0]);
    expect(requests.every((one) => one.messages[0].content.includes('quote-grounded qualitative habits'))).toBe(true);
    expect(requests.filter((one) => one.response_format.name === 'brand-voice-observations-v2')).toHaveLength(8);
    expect(requests.at(-1).messages[1].content).toContain('Preserve recurring quote-grounded expressive habits');
    expect(requests.at(-1).messages[1].content).toContain('[smp-8#1] TONE -');
  });

  test('qualitative evidence still loses fabricated quotes and fields without surviving references', async () => {
    const result = await pipeline.runAssistV2({
      samples: samples.slice(0, 1), measurement,
      transport: { complete: async ({ stage }) => stage === 'map'
        ? { sampleCode: 'smp-1', observations: [
          styleObservation(0),
          { ...styleObservation(0), field: 'WHO_SPEAKS', quote: 'Такой фразы нет ни в одном образце.' },
        ] }
        : { ...reduced(), portrait: { text: portrait, observationRefs: ['smp-1#2', 'smp-1#3'] }, fields: [
          { field: 'TONE', text: 'Самоирония над собой.', observationRefs: ['smp-1#1'] },
          { field: 'WHO_SPEAKS', text: 'Выдуманный портрет автора.', observationRefs: ['smp-1#2'] },
        ] } },
    });
    expect(result.calls).toHaveLength(2);
    expect(result.rejected).toEqual([{ sampleCode: 'smp-1', reason: 'QUOTE_NOT_GROUNDED', detail: '1' }]);
    expect(result.observations).toHaveLength(1);
    expect(result.proposal.fields.map((one) => one.field)).toEqual(['TONE']);
    expect(result.proposal.portrait).toBeNull();
  });

  test('a plain sample does not acquire self-irony from a deterministic injector', async () => {
    const text = 'Я сверил рабочий план с журналом и исправил дату следующей встречи.';
    const result = await pipeline.runAssistV2({
      samples: [{ ...samples[0], text }], measurement,
      transport: { complete: async ({ stage }) => stage === 'map'
        ? { sampleCode: 'smp-1', observations: [{ field: 'WHO_SPEAKS', metric: 'firstPerson', quote: text, claim: 'Автор рассказывает от своего лица.' }] }
        : { ...reduced('Сообщает о выполненной работе.', ['smp-1#1']), portrait: null } },
    });
    expect(result.calls).toHaveLength(2);
    expect(result.proposal.portrait).toBeNull();
    expect(result.proposal.fields[0].text).toBe('Сообщает о выполненной работе.');
    expect(JSON.stringify(result)).not.toMatch(/самоирон|self-irony/u);
  });
});
