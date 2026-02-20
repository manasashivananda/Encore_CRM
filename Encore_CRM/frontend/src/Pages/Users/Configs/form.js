import { useEffect, useState } from 'react';
import { HeadingFour, MyDiv } from "../../Common/Components";
import { Row, Col, Card, Spinner, Button } from "react-bootstrap";
import { TextField, MenuItem } from '@mui/material';
import axios from 'axios';
import swal from "sweetalert2";
import { driverType, region, status } from '../../Common/staticjson';
import PropTypes from 'prop-types';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function FormConfig({ handleClose, rowData, appendData }) {
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        name: "",
        lat: "",
        lon: "",
        region: "",
        allowed_radius: "",
        status: "active",
    });

    useEffect(() => {
        if (rowData._id) {
            setFormData(rowData);
        }
    }, [rowData]);


    
    async function submit(e) {
        e.preventDefault();
        setLoading(true);
        try {
            const method = rowData._id ? "PATCH" : "POST";
            const url = rowData._id ? `${API_BASE_URL}update-config/${rowData._id}` : `${API_BASE_URL}add-config`;
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
                !rowData._id && appendData([response.data.data]);
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
        if (rowData) {
            rowData[name] = newValue;
        }
        setFormData((prevData) => ({
            ...prevData,
            [name]: newValue
        }));
    }
    
    return (
        <MyDiv className="DrawerRight">
            <MyDiv className="grid-margin general-form stretch-card">
                <Card md={12}>
                    <Card.Header>
                        <HeadingFour className="card-title">
                            {rowData._id ? "Edit" : "Add"} Config
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
                                            label="Latitude"
                                            name="lat"
                                            value={formData.lat}
                                            onChange={handleFieldChange}
                                            required
                                            variant="standard"
                                            className="textarea"
                                        />
                                    </Col>
                                    <Col md={12} className="mb-3">
                                        <TextField
                                            fullWidth
                                            label="longitude"
                                            name="lon"
                                            value={formData.lon}
                                            onChange={handleFieldChange}
                                            required
                                            variant="standard"
                                            className="textarea"
                                        />
                                    </Col>
                                    <Col md={12} className="mb-3">
                                        <TextField
                                            fullWidth
                                            label="Allowed Radius (Km)"
                                            name="allowed_radius"
                                            value={formData.allowed_radius}
                                            onChange={handleFieldChange}
                                            required
                                            variant="standard"
                                            className="textarea"
                                        />
                                    </Col>
                                    <Col md={12} className="mb-3">
                                        <TextField
                                            fullWidth
                                            label="Region"
                                            name="region"
                                            select
                                            value={formData.region || ""}
                                            onChange={handleFieldChange}
                                            required
                                            variant="standard"
                                            className="textarea"
                                        >
                                            {region.map((option) => (
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

FormConfig.propTypes = {
    handleClose : PropTypes.func,
    rowData : PropTypes.object,
    appendData: PropTypes.func
}

export default FormConfig;