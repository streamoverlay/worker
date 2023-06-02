import type { MiddlewareHandler } from 'hono';
import { ZodObject, ZodError } from 'zod';

import BadRequestException from '../errors/BadRequestException';

type Schema = ZodObject<any, any, any, any, any>;

const withBody = (schema: Schema): MiddlewareHandler => {
  return async (c, next) => {
    const body = await c.req.json();
    const data = await schema.parseAsync(body).catch((e: ZodError) => {
      const error = e.errors[0];
      throw new BadRequestException(`Invalid field ${error.path[0]} (${error.code}): ${error.message}`);
    });

    c.req.addValidatedData('json', data);
    return next();
  };
};

export default withBody;
