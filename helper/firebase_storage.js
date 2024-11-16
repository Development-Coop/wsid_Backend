const admin = require('firebase-admin');
const path = require('path');

// Initialize Firebase Admin SDK if not done already
const bucket = admin.storage().bucket();

const uploadFileToFirebase = async (filePath, fileSrc) => {
    try {
      // Create a unique file name if needed (optional)
      const fileName = `${filePath}/${Date.now()}${path.extname(fileSrc.originalname)}`;
      
      // Create a file reference in Firebase Storage
      const fileRef = bucket.file(fileName);
      
      // Upload file buffer to Firebase Storage
      await fileRef.save(fileSrc.buffer, {
        metadata: {
          contentType: fileSrc.mimetype,
        },
      });
  
      // Make the file publicly accessible or keep it private based on your needs
      await fileRef.makePublic();
  
      // Get the public URL of the uploaded file
      const fileUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
  
      return fileUrl;
    } catch (error) {
      console.error('Error uploading file to Firebase:', error);
      throw new Error('Failed to upload file');
    }
  };

  module.exports = { uploadFileToFirebase };