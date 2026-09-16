const logger = require('../utils/logger');

/**
 * Last-resort error handler. Anything that reaches here is an
 * unanticipated failure — known/expected failures are handled with
 * specific status codes inside the controller. Never leaks stack traces
 * or internal error text to the client.
 */
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  logger.error('Unhandled request error', {
    path: req.path,
    method: req.method,
    error: err.message,
  });

  res.status(500).json({
    success: false,
    error: 'SERVER_ERROR',
    message: "Something went wrong on our end. Please try again in a moment.",
  });
}

function notFoundHandler(req, res) {
  res.status(404).json({
    success: false,
    error: 'NOT_FOUND',
    message: 'This endpoint does not exist.',
  });
}

module.exports = { errorHandler, notFoundHandler };
