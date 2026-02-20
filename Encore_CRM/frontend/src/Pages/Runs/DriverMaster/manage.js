import React, { useState, useEffect, useCallback } from 'react';
import { Row, Col, Badge } from "react-bootstrap";
import { HeadingTwo, MyDiv } from "../../Common/Components";
import { MdDelete, MdKeyboardArrowLeft, MdOutlineModeEditOutline } from "react-icons/md";
import { Link, useNavigate } from "react-router-dom";
import {  Drawer, TextField, Button, Tooltip, IconButton, Tab, Box, Tabs } from '@mui/material';
import CustomDataGrid from '../../Common/customDataGrid';
import Swal from 'sweetalert2';
import FormDriver from './form';
import { driverType } from '../../Common/staticjson';
import { MdOutlineSettingsBackupRestore } from "react-icons/md";
import axios from 'axios';


const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function ManageDrivers() {
    const navigate = useNavigate();
    const [data, setData] = useState([]);
    const [drawerState, setDrawerState] = React.useState(false);
    const [loading, setLoading] = useState(false);
    const [pageLimit, setPageLimit] = useState(10);
    const [page, setPage] = useState(0);
    const [total, setTotal] = useState(0);
    const [rowData, setRowData] = useState({});
    const [searchText, setSearchText] = useState('');
    const [activeTabState, setActiveTabState] = React.useState('active');
        
    const handleTabChange = (_, newTab) => {
        setActiveTabState(newTab);
    };

    const handleDrawerToggle = () => {
        drawerState === false ? setDrawerState(true) : setDrawerState(false)
    }

    const appendData = (newData) => {
        setData((prevData) => [...newData, ...prevData]);
    }

    const searchHandle = (e) => {
        setSearchText(e.target.value);
    }

    const getDriverList = useCallback(async () => {
        setLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}fetch-driver-list?page=${page}&limit=${pageLimit}&search_text=${searchText}&status=${activeTabState}`, {
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
            }else{
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
    },[searchText, page, pageLimit, activeTabState])

    useEffect(() => {
        getDriverList();
    }, [getDriverList]);

    const handleDelete = async (id) => {
        setLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}delete-driver/${id}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    "x-access-token": localStorage.getItem("token"),
                },
            });
            const result = await response.json();
            if (result.status) {
                Swal.fire({
                    text: result.message,
                    icon: "success",
                    type: "success"
                });
                getDriverList(searchText);
            } else {
                Swal.fire({
                    text: result.message,
                    icon: "warning",
                    type: "warning"
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
    }

    const handleRestore = async (data, type) => {
        setLoading(true);
        if(type=== "status")
            data.status = 'active'
        else
            data.onWork = !data.onWork
        try {
            const method ="PATCH" 
            const url = `${API_BASE_URL}update-driver/${data._id}`;
            const response = await axios({
                method,
                url,
                data: data,
                headers: {
                  "x-access-token": localStorage.getItem("token"),
                  'Accept': 'application/json',
                  'Content-Type': 'application/json'
                }
              });
            if (response.status) {
                getDriverList()
                Swal.fire({
                    text: response.data.message,
                    icon: "success",
                    type: "success"
                });
            } else {
                Swal.fire({
                    text: response.data.message,
                    icon: "warning",
                    type: "warning"
                });
            }
        }
        catch (error) {
            const errorMessages = error?.response?.data?.errors?.join('\n');
            Swal.fire({
                text: errorMessages || error.message,
                icon: "error",
                type: "error"
            });
        } finally {
            setLoading(false);
        }
    }

    const handleEdit = (item) => {
        handleDrawerToggle();
        setRowData(item);
    }

    const SteeringIcon = ({stroke = false}) => (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="black">
            <circle cx="12" cy="12" r="10" stroke="black" stroke-width="2" fill="none" />
            <circle cx="12" cy="12" r="2" fill="black" />
            <line x1="4.5" y1="9" x2="12" y2="12" stroke="black" stroke-width="2" />
            <line x1="19.5" y1="9" x2="12" y2="12" stroke="black" stroke-width="2" />
            <line x1="12" y1="12" x2="12" y2="20" stroke="black" stroke-width="2" />
            {stroke && <line x1="4" y1="4" x2="20" y2="20" stroke="red" stroke-width="3" />}
        </svg>
    );

    const columns = [
        { field: 'name', headerName: 'Name', width: 150, flex:1, minWidth: 100 },
        { field: 'phone', headerName: 'Phone', width: 150, flex:1, minWidth: 100 },
        { field: 'email', headerName: 'Email', width: 150, flex:1, minWidth: 100 },
        { field: 'work_location', headerName: 'Work Location', width: 150, flex:1, minWidth: 100 },
        { field: 'driver_type', headerName: 'Driver Type', width: 150, flex:1, minWidth: 100, renderCell: (params) => (
            <MyDiv> {driverType.map((item) => item.value === params.row.driver_type ? item.label : null).filter(Boolean)} </MyDiv>
        )},
        { field: 'address', headerName: 'Address', width: 150, flex:3, minWidth: 100 },
        { field: 'status', headerName: 'Status', width: 100, flex:0, minWidth: 100, renderCell: (params) => (
            <MyDiv> {params.row.status === 'active' ? <Badge bg='success' text="light">Active</Badge> : <Badge bg='danger' text="light">In Active</Badge>} </MyDiv> 
        )},
        {
            field: 'action',
            headerName: 'Action',
            width: 150,
            minWidth: 100,
            sortable: false,
            headerAlign: 'center',
            flex:1,
            renderCell: (params) => (
                <MyDiv className="d-flex justify-content-evenly">
                    {activeTabState === "active" ? 
                <>
                    <Tooltip title={!params.row.onWork ? "Mark as On Work" : "Mark as Not On Work"}>
                        <IconButton aria-label="fingerprint" color="success" onClick={(e) => handleRestore(params.row, "onWork")} >
                            <SteeringIcon stroke={!params.row.onWork}/>
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Edit">
                        <IconButton aria-label="fingerprint" color="success" onClick={(e) => handleEdit(params.row)} >
                            <MdOutlineModeEditOutline />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                        <IconButton aria-label="fingerprint" color="error" onClick={(e) => handleDelete(params.row._id)} >
                            <MdDelete/>
                        </IconButton>
                    </Tooltip>
                </> :
                <Tooltip title="Restore">
                    <IconButton aria-label="fingerprint" color="success" onClick={(e) => handleRestore(params.row, "status")} >
                        <MdOutlineSettingsBackupRestore />
                    </IconButton>
                </Tooltip>
                }
                </MyDiv>
            ),
        },
    ];

    const handleAddDriver = () => {
        handleDrawerToggle();
        setRowData({});
    }

    const onFilter = (e) => {
        e.preventDefault();
        getDriverList(searchText);
    }

    const tabs = [
        {
            key: 'active',
            title: 'Active',
        },
        {
            key: 'inactive',
            title: 'Deleted',
        },
    ]

    const getRowClassName = (params) => !params.row.onWork ? 'super-active-row' : ''
    

    return (
        <React.Fragment>
            <Row className="GeneralHeading withBackArrow">
                <Col md={9} xs={2} >
                    <HeadingTwo><Link className="arrow-btn" onClick={() => navigate(-1)}><MdKeyboardArrowLeft /></Link>Manage Drivers</HeadingTwo>
                </Col>
                <Col md={3} xs={10} className="text-end">
                    <Button onClick={(e) => handleAddDriver()} className="btn primary-btn">Add Driver</Button>
                </Col>
            </Row>
            <Row className='SearchBar GeneralHeading mt-3'>
                <Col md={12} >
                    <form onSubmit={(e) => onFilter(e)}>
                        <Row>
                            <Col md={4} className="SearchTextBox">
                                <TextField onChange={(e) => searchHandle(e)} className='textarea' id="search_text" placeholder="Enter Search Text Here...." value={searchText} variant="standard" />
                            </Col>
                            
                        </Row>
                    </form>
                </Col>
            </Row>
            <Row className='GeneralHeading mt-3'>
                <Box sx={{ maxWidth: { xs: 320, md: 1400 }, backgroundColor: 'background.paper' }}>
                    <Tabs value={activeTabState} onChange={handleTabChange} variant="scrollable" scrollButtons="auto" TabIndicatorProps={{ sx: { backgroundColor: '#d22530' } }}
                                    sx={{ '& .MuiTab-root': { color: '#000' }, '& .Mui-selected': { color: '#d22530' } }}>
                        {tabs.map((tab) => (
                            <Tab value={tab.key} label={tab.title} key={tab.key} />
                        ))}
                    </Tabs>
                </Box>
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
                    getRowClassName={getRowClassName}
                />
            </Row>
            <Drawer anchor="right" open={drawerState} onClose={() => handleDrawerToggle()}>
                <FormDriver  
                    handleClose={handleDrawerToggle}
                    rowData={rowData}
                    appendData={appendData}
                />
            </Drawer>
        </React.Fragment>
    );
}

export default ManageDrivers;