'use strict';

class ApiError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

class ValidationError extends ApiError {
  constructor(message) {
    super(400, message);
  }
}

class NotFoundError extends ApiError {
  constructor(message = 'Resource not found') {
    super(404, message);
  }
}

/*
 * A request that is well-formed but cannot be satisfied in the current state
 * of the world — a full opportunity, or one that has been cancelled or has
 * already started. The `code` lets the UI show the right message.
 */
class ConflictError extends ApiError {
  constructor(message, code) {
    super(409, message);
    this.code = code;
  }
}

/*
 * Used when a demo session is missing, malformed, unknown, or expired.
 *
 * All four cases deliberately return the same 401 shape so the endpoint can
 * never be used to probe which session UUIDs exist. The `code` lets the
 * frontend distinguish "start a new session" from a genuine error without the
 * message having to carry that meaning.
 */
class SessionError extends ApiError {
  constructor(message = 'Demo session is missing or no longer valid') {
    super(401, message);
    this.code = 'demo_session_invalid';
  }
}

module.exports = { ApiError, ValidationError, NotFoundError, ConflictError, SessionError };
