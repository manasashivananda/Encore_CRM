import React, { useState, useEffect, useCallback } from 'react';
import { Row, Col } from "react-bootstrap";
import { CurrencyDisplay, getFormattedDeliveryTime, HeadingTwo, MyDiv } from "../../Common/Components";
import { MdClose, MdDelete, MdFilePresent, MdKeyboardArrowLeft, MdOutlineModeEditOutline } from "react-icons/md";
import { Link, useNavigate } from "react-router-dom";
import { Drawer, TextField, Button, Tooltip, IconButton, Box } from '@mui/material';
import CustomDataGrid from '../../Common/customDataGrid';
import Swal from 'sweetalert2';
import FormOrder from './form';
import sampleDocument from "../../../Assets/SampleDocs/External-Orders.xlsx";
import { SiMicrosoftexcel } from "react-icons/si";
import ExternalOrdersBulkUpload from './BulkUpload';
import { MdUpload } from "react-icons/md";
import axios from 'axios';
import { DateTime } from 'luxon';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterLuxon } from '@mui/x-date-pickers/AdapterLuxon';
import CustomSwal from '../../Common/customSwal';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function ExternalOrders() {
    const navigate = useNavigate();
    const [data, setData] = useState([]);
    const [drawerState, setDrawerState] = React.useState(false);
    const [loading, setLoading] = useState(false);
    const [pageLimit, setPageLimit] = useState(40);
    const [page, setPage] = useState(0);
    const [total, setTotal] = useState(0);
    const [rowData, setRowData] = useState({});
    const [searchText, setSearchText] = useState('');
    const [selectedDate, setSelectedDate] = useState(DateTime.now().plus({ days: 1 }));


    const handleDateChange = (newDate) => {
        if (newDate) {
            setSelectedDate(newDate);  // Keep as Luxon DateTime object
        }
    };

    const handleDrawerToggle = (status) => {
        drawerState === false ? setDrawerState(true) : setDrawerState(false)
        if (status === 200) {
            getExternalOrders()
        }
    }

    const searchHandle = (e) => {
        setSearchText(e.target.value);
        console.log(e)

        if (e.key === "Enter") {
            if (e.target.value.length === 0) {
                CustomSwal.toast.info("Please enter text to search.")
                return
            }
            getExternalOrders(e.target.value)
        }
    }

    const handleEdit = (item) => {
        handleDrawerToggle();
        setRowData(item);
    }

    const getExternalOrders = useCallback(async (search_text = searchText) => {
        setLoading(true);
        const fromTime = selectedDate.setZone('Australia/Sydney').startOf('day').toUTC().toISO();
        const toTime = selectedDate.setZone('Australia/Sydney').endOf('day').toUTC().toISO();
        try {
            const response = await fetch(`${API_BASE_URL}get-ext-order?page=${page}&limit=${pageLimit}&search_text=${search_text}&fromTime=${fromTime}&toTime=${toTime}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    "x-access-token": localStorage.getItem("token"),
                    'Accept': 'application/json',
                },
            });
            const result = await response.json();
            if (result?.status) {
                setData(result.data);
                setTotal(result.total);
                let orders = result.data?.filter(item => item.order_docket.length === 0)
                    .map(item => item.order_number);
                if (orders.length) {
                    Swal.fire({
                        title: "Below orders dockets are not uploaded. Please verify.",
                        text: orders.map(item => item).join(", "),
                        icon: "warning",
                        type: "warning"
                    });
                }
            } else {
                const errorMessages = result?.errors?.join('\n');
                Swal.fire({
                    text: errorMessages,
                    icon: "error",
                    type: "error"
                });
            }
        } catch (error) {
            const errorMessages = error?.response?.data?.errors?.join('\n');
            Swal.fire({
                text: errorMessages || error.message,
                icon: "error",
                type: "error"
            });
        } finally {
            setLoading(false);
        }
    }, [page, pageLimit, selectedDate])

    useEffect(() => {
        getExternalOrders()
    }, [getExternalOrders])

    const columns = [
        { field: 'order_number', headerName: 'Order No', width: 60, flex: 1, minWidth: 60 },
        { field: 'order_customer_name', headerName: 'Customer', width: 150, flex: 1, minWidth: 180 },
        { field: 'order_customer_po_number', headerName: 'Cust PO No', width: 150, flex: 1, minWidth: 150 },
        { field: 'order_delivery_address', headerName: 'Address', width: 180, flex: 1, minWidth: 180 },
        { field: 'order_city', headerName: 'City', width: 150, flex: 1, minWidth: 100 },
        {
            field: 'order_delivery_time', headerName: 'Time', width: 150, flex: 1, minWidth: 100, renderCell: (params) => (
                <MyDiv>{getFormattedDeliveryTime(params.row.order_delivery_time, params.row.order_delivery_session, "runs")}</MyDiv>
            )
        },
        {
            field: 'order_overall_price', headerName: 'Order Value', width: 150, flex: 1, minWidth: 100, renderCell: (params) => (
                <CurrencyDisplay value={params.value} currency="AUD" locale="en-US" />
            )
        },
        { field: 'order_length', headerName: 'Length', width: 80, flex: 1, minWidth: 80 },
        { field: 'order_master_rack', headerName: 'Rack', width: 70, flex: 1, minWidth: 70 },
        { field: 'order_drivers_info', headerName: "Driver's Info", width: 100, flex: 1, minWidth: 130 },
        { field: 'order_loaders_info', headerName: "Loader's Info", width: 100, flex: 1, minWidth: 130 },
        {
            field: 'order_crane_lift_checker', headerName: "Crane Lift", width: 80, flex: 1, minWidth: 80, renderCell: (params) => (
                <MyDiv> {params.row.order_crane_lift_checker ? "Yes" : "No"} </MyDiv>
            )
        },
        { field: 'order_docket', headerName: "Docket", width: 80, flex: 1, minWidth: 90, renderCell: (params) => <FileUploadCell rowId={params.row._id} value={params.value} setLoading={setLoading} getOrders={getExternalOrders} /> },
        {
            field: 'action',
            headerName: 'Action',
            width: 80,
            minWidth: 80,
            sortable: false,
            headerAlign: 'center',
            flex: 1,
            renderCell: (params) => (
                <MyDiv className="d-flex justify-content-evenly">
                    <Tooltip title="Edit">
                        <IconButton aria-label="fingerprint" color="success" onClick={(e) => handleEdit(params.row)} >
                            <MdOutlineModeEditOutline />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                        <IconButton aria-label="fingerprint" color="error" onClick={(e) => handleDelete(params.row._id)} >
                            <MdDelete />
                        </IconButton>
                    </Tooltip>
                </MyDiv>
            ),
        },
    ];

    const handleAddTruck = () => {
        handleDrawerToggle();
        setRowData({});
    }

    const onFilter = (e) => {
        e.preventDefault();
    }

    const handleResponse = () => {
        getExternalOrders()
    }

    const handleDelete = async (rowId) => {
        const url = `${API_BASE_URL}delete-ext-order/${rowId}`;

        const result = await Swal.fire({
            title: "Are you sure?",
            text: "This will permanently deleted from here.",
            icon: "warning",
            showCancelButton: true,
            confirmButtonText: "Yes",
            cancelButtonText: "Cancel",
            reverseButtons: true,
            customClass: {
            confirmButton: "primary-btn",
            cancelButton: "secondary-btn",
            },
        });

        if (result.isConfirmed) {
            try {
                const response = await axios.delete(
                    url,
                    {
                        headers: {
                            "x-access-token": localStorage.getItem("token"),
                            Accept: "application/json",
                            "Content-Type": "application/json",
                        },
                    }
                );
                Swal.fire({
                    text: response.data || "Image deleted successfully",
                    icon: "success",
                });
                getExternalOrders();
            } catch (error) {
                Swal.fire({
                    text: error.response.data,
                    icon: "error",
                });
            }
        }
    };

    return (
        <React.Fragment>
            <Row className="GeneralHeading withBackArrow">
                <Col md={9} xs={2} >
                    <HeadingTwo><Link className="arrow-btn" onClick={() => navigate(-1)}><MdKeyboardArrowLeft /></Link>Manage External Orders</HeadingTwo>
                </Col>
                <Col md={3} xs={10} className="text-end">
                    <Button onClick={(e) => handleAddTruck()} className="btn primary-btn">Add Order</Button>
                </Col>
            </Row>
            <Row className='SearchBar GeneralHeading mt-2'>
                <Col md={12} >

                    <Row>

                        <Col lg={2} md={4} className="SearchTextBox">
                            <form onSubmit={(e) => onFilter(e)}>
                                <TextField onKeyDown={(e) => searchHandle(e)} onChange={(e) => {
                                    setSearchText(e.target.value)
                                    if (e.target.value.length === 0) {
                                        getExternalOrders(e.target.value)
                                    }
                                }} className='textarea' id="search_text" placeholder="Enter Search Text Here...." value={searchText} variant="standard" />
                            </form>
                        </Col>
                        <Col lg={2} md={4} className="SearchTextBox dateRangePicker">
                            <LocalizationProvider dateAdapter={AdapterLuxon}>
                                <DatePicker
                                    label="Delivery Date"
                                    value={selectedDate}
                                    onChange={handleDateChange}
                                    format="yyyy-MM-dd"
                                    slotProps={{ textField: { size: 'small', variant: 'outlined' } }}
                                />
                            </LocalizationProvider>
                        </Col>
                        <Col lg={4} md={4} className="SearchTextBox">
                            <Tooltip title="Sample Document">
                                <IconButton aria-label="Sample Document" color="success" component="a" href={sampleDocument} download="External-Orders-format.xlsx">
                                    <SiMicrosoftexcel />
                                </IconButton>
                            </Tooltip>
                        </Col>
                        <Col lg={4} md={4}>
                            <ExternalOrdersBulkUpload handleResponse={handleResponse} />
                        </Col>
                    </Row>

                </Col>
            </Row>
            <Row className='mt-2'>
                <CustomDataGrid
                    rows={data?.length > 0 ? data : []} // Access data for the grid
                    columns={columns}
                    loading={loading} // Set loading state here
                    disableSelectionOnClick={true} // Disable row selection on click
                    autoHeight={true} // Set to true if you want the grid to adjust its height automatically
                    getRowId={(row) => row._id} // Unique ID for each row
                    onPageChange={(newPage) => setPage(newPage)} // Handle page change
                    onPageSizeChange={(newPageLimit) => setPageLimit(newPageLimit)} // Handle page size change
                    page={page} // Current page
                    pageLimit={pageLimit} // Current page size
                    total={total} // Total number of rows
                // onRowClick={(params) => navigate(`/transport/trucks/${params.row._id}`)}
                />
            </Row>
            <Drawer anchor="right" open={drawerState} onClose={() => handleDrawerToggle()}>
                <FormOrder
                    handleClose={handleDrawerToggle}
                    rowData={rowData}
                />
            </Drawer>
        </React.Fragment>
    );
}

const FileUploadCell = ({ rowId, setLoading, value, getOrders }) => {

    const handleFileSelect = e => {
        handleSubmit(e, Array.from(e.target.files))
    };

    const handleRemove = async (index) => {
        const url = `${API_BASE_URL}delete-docket-ext-orders/${rowId}/${index}`;
        try {
            const response = await axios.delete(
                url,
                {
                    headers: {
                        "x-access-token": localStorage.getItem("token"),
                        Accept: "application/json",
                        "Content-Type": "application/json",
                    },
                }
            );
            Swal.fire({
                text: response.data || "Image deleted successfully",
                icon: "success",
            });
            getOrders();
        } catch (error) {
            Swal.fire({
                text: error.response.data,
                icon: "error",
            });
        }
    };

    const handleSubmit = (e, selectedFiles) => {
        e.preventDefault();
        setLoading(true);
        const formData = new FormData();
        selectedFiles.forEach(file => {
            formData.append("documents", file);
        });

        const url = API_BASE_URL + "upload-docket-ext-orders/" + rowId;
        axios
            .patch(url, formData, {
                headers: {
                    "x-access-token": localStorage.getItem("token"),
                    Accept: "application/json",
                    "Content-Type": "multipart/form-data",
                },
            })
            .then(res => {
                if (res.status === 200) {
                    Swal.fire({
                        text: "Successfully Saved",
                        icon: "success",
                    });
                    getOrders()
                }
                setLoading(false)
            })
            .catch(error => {
                Swal.fire({
                    text: error.response?.data || "An error occurred",
                    icon: "error",
                });
            })
            .finally(() => {
                setLoading(false);
            });
    };

    return (
        <Box display="flex" alignItems="center" gap={0.5}>
            {!value.length ? (
                <IconButton component="label" size="small">
                    <MdUpload />
                    <input
                        hidden
                        type="file"
                        accept="application/pdf,image/*"
                        id="document"
                        name="document"
                        onChange={handleFileSelect}
                    />
                </IconButton>
            ) : (
                value.map((file, index) => (
                    <React.Fragment key={index}>
                        <a href={file.url} download target="_blank" rel="noopener noreferrer" title="Download">
                            <MdFilePresent fontSize={25} title={file.key} />
                        </a>
                        <Tooltip title="Remove">
                            <IconButton size="small" onClick={() => handleRemove(index)}>
                                <MdClose fontSize={15} />
                            </IconButton>
                        </Tooltip>
                    </React.Fragment>
                ))
            )}
        </Box>
    );
};


export default ExternalOrders;