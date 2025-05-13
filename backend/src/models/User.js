const bcrypt = require("bcrypt");
const { executeQuery } = require("../config/database");

class User {
  static async create({ name, email, password, phone }) {
    // Hash mật khẩu
    const hashedPassword = await bcrypt.hash(password, 10);

    const query = `
      INSERT INTO users
      (name, email, password, phone, timestamp)
      VALUES (?, ?, ?, ?, NOW())
    `;

    const result = await executeQuery(query, [
      name,
      email,
      hashedPassword,
      phone,
    ]);

    // Lấy user vừa tạo
    return this.findById(result.insertId);
  }

  static async findById(id) {
    const query = `
      SELECT * FROM users WHERE id = ?
    `;

    const users = await executeQuery(query, [id]);

    if (users.length === 0) {
      return null;
    }

    const user = users[0];
    return new UserEntity(user);
  }

  static async findOne({ email }) {
    const query = `
      SELECT * FROM users WHERE email = ?
    `;

    const users = await executeQuery(query, [email]);

    if (users.length === 0) {
      return null;
    }

    const user = users[0];
    return new UserEntity(user);
  }

  static async findAll() {
    const query = `
      SELECT * FROM users
    `;

    const users = await executeQuery(query);
    return users.map((user) => new UserEntity(user));
  }

  static async update(id, updates) {
    const allowedFields = ["name", "email", "phone"];

    // Lọc các trường được phép cập nhật
    const validUpdates = {};
    Object.keys(updates).forEach((key) => {
      const snakeKey = key.replace(
        /[A-Z]/g,
        (letter) => `_${letter.toLowerCase()}`
      );
      if (allowedFields.includes(snakeKey)) {
        validUpdates[snakeKey] = updates[key];
      }
    });

    // Nếu không có gì để cập nhật
    if (Object.keys(validUpdates).length === 0) {
      return this.findById(id);
    }

    // Tạo chuỗi SET cho SQL query
    const setClauses = Object.keys(validUpdates)
      .map((key) => `${key} = ?`)
      .join(", ");
    const values = Object.values(validUpdates);

    const query = `
      UPDATE users
      SET ${setClauses}, updated_at = NOW()
      WHERE id = ?
    `;

    await executeQuery(query, [...values, id]);
    return this.findById(id);
  }

  static async updatePassword(id, newPassword) {
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const query = `
      UPDATE users
      SET password = ?, updated_at = NOW()
      WHERE id = ?
    `;

    await executeQuery(query, [hashedPassword, id]);
    return true;
  }

  // Activity Pattern related methods

  static async addActivityPattern(userId, patternData) {
    const { startLocation, endLocation, departureTime, routineType, days } =
      patternData;

    const query = `
      INSERT INTO activity_patterns
      (user_id, start_location, end_location, departure_time, routine_type, days, created_at)
      VALUES (?, ?, ?, ?, ?, ?, NOW())
    `;

    const result = await executeQuery(query, [
      userId,
      JSON.stringify(startLocation),
      JSON.stringify(endLocation),
      departureTime,
      routineType,
      JSON.stringify(days),
    ]);

    return this.findActivityPatternById(result.insertId);
  }

  static async updateActivityPattern(userId, patternId, patternData) {
    const { startLocation, endLocation, departureTime, routineType, days } =
      patternData;

    // Make sure the pattern belongs to the user
    const pattern = await this.findActivityPatternById(patternId);
    if (!pattern || pattern.userId !== userId) {
      throw new Error("Activity pattern not found or does not belong to user");
    }

    const query = `
      UPDATE activity_patterns
      SET start_location = ?,
          end_location = ?,
          departure_time = ?,
          routine_type = ?,
          days = ?,
          updated_at = NOW()
      WHERE id = ? AND user_id = ?
    `;

    await executeQuery(query, [
      JSON.stringify(startLocation),
      JSON.stringify(endLocation),
      departureTime,
      routineType,
      JSON.stringify(days),
      patternId,
      userId,
    ]);

    return this.findActivityPatternById(patternId);
  }

  static async deleteActivityPattern(userId, patternId) {
    // Make sure the pattern belongs to the user
    const pattern = await this.findActivityPatternById(patternId);
    if (!pattern || pattern.userId !== userId) {
      throw new Error("Activity pattern not found or does not belong to user");
    }

    const query = `
      DELETE FROM activity_patterns
      WHERE id = ? AND user_id = ?
    `;

    await executeQuery(query, [patternId, userId]);
    return true;
  }

  static async findActivityPatternById(patternId) {
    const query = `
      SELECT * FROM activity_patterns WHERE id = ?
    `;

    const patterns = await executeQuery(query, [patternId]);

    if (patterns.length === 0) {
      return null;
    }

    const pattern = patterns[0];
    return {
      id: pattern.id,
      userId: pattern.user_id,
      startLocation: JSON.parse(pattern.start_location),
      endLocation: JSON.parse(pattern.end_location),
      departureTime: pattern.departure_time,
      routineType: pattern.routine_type,
      days: JSON.parse(pattern.days),
      createdAt: pattern.created_at,
      updatedAt: pattern.updated_at,
    };
  }

  static async getUserActivityPatterns(userId) {
    const query = `
      SELECT * FROM activity_patterns WHERE user_id = ?
    `;

    const patterns = await executeQuery(query, [userId]);

    return patterns.map((pattern) => ({
      id: pattern.id,
      userId: pattern.user_id,
      startLocation: JSON.parse(pattern.start_location),
      endLocation: JSON.parse(pattern.end_location),
      departureTime: pattern.departure_time,
      routineType: pattern.routine_type,
      days: JSON.parse(pattern.days),
      createdAt: pattern.created_at,
      updatedAt: pattern.updated_at,
    }));
  }

  static async findPotentialPartners(userId) {
    // Get the user's activity patterns
    const userPatterns = await this.getUserActivityPatterns(userId);

    if (!userPatterns || userPatterns.length === 0) {
      return [];
    }

    // For simplicity, we'll just find users with similar patterns
    // In a real app, you'd use a more sophisticated algorithm
    const potentialPartners = [];

    for (const pattern of userPatterns) {
      // Find matching patterns based on start and end location proximity
      // and similar departure times
      const query = `
        SELECT u.id, u.name, u.email, u.phone, ap.* 
        FROM activity_patterns ap
        JOIN users u ON ap.user_id = u.id
        WHERE ap.user_id != ?
          AND JSON_EXTRACT(ap.start_location, '$.latitude') BETWEEN 
              JSON_EXTRACT(?, '$.latitude') - 0.01 AND JSON_EXTRACT(?, '$.latitude') + 0.01
          AND JSON_EXTRACT(ap.start_location, '$.longitude') BETWEEN 
              JSON_EXTRACT(?, '$.longitude') - 0.01 AND JSON_EXTRACT(?, '$.longitude') + 0.01
          AND JSON_EXTRACT(ap.end_location, '$.latitude') BETWEEN 
              JSON_EXTRACT(?, '$.latitude') - 0.01 AND JSON_EXTRACT(?, '$.latitude') + 0.01
          AND JSON_EXTRACT(ap.end_location, '$.longitude') BETWEEN 
              JSON_EXTRACT(?, '$.longitude') - 0.01 AND JSON_EXTRACT(?, '$.longitude') + 0.01
          AND ap.routine_type = ?
      `;

      const startLocationJson = JSON.stringify(pattern.startLocation);
      const endLocationJson = JSON.stringify(pattern.endLocation);

      const matches = await executeQuery(query, [
        userId,
        startLocationJson,
        startLocationJson,
        startLocationJson,
        startLocationJson,
        endLocationJson,
        endLocationJson,
        endLocationJson,
        endLocationJson,
        pattern.routineType,
      ]);

      // Add matching users to potential partners
      matches.forEach((match) => {
        const partnerExists = potentialPartners.some((p) => p.id === match.id);
        if (!partnerExists) {
          potentialPartners.push({
            id: match.id,
            name: match.name,
            email: match.email,
            phone: match.phone,
            matchingPattern: {
              startLocation: JSON.parse(match.start_location),
              endLocation: JSON.parse(match.end_location),
              departureTime: match.departure_time,
              routineType: match.routine_type,
              days: JSON.parse(match.days),
            },
          });
        }
      });
    }

    return potentialPartners;
  }
}

// Class đối tượng User
class UserEntity {
  constructor(data) {
    this.id = data.id;
    this.name = data.name;
    this.email = data.email;
    this.password = data.password;
    this.phone = data.phone;
  }

  async comparePassword(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
  }

  toJSON() {
    const { password, ...userWithoutPassword } = this;
    return userWithoutPassword;
  }
}

module.exports = User;
