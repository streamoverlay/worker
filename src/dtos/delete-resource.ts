import { z } from 'zod';

export const DeleteResourceDTO = z.object({
  uploadId: z.string(),
});

type DeleteResource = z.infer<typeof DeleteResourceDTO>;
export default DeleteResource;
