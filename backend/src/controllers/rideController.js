const db = require("../config/database");
const ABRA = require("../models/ABRA");

exports.shareRide = async (req, res) => {
  try {
    const {
      userId,
      pickupLocation,
      destination,
      pickupPosition,
      destinationPosition,
      departure_time,
      estimatedPrice,
      vehicle_type_preference,
      vehicleInfo,
    } = req.body;

    // Input validation
    if (!userId || !pickupLocation || !destination || !departure_time) {
      return res.status(400).json({
        message: "Thiếu thông tin cần thiết để chia sẻ chuyến đi",
        required: "userId, pickupLocation, destination, departure_time",
      });
    }

    if (!pickupPosition || !pickupPosition.lat || !pickupPosition.lng) {
      return res.status(400).json({
        message:
          "Thiếu thông tin vị trí đón (pickupPosition.lat, pickupPosition.lng)",
      });
    }

    if (
      !destinationPosition ||
      !destinationPosition.lat ||
      !destinationPosition.lng
    ) {
      return res.status(400).json({
        message:
          "Thiếu thông tin vị trí đến (destinationPosition.lat, destinationPosition.lng)",
      });
    }

    if (
      !vehicleInfo ||
      !vehicleInfo.model ||
      !vehicleInfo.licensePlate ||
      !vehicleInfo.color
    ) {
      return res.status(400).json({
        message: "Thiếu thông tin về phương tiện",
        required:
          "vehicleInfo.model, vehicleInfo.licensePlate, vehicleInfo.color",
      });
    } // Bắt đầu transaction để đảm bảo tính nhất quán dữ liệu
    let connection;
    try {
      // Lấy connection từ pool
      connection = await db.pool.getConnection();

      // Bắt đầu transaction
      await connection.beginTransaction();

      // 1. Thêm hoạt động
      const activitySql = `
        INSERT INTO activities (
          user_id, activity_time, start_place, start_lat, start_lon,
          end_place, end_lat, end_lon, type, activity_name,
          duration, role, requires
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const activityValues = [
        userId,
        departure_time,
        pickupLocation,
        pickupPosition.lat,
        pickupPosition.lng,
        destination,
        destinationPosition.lat,
        destinationPosition.lng,
        estimatedPrice,
        vehicle_type_preference,
        null, // duration
        "driver", // role - change to driver since this is shareRide
        "", // requires
      ];

      const [activityResults] = await connection.execute(
        activitySql,
        activityValues
      );
      const activityId = activityResults.insertId;

      // 2. Thêm phương tiện
      const vehicleSql = `
        INSERT INTO vehicles (user_id, vehicle_name, vehicle_number, vehicle_colo)
        VALUES (?, ?, ?, ?)`;

      const vehicleValues = [
        userId, // Changed from activityId to userId
        vehicleInfo.model,
        vehicleInfo.licensePlate,
        vehicleInfo.color,
      ];

      const [vehicleResults] = await connection.execute(
        vehicleSql,
        vehicleValues
      );
      const vehicleId = vehicleResults.insertId;

      // 3. Thêm nhóm
      const groupSql = `
        INSERT INTO groups_ (activity_id, start_timestamp, type, vehicle_id)
        VALUES (?, ?, ?, ?)`;

      const groupValues = [
        activityId,
        departure_time,
        vehicle_type_preference || "car",
        vehicleId,
      ];

      const [groupResults] = await connection.execute(groupSql, groupValues);
      const groupId = groupResults.insertId;

      // 4. Thêm thành viên
      const memberSql = `
        INSERT INTO members (activity_id, uid, group_id, role)
        VALUES (?, ?, ?, ?)`;

      const memberValues = [activityId, userId, groupId, "driver"];
      await connection.execute(memberSql, memberValues);

      // 5. Tìm người phù hợp để ghép chuyến sử dụng phương thức findRide chung
      const matchingParams = {
        pickupPosition,
        destinationPosition,
        departure_time,
        vehicle_type_preference,
        role: "driver", // Vai trò là tài xế, tìm hành khách
        userId,
      };

      const matchingOptions = {
        maxDistance: 5,
        timeFlexibility: 30,
        returnDetails: true,
      };

      const abra = await ABRA.findRide(matchingParams, matchingOptions);

      // 6. Commit transaction
      await connection.commit();

      // Phản hồi thành công
      res.status(201).json({
        message: abra
          ? "Chia sẻ chuyến đi thành công"
          : "Đã đăng ký chia sẻ chuyến đi, đang tìm người đi cùng",
        rideId: activityId,
        groupId: groupId,
        matchedRide: abra || null,
      });
    } catch (error) {
      // Rollback nếu có lỗi
      if (connection) {
        try {
          await connection.rollback();
        } catch (rollbackError) {
          console.error("Rollback error:", rollbackError);
        }
      }
      console.error("Operation error:", error);
      res.status(500).json({
        message: "Lỗi khi chia sẻ chuyến đi",
        error: error.message,
      });
    } finally {
      // Giải phóng connection trong mọi trường hợp
      if (connection) {
        connection.release();
      }
    }
  } catch (error) {
    console.error("Share ride error:", error);
    res.status(500).json({
      message: "Lỗi khi chia sẻ chuyến đi",
      error: error.message,
    });
  }
};

// Đặt chỗ trên chuyến đi
exports.bookRide = async (req, res) => {
  try {
    const {
      userId,
      pickupLocation,
      destination,
      pickupPosition,
      destinationPosition,
      departure_time,
      estimatedPrice,
      vehicle_type_preference,
      seats = 1,
    } = req.body;

    // Input validation
    if (!userId || !pickupLocation || !destination || !departure_time) {
      return res.status(400).json({
        message: "Thiếu thông tin cần thiết để đặt chỗ",
        required: "userId, pickupLocation, destination, departure_time",
      });
    }

    if (!pickupPosition || !pickupPosition.lat || !pickupPosition.lng) {
      return res.status(400).json({
        message:
          "Thiếu thông tin vị trí đón (pickupPosition.lat, pickupPosition.lng)",
      });
    }

    if (
      !destinationPosition ||
      !destinationPosition.lat ||
      !destinationPosition.lng
    ) {
      return res.status(400).json({
        message:
          "Thiếu thông tin vị trí đến (destinationPosition.lat, destinationPosition.lng)",
      });
    }

    // Bắt đầu transaction để đảm bảo tính nhất quán dữ liệu
    let connection;
    try {
      // Lấy connection từ pool
      connection = await db.pool.getConnection();

      // Bắt đầu transaction
      await connection.beginTransaction();

      // 1. Thêm hoạt động
      const activitySql = `
        INSERT INTO activities (
          user_id, activity_time, start_place, start_lat, start_lon,
          end_place, end_lat, end_lon, type, activity_name,
          duration, role, requires
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      const activityValues = [
        userId,
        departure_time,
        pickupLocation,
        pickupPosition.lat,
        pickupPosition.lng,
        destination,
        destinationPosition.lat,
        destinationPosition.lng,
        estimatedPrice,
        vehicle_type_preference,
        null, // duration
        "passenger", // role
        "", // requires
      ];

      const [activityResults] = await connection.execute(
        activitySql,
        activityValues
      );
      const activityId = activityResults.insertId;

      // 2. Thêm thành viên
      const memberSql = `
        INSERT INTO members (activity_id, uid, role)
        VALUES (?, ?, ?)`;

      const memberValues = [activityId, userId, "passenger"];
      await connection.execute(memberSql, memberValues);

      // 3. Tìm chuyến đi phù hợp để kết nối sử dụng findRide
      const matchingParams = {
        pickupPosition,
        destinationPosition,
        departure_time,
        vehicle_type_preference,
        role: "passenger", // Vai trò là hành khách, tìm tài xế
        userId,
      };

      const matchingOptions = {
        maxDistance: 5,
        timeFlexibility: 30,
        returnDetails: true,
      };

      const abra = await ABRA.findRide(matchingParams, matchingOptions);
      console.log("Matched ride:", abra);

      // 4. Nếu tìm thấy chuyến đi phù hợp, cập nhật group_id cho thành viên
      if (abra && abra.groupId) {
        const updateMemberSql = `
          UPDATE members 
          SET group_id = ? 
          WHERE activity_id = ?`;

        await connection.execute(updateMemberSql, [abra.groupId, activityId]);
      }

      // 5. Commit transaction
      await connection.commit();

      // Phản hồi thành công
      res.status(201).json({
        message: abra ? "Đặt chỗ thành công" : "Đang chờ tài xế xác nhận",
        bookingId: activityId,
        matchedRide: abra
          ? {
              driver: abra.match,
              vehicleInfo: abra.vehicleInfo,
              distance: {
                pickup: abra.pickupDistance,
                destination: abra.destinationDistance,
              },
              compatibility: abra.compatibilityScore,
              groupId: abra.groupId,
            }
          : null,
      });
    } catch (error) {
      // Rollback nếu có lỗi
      if (connection) {
        try {
          await connection.rollback();
        } catch (rollbackError) {
          console.error("Rollback error:", rollbackError);
        }
      }
      console.error("Operation error:", error);
      res.status(500).json({
        message: "Lỗi khi đặt chỗ",
        error: error.message,
      });
    } finally {
      // Giải phóng connection trong mọi trường hợp
      if (connection) {
        connection.release();
      }
    }
  } catch (error) {
    console.error("Book ride error:", error);
    res.status(500).json({
      message: "Lỗi khi đặt chỗ trên chuyến đi",
      error: error.message,
    });
  }
};
