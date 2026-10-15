export class IngestionAbortedError extends Error {
  override readonly name = 'IngestionAbortedError';
}

export class IngestionLockedError extends Error {
  override readonly name = 'IngestionLockedError';

  constructor() {
    super('another ingestion run holds the lock');
  }
}
