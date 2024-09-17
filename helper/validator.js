// Generic validation middleware for request bodies
const validateRequest = (schema) => (req, res, next) => {
  const dataToValidate = req.method === 'GET' ? req.query : req.body;
  const { error } = schema.validate(dataToValidate, { abortEarly: false });
  if (error) {
    // Map over error.details to get all validation messages
    const errorMessages = error.details.map((detail) => detail.message);

    // Send validation error response
    return res.status(400).json({
      data: [],
      message: errorMessages.join(','), // Get the first validation error message
      status: false,
    });
  }
  next(); // If validation passes, continue to the next middleware/controller
};
  
module.exports = validateRequest;
  