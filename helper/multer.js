const multer = require('multer');
const { error } = require('../model/response');

const multerConfig = {
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024 }, // 6MB
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = ['image/jpeg', 'image/png'];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG and PNG are allowed!'), false);
    }
  },
};

const upload = multer(multerConfig);

const uploadValidator = () => (req, res, next) => {
  try {
    const uploader = upload.any();
    uploader(req, res, function (err) {
      if (err instanceof multer.MulterError) {
        return error(res, err.message, [], 400);
      } else if (err) {
        return error(res, err.message, [], 400);
      }

      //if (!req.files || req.files.length === 0) {
      //  return error(res, "No files uploaded.", [], 400);
      //}

      console.log(`[UPLOAD VALIDATOR] ${req.files.length} file(s) uploaded successfully.`);
      next();
    });
  } catch (err) {
    return error(res, "Unexpected error occurred.", [], 500);
  }
};

module.exports = uploadValidator;
