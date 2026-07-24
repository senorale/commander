export class CommanderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommanderError';
  }
}
