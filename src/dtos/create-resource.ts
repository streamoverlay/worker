import { z } from 'zod';

export const CreateResourceDTO = z.object({
  contentType: z.string(),
  size: z.number(),
});

type CreateResource = z.infer<typeof CreateResourceDTO>;
export default CreateResource;
