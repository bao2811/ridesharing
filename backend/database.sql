CREATE TABLE users (
    id INT PRIMARY KEY,
    name VARCHAR(255),
    url VARCHAR(255),
    phone VARCHAR(50),
    email VARCHAR(255),
    password varchar(255),
    timestamp BIGINT
);

CREATE TABLE groups_ (
    id INT PRIMARY KEY,
    start_timestamp BIGINT,
    limit_passenger INT,
    type INT,
    vehicle_id INT,
    timestamp BIGINT,
    FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
);

CREATE TABLE members (
    id INT PRIMARY KEY,
    uid VARCHAR(255),
    group_id INT,
    FOREIGN KEY (group_id) REFERENCES groups_(id)
);

CREATE TABLE activity_chains (
    id INT PRIMARY KEY,
    user_id INT,
    timestamp BIGINT,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE activities (
    id INT PRIMARY KEY,
    activity_chain_id INT,
    activity_name VARCHAR(255),
    activity_time BIGINT,
    start_place VARCHAR(255),
    start_lat DOUBLE,
    start_lon DOUBLE,
    end_place VARCHAR(255),
    end_lat DOUBLE,
    end_lon DOUBLE,
    duration BIGINT,
    type INT,
    FOREIGN KEY (activity_chain_id) REFERENCES activity_chains(id)
);

CREATE TABLE vehicles (
    id INT PRIMARY KEY,
    user_id INT,
    vehicle_name VARCHAR(255),
    vehicle_number VARCHAR(255),
    vehicle_color VARCHAR(255),
    vehicle_image VARCHAR(255),
    vehicle_type VARCHAR(255),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE payments (
    id INT PRIMARY KEY,
    card_number VARCHAR(255),
    card_name VARCHAR(255),
    cvv VARCHAR(10),
    expire_month VARCHAR(10),
    expire_year VARCHAR(10),
    user_id INT,
    type INT,
    timestamp BIGINT,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE bookings (
    id INT PRIMARY KEY,
    user_id INT,
    group_id INT,
    payment_id INT,
    status INT,
    type INT,
    timestamp BIGINT,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (group_id) REFERENCES groups_(id),
    FOREIGN KEY (payment_id) REFERENCES payments(id)
);


-- Tạo indexes cho tìm kiếm không gian
ALTER TABLE rides ADD SPATIAL INDEX(start_location_lat, start_location_lng);
ALTER TABLE rides ADD SPATIAL INDEX(end_location_lat, end_location_lng);
ALTER TABLE rides ADD INDEX(departure_time);
ALTER TABLE rides ADD INDEX(status);

-- Tạo indexes khác
ALTER TABLE bookings ADD INDEX(passenger_id);
ALTER TABLE bookings ADD INDEX(ride_id);
ALTER TABLE ride_passengers ADD INDEX(user_id);
ALTER TABLE ride_passengers ADD INDEX(ride_id);