const jwt = require("jsonwebtoken");
const User = require("../models/User");

// Middleware bảo vệ route, yêu cầu xác thực
exports.protect = async (req, res, next) => {
  try {
    let token;

    // Kiểm tra token trong header
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    // Kiểm tra nếu không có token
    if (!token) {
      return res.status(401).json({
        message: "Không được phép truy cập, cần đăng nhập trước",
      });
    }

    // Xác thực token
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "ride_sharing_secret_key_2025"
    );

    // Lấy thông tin người dùng từ token
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({ message: "Token không hợp lệ" });
    }

    // Đặt thông tin người dùng vào request
    req.user = user;

    next();
  } catch (error) {
    console.error("Auth middleware error:", error);

    // Provide a more specific error message for token expiration
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        message: "Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại",
        expired: true,
      });
    }

    return res.status(401).json({ message: "Không được phép truy cập" });
  }
};

// Middleware kiểm tra vai trò
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        message: `Vai trò ${req.user.role} không được phép thực hiện hành động này`,
      });
    }
    next();
  };
};
