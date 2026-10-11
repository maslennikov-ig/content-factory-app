# Content Factory Node.js SDK

This package provides the Content Factory API client.

You can start by installing the package:

```bash
pnpm add @contentfactory/node
```

## Usage
```typescript
import ContentFactory from '@contentfactory/node';

const client = new ContentFactory(
  'your API key',
  'https://content-factory.example'
);
```

The available methods are:
- `post(posts: CreatePostDto)` - Schedule a post through Content Factory
- `postList(filters: GetPostsDto)` - Get a list of posts
- `upload(file: Buffer, extension: string)` - Upload a file to Content Factory
- `integrations()` - Get a list of connected channels
- `deletePost(id: string)` - Delete a post by ID

The client connects to the `/public/v1` API on the Content Factory instance
passed to its constructor.

## Errors

`post()` and `PUT /public/v1/posts/:id/status` answer `409` with
`{ "code": "CF_QUEUE_BUSY", "message": "..." }` when the post is a Content
Factory variant and another variant of the same piece is already scheduled in
that channel. Only one version of a piece may wait in a channel's queue.
Nothing is written. Unschedule the other version (set it back to `draft`) and
retry. Plain posts that did not come from a Content Factory piece never get
this answer.

By default JSON methods return the server's JSON on every status, preserving
existing clients and the `CF_QUEUE_BUSY` payload above. `deletePost()` returns
the raw `node-fetch` Response. Non-JSON bodies in this default mode still reject
with the JSON parser's error.

To obtain typed HTTP failures, opt in explicitly:

```typescript
import ContentFactory, { ContentFactoryHttpError } from '@contentfactory/node';

const client = new ContentFactory('your API key', 'https://content-factory.example', {
  httpErrors: 'throw',
});
try {
  await client.integrations();
} catch (error) {
  if (error instanceof ContentFactoryHttpError) {
    console.log(error.status, error.code, error.retryAfter);
  }
}
```

In this mode all five methods reject non-2xx responses with
`ContentFactoryHttpError`: `status`, `statusText`, optional string `code`, parsed
`body` (or raw text for non-JSON), `rawBody`, and raw `retryAfter` (`null` when
absent). Success returns stay unchanged, including the Response from deletion.
`retryable` identifies transient HTTP statuses 429/502/503/504. It is not proof
that repeating a write is safe: reconcile the operation's outcome first.
The SDK performs no automatic retries. Transport failures retain their original
error; successful responses with invalid JSON retain the JSON parser's error.

For local acceptance run `pnpm --filter ./apps/sdk run build` and
`pnpm --filter ./apps/sdk run typecheck`. Neither publishes the package. SDK
acceptance is separate from the repository's core application build.
