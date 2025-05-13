const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const bodyParser = require("body-parser");
require("dotenv").config();

// Import database connection
const { connectDB } = require("./src/config/database");

// Import routes
const userRoutes = require("./src/routes/userRoutes");
const rideRoutes = require("./src/routes/rideRoutes");

// Khởi tạo express app
const app = express();

// Middleware
app.use(cors());
app.use(morgan("dev"));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Routes
app.use("/api/auth", userRoutes);
app.use("/api/rides", rideRoutes);

// Home route
app.get("/", (req, res) => {
  res.json({
    message:
      "Welcome to Ride Sharing API with Activity-based Ridesharing Algorithm",
  });
});

// Port
const PORT = process.env.PORT || 5000;

// Start server
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

module.exports = app;
