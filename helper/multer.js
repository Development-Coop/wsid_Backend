const multer = require('multer');
const { error } = require('../model/response');

// Set up Multer with memory storage
const storage = multer.memoryStorage();

// Multer configuration
const upload = multer({
  storage: storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // Max file size: 2MB
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = ['image/jpeg', 'image/png'];

    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true); // Accept the file
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, and GIF are allowed!'), false);
    }
  },
}).single('profilePic'); // 'profilePic' is the field name in the form data

// Middleware function to validate file size and MIME type
const uploadValidator = (req, res, next) => {
  upload(req, res, function (err) {
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
