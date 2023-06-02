import { z } from 'zod';

export const UploadResourceDTO = z.object({
  buffer: z.string(),
  part: z.number(),
  uploadId: z.string(),
});

type UploadResource = z.infer<typeof UploadResourceDTO>;
export default UploadResource;
