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
