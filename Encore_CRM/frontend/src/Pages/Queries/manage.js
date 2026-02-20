import React, { useState, useEffect } from 'react';
import { Row, Col, Badge } from "react-bootstrap";
import { HeadingTwo, MyDiv, HeadingFour } from "../Common/Components";
import { MdKeyboardArrowLeft } from "react-icons/md";
import { Link, useNavigate } from "react-router-dom";
import { TableBody, Table, TableContainer, TableHead, TableRow, TableCell, Drawer, Button, TextField, Box, Tooltip, IconButton } from "@mui/material";
import { MdOutlineModeEditOutline } from "react-icons/md"
import axios from 'axios';
import NoDataFound from '../Common/noDataFound';
// import FormModules from './form';
import swal from "sweetalert2";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function QueriesManage() {
    const [data, setData] = useState('');
    const [moduless, setModuless] = useState('');
    const [loading, setLoading] = useState(false);

    let navigate = useNavigate();
    useEffect(() => {
        loadModuless();
    }, []);

    const loadModuless = async () => {
        setLoading(true);
        const url = API_BASE_URL + `fetch-modules-data`;
        axios.get(url, { headers: { "x-access-token": localStorage.getItem("token"), 'Accept': 'application/json', 'Content-Type': 'application/json' } })

            .then(res => {
                setModuless(res.data)
            },
                (error) => {
                    swal.fire({
                        text: error.response.message,
                        icon: 'error',
                        type: 'error',
                    });
                })
        setLoading(false);
    }

    /* Search Module */
    const [searchData, setSearchData] = useState({})

    function searchHandle(e) {
        const searchNewData = { ...searchData }
        searchNewData[e.target.id] = e.target.value
        setSearchData(searchNewData)
    }

    function searchSubmit(e) {
        e.preventDefault();

    }

    const [modulesDrawerState, setModulesDrawerState] = React.useState(false);
    const handleModulesDrawerToggle = () => {
        setData();
        modulesDrawerState === false ? setModulesDrawerState(true) : setModulesDrawerState(false)
    }
    const modulesEditId = (_id) => {
        modulesDrawerState === false ? setModulesDrawerState(true) : setModulesDrawerState(false);
        setData(_id);
    }
    const updateDrawer = () => {
        modulesDrawerState === false ? setModulesDrawerState(true) : setModulesDrawerState(false)
        loadModuless();
    };

    return (
        <React.Fragment>
            <Row className="GeneralHeading withBackArrow">
                <Col md={6} xs={6} >
                    <HeadingTwo><Link className="arrow-btn" onClick={() => navigate(-1)}><MdKeyboardArrowLeft /></Link>Manage Modules</HeadingTwo>
                </Col>
                <Col md={6} xs={6} className="text-end">
                    <Button onClick={(e) => handleModulesDrawerToggle()} className="btn primary-btn mx-1">Add Modules</Button>
                </Col>
            </Row>
            <Row className='SearchBar GeneralHeading mt-3 hide'>
                <Col md={12} >
                    <form onSubmit={(e) => searchSubmit(e)}>
                        <Row>
                            <Col md={6} className="SearchTextBox">
                                <TextField onChange={(e) => searchHandle(e)} className='textarea' required id="search_text" placeholder="Enter Search Text Here...." value={searchData.search_text} variant="standard" />
                            </Col>
                            <Col md={6} className="text-start">
                                <button className="btn primary-btn add-cta search mx-1">Search</button>
                            </Col>
                        </Row>
                    </form>
                </Col>
            </Row>
            <Row >
                <Col md={12} >
                    {loading ? (
                        <HeadingFour className="text-center">Loading...</HeadingFour>) :
                        <MyDiv className="GeneralTable">
                            <TableContainer>
                                <Table className='bgGrey' aria-label="Modules table">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell align="left">Modules Name</TableCell>
                                            <TableCell align="left">Status</TableCell>
                                            <TableCell align="center">Action</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {moduless?.length
                                            ? moduless.map((item) => (
                                                <React.Fragment key={item._id}>
                                                    <TableRow >
                                                        <TableCell align="left" component="th" scope="row" >
                                                            {item.modules_Name}
                                                        </TableCell>
                                                        <TableCell align="left">
                                                            <MyDiv> {item.modules_Status === 'active' ? <Badge bg='success' text="light">Active</Badge> : <Badge bg='danger' text="light">InActive</Badge>} </MyDiv>
                                                        </TableCell>
                                                        <TableCell align="center">
                                                            <Box className="custom-flex">
                                                                <Tooltip title="Edit">
                                                                    <IconButton aria-label="fingerprint" color="success" onClick={(e) => modulesEditId(item._id)} >
                                                                        <MdOutlineModeEditOutline />
                                                                    </IconButton>
                                                                </Tooltip>
                                                            </Box>
                                                        </TableCell>
                                                    </TableRow>
                                                </React.Fragment>
                                            )) : <TableRow><TableCell colSpan={8}><NoDataFound /></TableCell></TableRow>}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </MyDiv>
                    }
                </Col>
            </Row>
            {/* <Drawer anchor="right" open={modulesDrawerState} onClose={() => handleModulesDrawerToggle(false)} disableClose="false" >
                <FormModules handleClose={updateDrawer} modulesInfo={data} />
            </Drawer> */}
        </React.Fragment>
    );
}

export default QueriesManage;