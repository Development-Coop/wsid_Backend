// Example for request validation using Joi (optional)
const Joi = require('joi');

const registerSchemaStep1 = Joi.object({
  name: Joi.string().required(),
  email: Joi.string().email().required(),
  dateOfBirth: Joi.date().required(),
});

const registerSchemaStep2 = Joi.object({
  email: Joi.string().email().required(),
  otp: Joi.string().length(6).required(),
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
  username: Joi.string()
    .min(3)
    .max(15)
    .pattern(/^[a-zA-Z0-9](?!.*[._-]{2})[a-zA-Z0-9._-]{1,13}[a-zA-Z0-9]$/)
    .required()
    .messages({
      'string.min': 'Username must be at least 3 characters long.',
      'string.max': 'Username cannot exceed 15 characters.',
      'string.pattern.base': 'Username can only contain letters, numbers, underscores, hyphens, and periods, and must not have consecutive special characters or start/end with a special character.',
      'any.required': 'Username is required.'
    }),
  profilePic: Joi.any().optional(),
  bio: Joi.string().optional(),
});

const resendOtpSchema = Joi.object({
  email: Joi.string().email().required()
});

const userNameSchema = Joi.object({
  username: Joi.string()
    .min(3)
    .max(15)
    .pattern(/^[a-zA-Z0-9](?!.*[._-]{2})[a-zA-Z0-9._-]{1,13}[a-zA-Z0-9]$/)
    .required()
    .messages({
      'string.min': 'Username must be at least 3 characters long.',
      'string.max': 'Username cannot exceed 15 characters.',
      'string.pattern.base': 'Username can only contain letters, numbers, underscores, hyphens, and periods, and must not have consecutive special characters or start/end with a special character.',
      'any.required': 'Username is required.'
    })
});

const loginSchema = Joi.object({
  emailOrUsername: Joi.string().required(),
  password: Joi.string().required()
});

const forgotPasswordSchema = Joi.object({
  email: Joi.string().email().required()
});

const resetPasswordSchema = Joi.object({
  email: Joi.string().email().required(),
  otp: Joi.string().length(6).required(),
  password: Joi.string()
    .min(6)
    .pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#$%^&*])'))
    .required()
    .messages({
      'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
      'string.min': 'Password must be at least 6 characters long',
    })
});

module.exports = {
  registerSchemaStep1,
  registerSchemaStep2,
  registerSchemaStep3,
  resendOtpSchema,
  userNameSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema
};
