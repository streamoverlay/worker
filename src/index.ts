import { Context, Hono } from 'hono';
import { cors } from 'hono/cors';

import Environment from './environment';

import CompleteResource, { CompleteResourceDTO } from './dtos/complete-resource';
import CreateResource, { CreateResourceDTO } from './dtos/create-resource';
import DeleteResource, { DeleteResourceDTO } from './dtos/delete-resource';
import UploadResource, { UploadResourceDTO } from './dtos/upload-resource';

import NotFoundException from './errors/NotFoundException';
import RequestEntityTooLargeException from './errors/RequestEntityTooLargeException';

import withAuth from './middlewares/withAuth';
import withBody from './middlewares/withBody';
import { getUntilHoursEpoch } from './utils';

const app = new Hono();

/* Settings */
const MAX_THUMBNAIL_SIZE = 1024 * 256; // 256KB

/* Middlewares */
app.use(
  '*',
  cors({
    origin: [
      'http://localhost:3000',
      'http://localhost:5173',
      'https://staroverlay.com',
      'https://www.staroverlay.com',
      'https://app.staroverlay.com',
      'https://app.dev.staroverlay.com',
      'https://widgets.staroverlay.com',
      'https://widgets.dev.staroverlay.com',
    ],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowHeaders: ['Content-Type', 'Authorization'],
  })
);

/* Routes */

// Get saved resource.
const handleGet = async (c: Context, resourceId: string) => {
  const { BUCKET } = c.env as Environment;

  const res = await BUCKET.get(resourceId);
  if (!res) {
    throw new NotFoundException('Resource not found.');
  }

  const data = await res.arrayBuffer();
  const contentType = res.httpMetadata?.contentType || 'image/jpg';
  const ext = contentType.split('/')[1] || 'jpg';
  return c.body(data, 200, {
    etag: res.etag,
    'Content-Type': contentType,
    'Content-Disposition': `attachment; filename="${resourceId}.${ext}"`,
  });
};

app.get('/:resourceId', async (c) => {
  const resourceId = c.req.param('resourceId');
  return handleGet(c, resourceId);
});

app.get('/:resourceId/thumbnail', async (c) => {
  const resourceId = c.req.param('resourceId') + '-thumbnail';
  return handleGet(c, resourceId);
});

// Create new resource.
app.post('/', withAuth, withBody(CreateResourceDTO), async (c) => {
  const { contentType, size, id } = c.req.valid('json') as CreateResource;
  const { BUCKET, KV } = c.env as Environment;

  // Create resource.
  const res = await BUCKET.createMultipartUpload(id, {
    httpMetadata: {
      contentType,
    },
  });

  await KV.put(id, `${size}`, { expiration: getUntilHoursEpoch(1) });

  // Create thumbnail.
  const thumbId = `${id}-thumbnail`;
  const thumbRes = await BUCKET.createMultipartUpload(thumbId, {
    httpMetadata: {
      contentType: 'image/jpeg',
    },
  });
  await KV.put(thumbId, `${MAX_THUMBNAIL_SIZE}`, { expiration: getUntilHoursEpoch(1) });

  // Return uploadId.
  return c.json({ id, uploadId: res.uploadId, thumbnailUploadId: thumbRes.uploadId }, 201);
});

// Upload resource.
const handleUpload = async (c: Context, data: UploadResource, resourceId: string) => {
  const { buffer, part, uploadId } = data;
  const { BUCKET, KV } = c.env as Environment;

  const rawPending = await KV.get(resourceId);
  const pending = rawPending ? parseInt(rawPending) : 0;

  if (rawPending == null || pending == 0) {
    throw new RequestEntityTooLargeException(`Data is already saved.`);
  }

  const byteArray = Uint8Array.from(buffer, (c) => c.charCodeAt(0));
  const byteLength = byteArray.length;
  const spaceQuota = pending - byteLength;

  if (spaceQuota < 0) {
    throw new RequestEntityTooLargeException(
      `Chunk exceeds max storage quota for this resource (pending=${rawPending}, length=${byteLength})`
    );
  }

  const res = BUCKET.resumeMultipartUpload(resourceId, uploadId);
  const uploadedPart = await res.uploadPart(part, byteArray);
  return c.json(uploadedPart, 201);
};

app.put('/:resourceId', withBody(UploadResourceDTO), (c) => {
  const { buffer, part, uploadId } = c.req.valid('json') as UploadResource;
  const resourceId = c.req.param('resourceId');
  return handleUpload(c, { buffer, part, uploadId }, resourceId);
});

app.put('/:resourceId/thumbnail', withBody(UploadResourceDTO), (c) => {
  const { buffer, part, uploadId } = c.req.valid('json') as UploadResource;
  const resourceId = c.req.param('resourceId') + '-thumbnail';
  return handleUpload(c, { buffer, part, uploadId }, resourceId);
});

// Complete resource.
const handleComplete = async (c: Context, data: CompleteResource, resourceId: string) => {
  const { parts, uploadId } = data;
  const { BUCKET, KV } = c.env as Environment;

  const res = BUCKET.resumeMultipartUpload(resourceId, uploadId);
  if (!res) {
    throw new NotFoundException('Resource not found.');
  }

  await res.complete(parts);
  await KV.delete(resourceId);
  return c.json({ id: res.key }, 201);
};

app.post('/:resourceId/complete', withAuth, withBody(CompleteResourceDTO), async (c) => {
  const { parts, uploadId } = c.req.valid('json') as CompleteResource;
  const resourceId = c.req.param('resourceId');
  return handleComplete(c, { parts, uploadId }, resourceId);
});

app.post('/:resourceId/thumbnail/complete', withAuth, withBody(CompleteResourceDTO), async (c) => {
  const { parts, uploadId } = c.req.valid('json') as CompleteResource;
  const resourceId = c.req.param('resourceId') + '-thumbnail';
  return handleComplete(c, { parts, uploadId }, resourceId);
});

// Delete resource.
const handleDelete = async (c: Context, resourceId: string) => {
  const { BUCKET, KV } = c.env as Environment;

  await BUCKET.delete(resourceId);
  await KV.delete(resourceId);
  return c.json({ id: resourceId }, 200);
};

app.delete('/:resourceId', withAuth, async (c) => {
  const resourceId = c.req.param('resourceId');
  return handleDelete(c, resourceId);
});

app.delete('/:resourceId/thumbnail', withAuth, async (c) => {
  const resourceId = c.req.param('resourceId') + '-thumbnail';
  return handleDelete(c, resourceId);
});

// Abort resource upload.
const handleAbort = async (c: Context, data: DeleteResource, resourceId: string) => {
  const { uploadId } = data;
  const { BUCKET, KV } = c.env as Environment;

  const res = BUCKET.resumeMultipartUpload(resourceId, uploadId);
  if (!res) {
    throw new NotFoundException('Resource not found.');
  }

  await res.abort();
  await KV.delete(resourceId);
  return c.json({ id: res.key }, 200);
};

app.delete('/:resourceId/abort', withBody(DeleteResourceDTO), async (c) => {
  const resourceId = c.req.param('resourceId');
  const data = c.req.valid('json') as DeleteResource;
  return handleAbort(c, data, resourceId);
});

app.delete('/:resourceId/thumbnail/abort', withBody(DeleteResourceDTO), async (c) => {
  const resourceId = c.req.param('resourceId') + '-thumbnail';
  const data = c.req.valid('json') as DeleteResource;
  return handleAbort(c, data, resourceId);
});

// Handle 404 error.
app.all('*', async (c) => {
  const path = c.req.path;
  throw new NotFoundException('Path ' + path + ' not found.');
});

export default app;
