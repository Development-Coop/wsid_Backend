# WSID Backend

**WSID Backend** is a REST API built using Express.js, which provides authentication and data handling functionalities for the WSID platform.

## Table of Contents

- [Installation](#installation)
- [Running the Application](#running-the-application)
  - [Development Mode](#development-mode)
  - [Production Mode](#production-mode)
- [Environment Variables](#environment-variables)
- [API Endpoints](#api-endpoints)

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

## Running the Application

1. Development Mode:
   To run the application in development mode with automatic restarts (using nodemon), use

   ```bash
   npm run dev
   ```

2. Production Mode:
   To run the application in production mode

   ```bash
   npm run prod
   ```

## Environment Variables

Create a .env file in the root of the project and configure the following environment variables:

```bash
PORT=3000
JWT_SECRET=your_jwt_secret
FIREBASE_PROJECT_ID=your_firebase_project_id
FIREBASE_CLIENT_EMAIL=your_firebase_client_email
FIREBASE_PRIVATE_KEY="your_firebase_private_key"
FIREBASE_BUCKET="your_firebase_bucket_name"
MAX_ALLOWED_OTP_RESENDS=3
OTP_EXPIRATION_TIME=5
FROM_EMAIL="your_from_email"
SMTP_EMAIL="your_smtp_email"
SMTP_PASSWORD="your_smtp_password"
```

Make sure to replace the values with your actual Firebase credentials and configuration.

## API Endpoints

The following endpoints are available in the API:

### Authentication Routes

| Method | Endpoint                  | Description                            |
| :----- | :------------------------ | :------------------------------------- |
| POST   | /api/auth/register        | Register a new user                    |
| POST   | /api/auth/login           | Log in with email and password         |
| POST   | /api/auth/logout          | Log out the user                       |
| POST   | /api/auth/forgot-password | Send a password reset                  |
| POST   | /api/auth/reset-password  | Reset password with the provided token |
