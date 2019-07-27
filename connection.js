const mysql = require('mysql');

const connection = mysql.createConnection({
  connectionLimit: 10000,
  host: 'localhost',
  user: 'root',
  password : 'pass123',
  database: 'ey_test_tasks',
  multipleStatements: true
});

module.exports = connection;