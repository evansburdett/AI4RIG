/**
 * Throw one of these from a repository or route to answer with that status and
 * message. The error handler in app.ts turns it into `{ error: message }`.
 *
 *   throw new HttpError(409, 'VTI is used by 2 models. Take it out of them first.');
 */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/**
 * Fallback for a SQLite constraint the code did not check for first. Better a
 * 409 that says which kind of rule was broken than a 500.
 */
export function constraintStatus(error: unknown): { status: number; message: string } | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null;
  const code = String(error.code);
  if (code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
    return { status: 409, message: 'That refers to something that does not exist, or is still in use elsewhere.' };
  }
  if (code === 'SQLITE_CONSTRAINT_UNIQUE' || code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
    return { status: 409, message: 'Something with that name or number already exists.' };
  }
  if (code.startsWith('SQLITE_CONSTRAINT')) {
    return { status: 400, message: `The database refused that value (${code}).` };
  }
  return null;
}
