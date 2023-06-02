import { z } from 'zod';

export const CompleteResourceDTO = z.object({
  parts: z.array(z.any()),
  uploadId: z.string(),
});

type CompleteResource = z.infer<typeof CompleteResourceDTO>;
export default CompleteResource;
