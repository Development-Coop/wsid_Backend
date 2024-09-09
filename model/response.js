module.exports = {
  success: (res, data = [], message = '') => {
    return res.send({
      data,
      message,
      status: true,
    });
  },
  error: (res, message = '', data = [], statusCode = 400) => {
    return res.status(statusCode).send({
      data,
      message,
      status: false,
    });
  },
};
