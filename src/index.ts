import { Hono } from 'hono';
import { v4 as uuid } from 'uuid';

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

/* Middlewares */

/* Routes */

// Get saved resource.
app.get('/:resourceId', async (c) => {
  const { BUCKET } = c.env as Environment;
  const resourceId = c.req.param('resourceId');

  const res = await BUCKET.get(resourceId);
  if (!res) {
    throw new NotFoundException('Resource not found.');
  }

  const data = await res.arrayBuffer();
  return c.body(data, 200, {
    etag: res.etag,
    'Content-Type': res.httpMetadata?.contentType || 'image/jpg',
  });
});

// Create new resource.
app.post('/', withAuth, withBody(CreateResourceDTO), async (c) => {
  const { contentType, size } = c.req.valid('json') as CreateResource;
  const { BUCKET, KV } = c.env as Environment;

  const id = uuid().replace(/-/g, '');
  const res = await BUCKET.createMultipartUpload(id, {
    httpMetadata: {
      contentType,
    },
  });
  await KV.put(id, `${size}`, { expiration: getUntilHoursEpoch(1) });
  return c.json({ id, uploadId: res.uploadId }, 201);
});

// Upload resource.
app.put('/:resourceId', withBody(UploadResourceDTO), async (c) => {
  const { buffer, part, uploadId } = c.req.valid('json') as UploadResource;
  const { BUCKET, KV } = c.env as Environment;
  const resourceId = c.req.param('resourceId');

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
});

// Complete resource.
app.post('/:resourceId/complete', withBody(CompleteResourceDTO), async (c) => {
  const { parts, uploadId } = c.req.valid('json') as CompleteResource;
  const { BUCKET, KV } = c.env as Environment;
  const resourceId = c.req.param('resourceId');

  const res = BUCKET.resumeMultipartUpload(resourceId, uploadId);
  if (!res) {
    throw new NotFoundException('Resource not found.');
  }

  await res.complete(parts);
  await KV.delete(resourceId);
  return c.json({ resourceId }, 201);
});

// Delete resource.
app.delete('/:resourceId', withAuth, async (c) => {
  const { BUCKET } = c.env as Environment;
  const resourceId = c.req.param('resourceId');

  await BUCKET.delete(resourceId);
  return c.json({ resourceId }, 204);
});

// Abort resource upload.
app.delete('/:resourceId', withBody(DeleteResourceDTO), async (c) => {
  const { uploadId } = c.req.valid('json') as DeleteResource;
  const { BUCKET, KV } = c.env as Environment;
  const resourceId = c.req.param('resourceId');

  const res = BUCKET.resumeMultipartUpload(resourceId, uploadId);
  if (!res) {
    throw new NotFoundException('Resource not found.');
  }

  await res.abort();
  await KV.delete(resourceId);
  return c.json({ resourceId }, 204);
});

// Handle 404 error.
app.all('*', async (c) => {
  const path = c.req.path;
  throw new NotFoundException('Path ' + path + ' not found.');
});

export default app;
