'use strict';

/**
 * Voice dictation (`content-factory-next-bxeb.1`):
 * - Native `AISDKTranscription` (`@mastra/core/voice`) via `AiClients.getMastraVoice`
 *   and `MastraService.transcribeVoice` metered through `AiUsageService`.
 * - `POST /agent/voice/transcribe` accepts multipart `file` and base64 JSON.
 * - `AgentComposer` offers both «В текст» (inserts into textarea for review)
 *   and «Отправить сразу» (transcribes and submits immediately), redacting any
 *   accidental secret shapes.
 */

const React = require('react');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/agents/t1',
});
for (const key of ['window', 'document', 'navigator']) {
  Object.defineProperty(global, key, {
    configurable: true,
    value: key === 'window' ? dom.window : dom.window[key],
  });
}
global.self = dom.window;
global.FileReader = dom.window.FileReader;
global.IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, fireEvent, render, waitFor } = require('@testing-library/react');
const { loadTypeScriptModule } = require('./helpers/load-tsx.cjs');
const { loadWithMocks } = require('./helpers/load-ts-with-mocks.cjs');
const { loadTypeScriptModule: loadBackendTs } = require('./helpers/load-ts-module.cjs');

const h = React.createElement;
const { ru, en } = loadTypeScriptModule('apps/frontend/src/components/agents/agent.copy.ts').agentCopy;
const composer = loadWithMocks('apps/frontend/src/components/agents/agent.composer.tsx', {
  react: React,
  '@contentfactory/frontend/components/ui/allowance-hint': { AllowanceHint: () => null },
  '@contentfactory/frontend/components/media/library-image-compression': {
    compressLibraryImage: async (file) => file,
  },
});

afterEach(cleanup);

class FakeMediaRecorder {
  static isTypeSupported(mime) {
    return mime === 'audio/webm';
  }
  constructor(stream, options = {}) {
    this.stream = stream;
    this.mimeType = options.mimeType || 'audio/webm';
    this.state = 'inactive';
    this.ondataavailable = null;
    this.onstop = null;
  }
  start() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    if (this.ondataavailable) {
      this.ondataavailable({
        data: new Blob([new Uint8Array([1, 2, 3, 4])], { type: this.mimeType }),
      });
    }
    if (this.onstop) {
      this.onstop();
    }
  }
}

const installFakeMic = () => {
  const stoppedTracks = [];
  const fakeStream = {
    getTracks: () => [
      {
        stop: () => stoppedTracks.push('audio-track-stopped'),
      },
    ],
  };
  Object.defineProperty(global.navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: jest.fn(async () => fakeStream),
    },
  });
  global.MediaRecorder = FakeMediaRecorder;
  return { stoppedTracks };
};

const mount = async (props) => {
  const sent = [];
  await act(async () => {
    render(
      h(composer.AgentComposer, {
        busy: false,
        queued: false,
        onSubmit: (message) => sent.push(message),
        onStop: () => {},
        words: ru,
        ...props,
      })
    );
  });
  return sent;
};

describe('voice dictation in AgentComposer (bxeb.1)', () => {
  test('copy exists in both Russian and English for recording and both completion actions', () => {
    expect(ru.composer.voiceToText).toBe('В текст');
    expect(ru.composer.voiceSendNow).toBe('Отправить сразу');
    expect(en.composer.voiceToText).toBe('To text');
    expect(en.composer.voiceSendNow).toBe('Send right away');
  });

  test('«В текст» transcribes audio and inserts it into the textarea without sending', async () => {
    const { stoppedTracks } = installFakeMic();
    const calls = [];
    const sent = await mount({
      transcribeVoice: async (blob) => {
        calls.push(blob.type);
        return 'Напиши пост про утренний фильтр-кофе';
      },
    });

    const micBtn = document.querySelector(`button[aria-label="${ru.composer.voiceRecord}"]`);
    expect(micBtn).not.toBeNull();

    await act(async () => {
      fireEvent.click(micBtn);
    });

    expect(document.body.textContent).toContain(ru.composer.voiceRecording);
    const toTextBtn = [...document.querySelectorAll('button')].find(
      (btn) => btn.textContent === ru.composer.voiceToText
    );
    expect(toTextBtn).toBeDefined();

    await act(async () => {
      fireEvent.click(toTextBtn);
    });

    await waitFor(() =>
      expect(document.querySelector('textarea').value).toBe(
        'Напиши пост про утренний фильтр-кофе'
      )
    );
    expect(calls).toEqual(['audio/webm']);
    expect(stoppedTracks).toEqual(['audio-track-stopped']);
    expect(sent).toEqual([]);
  });

  test('«Отправить сразу» transcribes audio and immediately submits the message', async () => {
    installFakeMic();
    const sent = await mount({
      transcribeVoice: async () => 'Сделай адаптацию для Telegram-канала',
    });

    const micBtn = document.querySelector(`button[aria-label="${ru.composer.voiceRecord}"]`);
    await act(async () => {
      fireEvent.click(micBtn);
    });

    const sendNowBtn = [...document.querySelectorAll('button')].find(
      (btn) => btn.textContent === ru.composer.voiceSendNow
    );
    await act(async () => {
      fireEvent.click(sendNowBtn);
    });

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toEqual({
      text: 'Сделай адаптацию для Telegram-канала',
      files: [],
    });
    expect(document.querySelector('textarea').value).toBe('');
  });

  test('secret key shape in voice transcript is scrubbed and never sent automatically', async () => {
    installFakeMic();
    const sent = await mount({
      transcribeVoice: async () => 'Мой ключ sk-proj-1234567890abcdefghijklmnop',
    });

    const micBtn = document.querySelector(`button[aria-label="${ru.composer.voiceRecord}"]`);
    await act(async () => {
      fireEvent.click(micBtn);
    });
    const sendNowBtn = [...document.querySelectorAll('button')].find(
      (btn) => btn.textContent === ru.composer.voiceSendNow
    );
    await act(async () => {
      fireEvent.click(sendNowBtn);
    });

    await waitFor(() =>
      expect(document.body.textContent).toContain(ru.composer.keyPasted)
    );
    expect(sent).toEqual([]);
    expect(document.querySelector('textarea').value).not.toContain('sk-proj-');
  });

  test('cancelling recording stops microphone tracks and does not call transcribeVoice', async () => {
    const { stoppedTracks } = installFakeMic();
    let called = false;
    await mount({
      transcribeVoice: async () => {
        called = true;
        return 'не должно вызваться';
      },
    });

    const micBtn = document.querySelector(`button[aria-label="${ru.composer.voiceRecord}"]`);
    await act(async () => {
      fireEvent.click(micBtn);
    });
    const cancelBtn = document.querySelector(`button[aria-label="${ru.composer.voiceCancel}"]`);
    await act(async () => {
      fireEvent.click(cancelBtn);
    });

    expect(called).toBe(false);
    expect(stoppedTracks).toEqual(['audio-track-stopped']);
  });
});

describe('POST /agent/voice/transcribe door (bxeb.1)', () => {
  const noOp = () => () => undefined;
  const controllerModule = loadBackendTs('apps/backend/src/api/routes/agent.controller.ts', {
    '@mastra/ai-sdk': { handleChatStream: jest.fn() },
    '@mastra/ai-sdk/ui': { toAISdkMessages: (m) => m },
    '@mastra/memory': { Memory: class {} },
    '@mastra/core/processors': { RegexFilterProcessor: class {}, UnicodeNormalizer: class {} },
    '@nestjs/swagger': { ApiTags: noOp },
    '@contentfactory/backend/services/auth/permissions/permissions.ability': {
      CheckPolicies: noOp,
    },
    '@contentfactory/backend/services/auth/permissions/permission.exception.class': {
      AuthorizationActions: { Create: 'create' },
      Sections: { AI: 'ai' },
    },
    '@contentfactory/nestjs-libraries/openai/ai.usage.service': { AiUsageService: class {} },
    '@contentfactory/nestjs-libraries/chat/mastra.service': { MastraService: class {} },
  });

  test('accepts uploaded file buffer and delegates to MastraService.transcribeVoice', async () => {
    const transcribeVoice = jest.fn(async () => ({ text: 'Расшифрованный голос' }));
    const controller = new controllerModule.AgentController(
      { transcribeVoice },
      {},
      {}
    );
    const org = { id: 'org-1', createdAt: '2026-01-01T00:00:00.000Z', users: [{ role: 'EDITOR' }] };
    const user = { id: 'user-1', language: 'ru' };
    const result = await controller.transcribeVoice(
      org,
      user,
      {
        buffer: Buffer.from([1, 2, 3]),
        mimetype: 'audio/webm;codecs=opus',
      },
      {},
      'Europe/Moscow'
    );
    expect(result).toEqual({ text: 'Расшифрованный голос' });
    expect(transcribeVoice).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org-1',
        userId: 'user-1',
        language: 'ru',
      }),
      {
        buffer: Buffer.from([1, 2, 3]),
        mimeType: 'audio/webm;codecs=opus',
      }
    );
  });

  test('accepts base64 data URL in JSON body when no multipart file is provided', async () => {
    const transcribeVoice = jest.fn(async () => ({ text: 'Текст из JSON' }));
    const controller = new controllerModule.AgentController(
      { transcribeVoice },
      {},
      {}
    );
    const org = { id: 'org-1', createdAt: '2026-01-01T00:00:00.000Z', users: [{ role: 'EDITOR' }] };
    const user = { id: 'user-1', language: 'ru' };
    const result = await controller.transcribeVoice(
      org,
      user,
      undefined,
      { audio: 'data:audio/ogg;base64,AQIDBA==' },
      'Europe/Moscow'
    );
    expect(result).toEqual({ text: 'Текст из JSON' });
    expect(transcribeVoice).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: 'org-1' }),
      {
        buffer: Buffer.from([1, 2, 3, 4]),
        mimeType: 'audio/ogg',
      }
    );
  });
});
