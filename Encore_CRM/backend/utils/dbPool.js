// Production-safe SQL Server connection pool manager
const sql = require('mssql');
const config = require('../config/sqlConfig');
const { logger } = require('./logger');

class DatabasePool {
  constructor() {
    this.pool = null;
    this.connecting = false;
    this.connectionRetries = 0;
    this.maxRetries = 5;
    this.retryDelay = 5000; // 5 seconds
  }

  async getConnection() {
    // If pool exists and is connected, return it
    if (this.pool && this.pool.connected) {
      return this.pool;
    }

    // If connection is in progress, wait for it
    if (this.connecting) {
      await this.waitForConnection();
      return this.pool;
    }

    // Start new connection
    await this.connect();
    return this.pool;
  }

  async connect() {
    this.connecting = true;

    try {
      // Close existing pool if any
      if (this.pool) {
        try {
          await this.pool.close();
        } catch (err) {
          logger.error('Error closing existing pool:', err);
        }
      }

      // Create new pool using shared sqlConfig settings
      this.pool = new sql.ConnectionPool(config);

      // Connect with retry logic
      await this.pool.connect();
      
      //logger.log('✅ SQL Server connection pool established');
      this.connectionRetries = 0;
      this.connecting = false;

      // Set up error handlers
      this.pool.on('error', err => {
        //logger.error('SQL Pool Error:', err);
        this.handlePoolError();
      });

      return this.pool;

    } catch (error) {
      this.connecting = false;
      //logger.error('Failed to connect to SQL Server:', error);

      // Implement retry logic
      if (this.connectionRetries < this.maxRetries) {
        this.connectionRetries++;
        //logger.log(`Retrying connection (${this.connectionRetries}/${this.maxRetries}) in ${this.retryDelay}ms...`);
        
        await new Promise(resolve => setTimeout(resolve, this.retryDelay));
        return this.connect();
      }

      throw new Error(`Failed to connect to SQL Server after ${this.maxRetries} attempts`);
    }
  }

  async waitForConnection() {
    const maxWait = 30000; // 30 seconds
    const checkInterval = 100; // Check every 100ms
    let waited = 0;

    while (this.connecting && waited < maxWait) {
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      waited += checkInterval;
    }

    if (waited >= maxWait) {
      throw new Error('Timeout waiting for database connection');
    }
  }

  async handlePoolError() {
    // Mark pool as disconnected
    this.pool = null;
    
    // Try to reconnect after a delay
    setTimeout(() => {
      if (!this.connecting) {
        //logger.log('Attempting to reconnect to SQL Server...');
        this.connect().catch(err => {
          //logger.error('Failed to reconnect:', err);
        });
      }
    }, 5000);
  }

  async executeQuery(queryFn) {
    const pool = await this.getConnection();
    
    try {
      return await queryFn(pool);
    } catch (error) {
      // Check if it's a connection error
      if (error.code === 'ENOTOPEN' || error.code === 'ECONNCLOSED') {
        //logger.error('Connection lost, attempting to reconnect...');
        this.pool = null;
        
        // Retry once with new connection
        const newPool = await this.getConnection();
        return await queryFn(newPool);
      }
      
      throw error;
    }
  }

  async close() {
    if (this.pool) {
      try {
        await this.pool.close();
        this.pool = null;
        //logger.log('SQL Server connection pool closed');
      } catch (err) {
        logger.error('Error closing pool:', err);
      }
    }
  }
}

// Create singleton instance
const dbPool = new DatabasePool();

// Graceful shutdown
process.on('SIGINT', async () => {
  //logger.log('Closing database connections...');
  await dbPool.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  //logger.log('Closing database connections...');
  await dbPool.close();
  process.exit(0);
});

module.exports = dbPool;