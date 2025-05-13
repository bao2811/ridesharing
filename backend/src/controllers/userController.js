const User = require("../models/User");
const jwt = require("jsonwebtoken");

// Tạo token cho người dùng
const generateToken = (userId) => {
  return jwt.sign(
    { id: userId },
    process.env.JWT_SECRET || "ride_sharing_secret_key_2025",
    {
      expiresIn: "7d", // Increased from 1h to 7 days
    }
  );
};

// Đăng ký người dùng mới
exports.register = async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;

    // Kiểm tra xem email đã tồn tại chưa
    const existingUser = await User.findOne({ email });
    console.log("Existing user:", existingUser);
    if (existingUser) {
      return res.status(400).json({ message: "Email đã được sử dụng" });
    }

    // Tạo user mới
    const user = await User.create({
      name,
      email,
      password,
      phone,
    });

    console.log("User created:", user);

    // Trả về thông tin user (không tạo token, người dùng cần đăng nhập)
    res.status(201).json({
      id: user.id,
      name: user.name,
      email: user.email,
      phoneNumber: user.phoneNumber,
      message: "Đăng ký thành công, vui lòng đăng nhập",
    });
  } catch (error) {
    console.error("Registration error:", error);
    res
      .status(500)
      .json({ message: "Lỗi đăng ký người dùng", error: error.message });
  }
};

// Đăng nhập
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Tìm user theo email
    const user = await User.findOne({ email });

    if (!user) {
      return res
        .status(401)
        .json({ message: "Email hoặc mật khẩu không đúng" });
    }

    // So sánh mật khẩu
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res
        .status(401)
        .json({ message: "Email hoặc mật khẩu không đúng" });
    }

    // Tạo token và trả về thông tin user
    const token = generateToken(user.id);

    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      phoneNumber: user.phoneNumber,
      token,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Lỗi đăng nhập", error: error.message });
  }
};

// Lấy thông tin người dùng
exports.getProfile = async (req, res) => {
  try {
    // req.user đã được đặt trong middleware protect
    res.json(req.user);
  } catch (error) {
    console.error("Get profile error:", error);
    res
      .status(500)
      .json({ message: "Lỗi lấy thông tin người dùng", error: error.message });
  }
};

// Cập nhật thông tin người dùng
exports.updateProfile = async (req, res) => {
  try {
    const updates = req.body;

    // Không cho phép cập nhật password từ API này
    if (updates.password) {
      delete updates.password;
    }

    // Cập nhật thông tin người dùng
    const updatedUser = await User.update(req.user.id, updates);

    res.json(updatedUser);
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({
      message: "Lỗi cập nhật thông tin người dùng",
      error: error.message,
    });
  }
};

// Đổi mật khẩu
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    // So sánh mật khẩu hiện tại
    const isMatch = await req.user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ message: "Mật khẩu hiện tại không đúng" });
    }

    // Cập nhật mật khẩu mới
    await User.updatePassword(req.user.id, newPassword);

    res.json({ message: "Đổi mật khẩu thành công" });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({ message: "Lỗi đổi mật khẩu", error: error.message });
  }
};

// Đăng ký làm tài xế
exports.registerAsDriver = async (req, res) => {
  try {
    const {
      licenseNumber,
      vehicleType,
      vehicleModel,
      vehiclePlate,
      vehicleCapacity,
    } = req.body;

    // Cập nhật thông tin tài xế
    const user = await User.update(req.user.id, {
      licenseNumber,
      vehicleType,
      vehicleModel,
      vehiclePlate,
      vehicleCapacity: vehicleCapacity || 4,
      isDriverActive: false, // Cần admin xác thực trước khi kích hoạt
    });

    res.json({
      message: "Đăng ký làm tài xế thành công, đợi admin xác thực",
      user,
    });
  } catch (error) {
    console.error("Register as driver error:", error);
    res
      .status(500)
      .json({ message: "Lỗi đăng ký làm tài xế", error: error.message });
  }
};

// Cập nhật hoạt động thường xuyên (activity pattern)
exports.updateActivityPattern = async (req, res) => {
  try {
    const { startLocation, endLocation, departureTime, routineType, days } =
      req.body;
    const patternId = req.params.patternId;

    // Nếu có patternId, thì cập nhật pattern đó
    if (patternId) {
      const updatedPattern = await User.updateActivityPattern(
        req.user.id,
        patternId,
        {
          startLocation,
          endLocation,
          departureTime,
          routineType,
          days,
        }
      );

      return res.json({
        message: "Cập nhật hoạt động thường xuyên thành công",
        pattern: updatedPattern,
      });
    }

    // Nếu không có patternId, thêm pattern mới
    const newPattern = await User.addActivityPattern(req.user.id, {
      startLocation,
      endLocation,
      departureTime,
      routineType,
      days,
    });

    res.status(201).json({
      message: "Thêm hoạt động thường xuyên thành công",
      pattern: newPattern,
    });
  } catch (error) {
    console.error("Update activity pattern error:", error);
    res.status(500).json({
      message: "Lỗi cập nhật hoạt động thường xuyên",
      error: error.message,
    });
  }
};

// Xóa hoạt động thường xuyên
exports.deleteActivityPattern = async (req, res) => {
  try {
    const { patternId } = req.params;

    await User.deleteActivityPattern(req.user.id, patternId);

    res.json({
      message: "Xóa hoạt động thường xuyên thành công",
    });
  } catch (error) {
    console.error("Delete activity pattern error:", error);
    res.status(500).json({
      message: "Lỗi xóa hoạt động thường xuyên",
      error: error.message,
    });
  }
};

// Tìm người dùng có thể đi chung theo mẫu hoạt động
exports.findPotentialRideSharingPartners = async (req, res) => {
  try {
    const partners = await User.findPotentialPartners(req.user.id);

    res.json({
      message: "Tìm thấy người dùng có thể đi chung",
      partners,
    });
  } catch (error) {
    console.error("Find potential partners error:", error);
    res.status(500).json({
      message: "Lỗi tìm người có thể đi chung",
      error: error.message,
    });
  }
};
