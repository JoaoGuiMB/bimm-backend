const PREFIX = 'make:';

export function encodeMakeCursor(makeId: number): string {
  return Buffer.from(`${PREFIX}${makeId}`).toString('base64url');
}

export function decodeMakeCursor(cursor: string): number | null {
  const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
  const match = /^make:(\d{1,15})$/.exec(decoded);

  return match ? Number(match[1]) : null;
}
