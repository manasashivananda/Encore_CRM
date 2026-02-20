import { logger } from './logger';

class PerformanceMonitor {
  constructor() {
    this.metrics = {};
    this.thresholds = {
      apiCall: 3000, // 3 seconds
      pageLoad: 2000, // 2 seconds
      renderTime: 100 // 100ms
    };
  }

  // Track API call performance
  trackAPICall(endpoint, startTime) {
    const duration = Date.now() - startTime;
    
    if (duration > this.thresholds.apiCall) {
      logger.warn(`Slow API call to ${endpoint}: ${duration}ms`);
    }

    this.metrics[endpoint] = {
      ...this.metrics[endpoint],
      lastDuration: duration,
      avgDuration: this.calculateAverage(endpoint, duration)
    };

    return duration;
  }

  // Track component render time
  trackRender(componentName, startTime) {
    const duration = Date.now() - startTime;
    
    if (duration > this.thresholds.renderTime) {
      logger.warn(`Slow render in ${componentName}: ${duration}ms`);
    }

    return duration;
  }

  // Calculate average duration
  calculateAverage(key, newValue) {
    const current = this.metrics[key];
    if (!current) return newValue;
    
    const count = (current.count || 0) + 1;
    const total = (current.total || 0) + newValue;
    
    this.metrics[key].count = count;
    this.metrics[key].total = total;
    
    return Math.round(total / count);
  }

  // Get performance report
  getReport() {
    return {
      metrics: this.metrics,
      timestamp: new Date().toISOString()
    };
  }

  // Clear metrics
  clear() {
    this.metrics = {};
  }
}

export default new PerformanceMonitor();