import { useState, useEffect, Fragment } from 'react';
import {
  Fab, Modal, TextField, Button,
  Box, FormControl, InputLabel, Select, MenuItem
} from '@mui/material';
import axios from 'axios';
import { MdModeComment } from "react-icons/md";
import CustomSwal from '../Common/customSwal';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


const initialDept = {
  department_name: "Flashing",
  department_code: "F",
  department_status: "active",
}

function CoordinatorChat() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [departments, setDepartments] = useState([]);
  const [selected, setSelected] = useState([]);

  useEffect(() => {
    fetchDepartments();
  }, []);

  const fetchDepartments = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}fetch-department-data`, {
        headers: { "x-access-token": localStorage.getItem("token") }
      });
      const activeData = res.data.filter((item) => item.department_status.toLowerCase() === 'active' && item.department_code.toLowerCase() !== "gbil")
      activeData.unshift(initialDept)
      setDepartments(activeData);
    } catch (err) {
      console.error('Failed to load departments', err);
    }
  }

  const handleSend = async () => {
    if (!text.trim() || selected.length === 0)
        return;
    try{
      await axios.post(
        `${API_BASE_URL}post-message`,
        { text, depts: selected },
        { headers: { "x-access-token": localStorage.getItem("token") } }
      )
    }catch (err){
      CustomSwal.toast.info(err?.response?.data + " Enable add access for OrderCoordinator.")
    }
    setText('');
    setSelected([]);
    setOpen(false);
  };

  return (
    <Fragment>
      <Fab
        onClick={() => setOpen(true)}
        sx={{ position: 'fixed', bottom: 24, right: 24, borderRadius: 0, backgroundColor: 'transparent', boxShadow: 'none', zIndex: 1 }}
      >
        <MdModeComment size={70} color='#d22530' title='Message'>M</MdModeComment>
      </Fab>

      <Modal open={open} onClose={() => setOpen(false)}>
        <Box
          sx={{
            position: 'absolute', bottom: 80, right: 24,
            width: 320, backgroundColor: 'background.paper',
            boxShadow: 24, p: 2, display: 'flex',
            flexDirection: 'column', gap: 2
          }}
        >
          <FormControl fullWidth>
            <InputLabel id="dept-label">Departments</InputLabel>
            <Select
              labelId="dept-label"
              multiple
              value={selected}
              label="Departments"
              onChange={e => setSelected(e.target.value)}
              renderValue={vals => vals.join(', ')}
            >
              {departments.map(dw => (
                <MenuItem key={dw.department_code} value={dw.department_code}>
                  {dw.department_name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            label="Message"
            multiline rows={3}
            value={text}
            onChange={e => setText(e.target.value)}
            fullWidth
          />
          <Button variant="contained" onClick={() => handleSend()}>
            Send
          </Button>
        </Box>
      </Modal>
    </Fragment>
  );
}

export default CoordinatorChat;