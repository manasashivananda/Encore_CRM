import React, { useState, useEffect, useCallback } from 'react';
import { Row, Col, Badge } from "react-bootstrap";
import { HeadingTwo, MyDiv } from "../../Common/Components";
import { MdDelete, MdKeyboardArrowLeft, MdOutlineModeEditOutline, MdRemoveRedEye } from "react-icons/md";
import { Link, useNavigate } from "react-router-dom";
import {  Drawer, TextField, Button, Tooltip, IconButton, Box, Tabs, Tab } from '@mui/material';
import CustomDataGrid from '../../Common/customDataGrid';
import Swal from 'sweetalert2';
import FormTruck from './form';
import { truckType } from '../../Common/staticjson';
import axios from 'axios';
import { MdOutlineSettingsBackupRestore } from "react-icons/md";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function ManageTrucks() {
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

    const appendData = () => {
        getTruckList()
    }

    const searchHandle = (e) => {
        setSearchText(e.target.value);
    }

    const getTruckList = useCallback(async () => {
        setLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}fetch-truck-list?page=${page}&limit=${pageLimit}&search_text=${searchText}&status=${activeTabState}`, {
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
        getTruckList();
    }, [getTruckList]);

    const handleDelete = async (id) => {
        setLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}delete-truck/${id}`, {
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
                getTruckList(searchText);
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

    const handleEdit = (item) => {
        handleDrawerToggle();
        setRowData(item);
    }

    const handleRestore = async (data) => {
            setLoading(true);
            data.status = 'active'
            try {
                const method ="PATCH" 
                const url = `${API_BASE_URL}update-truck/${data._id}`;
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
                    getTruckList()
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

    const columns = [
        { field: 'reg_no', headerName: 'Reg No', width: 150, flex:1, minWidth: 100 },
        { field: 'name', headerName: 'Name', width: 150, flex:1, minWidth: 100 },
        { field: 'driver_name', headerName: 'Driver Name', width: 150, flex:1, minWidth: 100, renderCell: (params) => {
            const driver_info = params.row?.driver_info || {};
            const { name } = driver_info;
            params.row.driver_name = name
            return <MyDiv>{params.row.driver_name || '-'}</MyDiv>
        }},
        { field: 'dimensions', headerName: 'L x W (m)', width: 150, flex:1, minWidth: 100, renderCell: (params) => {
            const dim = params.row.dimensions || {};
            const { length, width } = dim;
            return <MyDiv>{length && width ? `${length}m x ${width}m` : 'N/A'}</MyDiv>;
        }},
        { field: 'max_length', headerName: 'Max Length (m)', width: 150, flex:1, minWidth: 100, renderCell: (params) => {
            const dim = params.row.dimensions || {};
            const { max_length } = dim;
            params.row.max_length = max_length
            return <MyDiv>{params.row.max_length + 'm' || 'N/A'}</MyDiv>;
        }},
        { field: 'location', headerName: 'Location', width: 150, flex:1, minWidth: 100 },
        { field: 'type', headerName: 'Type', width: 150, flex:1, minWidth: 100, renderCell: (params) => (
           <MyDiv> {truckType.map((item) => item.value === params.row.type ? item.label : null).filter(Boolean).join(', ') || 'N/A'} </MyDiv>
        )},
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
                <Link to={`${params.row._id}`}>
                    <Tooltip title="View Logs">
                        <IconButton aria-label="fingerprint" color="secondary" >
                            <MdRemoveRedEye/>
                        </IconButton>
                    </Tooltip>
                </Link>
                </> : 
                <Tooltip title="Restore">
                    <IconButton aria-label="fingerprint" color="success" onClick={(e) => handleRestore(params.row)} >
                        <MdOutlineSettingsBackupRestore />
                    </IconButton>
                </Tooltip>
            }
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
        getTruckList(searchText);
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

    return (
        <React.Fragment>
            <Row className="GeneralHeading withBackArrow">
                <Col md={9} xs={2} >
                    <HeadingTwo><Link className="arrow-btn" onClick={() => navigate(-1)}><MdKeyboardArrowLeft /></Link>Manage Trucks</HeadingTwo>
                </Col>
                <Col md={3} xs={10} className="text-end">
                    <Button onClick={(e) => handleAddTruck()} className="btn primary-btn">Add Truck</Button>
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
                    // onRowClick={(params) => navigate(`/transport/trucks/${params.row._id}`)}
                />
            </Row>
            <Drawer anchor="right" open={drawerState} onClose={() => handleDrawerToggle()}>
                <FormTruck  
                    handleClose={handleDrawerToggle}
                    rowData={rowData}
                    appendData={appendData}
                />
            </Drawer>
        </React.Fragment>
    );
}

export default ManageTrucks;