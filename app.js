require("dotenv").config();
const express = require("express");
const cors = require("cors");
const serverless = require("serverless-http");
const routes = require("./routes/index");
const app = express();

// CORS config
// const allowedOrigins = ['http://localhost:9000'];
app.use(cors());

// Middleware
app.use(express.json());

// Routes
app.use("/api", routes);

app.use("/", (req, res) => {
  res.send("Welcome to WSID REST API!");
});

// Export wrapped server
module.exports.handler = serverless(app);

// Run locally if not production
if (process.env.NODE_ENV !== "production") {
  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`Server running locally on port ${port}`);
  });
}
