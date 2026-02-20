import React, { useState, useEffect, useCallback } from "react";
import { Row, Col } from "react-bootstrap";
import { HeadingTwo, HeadingFour, MyDiv } from "../../Common/Components";
import Badge from "react-bootstrap/Badge";
import { MdKeyboardArrowLeft } from "react-icons/md";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { TableBody, Table, TableContainer, TableHead, TableRow, TableCell, Box, IconButton, Tooltip, Drawer, Button, TextField, Pagination } from "@mui/material";
import { MdOutlineModeEditOutline } from "react-icons/md";
import axios from "axios";
import NoDataFound from "../../Common/noDataFound";
import FormRacking from "./form";
import swal from "sweetalert2";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function RackingManage() {
  const [data, setData] = useState("");
  let location = useLocation();
  const [racking, setRacking] = useState("");
  const [loading, setLoading] = useState(false);
  const [pageCount, setPageCount] = useState(1);
  const [currentPage, setCurrentPage] = useState(parseInt(new URLSearchParams(location.search).get("page")) ? parseInt(new URLSearchParams(location.search).get("page")) : 1);

  let navigate = useNavigate();
  const [searchData, setSearchData] = useState({
    search_text: "",
  });

  const loadRacking = useCallback(async () => {
    setLoading(true);
    const url = `${API_BASE_URL}fetch-racking-data?page=${currentPage - 1}&query=${searchData.search_text}`;
    try {
      const response = await axios.get(url, { headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" } });
      setRacking(response.data.fetchedItems);
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
  }, [searchData.search_text, currentPage]);

  const handlePageChange = (event, value) => {
    setCurrentPage(value);
    navigate(`?page=${value}`);
  };
  useEffect(() => {
    loadRacking();
  }, [loadRacking]);
  /* Search Module */
  function searchHandle(e) {
    const searchNewData = { ...searchData };
    searchNewData[e.target.id] = e.target.value;
    setSearchData(searchNewData);
  }

  function searchSubmit(e) {
    e.preventDefault();
  }

  const [rackingDrawerState, setRackingDrawerState] = React.useState(false);
  const handleRackingDrawerToggle = () => {
    setData();
    rackingDrawerState === false ? setRackingDrawerState(true) : setRackingDrawerState(false);
  };
  const rackingEditId = _id => {
    rackingDrawerState === false ? setRackingDrawerState(true) : setRackingDrawerState(false);
    setData(_id);
  };
  const updateDrawer = () => {
    rackingDrawerState === false ? setRackingDrawerState(true) : setRackingDrawerState(false);
    loadRacking();
  };

  return (
    <React.Fragment>
      <Row className="GeneralHeading withBackArrow">
        <Col md={6} xs={6}>
          <HeadingTwo>
            <Link className="arrow-btn" onClick={() => navigate(-1)}>
              <MdKeyboardArrowLeft />
            </Link>
            Manage Racking
          </HeadingTwo>
        </Col>
        <Col md={6} xs={6} className="text-end">
          <Button onClick={e => handleRackingDrawerToggle()} className="btn primary-btn mx-1">
            Add Racking
          </Button>
        </Col>
      </Row>
      <Row className="SearchBar GeneralHeading mt-3">
        <Col md={12}>
          <form onSubmit={e => searchSubmit(e)}>
            <Row>
              <Col md={6} className="SearchTextBox">
                <TextField onChange={e => searchHandle(e)} className="textarea" required id="search_text" placeholder="Enter Search Text Here...." value={searchData.search_text} variant="standard" />
              </Col>
            </Row>
          </form>
        </Col>
      </Row>
      <Row>
        <Col>
          <MyDiv className="GeneralTable">
            {loading ? (
              <HeadingFour className="text-center">Loading...</HeadingFour>
            ) : (
              <>
                <TableContainer>
                  <Table className="bgGrey" aria-label="Racking table">
                    <TableHead>
                      <TableRow>
                        <TableCell align="left">Rack Name</TableCell>
                        <TableCell align="left">Rack Code</TableCell>
                        <TableCell align="left">Status</TableCell>
                        <TableCell align="center">Action</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {racking?.length ? (
                        racking.map(item => (
                          <React.Fragment key={item._id}>
                            <TableRow>
                              <TableCell align="left" component="th" scope="row">
                                {item.rack_name}
                              </TableCell>
                              <TableCell align="left" component="th" scope="row">
                                {item.rack_code}
                              </TableCell>
                              <TableCell align="left" component="th" scope="row">
                                {item.rack_status === "active" ? (
                                  <Badge bg="success" text="light" className="text-uppercase">
                                    {item.rack_status}
                                  </Badge>
                                ) : (
                                  <Badge bg="danger" text="light" className="text-uppercase">
                                    {item.rack_status}
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell align="center">
                                <Box className="custom-flex">
                                  <Tooltip title="Edit">
                                    <IconButton aria-label="fingerprint" color="success" onClick={e => rackingEditId(item._id)}>
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
                <MyDiv className="reactPaginate d-flex justify-content-center mt-4">
                  <Pagination count={pageCount} page={currentPage} onChange={handlePageChange} />
                </MyDiv>
              </>
            )}
          </MyDiv>
        </Col>
      </Row>
      <Drawer anchor="right" open={rackingDrawerState} onClose={handleRackingDrawerToggle} disableClose="false">
        <FormRacking handleClose={updateDrawer} rackingInfo={data} />
      </Drawer>
    </React.Fragment>
  );
}

export default RackingManage;
