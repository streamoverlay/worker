import Exception from './Exception';

export default class UnauthorizedException extends Exception {
  constructor(message: string) {
    super(401, 'UNAUTHORIZED', message);
  }
}
