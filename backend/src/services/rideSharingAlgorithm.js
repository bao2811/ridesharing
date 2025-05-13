/**
 * Activity-based Ridesharing Algorithm Service
 *
 * Thuật toán dựa trên hoạt động (Activity-based) tìm kiếm tài xế phù hợp dựa trên:
 * 1. Mẫu hoạt động lặp lại của người dùng (thời gian và địa điểm)
 * 2. Sự trùng khớp về thời gian và địa điểm
 * 3. Tối ưu hóa lộ trình đi chung
 */

const User = require("../models/User");
const Ride = require("../models/Ride");
const Booking = require("../models/Booking");

/**
 * Tính khoảng cách giữa hai điểm địa lý theo công thức Haversine
 * @param {Array} point1 - Tọa độ điểm 1 [longitude, latitude]
 * @param {Array} point2 - Tọa độ điểm 2 [longitude, latitude]
 * @returns {Number} - Khoảng cách tính bằng km
 */
const calculateDistance = (point1, point2) => {
  const [lon1, lat1] = point1;
  const [lon2, lat2] = point2;

  const R = 6371; // Bán kính Trái đất tính bằng km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return distance;
};

/**
 * Tính thời gian dự kiến di chuyển giữa hai điểm
 * @param {Array} point1 - Tọa độ điểm 1 [longitude, latitude]
 * @param {Array} point2 - Tọa độ điểm 2 [longitude, latitude]
 * @param {Number} avgSpeed - Vận tốc trung bình (km/h)
 * @returns {Number} - Thời gian di chuyển (phút)
 */
const calculateTravelTime = (point1, point2, avgSpeed = 40) => {
  const distance = calculateDistance(point1, point2);
  const timeHours = distance / avgSpeed;
  return Math.round(timeHours * 60); // Chuyển sang phút
};

/**
 * Kiểm tra xem điểm đón có nằm trên đường đi không (với sai số cho phép)
 * @param {Array} pickupPoint - Điểm đón [longitude, latitude]
 * @param {Array} startPoint - Điểm bắt đầu [longitude, latitude]
 * @param {Array} endPoint - Điểm kết thúc [longitude, latitude]
 * @param {Number} maxDetour - Sai số tối đa cho phép (km)
 * @returns {Boolean} - true nếu điểm đón nằm trên đường đi
 */
const isPickupOnRoute = (pickupPoint, startPoint, endPoint, maxDetour = 2) => {
  const directDistance = calculateDistance(startPoint, endPoint);
  const distanceViaPickup =
    calculateDistance(startPoint, pickupPoint) +
    calculateDistance(pickupPoint, endPoint);

  // Nếu đi qua điểm đón không làm tăng quãng đường quá nhiều
  return distanceViaPickup - directDistance <= maxDetour;
};

/**
 * Tìm kiếm chuyến đi phù hợp dựa trên hoạt động người dùng
 * @param {Object} rideRequest - Yêu cầu chuyến đi từ người dùng
 * @returns {Array} - Danh sách chuyến đi phù hợp
 */
const findMatchingRides = async (rideRequest) => {
  try {
    const {
      startLocation,
      endLocation,
      departureTime,
      flexibilityMinutes = 30,
      passengers = 1,
    } = rideRequest;

    // Tính toán thời gian linh hoạt
    const startTime = new Date(departureTime);
    startTime.setMinutes(startTime.getMinutes() - flexibilityMinutes);

    const endTime = new Date(departureTime);
    endTime.setMinutes(endTime.getMinutes() + flexibilityMinutes);

    // Tìm các chuyến đi phù hợp về thời gian và còn chỗ trống
    const availableRides = await Ride.find({
      departureTime: { $gte: startTime, $lte: endTime },
      availableSeats: { $gte: passengers },
      status: "scheduled",
    }).populate("driver", "name rating phoneNumber profilePicture driverInfo");

    // Lọc các chuyến đi phù hợp dựa trên khoảng cách
    const MAX_PICKUP_DISTANCE = 3; // km
    const MAX_DROPOFF_DISTANCE = 3; // km

    const matchingRides = availableRides.filter((ride) => {
      // Tính khoảng cách từ điểm bắt đầu của người dùng đến điểm bắt đầu của chuyến đi
      const pickupDistance = calculateDistance(
        startLocation.coordinates,
        ride.startLocation.coordinates
      );

      // Tính khoảng cách từ điểm kết thúc của người dùng đến điểm kết thúc của chuyến đi
      const dropoffDistance = calculateDistance(
        endLocation.coordinates,
        ride.endLocation.coordinates
      );

      // Kiểm tra xem điểm đón có nằm trên đường đi không
      const isOnRoute = isPickupOnRoute(
        startLocation.coordinates,
        ride.startLocation.coordinates,
        ride.endLocation.coordinates
      );

      return (
        (pickupDistance <= MAX_PICKUP_DISTANCE || isOnRoute) &&
        dropoffDistance <= MAX_DROPOFF_DISTANCE
      );
    });

    // Tính điểm phù hợp cho từng chuyến đi
    const scoredRides = matchingRides.map((ride) => {
      const pickupDistance = calculateDistance(
        startLocation.coordinates,
        ride.startLocation.coordinates
      );

      const dropoffDistance = calculateDistance(
        endLocation.coordinates,
        ride.endLocation.coordinates
      );

      // Điểm dựa trên khoảng cách (càng gần càng tốt)
      const distanceScore = 10 - (pickupDistance + dropoffDistance) / 2;

      // Điểm dựa trên thời gian (càng gần càng tốt)
      const timeDiffMinutes =
        Math.abs(new Date(ride.departureTime) - new Date(departureTime)) /
        60000;
      const timeScore = 10 - (timeDiffMinutes / flexibilityMinutes) * 10;

      // Điểm dựa trên đánh giá của tài xế
      const ratingScore = ride.driver.rating * 2; // 0-10

      // Tính tổng điểm
      const totalScore =
        distanceScore * 0.4 + timeScore * 0.4 + ratingScore * 0.2;

      return {
        ...ride.toObject(),
        matchScore: parseFloat(totalScore.toFixed(1)),
        pickupDistance: parseFloat(pickupDistance.toFixed(1)),
        dropoffDistance: parseFloat(dropoffDistance.toFixed(1)),
        estimatedPickupTime: calculateTravelTime(
          ride.startLocation.coordinates,
          startLocation.coordinates
        ),
      };
    });

    // Sắp xếp theo điểm phù hợp giảm dần
    return scoredRides.sort((a, b) => b.matchScore - a.matchScore);
  } catch (error) {
    console.error("Error in findMatchingRides:", error);
    throw error;
  }
};

/**
 * Tìm kiếm người dùng có mẫu hoạt động tương tự để gợi ý đi chung xe
 * @param {String} userId - ID người dùng muốn tìm gợi ý
 * @returns {Array} - Danh sách người dùng tiềm năng cho đi chung xe
 */
const recommendRideSharingPartners = async (userId) => {
  try {
    // Lấy thông tin người dùng và mẫu hoạt động của họ
    const user = await User.findById(userId);
    if (!user || !user.activityPatterns || user.activityPatterns.length === 0) {
      return [];
    }

    const potentialMatches = [];

    // Duyệt qua từng mẫu hoạt động của người dùng
    for (const activity of user.activityPatterns) {
      // Tìm người dùng khác có hoạt động tương tự
      const matchingUsers = await User.find({
        _id: { $ne: userId }, // Không bao gồm người dùng hiện tại
        "activityPatterns.type": activity.type,
        "activityPatterns.daysOfWeek": { $in: activity.daysOfWeek },
        // Tìm người dùng có điểm đến gần với điểm đến của người dùng hiện tại
        "activityPatterns.location": {
          $near: {
            $geometry: {
              type: "Point",
              coordinates: activity.location.coordinates,
            },
            $maxDistance: 2000, // Tìm trong bán kính 2km
          },
        },
      }).select("name email phoneNumber activityPatterns");

      // Phân tích và tính điểm phù hợp cho từng người dùng
      for (const match of matchingUsers) {
        const matchingActivity = match.activityPatterns.find(
          (pattern) =>
            pattern.type === activity.type &&
            pattern.daysOfWeek.some((day) => activity.daysOfWeek.includes(day))
        );

        if (matchingActivity) {
          // Tính độ tương đồng về thời gian
          const userArrivalTime = activity.arrivalTime
            ? parseInt(activity.arrivalTime.split(":")[0]) * 60 +
              parseInt(activity.arrivalTime.split(":")[1])
            : 0;

          const matchArrivalTime = matchingActivity.arrivalTime
            ? parseInt(matchingActivity.arrivalTime.split(":")[0]) * 60 +
              parseInt(matchingActivity.arrivalTime.split(":")[1])
            : 0;

          const timeDifference = Math.abs(userArrivalTime - matchArrivalTime);
          const timeScore =
            timeDifference <= 30 ? ((30 - timeDifference) / 30) * 10 : 0;

          // Tính khoảng cách giữa hai địa điểm
          const locationDistance = calculateDistance(
            activity.location.coordinates,
            matchingActivity.location.coordinates
          );

          // Tính điểm dựa trên khoảng cách
          const distanceScore =
            locationDistance <= 2 ? ((2 - locationDistance) / 2) * 10 : 0;

          // Tính tổng điểm
          const totalScore = timeScore * 0.6 + distanceScore * 0.4;

          // Thêm vào danh sách nếu điểm đủ cao
          if (totalScore > 5) {
            potentialMatches.push({
              user: {
                id: match._id,
                name: match.name,
                email: match.email,
                phoneNumber: match.phoneNumber,
              },
              activityType: activity.type,
              activityDays: matchingActivity.daysOfWeek.map((day) => {
                const days = [
                  "Chủ nhật",
                  "Thứ 2",
                  "Thứ 3",
                  "Thứ 4",
                  "Thứ 5",
                  "Thứ 6",
                  "Thứ 7",
                ];
                return days[day];
              }),
              arrivalTime: matchingActivity.arrivalTime,
              departureTime: matchingActivity.departureTime,
              locationDistance: parseFloat(locationDistance.toFixed(2)),
              matchScore: parseFloat(totalScore.toFixed(1)),
            });
          }
        }
      }
    }

    // Sắp xếp theo điểm phù hợp giảm dần
    return potentialMatches.sort((a, b) => b.matchScore - a.matchScore);
  } catch (error) {
    console.error("Error in recommendRideSharingPartners:", error);
    throw error;
  }
};

/**
 * Tự động tạo chuyến đi định kỳ dựa trên mẫu hoạt động
 * @param {String} userId - ID người dùng (tài xế)
 * @returns {Object} - Kết quả tạo chuyến đi
 */
const generateRecurringRides = async (userId) => {
  try {
    // Lấy thông tin người dùng tài xế
    const driver = await User.findById(userId);
    if (!driver || driver.role !== "driver" || !driver.driverInfo.isActive) {
      throw new Error("User is not an active driver");
    }

    // Kiểm tra xem người dùng có mẫu hoạt động không
    if (!driver.activityPatterns || driver.activityPatterns.length === 0) {
      return { success: false, message: "No activity patterns found" };
    }

    const createdRides = [];
    const today = new Date();

    // Duyệt qua từng mẫu hoạt động
    for (const activity of driver.activityPatterns) {
      // Chỉ tạo chuyến đi cho hoạt động có thời gian đi và đến
      if (!activity.arrivalTime || !activity.departureTime) continue;

      // Xác định ngày trong tuần và thời gian
      for (const dayOfWeek of activity.daysOfWeek) {
        // Tính ngày tiếp theo có cùng thứ trong tuần
        const nextDate = new Date(today);
        const daysToAdd = (7 + dayOfWeek - today.getDay()) % 7;
        nextDate.setDate(today.getDate() + (daysToAdd === 0 ? 7 : daysToAdd));

        // Thiết lập thời gian cho ngày đó
        const departureHour = parseInt(activity.departureTime.split(":")[0]);
        const departureMinute = parseInt(activity.departureTime.split(":")[1]);
        const departureDateTime = new Date(nextDate);
        departureDateTime.setHours(departureHour, departureMinute, 0);

        const arrivalHour = parseInt(activity.arrivalTime.split(":")[0]);
        const arrivalMinute = parseInt(activity.arrivalTime.split(":")[1]);
        const arrivalDateTime = new Date(nextDate);
        arrivalDateTime.setHours(arrivalHour, arrivalMinute, 0);

        // Tính toán các thông tin khác
        const distance =
          activity.type === "work"
            ? calculateDistance(
                activity.location.coordinates,
                driver.homeAddress
                  ? JSON.parse(driver.homeAddress).coordinates
                  : [0, 0]
              )
            : 5; // Giả định 5km nếu không có địa chỉ nhà

        // Tạo chuyến đi mới
        const newRide = new Ride({
          driver: userId,
          startLocation:
            activity.type === "home"
              ? {
                  type: "Point",
                  coordinates: activity.location.coordinates,
                  address: activity.address,
                }
              : {
                  type: "Point",
                  coordinates: driver.homeAddress
                    ? JSON.parse(driver.homeAddress).coordinates
                    : [0, 0],
                  address: driver.homeAddress
                    ? JSON.parse(driver.homeAddress).address
                    : "Home",
                },
          endLocation:
            activity.type === "work"
              ? {
                  type: "Point",
                  coordinates: activity.location.coordinates,
                  address: activity.address,
                }
              : {
                  type: "Point",
                  coordinates: driver.workAddress
                    ? JSON.parse(driver.workAddress).coordinates
                    : [0, 0],
                  address: driver.workAddress
                    ? JSON.parse(driver.workAddress).address
                    : "Work",
                },
          departureTime: departureDateTime,
          expectedArrivalTime: arrivalDateTime,
          availableSeats: driver.driverInfo.vehicleCapacity || 4,
          totalSeats: driver.driverInfo.vehicleCapacity || 4,
          distance: distance,
          price: Math.round(distance * 5000), // 5000 VND per km
          status: "scheduled",
          isRecurring: true,
          recurringPattern: {
            daysOfWeek: [dayOfWeek],
            frequency: "weekly",
          },
          carDetails: {
            model: driver.driverInfo.vehicleModel,
            color: "Unknown",
            plateNumber: driver.driverInfo.vehiclePlate,
          },
        });

        const savedRide = await newRide.save();
        createdRides.push(savedRide);
      }
    }

    return {
      success: true,
      message: `Created ${createdRides.length} recurring rides`,
      rides: createdRides,
    };
  } catch (error) {
    console.error("Error in generateRecurringRides:", error);
    throw error;
  }
};

module.exports = {
  findMatchingRides,
  recommendRideSharingPartners,
  generateRecurringRides,
  calculateDistance,
  calculateTravelTime,
  isPickupOnRoute,
};
