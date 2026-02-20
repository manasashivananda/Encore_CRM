import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';
import Swal from 'sweetalert2';
import { useNavigate } from 'react-router-dom';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


const socket = io(API_BASE_URL, {
  transports: ['websocket','polling'],
  auth: { token: localStorage.getItem("token") },
});

export function NotifyMessage() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [departments, setDepartments] = useState(() => {
      return JSON.parse(localStorage.getItem("assignedDepartments")) || [];
    });

    useEffect(() => {
    // Listen for localStorage changes from other tabs or after post
    const onStorage = () => {
        const departments = JSON.parse(localStorage.getItem("assignedDepartments")) || [];
        setDepartments(departments);
    };
    window.addEventListener('storage', onStorage);

    return () => {
        window.removeEventListener('storage', onStorage);
    };
    }, []);

  useEffect(() => {
    if (!departments.length) return;

    socket.on('connect', () => {
      departments.forEach(dep => socket.emit('join', dep));
    });

    const fetchMessages = async () => {
      const res = await axios.get(`${API_BASE_URL}fetch-message-co`, {
        params: { status: 'pending,not_possible' },
        headers: { "x-access-token": localStorage.getItem("token") },
      });
      setMessages(res.data);
    };
    fetchMessages();

    socket.on('message_new', msg => {
      if (msg.depts.some(dep => departments.includes(dep))) {
        setMessages(prev => [msg, ...prev]);

        // 🔔 Show clickable bottom-right toast
        Swal.fire({
          toast: true,
          position: 'bottom-end',
          icon: 'info',
          title: 'New message',
          text: msg.text,
          showConfirmButton: true,
          confirmButtonText: 'Open',
          timer: 10000,
          timerProgressBar: true,
          didOpen: (toast) => {
            toast.addEventListener('click', () => {
              Swal.close();                  
              navigate(`/production`);
            });
          }
        });
      }
    });

    return () => {
      socket.off('message_new');
    };
  }, [departments, navigate]);
}
