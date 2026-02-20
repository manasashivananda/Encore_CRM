/**
 * Navigation Guard Context
 * Prevents navigation when there are unsaved changes (e.g., editing rows, pending deletions)
 */
import React, { createContext, useContext, useState, useCallback } from 'react';
import swal from 'sweetalert2';

const NavigationGuardContext = createContext({
  isBlocked: false,
  blockReason: '',
  setNavigationBlock: () => {},
  clearNavigationBlock: () => {},
  checkNavigation: () => true,
});

export const NavigationGuardProvider = ({ children }) => {
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockReason, setBlockReason] = useState('');

  const setNavigationBlock = useCallback((reason) => {
    setIsBlocked(true);
    setBlockReason(reason);
  }, []);

  const clearNavigationBlock = useCallback(() => {
    setIsBlocked(false);
    setBlockReason('');
  }, []);

  // Returns a promise that resolves to true if navigation should proceed
  const checkNavigation = useCallback(async () => {
    if (!isBlocked) return true;

    // Show warning - no option to leave, user must click Finish
    await swal.fire({
      title: 'Cannot Navigate',
      text: blockReason || 'Please click "Finish" to complete the operation before navigating away.',
      icon: 'warning',
      confirmButtonText: 'OK',
      confirmButtonColor: '#3085d6',
      allowOutsideClick: false,
      allowEscapeKey: false
    });

    // Always block navigation - user must click Finish
    return false;
  }, [isBlocked, blockReason]);

  return (
    <NavigationGuardContext.Provider
      value={{
        isBlocked,
        blockReason,
        setNavigationBlock,
        clearNavigationBlock,
        checkNavigation,
      }}
    >
      {children}
    </NavigationGuardContext.Provider>
  );
};

export const useNavigationGuard = () => useContext(NavigationGuardContext);

export default NavigationGuardContext;
