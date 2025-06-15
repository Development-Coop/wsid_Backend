const sgMail = require('@sendgrid/mail');

// Set SendGrid API key
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

/**
 * Sends an OTP to the user's email address
 * @param {string} email - The recipient's email address
 * @param {string} otp - The generated OTP to be sent
 */
const sendOtpToEmail = async (email, otp) => {
  try {
    const msg = {
      to: email, // Recipient email
      from: process.env.FROM_EMAIL, // Verified sender email in SendGrid
      subject: 'Your WSID Verification Code',
      text: `Your verification code is: ${otp}`, // Plain text body
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">WSID Verification Code</h2>
          <p>Your verification code is:</p>
          <div style="background-color: #f5f5f5; padding: 20px; text-align: center; margin: 20px 0;">
            <h1 style="color: #007bff; font-size: 32px; margin: 0; letter-spacing: 4px;">${otp}</h1>
          </div>
          <p>This code will expire in ${process.env.OTP_EXPIRATION_TIME || 5} minutes.</p>
          <p>If you didn't request this code, please ignore this email.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          <p style="color: #666; font-size: 12px;">© 2025 WSID. All rights reserved.</p>
        </div>
      `
    };

    await sgMail.send(msg);
    console.log('OTP email sent successfully to:', email);
  } catch (error) {
    console.error('SendGrid error:', error);
    
    // Handle specific SendGrid errors
    if (error.response) {
      console.error('SendGrid response error:', error.response.body);
    }
    
    throw new Error('Failed to send OTP email');
  }
};

/**
 * Sends a password reset email
 * @param {string} email - The recipient's email address
 * @param {string} otp - The generated OTP for password reset
 */
const sendPasswordResetEmail = async (email, otp) => {
  try {
    const msg = {
      to: email,
      from: process.env.FROM_EMAIL,
      subject: 'WSID Password Reset',
      text: `Your password reset code is: ${otp}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Password Reset Request</h2>
          <p>You requested a password reset for your WSID account.</p>
          <p>Your password reset code is:</p>
          <div style="background-color: #f5f5f5; padding: 20px; text-align: center; margin: 20px 0;">
            <h1 style="color: #007bff; font-size: 32px; margin: 0; letter-spacing: 4px;">${otp}</h1>
          </div>
          <p>This code will expire in ${process.env.OTP_EXPIRATION_TIME || 5} minutes.</p>
          <p>If you didn't request this password reset, please ignore this email.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          <p style="color: #666; font-size: 12px;">© 2025 WSID. All rights reserved.</p>
        </div>
      `
    };

    await sgMail.send(msg);
    console.log('Password reset email sent successfully to:', email);
  } catch (error) {
    console.error('SendGrid error:', error);
    
    if (error.response) {
      console.error('SendGrid response error:', error.response.body);
    }
    
    throw new Error('Failed to send password reset email');
  }
};

module.exports = { 
  sendOtpToEmail,
  sendPasswordResetEmail 
};