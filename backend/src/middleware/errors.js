'use strict';

const { ApiError } = require('../errors');

function notFoundHandler(req, res) {
  res.status(404).json({ error: { message: 'Not found' } });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({ error: { message: err.message } });
    return;
  }

  console.error('Unhandled request error', {
    message: err && err.message,
    code: err && err.code,
  });
  res.status(500).json({ error: { message: 'Internal server error' } });
}

module.exports = { notFoundHandler, errorHandler };
