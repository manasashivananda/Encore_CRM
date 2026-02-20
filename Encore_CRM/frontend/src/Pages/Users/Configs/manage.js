import React, { useState, useEffect, useCallback } from 'react';
import { Row, Col, Badge } from "react-bootstrap";
import { HeadingTwo, MyDiv } from "../../Common/Components";
import { MdDelete, MdKeyboardArrowLeft, MdOutlineModeEditOutline } from "react-icons/md";
import { Link, useNavigate } from "react-router-dom";
import {  Drawer, TextField, Button, Tooltip, IconButton } from '@mui/material';
import CustomDataGrid from '../../Common/customDataGrid';
import Swal from 'sweetalert2';
import FormDriver from './form';
import { region } from '../../Common/staticjson';


const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function ManageConfigs() {
    const navigate = useNavigate();
    const [data, setData] = useState([]);
    const [drawerState, setDrawerState] = React.useState(false);
    const [loading, setLoading] = useState(false);
    const [pageLimit, setPageLimit] = useState(10);
    const [page, setPage] = useState(0);
    const [total, setTotal] = useState(0);
    const [rowData, setRowData] = useState({});
    const [searchText, setSearchText] = useState('');

    const handleDrawerToggle = () => {
        drawerState === false ? setDrawerState(true) : setDrawerState(false)
    }

    const appendData = (newData) => {
        setData((prevData) => [...newData, ...prevData]);
    }

    const searchHandle = (e) => {
        setSearchText(e.target.value);
    }

    const getConfigList = useCallback(async () => {
        setLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}fetch-config-list?page=${page}&limit=${pageLimit}&search_text=${searchText}`, {
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
    },[searchText, page, pageLimit])

    useEffect(() => {
        getConfigList();
    }, [getConfigList]);

    const handleDelete = async (id) => {
        setLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}delete-config/${id}`, {
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
                getConfigList(searchText);
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

    const columns = [
        { field: 'name', headerName: 'Name', width: 150, flex:1, minWidth: 100 },
        { field: 'lat', headerName: 'Latitude', width: 150, flex:1, minWidth: 100 },
        { field: 'lon', headerName: 'Longitude', width: 150, flex:1, minWidth: 100 },
        { field: 'allowed_radius', headerName: 'Radius (KM)', width: 150, flex:1, minWidth: 100 },
        { field: 'region', headerName: 'Region', width: 150, flex:1, minWidth: 100, renderCell: (params) => (
            <MyDiv> {region.map((item) => item.value === params.row.region ? item.label : null).filter(Boolean)} </MyDiv>
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
                </MyDiv>
            ),
        },
    ];

    const handleAddConfig = () => {
        handleDrawerToggle();
        setRowData({});
    }

    const onFilter = (e) => {
        e.preventDefault();
        getConfigList(searchText);
    }

    return (
        <React.Fragment>
            <Row className="GeneralHeading withBackArrow">
                <Col md={9} xs={2} >
                    <HeadingTwo><Link className="arrow-btn" onClick={() => navigate(-1)}><MdKeyboardArrowLeft /></Link>Manage Configurations</HeadingTwo>
                </Col>
                <Col md={3} xs={10} className="text-end">
                    <Button onClick={(e) => handleAddConfig()} className="btn primary-btn">Add Config</Button>
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

export default ManageConfigs;