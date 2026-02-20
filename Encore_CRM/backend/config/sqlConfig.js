require('dotenv').config();
const sql = require('mssql');

const config = {
  server: process.env.SQLServerName,
  port: Number(process.env.SQLPort?.trim()) || 8050,
  database: process.env.SQLDataBase,
  user: process.env.SQLUsername,
  password: process.env.SQLPassword,
   pool: {
    max: 30,                 // Increased max pool size for higher concurrency (was 20)
    min: 5,                  // Minimum connections to keep warm (was 2)
    idleTimeoutMillis: 90000, // Close idle connections after 30 seconds
    acquireTimeoutMillis: 120000, // Wait up to 120 seconds for connection from pool
    createTimeoutMillis: 90000,  // Wait up to 30 seconds for connection creation
    destroyTimeoutMillis: 9000,  // Wait up to 5 seconds for connection destruction
    reapIntervalMillis: 5000,    // Check for idle connections every 1 second
    createRetryIntervalMillis: 1000, // Retry connection creation every 200ms
    propagateCreateError: false   // Don't propagate connection creation errors immediately
  },
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true,
    connectTimeout: 120000,  // Set here too
    requestTimeout: 120000,    
    datefirst: 1,  // Set first day of week to Monday for consistency
    dateFormat: 'dmy'  // Use day-month-year format
  },
  connectionTimeout: 120000,  // 120 seconds connection timeout
  requestTimeout: 120000,     // 120 seconds for long queries
  cancelTimeout: 9000     // 5 seconds to cancel queries
 
};



module.exports = config;


// // MS-SQL configuration
// const swiConfig = {
//   server: process.env.SQLServerName,
//   port: parseInt(process.env.SQLPort) || 1433,
//   database: process.env.SQLDataBase,
//   user: process.env.SQLUsername,
//   password: process.env.SQLPassword,
//   options: {
//     encrypt: false,
//     trustServerCertificate: true,
//     enableArithAbort: true,
//     datefirst: 1,  // Set first day of week to Monday for consistency
//     dateFormat: 'dmy'  // Use day-month-year format
//   },
//   connectionTimeout: 30000,  // 30 seconds connection timeout
//   requestTimeout: 60000,     // 60 seconds for long queries
//   cancelTimeout: 5000,       // 5 seconds to cancel queries
//   pool: {
//     max: 20,                 // Increased max pool size for higher concurrency
//     min: 2,                  // Minimum connections to keep warm
//     idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
//     acquireTimeoutMillis: 60000, // Wait up to 60 seconds for connection from pool
//     createTimeoutMillis: 30000,  // Wait up to 30 seconds for connection creation
//     destroyTimeoutMillis: 5000,  // Wait up to 5 seconds for connection destruction
//     reapIntervalMillis: 1000,    // Check for idle connections every 1 second
//     createRetryIntervalMillis: 200, // Retry connection creation every 200ms
//     propagateCreateError: false   // Don't propagate connection creation errors immediately
//   }
// };