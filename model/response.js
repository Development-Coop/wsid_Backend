// Define response schemas (if needed, or response format convention)
module.exports = {
  success: (data) => ({ success: true, data }),
  error: (message) => ({ success: false, message }),
};
