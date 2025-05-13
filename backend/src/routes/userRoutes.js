const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const { protect, authorize } = require("../utils/authMiddleware");

// Route công khai (không cần đăng nhập)
router.post("/register", userController.register);
router.post("/login", userController.login);

// Route cần đăng nhập
router.use(protect);
router.get("/profile", userController.getProfile);
router.put("/profile", userController.updateProfile);
router.put("/change-password", userController.changePassword);
router.post("/register-driver", userController.registerAsDriver);

// Route liên quan đến hoạt động (activity patterns)
router.post("/activity-patterns", userController.updateActivityPattern);
router.put(
  "/activity-patterns/:patternId",
  userController.updateActivityPattern
);
router.delete(
  "/activity-patterns/:patternId",
  userController.deleteActivityPattern
);
router.get(
  "/potential-partners",
  userController.findPotentialRideSharingPartners
);

module.exports = router;
