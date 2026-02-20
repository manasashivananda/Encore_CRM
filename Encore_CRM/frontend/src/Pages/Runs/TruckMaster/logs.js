import React, { useState, useEffect, useCallback } from 'react';
import { Row, Col, Card, Badge } from "react-bootstrap";
import { HeadingTwo, LabelTag, MyDiv, SpanTag } from "../../Common/Components";
import { MdKeyboardArrowLeft } from "react-icons/md";
import { Link, useNavigate, useParams } from "react-router-dom";
import {  Drawer, Button } from '@mui/material';
import CustomDataGrid from '../../Common/customDataGrid';
import Swal from 'sweetalert2';
import TruckMaintain from './logForm';
import { truckType } from '../../Common/staticjson';
import moment from 'moment';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function ManageTruckLogs() {
     let { id } = useParams();
    const navigate = useNavigate();
    const [data, setData] = useState([]);
    const [drawerState, setDrawerState] = React.useState(false);
    const [loading, setLoading] = useState(false);
    const [pageLimit, setPageLimit] = useState(10);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [truckInfo, setTruckInfo] = useState({})

    const handleDrawerToggle = () => {
        drawerState === false ? setDrawerState(true) : setDrawerState(false)
    }

    const handleClose = () =>{
        drawerState === false ? setDrawerState(true) : setDrawerState(false)
        getTruckLogList()
    }

    const getTruckLogList = useCallback(async () => {
        setLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}fetch-truck-log/${id}`, {
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
                setTruckInfo(result.truckInfo)
                setTotal(result.data?.length)
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
    },[id])

    useEffect(() => {
        getTruckLogList();
    }, [getTruckLogList]);

    const columns = [
        { field: 'from_date', headerName: 'From Date', width: 150, flex:1, minWidth: 100, renderCell : (params) => (moment(params.row.from_date).tz('Australia/Sydney').format('DD-MM-YYYY hh:mm a')) },
        { field: 'to_date', headerName: 'To Date', width: 150, flex:1, minWidth: 100, renderCell : (params) => (moment(params.row.to_date).tz('Australia/Sydney').format('DD-MM-YYYY hh:mm a')) },
        { field: 'description', headerName: 'Reason', width: 150, flex:1, minWidth: 100 },
        { field: 'amt', headerName: 'Amount', width: 150, flex:1, minWidth: 100},
    ];

    const handleLogTruckMaintenance = () => {
        handleDrawerToggle();
    }

    return (
        <React.Fragment>
            <Row className="GeneralHeading withBackArrow">
                <Col md={9} xs={2} >
                    <HeadingTwo><Link className="arrow-btn" onClick={() => navigate(-1)}><MdKeyboardArrowLeft /></Link>View Truck Logs</HeadingTwo>
                </Col>
                <Col md={3} xs={10} className="text-end">
                    <Button onClick={(e) => handleLogTruckMaintenance()} className="btn primary-btn">maintenance</Button>
                </Col>
            </Row>
                <MyDiv className="ProfileBasicDetail user-profile mt-3">
                <Card className="ProfileBasicDetailLeftHeader" >
                    <Row>
                        <Col md={4} className="text-start">
                        <MyDiv className="ProfileCard">
                            <Row>
                                <Col md={5}><LabelTag>Name</LabelTag></Col>
                                <Col md={7}><SpanTag>{truckInfo.name}</SpanTag></Col>
                            </Row>
                            <Row>
                                <Col md={5}><LabelTag>Reg No</LabelTag></Col>
                                <Col md={7}><SpanTag>{truckInfo.reg_no}</SpanTag></Col>
                            </Row>
                            <Row>
                                <Col md={5}><LabelTag>Max Length</LabelTag></Col>
                                <Col md={7}><SpanTag>{truckInfo.dimensions?.max_length} m</SpanTag></Col>
                            </Row>
                        </MyDiv>
                        </Col>
                        <Col md={4} className="text-start">
                        <MyDiv className="ProfileCard">
                            <Row>
                            <Col md={5}><LabelTag>Location</LabelTag></Col>
                            <Col md={7}><SpanTag>{truckInfo.location}</SpanTag></Col>
                            </Row>
                            <Row>
                            <Col md={5}><LabelTag>Type</LabelTag></Col>
                            <Col md={7}><SpanTag>{truckType.map((item) => item.value === truckInfo.type ? item.label : null).filter(Boolean).join(', ') || 'N/A'}</SpanTag></Col>
                            </Row>
                            <Row>
                            <Col md={5}><LabelTag>Status</LabelTag></Col>
                            <Col md={7}>
                                <SpanTag>
                                <Badge bg="success" text="light">
                                    {truckInfo.status}
                                </Badge>
                                </SpanTag>
                            </Col>
                            </Row>
                        </MyDiv>
                        </Col>
                    </Row>
                </Card>
                </MyDiv>
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
                <TruckMaintain  
                    handleClose={handleClose}
                    Id={id}
                />
            </Drawer>
        </React.Fragment>
    );
}

export default ManageTruckLogs;