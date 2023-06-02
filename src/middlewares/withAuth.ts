import { Context, Next } from 'hono';
import type { MiddlewareHandler } from 'hono';

import Environment from '../environment';
import UnauthorizedException from '../errors/UnauthorizedException';

const withAuth = (): MiddlewareHandler => {
  return async (c: Context, next: Next) => {
    const env = c.env as Environment;
    const bearer = c.req.headers.get('authorization') || '';
    const token = bearer.split('Bearer ')[1];
    const key = env.SECRET_KEY;

    if (!token || !key) {
      throw new UnauthorizedException('Missing bearer token header');
    } else if (token != key) {
      throw new UnauthorizedException('Invalid bearer token header');
    }

    await next();
  };
};

export default withAuth();
