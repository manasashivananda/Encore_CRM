import { useEffect, useState } from 'react';
import axios from 'axios';
import { Card } from 'react-bootstrap';
import { MyDiv } from './Pages/Common/Components';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;
function DeviceInfo() {
  const [deviceInfo, setDeviceInfo] = useState(null);

  useEffect(() => {
    axios.get(`${API_BASE_URL}device-info`)
      .then(res => setDeviceInfo(res.data))
      .catch(err => console.error(err));
  }, []);

  return (
    <MyDiv style={{ width: 'auto' }}>
        <Card style={{ padding: 10 }}>
        <h2>Device Info</h2>
        <pre>{JSON.stringify(deviceInfo, null, 2) || "Not Found"}</pre>
        </Card>
    </MyDiv>
  );
}

export default DeviceInfo;
