const express = require("express");
const router = express.Router();
const rideController = require("../controllers/rideController");
const { protect, authorize } = require("../utils/authMiddleware");

router.use(protect);

router.post("/book-ride", rideController.bookRide);

router.post("/share-ride", rideController.shareRide);

module.exports = router;
