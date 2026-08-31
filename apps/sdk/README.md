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
