import React, { useEffect, useState } from 'react';
import { HeadingFour, LabelTag, MyDiv } from "../../Common/Components";
import { Row, Col, Card, Spinner, Button } from "react-bootstrap";
import { TextField, MenuItem } from '@mui/material';
import axios from 'axios';
import swal from "sweetalert2";
import { status, truckType } from '../../Common/staticjson';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

const USER_ID = localStorage.getItem("userId");

function FormTruck({ handleClose, rowData, appendData }) {
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        name: "",
        reg_no: "",
        driver_id: null,
        location: "",
        dimensions: {
            length: 0,
            width: 0,
            max_length: 0
        },
        type: 0,
        created_by: USER_ID,
        status: "",
    });
    const [driverList, setDriverList] = useState([]);

    useEffect(() => {
        if (rowData._id) {
            // console.log(rowData);
            setFormData({...rowData, driver_id: rowData.driver_info?._id});
        }
    }, [rowData]);

    useEffect(() => {
        getActiveDriver();
    }, []);

    async function submit(e) {
        e.preventDefault();
        setLoading(true);
        try {
            const method = rowData._id ? "PATCH" : "POST";
            const url = rowData._id ? `${API_BASE_URL}update-truck/${rowData._id}` : `${API_BASE_URL}add-truck`;
            const response = await axios({
                method,
                url,
                data: rowData._id ? { ...rowData, updated_by: USER_ID } : formData,
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
                    
                });
                appendData();
                handleClose();
            } else {
                swal.fire({
                    text: response.data.message,
                    icon: "warning",
                    
                });
            }
        }
        catch (error) {
            const errorMessages = error?.response?.data?.errors?.join('\n');
            swal.fire({
                text: errorMessages || error.message,
                icon: "error",
                
            });
        } finally {
            setLoading(false);
        }
    }

    const getActiveDriver = async () => {
        setLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}fetch-active-drivers`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    "x-access-token": localStorage.getItem("token"),
                    'Accept': 'application/json',
                },
            });
            const result = await response.json();
            if (result.status) {
                setDriverList(result.data);
            } else {
                const errorMessages = result?.errors?.join('\n');
                swal.fire({
                    text: errorMessages,
                    icon: "error",
                    type: "error"
                });
            }
        } catch (error) {
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

        if (["length", "width", "max_length"].includes(name)) {
            if (rowData) {
                rowData.dimensions = {
                    ...rowData.dimensions,
                    [name]: newValue
                };
            }
            setFormData((prevData) => ({
                ...prevData,
                dimensions: {
                    ...prevData.dimensions,
                    [name]: newValue
                }
            }));
        } else {
            if (rowData) {
                rowData[name] = newValue;
            }
            setFormData((prevData) => ({
                ...prevData,
                [name]: newValue
            }));
        }
    }
    
    return (
        <MyDiv className="DrawerRight">
            <MyDiv className="grid-margin general-form stretch-card">
                <Card md={12}>
                    <Card.Header>
                        <HeadingFour className="card-title">
                            {rowData._id ? "Edit" : "Add"} Truck
                        </HeadingFour>
                    </Card.Header>
                    <Card.Body>
                        <MyDiv className="DrawerForm">
                            <form onSubmit={(e) => submit(e)}>
                                <Row className="DrawerFormField">
                                    <Col md={12} className="mb-3">
                                        <TextField
                                            fullWidth
                                            label="Name"
                                            name="name"
                                            value={formData.name}
                                            onChange={handleFieldChange}
                                            required
                                            variant="standard"
                                            className="textarea"
                                        />
                                    </Col>
                                    <Col md={12} className="mb-3">
                                        <TextField
                                            fullWidth
                                            label="Registration No"
                                            name="reg_no"
                                            value={formData.reg_no}
                                            onChange={handleFieldChange}
                                            required
                                            variant="standard"
                                            className="textarea"
                                        />
                                    </Col>
                                    <Col md={12} className="mb-3">
                                        <TextField
                                            fullWidth
                                            label="Driver"
                                            name="driver_id"
                                            select
                                            value={formData.driver_id || ""}
                                            onChange={handleFieldChange}
                                            // required
                                            variant="standard"
                                            className="textarea"
                                        >
                                            <MenuItem value={null}>--select--</MenuItem>
                                            {driverList && driverList.map((option) => (
                                                <MenuItem key={option._id} value={option._id}>
                                                    {option.name}
                                                </MenuItem>
                                            ))}
                                        </TextField>
                                    </Col>
                                    <Col md={12} className="mb-3">
                                        <LabelTag>Dimensions</LabelTag>
                                        <Row className="d-flex justify-content-between">
                                            <Col md={4} className="mb-3">
                                                <TextField
                                                    fullWidth
                                                    label="Length (m)"
                                                    name="length"
                                                    value={formData.dimensions?.length || ""}
                                                    onChange={handleFieldChange}
                                                    required
                                                    variant="standard"
                                                    className="textarea"
                                                />
                                            </Col>
                                            <Col md={4} className="mb-3">
                                                <TextField
                                                    fullWidth
                                                    label="Width (m)"
                                                    name="width"
                                                    value={formData.dimensions?.width || ""}
                                                    onChange={handleFieldChange}
                                                    required
                                                    variant="standard"
                                                    className="textarea"
                                                />
                                            </Col>
                                            <Col md={4} className="mb-3">
                                                <TextField
                                                    fullWidth
                                                    label="Max Length (m)"
                                                    name="max_length"
                                                    value={formData.dimensions?.max_length || ""}
                                                    onChange={handleFieldChange}
                                                    required
                                                    variant="standard"
                                                    className="textarea"
                                                />
                                            </Col>
                                        </Row>
                                    </Col>
                                    <Col md={12} className="mb-3">
                                        <TextField
                                            fullWidth
                                            label="Location"
                                            name="location"
                                            value={formData.location}
                                            onChange={handleFieldChange}
                                            required
                                            variant="standard"
                                            className="textarea"
                                        />
                                    </Col>
                                    <Col md={12} className="mb-3">
                                        <TextField
                                            fullWidth
                                            label="Type"
                                            name="type"
                                            select
                                            value={formData.type || ""}
                                            onChange={handleFieldChange}
                                            required
                                            variant="standard"
                                            className="textarea"
                                        >
                                            {truckType && truckType.map((option) => (
                                                <MenuItem key={option.value} value={option.value}>
                                                    {option.label}
                                                </MenuItem>
                                            ))}
                                        </TextField>
                                    </Col>
                                    {rowData._id && (
                                    <Col md={12} className='mb-3'>
                                        <TextField
                                            fullWidth
                                            label="Status"
                                            select
                                            name="status"
                                            value={formData.status || ""}
                                            onChange={handleFieldChange}
                                            required
                                            variant="standard"
                                            className="textarea" 
                                        >
                                            {status.map((option) => (
                                                <MenuItem key={option.value} value={option.value}>
                                                    {option.label}
                                                </MenuItem>
                                            ))}
                                        </TextField>
                                    </Col>
                                    )}
                                    <Col md={12} className="text-end">
                                        {loading ?
                                            <Button variant="primary" disabled className='mt-4 w-100'>
                                                <Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" className='mx-2' />
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
export default FormTruck;