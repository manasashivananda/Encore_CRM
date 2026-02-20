import React, { useState, useEffect } from "react";
import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";
import Badge from "react-bootstrap/Badge";
import { HeadingTwo, MyDiv, HeadingFour } from "../../Common/Components";
import { Link, useNavigate } from "react-router-dom";
import TableBody from "@mui/material/TableBody";
import Table from "@mui/material/Table";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Drawer from "@mui/material/Drawer";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import { MdOutlineModeEditOutline } from "react-icons/md";
import { IoMdArrowBack } from "react-icons/io";
import axios from "axios";
import NoDataFound from "../../Common/noDataFound";
import FormDepartment from "./form";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function DepartmentManage() {
  const [data, setData] = useState("");
  const [department, setDepartment] = useState("");
  const [loading, setLoading] = useState(false);

  let navigate = useNavigate();
  useEffect(() => {
    loadDepartment();
  }, []);

  const loadDepartment = async () => {
    setLoading(true);
    const url = API_BASE_URL + `fetch-department-data`;
    axios
      .get(url, { headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" } })
      .then(res => {
        setDepartment(res.data);
        setLoading(false);
      })
      .catch(error => {
        setLoading(false);
      });
    setLoading(false);
  };

  /* Search Module */
  const [searchData, setSearchData] = useState({});

  function searchHandle(e) {
    const searchNewData = { ...searchData };
    searchNewData[e.target.id] = e.target.value;
    setSearchData(searchNewData);
  }

  function searchSubmit(e) {
    e.preventDefault();
  }

  const [departmentDrawerState, setDepartmentDrawerState] = React.useState(false);
  const handleDepartmentDrawerToggle = () => {
    setData();
    departmentDrawerState === false ? setDepartmentDrawerState(true) : setDepartmentDrawerState(false);
  };
  const departmentEditId = _id => {
    departmentDrawerState === false ? setDepartmentDrawerState(true) : setDepartmentDrawerState(false);
    setData(_id);
  };
  const updateDrawer = () => {
    departmentDrawerState === false ? setDepartmentDrawerState(true) : setDepartmentDrawerState(false);
    loadDepartment();
  };

  return (
    <React.Fragment>
      <Row className="GeneralHeading withBackArrow">
        <Col md={6} xs={6}>
          <HeadingTwo>
            <Link className="arrow-btn" onClick={() => navigate(-1)}>
              <IoMdArrowBack />
            </Link>
            Manage Custom order Departments
          </HeadingTwo>
        </Col>
        <Col md={6} xs={6} className="text-end">
          <Button onClick={e => handleDepartmentDrawerToggle()} className="btn primary-btn mx-1">
            Add Department
          </Button>
        </Col>
      </Row>
      <Row className="SearchBar GeneralHeading mt-3 hide">
        <Col md={12}>
          <form onSubmit={e => searchSubmit(e)}>
            <Row>
              <Col md={6} className="SearchTextBox">
                <TextField onChange={e => searchHandle(e)} className="textarea" required id="search_text" placeholder="Enter Search Text Here...." value={searchData.search_text} variant="standard" />
              </Col>
              <Col md={6} className="text-start">
                <button className="btn primary-btn add-cta search mx-1">Search</button>
              </Col>
            </Row>
          </form>
        </Col>
      </Row>
      <Row>
        <Col md={12}>
          {loading ? (
            <HeadingFour className="text-center">Loading...</HeadingFour>
          ) : (
            <MyDiv className="GeneralTable">
              <TableContainer>
                <Table className="bgGrey" aria-label="Department table">
                  <TableHead>
                    <TableRow>
                      <TableCell align="left">Department Name</TableCell>
                      <TableCell align="left">Department Code</TableCell>
                      <TableCell align="left">Status</TableCell>
                      {/* <TableCell align="center">Action</TableCell> */}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {department?.length ? (
                      department.map(item => (
                        <React.Fragment key={item._id}>
                          <TableRow>
                            <TableCell align="left" component="th" scope="row">
                              <Link to={`${item._id}`}> {item.department_name}</Link>
                            </TableCell>
                            <TableCell align="left" component="th" scope="row">
                              {item.department_code}
                            </TableCell>
                            <TableCell align="left" component="th" scope="row">
                              <MyDiv>
                                <Badge bg="success" text="light">
                                  {item.department_status}
                                </Badge>
                              </MyDiv>
                            </TableCell>
                            <TableCell align="center" className="hide">
                              <Box className="custom-flex">
                                <Tooltip title="Edit">
                                  <IconButton aria-label="fingerprint" color="success" onClick={e => departmentEditId(item._id)}>
                                    <MdOutlineModeEditOutline />
                                  </IconButton>
                                </Tooltip>
                              </Box>
                            </TableCell>
                          </TableRow>
                        </React.Fragment>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={8}>
                          <NoDataFound />
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </MyDiv>
          )}
        </Col>
      </Row>
      <Drawer anchor="right" open={departmentDrawerState} onClose={handleDepartmentDrawerToggle} disableClose="false">
        <FormDepartment handleClose={updateDrawer} departmentInfo={data} />
      </Drawer>
    </React.Fragment>
  );
}

export default DepartmentManage;
