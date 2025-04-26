require("dotenv").config();
const express = require("express");
const cors = require("cors");
const serverless = require("serverless-http");
const routes = require("./routes/index");
const app = express();

// CORS config
const allowedOrigins = ["https://wsid.com", "http://localhost:9000"];
app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);

      if (allowedOrigins.indexOf(origin) === -1) {
        const msg =
          "The CORS policy for this site does not allow access from the specified Origin.";
        return callback(new Error(msg), false);
      }
      return callback(null, true);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

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
