import React, { useState, useEffect, useCallback } from "react";
import { Row, Col, Badge } from "react-bootstrap";
import { HeadingTwo, HeadingFour, MyDiv } from "../../Common/Components";
import { MdKeyboardArrowLeft, MdOutlineModeEditOutline } from "react-icons/md";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { TableBody, Table, TableContainer, TableHead, TableRow, TableCell, Box, IconButton, Tooltip, Drawer, Button, Pagination } from "@mui/material";
import { BiCheckShield } from "react-icons/bi";
import axios from "axios";
import swal from "sweetalert2";
import FormRoles, { initialDept } from "./form";
import FormRolePermission from "./form-permission";
import NoDataFound from "../../Common/noDataFound";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function ManageRoles() {
  let location = useLocation();
  let navigate = useNavigate();
  const [roles, setRoles] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState("");
  const [pageCount, setPageCount] = useState(1);
  const [currentPage, setCurrentPage] = useState(parseInt(new URLSearchParams(location.search).get("page")) ? parseInt(new URLSearchParams(location.search).get("page")) : 1);

  const loadRoles = useCallback(async () => {
    setLoading(true);
    const url = `${API_BASE_URL}fetch-role-data?page=${currentPage - 1}`;
    try {
      const response = await axios.get(url, { headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" } });
      setRoles(response.data.fetchedItems);
      setPageCount(response.data.totalPages);
    } catch (error) {
      swal.fire({
        text: error.response.data,
        icon: "error",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [currentPage]);

  useEffect(() => {
    loadRoles();
  }, [loadRoles]);

  const [roleDrawerState, setRoleDrawerState] = React.useState(false);
  const handleRoleDrawerToggle = () => {
    setData();
    roleDrawerState === false ? setRoleDrawerState(true) : setRoleDrawerState(false);
  };
  const roleEditId = _id => {
    roleDrawerState === false ? setRoleDrawerState(true) : setRoleDrawerState(false);
    setData(_id);
  };
  const updateDrawer = () => {
    roleDrawerState === false ? setRoleDrawerState(true) : setRoleDrawerState(false);
    loadRoles();
  };

  const [permissionDrawerState, setPermissionDrawerState] = React.useState(false);

  const handlePermissionDrawerToggle = () => {
    if (permissionDrawerState) {
      setData(null);
    }
    setPermissionDrawerState(prev => !prev);
  };
  const roleAddPermissions = id => {
    permissionDrawerState === false ? setPermissionDrawerState(true) : setPermissionDrawerState(false);
    setData(id);
  };
  const updatePermissionDrawer = () => {
    permissionDrawerState === false ? setPermissionDrawerState(true) : setPermissionDrawerState(false);
    loadRoles();
  };
  const handlePageChange = (event, value) => {
    setCurrentPage(value);
    navigate(`?page=${value}`);
  };
  return (
    <React.Fragment>
      <Row className="GeneralHeading withBackArrow">
        <Col md={6} xs={6}>
          <HeadingTwo>
            <Link className="arrow-btn" onClick={() => navigate(-1)}>
              <MdKeyboardArrowLeft />
            </Link>
            Manage Roles
          </HeadingTwo>
        </Col>
        <Col md={6} xs={6} className="text-end">
          <Button onClick={e => handleRoleDrawerToggle()} className="btn primary-btn">
            Add Roles
          </Button>
        </Col>
      </Row>
      <Row>
        <Col md={12}>
          {loading ? (
            <HeadingFour className="text-center">Loading...</HeadingFour>
          ) : (
            <MyDiv className="GeneralTable">
              <TableContainer>
                <Table className="bgGrey" aria-label="Role table">
                  <TableHead>
                    <TableRow>
                      <TableCell align="left">Role Name</TableCell>
                      <TableCell align="left">Category</TableCell>
                      <TableCell align="left">Departments</TableCell>
                      <TableCell align="left">Status</TableCell>
                      <TableCell align="center">Action</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {roles?.length ? (
                      roles.map(item => (
                        <React.Fragment key={item._id}>
                          <TableRow>
                            <TableCell align="left">{item.role_Name}</TableCell>
                            <TableCell align="left">{item.role_category?.toUpperCase()}</TableCell>
                            <TableCell align="left">
                                {item.depts?.map(item => (item)).join(', ')}
                            </TableCell>
                            <TableCell align="left">
                              {item.role_status === "active" ? (
                                <Badge bg="success" text="light" className="text-uppercase">
                                  {item.role_status}
                                </Badge>
                              ) : (
                                <Badge bg="danger" text="light" className="text-uppercase">
                                  {item.role_status}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell align="center">
                              <Box className="custom-flex">
                                <Tooltip title="Edit">
                                  <IconButton aria-label="fingerprint" color="success" onClick={e => roleEditId(item._id)}>
                                    <MdOutlineModeEditOutline />
                                  </IconButton>
                                </Tooltip>
                                <Tooltip title="Edit">
                                  <IconButton aria-label="fingerprint" color="primary" onClick={e => roleAddPermissions(item._id)}>
                                    <BiCheckShield />
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
              <MyDiv className="reactPaginate d-flex justify-content-center mt-4">
                <Pagination count={pageCount} page={currentPage} onChange={handlePageChange} />
              </MyDiv>
            </MyDiv>
          )}
        </Col>
      </Row>
      <Drawer anchor="right" open={roleDrawerState} onClose={handleRoleDrawerToggle}>
        <FormRoles handleClose={updateDrawer} roleInfo={data} />
      </Drawer>
      <Drawer anchor="right" open={permissionDrawerState} onClose={handlePermissionDrawerToggle}>
        <FormRolePermission handleClose={updatePermissionDrawer} roleAddPermissions={data} />
      </Drawer>
    </React.Fragment>
  );
}

export default ManageRoles;
