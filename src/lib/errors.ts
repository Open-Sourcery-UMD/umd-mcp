/** Failure reported by the CAS server, e.g. `INVALID_TICKET` or `INVALID_SERVICE`. */
export class CasError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(`CAS ${code}: ${message}`);
    this.name = 'CasError';
  }
}

/**
 * Thrown when a tool needs a signed-in user or service session and there is none, or the
 * session has expired. The base integration turns it into a tool error telling the model to
 * call `login`.
 */
export class AuthRequiredError extends Error {
  constructor(message = 'Not signed in to UMD. Call the `login` tool first.') {
    super(message);
    this.name = 'AuthRequiredError';
  }
}
