import React, { useState, useEffect, useCallback } from "react";
import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";
import Badge from "react-bootstrap/Badge";
import Card from "react-bootstrap/Card";
import { TableContainer, Table, TableHead, TableBody, TableRow, TableCell, Box, IconButton, Tooltip, Drawer, Button } from "@mui/material";
import { Link, useNavigate, useParams } from "react-router-dom";

import axios from "axios";
import swal from "sweetalert2";
import { MdKeyboardArrowLeft, MdOutlineModeEditOutline } from "react-icons/md";
import { HeadingFour, MyDiv, LabelTag, SpanTag, HeadingTwo, Avatar } from "../../Common/Components";
import NoDataFound from "../../Common/noDataFound";
import FormSubDepartment from "./formSubDept";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function DepartmentDetail() {
  const [loading, setLoading] = useState(false);
  const [depart, setDept] = useState([]);
  const [data, setData] = useState("");
  let navigate = useNavigate();
  const [subDept, setSubDept] = useState([]);
  let { id } = useParams();

  const loadSpecificDept = useCallback(async () => {
    setLoading(true);
    const url = `${API_BASE_URL}fetch-specific-department-data/${id}`;
    try {
      const response = await axios.get(url, {
        headers: {
          "x-access-token": localStorage.getItem("token"),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });
      setDept(response.data);
    } catch (error) {
      swal.fire({
        text: error.response?.data || "Failed to load department",
        icon: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadSpecificSubDept = useCallback(async () => {
    setLoading(true);
    const url = `${API_BASE_URL}fetch-department-child-data/${id}`;
    try {
      const response = await axios.get(url, {
        headers: {
          "x-access-token": localStorage.getItem("token"),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });
      setSubDept(response.data);
    } catch (error) {
      swal.fire({
        text: error.response?.data || "Failed to load sub-department",
        icon: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadSpecificDept();
    loadSpecificSubDept();
  }, [loadSpecificDept, loadSpecificSubDept]);

  const [subDepartDrawerState, setSubDeptDrawerState] = useState(false);

  const handleSubDeptDrawerToggle = () => {
    setData();
    setSubDeptDrawerState(!subDepartDrawerState);
  };

  const subDepartEditId = _id => {
    setSubDeptDrawerState(!subDepartDrawerState);
    setData(_id);
  };

  const updateSubDeptDrawer = () => {
    setSubDeptDrawerState(!subDepartDrawerState);
    loadSpecificSubDept();
  };

  return (
    <React.Fragment>
      {loading ? (
        <HeadingFour className="text-center">Loading...</HeadingFour>
      ) : (
        <>
          {depart.length ? (
            depart.map(item => (
              <React.Fragment key={item._id}>
                <Row>
                  {/* Dept basic Details start */}
                  <Col md={12} className="mb-4 p-0">
                    <MyDiv className="ProfileBasicDetail user-profile">
                      <Card className="ProfileBasicDetailLeftHeader">
                        <Row>
                          <Link className="arrow-btn" onClick={() => navigate(-1)}>
                            <MdKeyboardArrowLeft />
                          </Link>
                          <Col md={2} className="text-center">
                            <MyDiv className="profileImageUploader">
                              <Avatar round="100px" size="120" name={item.department_name} src="" />
                            </MyDiv>
                          </Col>
                          <Col md={4} className="text-start">
                            <MyDiv className="ProfileCard">
                              <Row>
                                <Col md={5}>
                                  <LabelTag>Department Name</LabelTag>
                                </Col>
                                <Col md={7}>
                                  <SpanTag>{item.department_name}</SpanTag>
                                </Col>
                              </Row>
                              <Row>
                                <Col md={5}>
                                  <LabelTag>Department Code</LabelTag>
                                </Col>
                                <Col md={7}>
                                  <SpanTag>{item.department_code}</SpanTag>
                                </Col>
                              </Row>
                              <Row>
                                <Col md={5}>
                                  <LabelTag>Department Code</LabelTag>
                                </Col>
                                <Col md={7}>
                                  <SpanTag>
                                    {item.department_status === "active" ? (
                                      <Badge bg="success" text="light">
                                        Active
                                      </Badge>
                                    ) : (
                                      <Badge bg="danger" text="light">
                                        InActive
                                      </Badge>
                                    )}
                                  </SpanTag>
                                </Col>
                              </Row>
                            </MyDiv>
                          </Col>
                        </Row>
                      </Card>
                    </MyDiv>
                  </Col>
                  {/* Dept basic Details */}
                </Row>
                <Row className="GeneralHeading">
                  <Col md={6}>
                    <HeadingTwo>Manage Sub Department</HeadingTwo>
                  </Col>
                  <Col md={6} className="text-end">
                    <Button onClick={handleSubDeptDrawerToggle} className="btn primary-btn mx-1">
                      Add Sub Department
                    </Button>
                  </Col>
                </Row>
                <MyDiv className="GeneralTable">
                  <Row>
                    {subDept.length ? (
                      <TableContainer>
                        <Table className="bgGrey" aria-label="Color table">
                          <TableHead>
                            <TableRow>
                              <TableCell align="left">Sub Department Name</TableCell>
                              <TableCell align="left">Status</TableCell>
                              <TableCell align="center">Action</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {subDept.map(item => (
                              <React.Fragment key={item._id}>
                                <TableRow>
                                  <TableCell align="left" component="th" scope="row">
                                    {item.department_child_name}
                                  </TableCell>
                                  <TableCell align="left">
                                    <MyDiv>
                                      {item.department_child_status === "active" ? (
                                        <Badge bg="success" text="light">
                                          Active
                                        </Badge>
                                      ) : (
                                        <Badge bg="danger" text="light">
                                          InActive
                                        </Badge>
                                      )}
                                    </MyDiv>
                                  </TableCell>
                                  <TableCell align="center">
                                    <Box className="custom-flex">
                                      <Tooltip title="Edit">
                                        <IconButton aria-label="fingerprint" color="success" onClick={() => subDepartEditId(item._id)}>
                                          <MdOutlineModeEditOutline />
                                        </IconButton>
                                      </Tooltip>
                                    </Box>
                                  </TableCell>
                                </TableRow>
                              </React.Fragment>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    ) : (
                      <NoDataFound />
                    )}
                  </Row>
                </MyDiv>
              </React.Fragment>
            ))
          ) : (
            <NoDataFound />
          )}
        </>
      )}
      <Drawer anchor="right" open={subDepartDrawerState} onClose={handleSubDeptDrawerToggle}>
        <FormSubDepartment handleClose={updateSubDeptDrawer} subDepartInfo={data} />
      </Drawer>
    </React.Fragment>
  );
}

export default DepartmentDetail;
