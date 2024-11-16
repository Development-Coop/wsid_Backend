const multer = require('multer');
const { error } = require('../model/response');

// Set up Multer with memory storage
const storage = multer.memoryStorage();

// Multer configuration
const upload = multer({
  storage: storage,
  limits: { fileSize: 6 * 1024 * 1024 }, // Max file size: 6MB
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = ['image/jpeg', 'image/png'];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true); // Accept the file
    } else {
      cb(new Error('Invalid file type. Only JPEG and PNG are allowed!'), false);
    }
  },
});

/**
 * Middleware to handle file upload validation
 * @param {string} fieldName - The name of the form field
 * @param {boolean} isMultiple - Whether the field accepts multiple files
 * @returns {function} - Middleware function
 */
const uploadValidator = (fieldName, isMultiple = false) => (req, res, next) => {
  const uploader = isMultiple
    ? upload.array(fieldName) // Multiple file upload
    : upload.single(fieldName); // Single file upload

  uploader(req, res, function (err) {
    if (err instanceof multer.MulterError) {
      // Multer-specific errors
      return error(res, err.message, [], 400);
    } else if (err) {
      // Other errors (e.g., invalid MIME type)
      return error(res, err.message, [], 400);
    }

    // File is valid; proceed to the controller
    next();
  });
};

module.exports = uploadValidator;
