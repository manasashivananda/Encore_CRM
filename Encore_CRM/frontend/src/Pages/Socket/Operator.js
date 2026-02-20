import React, { useCallback, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';
import { Avatar, Box, Chip, IconButton, Stack, Typography } from '@mui/material';
import { MdDoneOutline } from "react-icons/md";
import { MyDiv } from '../Common/Components';
import { MdDoNotDisturb } from "react-icons/md";
import CustomSwal from '../Common/customSwal';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


const socket = io(API_BASE_URL, {
  transports: ['websocket', 'polling'],
  auth: { token: localStorage.getItem("token") },
});

function Operator() {
  const [departments, setDepartments] = useState(() => {
    return JSON.parse(localStorage.getItem("assignedDepartments")) || [];
  });
  const [messages, setMessages] = useState([]);

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


    const handleUpdated = updated => {
      setMessages(prev => prev.map(m => m._id === updated._id ? updated : m));
    };

    const fetchMessages = useCallback(async () => {
        try {
          const res = await axios.get(`${API_BASE_URL}fetch-message-co`, {
            params: { status: 'pending', user_type: 'op', depts: departments.join(',') },
            headers: { "x-access-token": localStorage.getItem("token") },
          });
          setMessages(res.data);
        } catch (err) {
          console.error('Fetch error', err);
        }
    },[departments]);

  useEffect(() => {
    if (!departments.length) return;
    // Join rooms based on current departments
    socket.emit('join', departments);
    // Fetch pending + not_possible messages
    fetchMessages();
    // Socket event handlers
    const handleNew = msg => {
      if (msg.depts.some(dep => departments.includes(dep))) {
        setMessages(prev => [msg, ...prev]);
      }
    };

    socket.on('message_new', handleNew);
    socket.on('message_updated', handleUpdated);

    return () => {
      socket.off('message_new', handleNew);
      socket.off('message_updated', handleUpdated);
    };
  }, [fetchMessages, departments]);

  const markStatus = async (id, status) => {
    try {
      await axios.patch(
        `${API_BASE_URL}update-message/${id}`,
        { status },
        { headers: { "x-access-token": localStorage.getItem("token") } }
      );
      setMessages(prev => prev.filter(m => m._id !== id));
    } catch (err) {
      CustomSwal.toast.info(err?.response?.data + " Enable edit access for OrderCoordinator.")
    }
  };

  return (
    <Stack
      direction="column"
      spacing={1}
      sx={{
        '& .MuiChip-root': {
              justifyContent: 'space-between',
              padding: .5,
            }
      }}
    >
    {messages.map(m => (
      <Chip
        key={m._id}
        sx={{
            height: 'auto',
            alignItems: 'flex-start',  // top-align avatar & label
            '& .MuiChip-label': {
              whiteSpace: 'normal',    // allow multiline
              width: "100%"
            },
            boxShadow : '2px 2px 5px grey'
          }}
        label={
          <>
            <Box sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              pr: 1,
            }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Avatar sx={{ alignItems: 'center', display: 'flex',  }}>{m.createdByName?.split("")[0] || "Unknown"}</Avatar>
                <Typography variant="body2">{m.createdByName || "Unknown"}</Typography>
              </Box>
              <MyDiv>
                <Stack
                  direction="row"
                  spacing={3}
                  sx={{
                    '& .MuiChip-root': {
                          justifyContent: 'space-between',
                          padding: .5,
                        }
                  }}
                >
                  <IconButton title='Attended' onClick={() => markStatus(m._id, 'finished')}>
                      <MdDoneOutline color='green' size={30}/>
                  </IconButton>
                  <IconButton title='Not Possible' onClick={() => markStatus(m._id, 'not_possible')}>
                      <MdDoNotDisturb color='red' size={30}/>
                  </IconButton>
                </Stack>
              </MyDiv>
            </Box>
            <Box sx={{ mt: 0.5 }}>
              <Typography variant="body1" fontWeight="bold">{m.text}</Typography>
            </Box>
          </>
        }
      />
    ))}
  </Stack>
  );
}

export default Operator;
