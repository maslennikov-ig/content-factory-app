import {
  AuthTokenDetails,
  PostDetails,
  PostResponse,
  SocialProvider,
} from '@contentfactory/nestjs-libraries/integrations/social/social.integrations.interface';
import { makeId } from '@contentfactory/nestjs-libraries/services/make.is';
import dayjs from 'dayjs';
import { SocialAbstract } from '@contentfactory/nestjs-libraries/integrations/social.abstract';
import { getPublicKey, finalizeEvent, SimplePool, VerifiedEvent } from 'nostr-tools';

import WebSocket from 'ws';
import { AuthService } from '@contentfactory/helpers/auth/auth.service';
import { Integration } from '@prisma/client';

// @ts-ignore
global.WebSocket = WebSocket;

const list = [
  'wss://nos.lol',
  'wss://relay.damus.io',
  'wss://relay.snort.social',
  'wss://temp.iris.to',
  'wss://vault.iris.to',
];

const pool = new SimplePool();

export class NostrProvider extends SocialAbstract implements SocialProvider {
  override maxConcurrentJob = 5;
  identifier = 'nostr';
  name = 'Nostr';
  isBetweenSteps = false;
  scopes = [] as string[];
  editor = 'normal' as const;
  toolTip = 'Make sure you private a HEX key of your Nostr private key, you can get it from websites like iris.to'

  maxLength() {
    return 100000;
  }

  async customFields() {
    return [
      {
        key: 'password',
        label: 'Nostr private key',
        validation: `/^.{3,}$/`,
        type: 'password' as const,
      },
    ];
  }

  async refreshToken(refresh_token: string): Promise<AuthTokenDetails> {
    return {
      refreshToken: '',
      expiresIn: 0,
      accessToken: '',
      id: '',
      name: '',
      picture: '',
      username: '',
    };
  }

  async generateAuthUrl() {
    const state = makeId(17);
    return {
      url: state,
      codeVerifier: makeId(10),
      state,
    };
  }

  private async findRelayInformation(pubkey: string) {
    // This queries ALL relays in parallel and resolves with
    // the first matching event from ANY relay.
    const evt = await pool.get(list, {
      kinds: [0],
      authors: [pubkey],
      limit: 1,
    });

    if (!evt) return {};

    let content: any = {};
    try {
      content = JSON.parse(evt.content || '{}');
    } catch {
      return {};
    }

    if (content.name || content.displayName || content.display_name) {
      return content;
    }

    return {};
  }

  private publishToRelay(relay: string, event: VerifiedEvent): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new WebSocket(relay);
      let settled = false;
      const timeout = setTimeout(() => finish(false), 6000);
      const finish = (accepted: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        socket.removeAllListeners('open');
        socket.removeAllListeners('message');
        // This one-shot exchange also owns sockets still connecting at timeout.
        // Keep error/close listeners for asynchronous termination notifications.
        socket.terminate();
        resolve(accepted);
      };
      socket.once('open', () => {
        try {
          socket.send(JSON.stringify(['EVENT', event]), (error) => {
            if (error) finish(false);
          });
        } catch {
          finish(false);
        }
      });
      socket.on('message', (data) => {
        let reply: unknown;
        try {
          reply = JSON.parse(data.toString());
        } catch {
          return;
        }
        if (
          Array.isArray(reply) && reply[0] === 'OK' && reply[1] === event.id &&
          typeof reply[2] === 'boolean' && typeof reply[3] === 'string'
        ) {
          finish(reply[2]);
        }
      });
      socket.on('error', () => finish(false));
      socket.once('close', () => finish(false));
    });
  }

  private async publish(pubkey: string, event: VerifiedEvent) {
    if (event.pubkey !== pubkey) throw new Error('Nostr signing identity mismatch');
    let accepted = false;
    for (const relay of list) {
      try {
        if (await this.publishToRelay(relay, event)) accepted = true;
      } catch {
        // Constructor/connect/send failures are not acknowledgement. Continue
        // the existing relay fanout with this exact signed event.
      }
    }
    if (!accepted) throw new Error('Nostr publication not acknowledged');
    return event.id;
  }

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }) {
    try {
      const body = JSON.parse(Buffer.from(params.code, 'base64').toString());

      const pubkey = getPublicKey(
        Uint8Array.from(
          body.password.match(/.{1,2}/g).map((byte: any) => parseInt(byte, 16))
        )
      );

      const user = await this.findRelayInformation(pubkey);

      return {
        id: pubkey,
        name: user.display_name || user.displayName || user.name || 'No Name',
        accessToken: AuthService.signJWT({ password: body.password }),
        refreshToken: '',
        expiresIn: dayjs().add(200, 'year').unix() - dayjs().unix(),
        picture: user?.picture || '',
        username: user.name || 'nousername',
      };
    } catch (e) {
      console.log(e);
      return 'Invalid credentials';
    }
  }

  private buildContent(post: PostDetails): string {
    const mediaContent = post.media?.map((m) => m.path).join('\n\n') || '';
    return mediaContent
      ? `${post.message}\n\n${mediaContent}`
      : post.message;
  }

  private signingKey(accessToken: string): Uint8Array {
    const { password } = AuthService.verifyJWT(accessToken) as { password?: unknown };
    if (typeof password !== 'string' || !/^[0-9a-fA-F]{64}$/.test(password)) {
      throw new Error('Invalid Nostr signing key');
    }
    return Uint8Array.from(Buffer.from(password, 'hex'));
  }

  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails[]
  ): Promise<PostResponse[]> {
    const key = this.signingKey(accessToken);
    const [firstPost] = postDetails;

    const textEvent = finalizeEvent(
      {
        kind: 1, // Text note
        content: this.buildContent(firstPost),
        tags: [],
        created_at: Math.floor(Date.now() / 1000),
      },
      key
    );

    const eventId = await this.publish(id, textEvent);

    return [
      {
        id: firstPost.id,
        postId: String(eventId),
        releaseURL: `https://primal.net/e/${eventId}`,
        status: 'completed',
      },
    ];
  }

  async comment(
    id: string,
    postId: string,
    lastCommentId: string | undefined,
    accessToken: string,
    postDetails: PostDetails[],
    integration: Integration
  ): Promise<PostResponse[]> {
    const key = this.signingKey(accessToken);
    const [commentPost] = postDetails;
    const replyToId = lastCommentId || postId;

    const textEvent = finalizeEvent(
      {
        kind: 1, // Text note
        content: this.buildContent(commentPost),
        tags: [
          ['e', replyToId, '', 'reply'],
          ['p', id],
        ],
        created_at: Math.floor(Date.now() / 1000),
      },
      key
    );

    const eventId = await this.publish(id, textEvent);

    return [
      {
        id: commentPost.id,
        postId: String(eventId),
        releaseURL: `https://primal.net/e/${eventId}`,
        status: 'completed',
      },
    ];
  }
}
