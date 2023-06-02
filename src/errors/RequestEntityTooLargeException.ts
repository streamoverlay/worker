import Exception from './Exception';

export default class RequestEntityTooLargeException extends Exception {
  constructor(message: string) {
    super(413, 'REQUEST_ENTITY_TOO_LARGE', message);
  }
}
