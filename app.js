require('dotenv').config();
const express = require('express');
const cors = require('cors');
const serverless = require('serverless-http');
const routes = require('./routes/index');
const app = express();

// Enable CORS for all routes
app.use(cors());

// Middleware
app.use(express.json()); // To handle JSON request bodies

// Routes
app.use('/api', routes);

app.use('/', (req, res) => {
  res.send('Welcome to WSID REST API!');
});

// Export the app wrapped in serverless-http
module.exports.handler = serverless(app);

// If running locally, start the app on port 3000
if (process.env.NODE_ENV !== 'production') {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Server running locally on port ${port}`);
  });
}
