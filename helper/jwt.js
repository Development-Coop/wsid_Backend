const jwt = require('jsonwebtoken');
const messages = require('../constants/messages');
const { error } = require('../model/response');

const generateToken = (user) => {
  return jwt.sign(
    { uid: user.uid, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
};

const generateRefreshToken = (user) => {
  return jwt.sign(
    { uid: user.uid, email: user.email },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: '7d' }
  );
};

const authenticateJWT = (req, res, next) => {
  const token = req.headers.authorization && req.headers.authorization.split(' ')[1];

  if (!token) {
    return error(res, messages.ACCESS_TOKEN_REQUIRED, [], 401);
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return error(res, messages.EXPIRED_TOKEN, [], 403);
    }

    // Attach user info to the request object
    req.user = user;
    next();
  });
};

const verifyRefreshToken = (refreshToken) => {
  return jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
};

module.exports = { 
  generateToken,
  generateRefreshToken,
  authenticateJWT,
  verifyRefreshToken
};
