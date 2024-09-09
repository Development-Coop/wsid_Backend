// Example for request validation using Joi (optional)
const Joi = require('joi');

const registerSchemaStep1 = Joi.object({
  name: Joi.string().required(),
  email: Joi.string().email().required(),
  dateOfBirth: Joi.date().required(),
});

const registerSchemaStep2 = Joi.object({
  email: Joi.string().email().required(),
  otp: Joi.string().length(6).required(), // Assuming OTP is 6 digits
});

const registerSchemaStep3 = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
  username: Joi.string().required(),
  profilePic: Joi.string().uri().optional(),
  bio: Joi.string().optional(),
});

module.exports = {
  registerSchemaStep1,
  registerSchemaStep2,
  registerSchemaStep3
};
