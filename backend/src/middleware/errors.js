'use strict';

const { ApiError } = require('../errors');

function notFoundHandler(req, res) {
  res.status(404).json({ error: { message: 'Not found' } });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof ApiError) {
    const body = { error: { message: err.message } };
    // Machine-readable hint (e.g. demo_session_invalid) so the client can act
    // on the outcome without parsing prose.
    if (err.code) body.error.code = err.code;
    res.status(err.statusCode).json(body);
    return;
  }

  console.error('Unhandled request error', {
    message: err && err.message,
    code: err && err.code,
  });
  res.status(500).json({ error: { message: 'Internal server error' } });
}

module.exports = { notFoundHandler, errorHandler };
