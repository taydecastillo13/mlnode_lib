const errorHandler = (err, req, res, next) => {
  const status = err.status || 500;
  const payload = {
    error: err.message || 'Internal Server Error',
  };
  if (process.env.NODE_ENV !== 'production') {
    payload.stack = err.stack;
  }
  console.error(err);
  res.status(status).json(payload);
};

module.exports = { errorHandler };
