const nodemailer = require('nodemailer');

// Create reusable transporter object using the default SMTP transport
const transporter = nodemailer.createTransport({
  service: 'gmail', // Or any other service you are using (e.g., SendGrid)
  auth: {
    user: process.env.SMTP_EMAIL, // Your email
    pass: process.env.SMTP_PASSWORD, // Your email password or app-specific password
  },
});

/**
 * Sends an OTP to the user's email address
 * @param {string} email - The recipient's email address
 * @param {string} otp - The generated OTP to be sent
 */
const sendOtpToEmail = async (email, otp) => {
  try {
    const mailOptions = {
      from: process.env.FROM_EMAIL, // Sender address (your email)
      to: email, // Receiver email
      subject: 'Your OTP Code', // Subject line
      text: `Your OTP is: ${otp}`, // Plain text body
    };

    // Send mail with defined transport object
    await transporter.sendMail(mailOptions);
    console.log('OTP email sent to:', email);
  } catch (error) {
    console.error('Error sending OTP email:', error);
    throw new Error('Failed to send OTP email');
  }
};

module.exports = sendOtpToEmail;
