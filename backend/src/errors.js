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

module.exports = { ApiError, ValidationError, NotFoundError };
