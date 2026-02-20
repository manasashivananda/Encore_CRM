import axios from 'axios';
import { API_BASE_URL, tokenManager } from '../config/api.config';
import swal from "sweetalert2";


// Create axios instance with default config
const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 120000, // 120 seconds - match backend timeout
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  }
});

// Request interceptor to add token
axiosInstance.interceptors.request.use(
  (config) => {
    const token = tokenManager.getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
      
      // Check if we need to set timestamp for backward compatibility
      // This handles tokens set by login page using localStorage directly
      const tokenTimestamp = localStorage.getItem('tokenTimestamp');
      if (!tokenTimestamp) {
        // Set timestamp now if it doesn't exist (for existing tokens)
        localStorage.setItem('tokenTimestamp', Date.now().toString());
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling and retry logic
axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Handle network errors
    if (!error.response) {
      swal.fire({
        text: 'Network error. Please check your connection.',
        icon: "error",
        type: "error",
      });
      return Promise.reject(error);
    }

    // Handle 401 - Unauthorized
    if (error.response.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      tokenManager.removeToken();
      window.location.href = '/login';
      return Promise.reject(error);
    }

    // Handle 403 - Forbidden
    if (error.response.status === 403) {
      swal.fire({
        text: 'You do not have permission to perform this action.',
        icon: "error",
        type: "error",
      });
      return Promise.reject(error);
    }

    // Handle 500 - Server errors with retry
    if (error.response.status >= 500 && !originalRequest._retry) {
      originalRequest._retry = true;
      swal.fire({
        text: 'Server error. Retrying...',
        icon: "warning",
        type: "warning",
      });
      await new Promise(resolve => setTimeout(resolve, 1000));
      return axiosInstance(originalRequest);
    }

    return Promise.reject(error);
  }
);

// Request cancellation support
export const createCancelToken = () => {
  return axios.CancelToken.source();
};

export default axiosInstance;