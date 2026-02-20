import React, { useState, useEffect } from 'react';
import { Row, Col, Badge } from "react-bootstrap";
import { HeadingTwo, MyDiv, Avatar } from "../../Common/Components";
import { Link, useNavigate } from "react-router-dom";
import { TableBody, Table, TableContainer, TableHead, TableRow, TableCell } from "@mui/material";



const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function CustomerInsightsManage() {
    const [data, setData] = useState('');

    let navigate = useNavigate();
    useEffect(() => {
    });

    /* Search Module */
    const [searchData, setSearchData] = useState({})

    function searchHandle(e) {
        const searchNewData = { ...searchData }
        searchNewData[e.target.id] = e.target.value
        setSearchData(searchNewData)
    }

    function searchSubmit(e) {
        e.preventDefault();
       // console.log('filterData', searchData);
    }

    const [employeeDrawerState, setEmployeeDrawerState] = React.useState(false);
    const employeeEditId = (_id) => {
        employeeDrawerState === false ? setEmployeeDrawerState(true) : setEmployeeDrawerState(false)
        setData(_id);
    }

    return (
        <React.Fragment>
            <Row className="GeneralHeading">
                <Col md={12} >
                    <HeadingTwo>Orders</HeadingTwo>
                </Col>
            </Row>           
            <Row className="row GeneralTable">
                <TableContainer>
                    <Table className='bgGrey' aria-label="Employee table">
                        <TableHead>
                            <TableRow>
                                <TableCell align="left">Order Number</TableCell>
                                <TableCell align="left">Date</TableCell>
                                <TableCell align="left">Amount</TableCell>
                                <TableCell align="left">Status</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            <React.Fragment >
                                <TableRow >
                                    <TableCell align="left" component="th" scope="row">
                                        <Link to="detail">
                                            ORD-00011212
                                        </Link>
                                    </TableCell>
                                    <TableCell align="left">
                                        12-05-2023
                                    </TableCell>
                                    <TableCell align="left">
                                        $3000/-
                                    </TableCell>
                                    <TableCell align="left">
                                        <MyDiv><Badge bg='success' text="light">Completed</Badge>  </MyDiv>
                                    </TableCell>
                                </TableRow>
                                <TableRow >
                                    <TableCell align="left" component="th" scope="row">
                                        <Link to="detail">
                                            ORD-00011212
                                        </Link>
                                    </TableCell>
                                    <TableCell align="left">
                                        12-05-2023
                                    </TableCell>
                                    <TableCell align="left">
                                        $3000/-
                                    </TableCell>
                                    <TableCell align="left">
                                        <MyDiv><Badge bg='success' text="light">Completed</Badge>  </MyDiv>
                                    </TableCell>
                                </TableRow>
                                <TableRow >
                                    <TableCell align="left" component="th" scope="row">
                                        <Link to="detail">
                                            ORD-00011212
                                        </Link>
                                    </TableCell>
                                    <TableCell align="left">
                                        12-05-2023
                                    </TableCell>
                                    <TableCell align="left">
                                        $3000/-
                                    </TableCell>
                                    <TableCell align="left">
                                        <MyDiv><Badge bg='success' text="light">Completed</Badge>  </MyDiv>
                                    </TableCell>
                                </TableRow>
                                <TableRow >
                                    <TableCell align="left" component="th" scope="row">
                                        <Link to="detail">
                                            ORD-00011212
                                        </Link>
                                    </TableCell>
                                    <TableCell align="left">
                                        12-05-2023
                                    </TableCell>
                                    <TableCell align="left">
                                        $3000/-
                                    </TableCell>
                                    <TableCell align="left">
                                        <MyDiv><Badge bg='success' text="light">Completed</Badge>  </MyDiv>
                                    </TableCell>
                                </TableRow>
                                <TableRow >
                                    <TableCell align="left" component="th" scope="row">
                                        <Link to="detail">
                                            ORD-00011212
                                        </Link>
                                    </TableCell>
                                    <TableCell align="left">
                                        12-05-2023
                                    </TableCell>
                                    <TableCell align="left">
                                        $3000/-
                                    </TableCell>
                                    <TableCell align="left">
                                        <MyDiv><Badge bg='success' text="light">Completed</Badge>  </MyDiv>
                                    </TableCell>
                                </TableRow>
                                <TableRow >
                                    <TableCell align="left" component="th" scope="row">
                                        <Link to="detail">
                                            ORD-00011212
                                        </Link>
                                    </TableCell>
                                    <TableCell align="left">
                                        12-05-2023
                                    </TableCell>
                                    <TableCell align="left">
                                        $3000/-
                                    </TableCell>
                                    <TableCell align="left">
                                        <MyDiv><Badge bg='success' text="light">Completed</Badge>  </MyDiv>
                                    </TableCell>
                                </TableRow>
                                <TableRow >
                                    <TableCell align="left" component="th" scope="row">
                                        <Link to="detail">
                                            ORD-00011212
                                        </Link>
                                    </TableCell>
                                    <TableCell align="left">
                                        12-05-2023
                                    </TableCell>
                                    <TableCell align="left">
                                        $3000/-
                                    </TableCell>
                                    <TableCell align="left">
                                        <MyDiv><Badge bg='success' text="light">Completed</Badge>  </MyDiv>
                                    </TableCell>
                                </TableRow>
                                <TableRow >
                                    <TableCell align="left" component="th" scope="row">
                                        <Link to="detail">
                                            ORD-00011212
                                        </Link>
                                    </TableCell>
                                    <TableCell align="left">
                                        12-05-2023
                                    </TableCell>
                                    <TableCell align="left">
                                        $3000/-
                                    </TableCell>
                                    <TableCell align="left">
                                        <MyDiv><Badge bg='success' text="light">Completed</Badge>  </MyDiv>
                                    </TableCell>
                                </TableRow>
                            </React.Fragment>
                        </TableBody>
                    </Table>
                </TableContainer>
            </Row>
            {/* <Drawer anchor="right" open={employeeDrawerState} onClose={() => handleEmployeeDrawerToggle(false)} >
                <FormEmployee handleClose={updateDrawer} employeeEditId={data} props />
            </Drawer> */}
        </React.Fragment>
    );
}

export default CustomerInsightsManage;