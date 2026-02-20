import React, { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import axios from 'axios';
import { Col, Row } from 'react-bootstrap';
import { HeadingTwo } from '../Common/Components';
import { Link, useNavigate } from 'react-router-dom';
import { MdKeyboardArrowLeft } from 'react-icons/md';
import { Box, Chip, Stack, Typography } from '@mui/material';
import { FaEye } from "react-icons/fa";
import moment from 'moment';
import CustomSwal from '../Common/customSwal';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


// Initialize socket once (auto-connect enabled)
const socket = io(API_BASE_URL, {
  transports: ['websocket', 'polling'],
  auth: { token: localStorage.getItem("token") },
});

function Coordinator() {
let navigate = useNavigate();
  const [pending, setPending] = useState([]);
  const [finished, setFinished] = useState([]);

  useEffect(() => {
    // Join room once authenticated & connected
    socket.on('connect', () => {
      socket.emit('join', 'coordinator');
    });

    // Initial fetch
    const fetchMessages = async () => {
      try {
        const [p, f] = await Promise.all([
          axios.get(`${API_BASE_URL}fetch-message-co`, {
            params: { status: 'pending,not_possible', user_type: 'co' },
            headers: { "x-access-token": localStorage.getItem("token") }
          }),
          axios.get(`${API_BASE_URL}fetch-message-co`, {
            params: { status: 'finished', user_type: 'co' },
            headers: { "x-access-token": localStorage.getItem("token") }
          }),
        ]);
        setPending(p.data);
        setFinished(f.data);
      } catch (err) {
        console.error('Fetch error', err);
      }
    };
    fetchMessages();

    // Listen for new & updated messages
    socket.on('message_new', msg => {
      console.log(msg)
      setPending(prev => [msg, ...prev]);
    });

    socket.on('message_updated', msg => {
  // Remove from pending/not_possible if status changed
        setPending(prev => prev.filter(m => m._id !== msg._id));

        if (msg.status === 'finished') {
            // Move to finished
            setFinished(prev => [msg, ...prev]);
        } else if (msg.status === 'not_possible') {
            // If not_finished, treat as still pending but highlighted
            setPending(prev => [msg, ...prev]);
        }
    });

    // Cleanup listeners on unmount
    return () => {
      socket.off('connect');
      socket.off('message_new');
      socket.off('message_updated');
    };
  }, []);

  const markStatus = async (id, status) => {
      try {
        await axios.patch(
          `${API_BASE_URL}update-message/${id}`,
          { status },
          { headers: { "x-access-token": localStorage.getItem("token") } }
        );
      } catch (err) {
        CustomSwal.toast.info(err?.response?.data + " Enable edit access for OrderCoordinator.")
        // console.error(`Error marking ${status}`, err);
      }
    };

  return (
    <React.Fragment>
        <Row className="GeneralHeading withBackArrow">
            <Col md={6} xs={6} >
                <HeadingTwo><Link className="arrow-btn" onClick={() => navigate(-1)}><MdKeyboardArrowLeft /></Link>Order Coordinator</HeadingTwo>
            </Col>
        </Row>
        <Row className="GeneralHeading mt-2">
          <Col>
            <Typography variant='h4' fontWeight="bold">Pending & Rejected Messages</Typography>
          </Col>
          <Col>
            <Typography variant='h4' fontWeight="bold">Finished Messages</Typography>
          </Col>
        </Row>
      <Row className="GeneralHeading mt-2">
        <Col style={{ height : '720px', overflowY : 'scroll' }}>
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
          {pending.map(m => (
            <Chip
              key={m._id}
              className={m.status === 'not_possible' ? 'blinking' : ''}
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
                      <Typography variant="body2">{m.status === 'not_possible' ? m.updatedByName : m.createdByName || "Unknown"}</Typography>
                    </Box>
                    <Typography variant="body2">
                      To Dept: {m.depts?.join(', ')}
                    </Typography>
                  </Box>

                  <Box sx={{ mt: 0.5, display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center' }}>
                    <Typography variant="body1" fontWeight="bold">{m.text}</Typography>
                    <Typography variant="caption">{moment(m.created_date).format('DD-MMM-YYYY hh:mm a')}</Typography>
                  </Box>
                </>
              }
              onDelete={() => markStatus(m._id, 'finished')}
              deleteIcon={m.status === 'not_possible' ? <FaEye color='#fff'/> : <></>}
            />
          ))}
        </Stack>
        </Col>
        <Col style={{ height : '720px', overflowY : 'scroll' }}>
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
            {finished.map(m => (
              <Chip
                key={m._id}
                color="success"
                variant="outlined"
                sx={{
                  height: 'auto',
                  alignItems: 'flex-start',  // top-align avatar & label
                  '& .MuiChip-label': {
                    whiteSpace: 'normal',    // allow multiline
                    width: "100%"
                  },
                  boxShadow : '2px 2px 5px green'
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
                        <Typography variant="body2">{m.updatedByName || "Unknown"}</Typography>
                      </Box>
                        <Typography textAlign={"right"} variant="body2" color="text.secondary">
                          From Dept: {m.depts?.join(', ')}
                        </Typography>
                    </Box>

                    <Box sx={{ mt: 0.5, display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center' }}>
                      <Typography variant="body1" fontWeight="bold">{m.text}</Typography>
                      <Typography variant="caption">{m.updated_date ? moment(m.updated_date).format('DD-MMM-YYYY hh:mm a') : ""}</Typography>
                    </Box>
                  </>
                }
              />
            ))}
          </Stack>


        </Col>
      </Row>
      {/* Blinking CSS */}
      <style>{`
        @keyframes blink {
          0%,50%,100%{opacity:1}
          25%,75%{opacity:0}
        }
      `}</style>
    </React.Fragment>
  );
}

export default Coordinator;
