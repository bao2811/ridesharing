/**
 * ABRA (Activity-Based Ride Assignment) Model
 * Thuật toán tìm kiếm và ghép cặp chuyến đi dựa trên hoạt động
 */

const db = require("../config/database");

class ABRA {
  /**
   * Tìm kiếm chuyến đi phù hợp dựa trên vị trí, thời gian và loại nhu cầu
   * @param {Object} req - Yêu cầu từ người dùng
   * @param {Object} options - Các tùy chọn bổ sung
   * @returns {Promise<Object|null>} Kết quả tìm kiếm hoặc null nếu không tìm thấy
   */
  static async search(req, options = {}) {
    try {
      const result = await this.findRide(req.body, options);
      return result;
    } catch (error) {
      console.error("ABRA search error:", error);
      return null;
    }
  }

  /**
   * Tìm kiếm và ghép cặp chuyến đi dựa trên các thông số đầu vào
   * Phương thức này được sử dụng chung cho cả bookRide và shareRide
   *
   * @param {Object} params - Thông số tìm kiếm
   * @param {Object} params.pickupPosition - Vị trí đón (lat, lng)
   * @param {Object} params.destinationPosition - Vị trí đến (lat, lng)
   * @param {String} params.departure_time - Thời gian khởi hành
   * @param {Number} params.seats - Số ghế yêu cầu (mặc định: 1)
   * @param {String} params.vehicle_type_preference - Loại phương tiện ưu tiên
   * @param {String} params.role - Vai trò ('driver' hoặc 'passenger')
   * @param {Object} options - Các tùy chọn bổ sung
   * @param {Number} options.maxDistance - Khoảng cách tối đa (km) để ghép đôi (mặc định: 5)
   * @param {Number} options.timeFlexibility - Độ linh hoạt thời gian (phút) (mặc định: 30)
   * @param {Boolean} options.returnDetails - Có trả về thông tin chi tiết hay không (mặc định: true)
   * @returns {Promise<Object|null>} Kết quả tìm kiếm hoặc null nếu không tìm thấy
   */
  static async findRide(params, options = {}) {
    const {
      pickupPosition,
      destinationPosition,
      departure_time,
      seats = 1,
      vehicle_type_preference,
      role = "passenger", // Mặc định là hành khách
      userId,
    } = params;

    const {
      maxDistance = 5, // Khoảng cách tối đa (km)
      timeFlexibility = 30, // Độ linh hoạt thời gian (phút)
      returnDetails = true, // Trả về chi tiết hay không
    } = options;

    if (!pickupPosition || !destinationPosition || !departure_time) {
      console.warn("ABRA findRide: Missing required parameters");
      return null;
    }

    try {
      // Chuyển đổi thời gian sang đối tượng Date
      const departureTime = new Date(departure_time);

      // Tính toán khoảng thời gian chấp nhận được
      const earliestTime = new Date(departureTime);
      earliestTime.setMinutes(earliestTime.getMinutes() - timeFlexibility);

      const latestTime = new Date(departureTime);
      latestTime.setMinutes(latestTime.getMinutes() + timeFlexibility); // Tìm kiếm ngược với vai trò hiện tại (nếu là hành khách thì tìm tài xế và ngược lại)
      const oppositeRole = role === "driver" ? "passenger" : "driver";

      // Thiết lập bán kính tìm kiếm (km)
      const pickupRadius = maxDistance;
      const destRadius = maxDistance;

      // Tính toán biên độ tọa độ (độ) để tìm kiếm hiệu quả hơn trước khi dùng công thức Haversine
      // 1 độ latitude ~ 111 km
      // 1 độ longitude ~ 111 * cos(latitude) km
      const latDelta = pickupRadius / 111;
      // Tính xấp xỉ để giới hạn phạm vi tìm kiếm ban đầu
      const lngDelta =
        pickupRadius / (111 * Math.cos(pickupPosition.lat * (Math.PI / 180)));

      // SQL query đơn giản hơn để lọc sơ bộ
      const sql = `
        SELECT a.*, g.id as group_id, g.vehicle_id, g.type, 
               v.vehicle_name, v.vehicle_number, v.vehicle_color,
               m.id as member_id
        FROM activities a
        LEFT JOIN members m ON a.id = m.activity_id
        LEFT JOIN groups_ g ON m.group_id = g.id
        LEFT JOIN vehicles v ON g.vehicle_id = v.id
        WHERE a.role = ?
          AND a.activity_time BETWEEN ? AND ?
          AND a.user_id != ?
          AND a.start_lat BETWEEN ? AND ?
          AND a.start_lon BETWEEN ? AND ?
          AND a.end_lat BETWEEN ? AND ?
          AND a.end_lon BETWEEN ? AND ?
      `;

      // Tham số cho truy vấn SQL
      const params2 = [
        oppositeRole,
        earliestTime,
        latestTime,
        userId || 0,
        pickupPosition.lat - latDelta,
        pickupPosition.lat + latDelta,
        pickupPosition.lng - lngDelta,
        pickupPosition.lng + lngDelta,
        destinationPosition.lat - latDelta,
        destinationPosition.lat + latDelta,
        destinationPosition.lng - lngDelta,
        destinationPosition.lng + lngDelta,
      ];

      // Thêm điều kiện loại phương tiện nếu có
      let finalSql = sql;
      if (vehicle_type_preference) {
        finalSql += " AND (g.type IS NULL OR g.type = ?)";
        params2.push(vehicle_type_preference);
      }

      // Thêm điều kiện số ghế nếu vai trò là hành khách và số ghế > 1
      if (role === "passenger" && seats > 1) {
        finalSql +=
          " AND (a.available_seats >= ? OR a.available_seats IS NULL)";
        params2.push(seats);
      }

      // Giới hạn kết quả trả về để xử lý tiếp trong JavaScript
      finalSql += " LIMIT 50";

      console.log("ABRA findRide SQL:", finalSql);

      // Thực hiện truy vấn
      const results = await db.executeQuery(finalSql, params2);
      console.log("ABRA findRide results count:", results ? results.length : 0);

      // Nếu không tìm thấy kết quả
      if (!results || results.length === 0) {
        return null;
      }

      // Tính toán khoảng cách thực tế cho tất cả các kết quả và xếp hạng lại
      const calculatedResults = results.map((activity) => {
        // Tính khoảng cách theo công thức Haversine
        const pickupDistance = this.haversineDistance(
          pickupPosition.lat,
          pickupPosition.lng,
          activity.start_lat,
          activity.start_lon
        );

        const destinationDistance = this.haversineDistance(
          destinationPosition.lat,
          destinationPosition.lng,
          activity.end_lat,
          activity.end_lon
        );

        // Tính độ chênh lệch thời gian
        const timeDiff =
          Math.abs(departureTime - new Date(activity.activity_time)) /
          (1000 * 60); // phút

        // Tính điểm tương thích (0-100)
        const compatibilityScore = Math.max(
          0,
          100 -
            (pickupDistance / maxDistance) * 25 -
            (destinationDistance / maxDistance) * 25 -
            (timeDiff / timeFlexibility) * 50
        );

        return {
          activity,
          pickupDistance,
          destinationDistance,
          timeDiff,
          compatibilityScore,
        };
      });

      // Lọc kết quả theo khoảng cách thực tế
      const filteredResults = calculatedResults.filter(
        (item) =>
          item.pickupDistance <= maxDistance &&
          item.destinationDistance <= maxDistance
      );

      // Sắp xếp theo điểm tương thích cao nhất
      filteredResults.sort(
        (a, b) => b.compatibilityScore - a.compatibilityScore
      );

      console.log("ABRA filtered results count:", filteredResults.length);

      // Nếu không còn kết quả sau khi lọc
      if (filteredResults.length === 0) {
        return null;
      }

      // Lấy kết quả đầu tiên (tốt nhất)
      const bestMatch = filteredResults[0];
      const match = bestMatch.activity;
      const pickupDistance = bestMatch.pickupDistance;
      const destinationDistance = bestMatch.destinationDistance;
      const timeDiff = bestMatch.timeDiff;
      const compatibilityScore = bestMatch.compatibilityScore;

      // Trả về thông tin chi tiết nếu yêu cầu
      if (returnDetails) {
        return {
          match: {
            activityId: match.id,
            userId: match.user_id,
            role: match.role,
            pickupLocation: {
              address: match.start_plac,
              lat: match.start_lat,
              lng: match.start_lon,
            },
            destinationLocation: {
              address: match.end_place,
              lat: match.end_lat,
              lng: match.end_lon,
            },
            departureTime: match.activity_time,
            price: match.type,
            vehicleType: match.activity_nam || vehicle_type_preference,
          },
          pickupDistance: Math.round(pickupDistance * 10) / 10,
          destinationDistance: Math.round(destinationDistance * 10) / 10,
          timeDifference: Math.round(timeDiff),
          compatibilityScore: Math.round(compatibilityScore),
          groupId: match.group_id,
          vehicleInfo: match.vehicle_id
            ? {
                id: match.vehicle_id,
                model: match.vehicle_name,
                licensePlate: match.vehicle_number,
                color: match.vehicle_color,
              }
            : null,
        };
      }

      // Trả về kết quả tối thiểu
      return {
        activityId: match.id,
        groupId: match.group_id,
        compatibilityScore: Math.round(compatibilityScore),
      };
    } catch (error) {
      console.error("ABRA findRide error:", error);
      return null;
    }
  }

  /**
   * Tính khoảng cách giữa hai điểm theo công thức Haversine
   * @param {Number} lat1 - Vĩ độ điểm 1
   * @param {Number} lon1 - Kinh độ điểm 1
   * @param {Number} lat2 - Vĩ độ điểm 2
   * @param {Number} lon2 - Kinh độ điểm 2
   * @returns {Number} Khoảng cách (km)
   */
  static haversineDistance(lat1, lon1, lat2, lon2) {
    // Chuyển đổi độ sang radian
    const toRad = (value) => {
      return (value * Math.PI) / 180;
    };

    const R = 6371; // Bán kính trái đất (km)
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    return distance;
  }
}

module.exports = ABRA;
