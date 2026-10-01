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

  /** The user has not signed in to `service` yet. */
  static notSignedIn(service: string): AuthRequiredError {
    return new AuthRequiredError(`Not signed in to ${service}. Call the \`login\` tool first.`);
  }

  /** `service` stopped accepting the session, for `reason` when one is known. */
  static expired(service: string, reason?: string): AuthRequiredError {
    const why = reason === undefined ? '' : ` (${reason})`;
    return new AuthRequiredError(
      `The ${service} session has expired${why}. Call the \`login\` tool to sign in again.`,
    );
  }
}
