const mysql = require("mysql2/promise");

// Cấu hình kết nối
const dbConfig = {
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "ridesharing",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
};

// Tạo pool ngay lập tức khi file được require
const pool = mysql.createPool(dbConfig);

// Hàm thực thi query
const executeQuery = async (sql, params = []) => {
  try {
    const [results] = await pool.execute(sql, params);
    return results;
  } catch (error) {
    console.error("Database query error:", error);
    throw error;
  }
};

module.exports = {
  pool,
  executeQuery,
};
