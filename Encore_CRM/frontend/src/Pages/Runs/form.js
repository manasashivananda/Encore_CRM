import React, { useState, useEffect } from 'react';
import { HeadingFour, MyDiv } from "../Common/Components";
import { Row, Col, Card, Spinner, Button } from "react-bootstrap";
import { TextField, MenuItem } from '@mui/material';
import axios from 'axios';
import swal from "sweetalert2";
import { DateTime } from 'luxon';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterLuxon } from '@mui/x-date-pickers/AdapterLuxon';
import PropTypes from 'prop-types';
import { runs_type } from '../Common/staticjson';
import Swal from 'sweetalert2';
import { useCallback } from 'react';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function FormRuns({handleClose, sendValueToParent, selectedDate }) {
    const [btnLoading, setBtnLoading] = useState(false);
    const [data, setData] = useState({
        drivers_id: [],
        driver_count: 0,
        delivery_date: DateTime.fromISO(selectedDate),
        run_type: "1",
        draft_drivers: []
    })
    const [runTypeCopy, setRunsTypeCopy] = useState(runs_type);

    const getRuns = useCallback(async () => {
            const formattedDate = new Date(data.delivery_date).toISOString();
            try {
                const response = await fetch(`${API_BASE_URL}fetch-run-types-added?delivery_date=${formattedDate}`, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                        "x-access-token": localStorage.getItem("token"),
                        'Accept': 'application/json',
                    },
                });
                const result = await response.json();
                if(result.status){
                    const availableRunTypes = new Set(result.data?.map(item => parseInt(item.run_type)));

                    // Determine max continuous run_type starting from 1
                    let maxEnabled = 0;
                    for (let i = 1; i <= runTypeCopy.length; i++) {
                    if (availableRunTypes.has(i)) {
                        maxEnabled = i;
                    } else {
                        break; // stop at first missing value
                    }
                    }

                    // Allow next one too
                    const enableUpTo = maxEnabled + 1;

                    // Update disabled status
                    const updatedRunsType = runTypeCopy.map(run => ({
                    ...run,
                    disabled: run.value > enableUpTo
                    }));
                    setRunsTypeCopy(updatedRunsType)
                    data.run_type = ""
                }else{
                 
                }
            } catch (error) {
                const errorMessages = error?.result?.data?.errors?.join('\n');
                Swal.fire({
                    text: errorMessages || error.message,
                    icon: "error",
                    type: "error"
                });
            }
        },[data.delivery_date])

    useEffect(() => {
        getRuns()
    },[getRuns])

    async function submit(e) {
        e.preventDefault();
        setBtnLoading(true);
        if (data.driver_count < 1) {
            swal.fire({

                text: "Driver count should be greater than 0",
                icon: "warning",
                type: "warning"
            });
            setBtnLoading(false);
            return;
        }

        try {
            const method = "POST";
            const url = `${API_BASE_URL}add/run`;
            const response = await axios({
                method,
                url,
                data,
                headers: {
                  "x-access-token": localStorage.getItem("token"),
                  'Accept': 'application/json',
                  'Content-Type': 'application/json'
                }
              });

            if (response.data?.status) {
                swal.fire({
                    text: response.data.message,
                    icon: "success",
                    type: "success"
                });
                sendValueToParent(response.data?.result[0]?.delivery_date);
                handleClose();
            } else {
                swal.fire({
                    text: response.data.message,
                    icon: "warning",
                    type: "warning"
                });
            }
        }
        catch (error) {
            console.log(error)
            const errorMessages = error?.response?.data?.errors?.join('\n');
            swal.fire({
                text: errorMessages || error.message,
                icon: "error",
                type: "error"
            });
        } finally {
            setBtnLoading(false);
        }
    }

    const handleDateChange = (newValue) => {
        setData((prevData) => ({
            ...prevData,
            delivery_date: newValue
        }));
    };

    const handleFieldChange = (event) => {
        const { name, type, checked, value } = event.target;
        setData((prevData) => ({
            ...prevData,
            [name]: type === "checkbox" ? checked : value
        }));
        if (event.target.value.length > data.driver_count) {
            swal.fire({  
                text: "Selected drivers are more than the driver count",
                icon: "warning",
                type: "warning"
            });
        }
        // need to match the selected drivers with the driver count and not equal show a warning
    }

    const handleChangeCount = (e) =>{
        const { value } = e.target
        let name = []
        for(let i=1; i <= value; i++){
            name.push(`D${i}`)
        }
        console.log(name)
        setData({ ...data, driver_count: value, draft_drivers: name })
    }
    
    return (
        <MyDiv className="DrawerRight">
            <MyDiv className="grid-margin general-form stretch-card">
                <Card md={12}>
                    <Card.Header>
                        <HeadingFour className="card-title">
                            Add Run
                        </HeadingFour>
                    </Card.Header>
                    <Card.Body>
                        <MyDiv className="DrawerForm">
                            <form onSubmit={(e) => submit(e)}>
                                <Row className="DrawerFormField">
                                    <Col md={12} className="mb-3">
                                        <LocalizationProvider dateAdapter={AdapterLuxon}>
                                            <DatePicker
                                                label="Delivery Date"
                                                value={data.delivery_date}
                                                onChange={handleDateChange}
                                                format="yyyy-MM-dd"
                                                slotProps={{ textField: { size: 'small', variant: 'standard', required: true } }}
                                            />
                                        </LocalizationProvider>
                                    </Col>
                                    <Col md={12} className="mb-3">
                                        <TextField required={true} label="No of Drivers / Runs" variant='standard' value={data.driver_count} onChange={(e) => handleChangeCount(e)} fullWidth />
                                    </Col>  
                                    {/* <Col md={12}>
                                        <TextField
                                            select
                                            name="drivers_id"
                                            id="drivers_id"
                                            variant="standard"
                                            label="Drivers"
                                            SelectProps={{
                                                multiple: true,
                                                value: data.drivers_id,
                                                onChange: handleFieldChange,
                                                renderValue: (selected) =>
                                                selected
                                                    .map((id) => {
                                                    const driver = driverList.find((d) => d._id === id);
                                                    return driver ? driver.name + (driver.truck_name ? ` (${driver.truck_name})` : '') : '';
                                                    })
                                                    .join(', ')
                                            }}
                                            >
                                            {driverList.map((driver) => (
                                                <MenuItem key={driver._id} value={driver._id}>
                                                {driver.name} {driver?.truck_name && `(${driver.truck_name})`}
                                                </MenuItem>
                                            ))}
                                            </TextField>

                                    </Col> */}
                                    <Col>
                                    <TextField label="Run" className="mb-3" name='run_type' variant='standard' value={data.run_type} onChange={(e) => handleFieldChange(e)} fullWidth select
                                        required>
                                            {runTypeCopy.map((run_type) => (
                                                <MenuItem key={run_type.value} value={run_type.value} disabled={run_type.disabled}>{run_type.label}</MenuItem>
                                            ))}
                                    </TextField>
                                    </Col> 
                                    <Col md={12} className="text-end">
                                        {btnLoading ?
                                            <Button variant="primary" disabled className='mt-4 w-100'>
                                                <Spinner as="span" animation="border" size="sm" role="header" aria-hidden="true" className='mx-2' />
                                                Please Wait...
                                            </Button> :
                                            <button type="submit" className="FormBtn">Submit</button>
                                        }
                                    </Col>
                                </Row>
                            </form>
                        </MyDiv>
                    </Card.Body>
                </Card>
            </MyDiv>
        </MyDiv>
    );
}

FormRuns.propTypes = {
    handleClose : PropTypes.func,
    driversInfo : PropTypes.object,
    sendValueToParent : PropTypes.func,
    selectedDate: PropTypes.any
}

export default FormRuns;