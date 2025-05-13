import jwt from "jsonwebtoken";

// Middleware xử lý lỗi
export const errorHandler = (err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Server error" });
};

// Middleware xác thực token
export const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;

  // 1. Kiểm tra có token không
  if (!authHeader) {
    return res.status(401).json({ message: "Thiếu token" });
  }

  // 2. Tách token từ chuỗi "Bearer <token>"
  const token = authHeader.split(" ")[1];

  try {
    // 3. Giải mã token bằng secret key
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // 4. Gắn thông tin người dùng vào request để route sau dùng
    req.user = decoded;

    // 5. Cho phép đi tiếp
    next();
  } catch (err) {
    return res.status(403).json({ message: "Token không hợp lệ" });
  }
};
