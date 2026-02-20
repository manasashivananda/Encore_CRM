import PropTypes from 'prop-types';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
// import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from '@mui/material';

const AutoLogout = ({
  timeout = 5 * 60 * 1000,           // 5 mins default
  isLoggedIn,
  onLogout,
}) => {
  const navigate = useNavigate();
  const logoutTimer = useRef(null);
  const warningTimer = useRef(null);
  const [warningVisible, setWarningVisible] = useState(isLoggedIn);
  const CHANNEL_NAME = 'AUTO_LOGOUT_CHANNEL';
  const broadcastChannel = useRef(null);

  const clearTimers = () => {
    if (logoutTimer.current) clearTimeout(logoutTimer.current);
    if (warningTimer.current) clearTimeout(warningTimer.current);
  };

  const resetTimers = useCallback(() => {
    if (!isLoggedIn) return;

    clearTimers();
    setWarningVisible(false);

    logoutTimer.current = setTimeout(() => {
      localStorage.setItem('autoLogoutEvent', Date.now().toString());
      onLogout();
      navigate('/login');
    }, timeout);

  },[isLoggedIn, onLogout, navigate, timeout]);

  const handleActivity = useCallback(() => {
    resetTimers();
    broadcastChannel.current?.postMessage('reset');
  },[resetTimers]);

  useEffect(() => {
    if (!isLoggedIn) return;

    const events = ['mousemove', 'mousedown', 'keypress', 'scroll', 'touchstart'];
    events.forEach(e => window.addEventListener(e, handleActivity));
    resetTimers();

    broadcastChannel.current = new BroadcastChannel(CHANNEL_NAME);
    broadcastChannel.current.onmessage = (e) => {
      if (e.data === 'reset') resetTimers();
      if (e.data === 'logout') {
        onLogout();
        navigate('/login');
      }
    };

    const handleStorage = (e) => {
      if (e.key === 'autoLogoutEvent') {
        onLogout();
        navigate('/login');
      }
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      events.forEach(e => window.removeEventListener(e, handleActivity));
      clearTimers();
      if (broadcastChannel.current) broadcastChannel.current.close();
      window.removeEventListener('storage', handleStorage);
    };
  }, [isLoggedIn, handleActivity, navigate, onLogout, resetTimers]);

  return null
};

AutoLogout.propTypes = {
  timeout : PropTypes.any,
  isLoggedIn: PropTypes.bool,
  onLogout: PropTypes.func
}

export default AutoLogout;
