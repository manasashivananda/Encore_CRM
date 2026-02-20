import React from 'react';
import { Row, Col, Badge } from "react-bootstrap";
import { Link } from "react-router-dom";
import {TableBody,Table,TableContainer,TableHead,TableRow,TableCell} from "@mui/material";
import {  HeadingTwo, MyDiv } from "../../Common/Components";



function UsersReport() {
    // const [data, setData] = useState('');

    // let navigate = useNavigate();
    // useEffect(() => {
    // }, []);

    //  /* Search Module */
    // const [searchData, setSearchData] = useState({ })
    // function searchHandle(e) {
    //     const searchNewData = { ...searchData }
    //     searchNewData[e.target.id] = e.target.value
    //     setSearchData(searchNewData)
    // }
    // function searchSubmit(e) {
    //     e.preventDefault();
    //     console.log('filterData', searchData);
    // }

    // const [employeeDrawerState, setEmployeeDrawerState] = React.useState(false);
    // const employeeEditId = (_id) => {
    //     employeeDrawerState === false ? setEmployeeDrawerState(true) : setEmployeeDrawerState(false)
    //     setData(_id);
    // }

    return (
        <React.Fragment>
             <Row className="GeneralHeading">
                <Col md={6} >
                    <HeadingTwo>User Report</HeadingTwo>
                </Col>
                <Col md={6} className="text-end">
                 
                </Col>
            </Row>
           
            <Row className="row GeneralTable">
                <TableContainer>
                    <Table className='bgGrey' aria-label="Employee table">
                        <TableHead>
                            <TableRow>
                                <TableCell align="left">Order Number</TableCell>
                                <TableCell align="left">Date</TableCell>
                                <TableCell align="left">Pieces</TableCell>
                                <TableCell align="left">Report Type</TableCell>
                                <TableCell align="left">Department</TableCell>
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
                                       89
                                    </TableCell>
                                    <TableCell align="left">
                                       Roll Process
                                    </TableCell>
                                    <TableCell align="left">
                                       All Department
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
                                       89
                                    </TableCell>
                                    <TableCell align="left">
                                       Roll Process
                                    </TableCell>
                                    <TableCell align="left">
                                       All Department
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
                                       89
                                    </TableCell>
                                    <TableCell align="left">
                                       Roll Process
                                    </TableCell>
                                    <TableCell align="left">
                                       All Department
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
                                       89
                                    </TableCell>
                                    <TableCell align="left">
                                       Roll Process
                                    </TableCell>
                                    <TableCell align="left">
                                       All Department
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
                                       89
                                    </TableCell>
                                    <TableCell align="left">
                                       Roll Process
                                    </TableCell>
                                    <TableCell align="left">
                                       All Department
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
                                       89
                                    </TableCell>
                                    <TableCell align="left">
                                       Roll Process
                                    </TableCell>
                                    <TableCell align="left">
                                       All Department
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
                                       89
                                    </TableCell>
                                    <TableCell align="left">
                                       Roll Process
                                    </TableCell>
                                    <TableCell align="left">
                                       All Department
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
                                       89
                                    </TableCell>
                                    <TableCell align="left">
                                       Roll Process
                                    </TableCell>
                                    <TableCell align="left">
                                       All Department
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

export default UsersReport;