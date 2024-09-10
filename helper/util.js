const generateOTP = (user) => {
  const newOtp = Math.floor(100000 + Math.random() * 900000); // Generate new 6-digit OTP
  const otpExpires = new Date();
  otpExpires.setMinutes(otpExpires.getMinutes() + process.env.OTP_EXPIRATION_TIME); // OTP expiration in minutes
  return {
    newOtp,
    otpExpires,
  };
};
  
module.exports = { generateOTP };
  