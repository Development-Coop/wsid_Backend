# WSID Backend

**WSID Backend** is a REST API built using Express.js, which provides authentication and data handling functionalities for the WSID platform.

## Table of Contents

- [Installation](#installation)
- [Firebase Setup](#firebase-setup)
- [Environment Variables](#environment-variables)
- [Running the Application](#running-the-application)
  - [Development Mode](#development-mode)
  - [Production Mode](#production-mode)
- [API Endpoints](#api-endpoints)
- [Troubleshooting](#troubleshooting)

## Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/Development-Coop/wsid_Backend.git
   ```

2. Navigate into the project directory:

   ```bash
   cd wsid_Backend
   ```

3. Install the required dependencies:

   ```bash
   npm install
   ```

## Firebase Setup

### For Local Development

To avoid Firebase credential formatting issues in environment variables, we use a service account JSON file for local development:

1. **Download Firebase Service Account Key:**
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Select the WSID project (`wsid-3b236`)
   - Click the gear icon → **Project Settings**
   - Go to the **Service Accounts** tab
   - Click **"Generate new private key"**
   - Click **"Generate key"** to download the JSON file

2. **Save the Service Account File:**
   - Save the downloaded file as `serviceAccountKey.json` in the `db/` directory
   - The file path should be: `db/serviceAccountKey.json`
   - The file is already listed in `.gitignore` and will not be committed

3. **Firebase Configuration:**
   The app automatically detects the service account file for local development and uses environment variables for production deployment.

## Environment Variables

### Getting Environment Variables

**Important:** Do not use Firebase Console to get environment variables. Instead:

1. **Get from Production Server:** Contact the team lead to get the proper environment variables from the production server
2. **Or Copy from Deployment Platform:** Get them from the actual deployment environment (Netlify, Vercel, etc.)

### Create Environment File

Create a `.env` file in the root of the project with the following variables:

```bash
# Server Configuration
PORT=3000

# JWT Configuration
JWT_SECRET=your_jwt_secret_from_production

# Firebase Configuration
FIREBASE_PROJECT_ID=your_firebase_project_id
FIREBASE_CLIENT_EMAIL=your_firebase_client_email
FIREBASE_BUCKET=your_firebase_bucket
# Note: FIREBASE_PRIVATE_KEY is only used in production deployment

# Email Configuration
MAX_ALLOWED_OTP_RESENDS=3
OTP_EXPIRATION_TIME=5
SENDGRID_API_KEY=your_sendgrid_api_key
FROM_EMAIL=your_from_email
```

### Important Notes:

- **Always get environment variables from the production server** - contact team lead for proper values
- For local development, the service account JSON file is used instead of environment variables
- The `FIREBASE_PRIVATE_KEY` environment variable is only needed for production deployment
- All values should match exactly what's used in production

## Running the Application

### Development Mode

To run the application in development mode with automatic restarts (using nodemon):

```bash
npm run dev
```

The server will start on `http://localhost:3000` and automatically use the Firebase service account file if present.

### Production Mode

To run the application in production mode:

```bash
npm run prod
```

## API Endpoints

The following endpoints are available in the API:

### Authentication Routes

| Method | Endpoint                      | Description                            |
| :----- | :---------------------------- | :------------------------------------- |
| POST   | /api/auth/register-step1      | Start user registration process        |
| POST   | /api/auth/register-step2      | Verify OTP during registration         |
| POST   | /api/auth/register-step3      | Complete registration with profile     |
| POST   | /api/auth/resend-otp          | Resend OTP for verification            |
| POST   | /api/auth/username-suggestions| Generate username suggestions          |
| POST   | /api/auth/login               | Log in with email/username & password |
| POST   | /api/auth/login-with-google   | Log in with Google OAuth               |
| POST   | /api/auth/login-with-apple    | Log in with Apple OAuth                |
| POST   | /api/auth/logout              | Log out the user                       |
| POST   | /api/auth/forgot-password     | Send password reset email              |
| POST   | /api/auth/reset-password      | Reset password with OTP                |
| POST   | /api/auth/refresh-token       | Refresh access token                   |

## Troubleshooting

If you encounter issues:
1. Check the console logs for detailed error messages
2. Verify all environment variables are set correctly
3. Ensure the Firebase service account file is in the correct location
4. Contact the team lead for production environment variables