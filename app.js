require('dotenv').config();
const express = require('express');
const routes = require('./routes/index');
const app = express();

// Middleware
app.use(express.json()); // To handle JSON request bodies

// Routes
app.use('/api', routes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
