import { useEffect, useState } from 'react';
import { HeadingFour, MyDiv } from "../../Common/Components";
import dayjs from 'dayjs';
import { Row, Col, Card, Spinner, Button } from "react-bootstrap";
import { TextField } from '@mui/material';
import axios from 'axios';
import swal from "sweetalert2";
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { DateTimePicker  } from '@mui/x-date-pickers/DateTimePicker';
import PropTypes from 'prop-types';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function TruckMaintainForm({ handleClose, Id }) {
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        description: "",
        amt: ""
    });
    const [dateRange, setDateRange] = useState([new Date().toISOString().split('T')[0], new Date().toISOString().split('T')[0]]);

    useEffect(() => {
        if (Id) {
            setFormData({...Id, driver_id: Id.driver_info?._id});
        }
    }, [Id]);

    async function submit(e) {
        e.preventDefault();
        setLoading(true);
        formData.from_date = dateRange[0]
        formData.to_date = dateRange[1]
        formData.truck_id = Id
        try {
            const method = "POST";
            const url = `${API_BASE_URL}log-truck-maintenance`;
            const response = await axios({
                method,
                url,
                data: formData,
                headers: {
                  "x-access-token": localStorage.getItem("token"),
                  'Accept': 'application/json',
                  'Content-Type': 'application/json'
                }
              });
            if (response.status) {
                swal.fire({
                    text: response.data.message,
                    icon: "success",
                    type: "success"
                });
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
            const errorMessages = error?.response?.data?.errors?.join('\n');
            swal.fire({
                text: errorMessages || error.message,
                icon: "error",
                type: "error"
            });
        } finally {
            setLoading(false);
        }
    }

    const handleFieldChange = (event) => {
        const { name, type, checked, value } = event.target;
        const newValue = type === "checkbox" ? checked : value;
        setFormData((prevData) => ({
            ...prevData,
            [name]: newValue
        }));
    }
    
     const handleCustomDateChange = (newDateRange) => {
        setDateRange(newDateRange);
    };

    return (
        <MyDiv className="DrawerRight">
            <MyDiv className="grid-margin general-form stretch-card">
                <Card md={12}>
                    <Card.Header>
                        <HeadingFour className="card-title">
                            {Id ? "Edit" : "Add"} Truck Log
                        </HeadingFour>
                    </Card.Header>
                    <Card.Body>
                        <MyDiv className="DrawerForm">
                            <form onSubmit={(e) => submit(e)}>
                                <Row className="DrawerFormField">
                                    <Col md={12} className="mb-3">
                                        <LocalizationProvider dateAdapter={AdapterDayjs}>
                                        <DateTimePicker
                                            label="Start Date"
                                            value={dayjs(dateRange[0])}
                                            onChange={(newValue) => handleCustomDateChange([newValue, dateRange[1]])}
                                            slotProps={{ textField: {  variant: 'standard', required: true } }}
                                            disableFuture
                                            // format=''
                                        />
                                    </LocalizationProvider>
                                    </Col>
                                    <Col md={12} className="mb-3">
                                        <LocalizationProvider dateAdapter={AdapterDayjs}>
                                        <DateTimePicker
                                            label="End Date"
                                            value={dayjs(dateRange[1])}
                                            onChange={(newValue) => handleCustomDateChange([dateRange[0], newValue])}
                                            slotProps={{ textField: {  variant: 'standard', required: true } }}
                                            // disableFuture
                                            minDate={dayjs(dateRange[0])}
                                        />
                                    </LocalizationProvider>
                                    </Col>
                                    <Col md={12} className="mb-3">
                                        <TextField
                                            fullWidth
                                            label="Description"
                                            name="description"
                                            value={formData.description}
                                            onChange={handleFieldChange}
                                            required
                                            variant="standard"
                                        />
                                    </Col>
                                    <Col md={12} className="mb-3">
                                        <TextField
                                            fullWidth
                                            label="Amount"
                                            name="amt"
                                            type='number'
                                            value={formData.amt}
                                            onChange={handleFieldChange}
                                            variant="standard"
                                        />
                                    </Col>
                                    <Col md={12} className="text-end">
                                        {loading ?
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

TruckMaintainForm.propTypes = {
    handleClose : PropTypes.func,
    Id : PropTypes.object
}
export default TruckMaintainForm;