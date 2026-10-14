export class VpicRequestError extends Error {
  override readonly name = 'VpicRequestError';

  constructor(
    message: string,
    readonly status?: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }

  get isThrottled(): boolean {
    return this.status === 403 || this.status === 429;
  }
}

export class XmlParseError extends Error {
  override readonly name = 'XmlParseError';
}

export class TransformationError extends Error {
  override readonly name = 'TransformationError';

  constructor(
    message: string,
    readonly record: unknown,
  ) {
    super(message);
  }
}
