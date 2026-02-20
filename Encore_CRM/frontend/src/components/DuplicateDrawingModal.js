import React from 'react';
import '../styles/DuplicateDrawingModal.scss';

const DuplicateDrawingModal = ({ isOpen, onConfirm, onCancel, libraryName }) => {
  if (!isOpen) return null;

  return (
    <div className="duplicate-modal-overlay">
      <div className="duplicate-modal">
        <div className="duplicate-modal-header">
          <h3 className="duplicate-modal-header-title">Duplicate Drawing Found</h3>
          <button className="duplicate-modal-close" onClick={onCancel}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M18 6L6 18M6 6L18 18" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
        <div className="duplicate-modal-content">
          <div className="duplicate-modal-icon">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 8V13M12 17H12.01M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12Z"
                stroke="#9333EA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <p className="duplicate-modal-message">
            A drawing with the same dimensions already exists in {libraryName}.
            Do you want to create a new one?
          </p>
          <div className="duplicate-modal-buttons">
            <button className="duplicate-modal-btn duplicate-modal-btn-confirm" onClick={onConfirm}>
              Create
            </button>
            <button className="duplicate-modal-btn duplicate-modal-btn-cancel" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DuplicateDrawingModal;