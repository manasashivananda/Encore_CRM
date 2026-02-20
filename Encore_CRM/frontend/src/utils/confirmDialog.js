import { toast } from 'react-toastify';
import React from 'react';

/**
 * Custom confirmation dialog using react-toastify
 * @param {string} message - The confirmation message
 * @param {Function} onConfirm - Callback when user confirms
 * @param {Function} onCancel - Optional callback when user cancels
 */
export const confirmAction = (message, onConfirm, onCancel = null) => {
  const ConfirmToast = ({ closeToast }) => (
    <div>
      <p style={{ marginBottom: '15px' }}>{message}</p>
      <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
        <button
          onClick={() => {
            closeToast();
            if (onCancel) onCancel();
          }}
          style={{
            padding: '5px 15px',
            backgroundColor: '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Cancel
        </button>
        <button
          onClick={() => {
            closeToast();
            onConfirm();
          }}
          style={{
            padding: '5px 15px',
            backgroundColor: '#dc3545',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Confirm
        </button>
      </div>
    </div>
  );

  toast(<ConfirmToast />, {
    position: 'top-center',
    autoClose: false,
    closeOnClick: false,
    draggable: false,
    closeButton: false,
    style: { width: '400px' }
  });
};

// For async operations
export const confirmActionAsync = (message) => {
  return new Promise((resolve) => {
    confirmAction(
      message,
      () => resolve(true),
      () => resolve(false)
    );
  });
};