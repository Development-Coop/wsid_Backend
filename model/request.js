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
  password: Joi.string()
    .min(6)
    .pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*])'))
    .required()
    .messages({
      'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
      'string.min': 'Password must be at least 6 characters long',
    }),
  username: Joi.string().required(),
  profilePic: Joi.any().optional(),
  bio: Joi.string().optional(),
});

const resendOtpSchema = Joi.object({
  email: Joi.string().email().required()
});

module.exports = {
  registerSchemaStep1,
  registerSchemaStep2,
  registerSchemaStep3,
  resendOtpSchema
};
