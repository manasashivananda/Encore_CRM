import React, { useState, useEffect, useCallback } from "react";
import { Row, Col, Badge } from "react-bootstrap";
import { Link, useParams, useLocation, useNavigate } from "react-router-dom";
import { TableBody, Table, TableContainer, TableHead, TableRow, TableCell, IconButton, Tooltip, Pagination, TextField } from "@mui/material";
import { MdRemoveRedEye } from "react-icons/md";
import axios from "axios";
import { HeadingTwo, MyDiv, HeadingFour, StrongTag, CurrencyDisplay } from "../../Common/Components";
import NoDataFound from "../../Common/noDataFound";
import moment from "moment";
import swal from "sweetalert2";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function CustomerOrderManage() {
  let { id } = useParams();
  let location = useLocation();
  let navigate = useNavigate();
  const [contacts, setContacts] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchData, setSearchData] = useState({ search_text: "" });
  const [pageCount, setPageCount] = useState(1);
  const [currentPage, setCurrentPage] = useState(parseInt(new URLSearchParams(location.search).get("page")) ? parseInt(new URLSearchParams(location.search).get("page")) : 1);

  const loadContacts = useCallback(async () => {
    setLoading(true);
    const url = `${API_BASE_URL}fetch-customer-based-order-details/` + id + `?page=${currentPage - 1}&query=${searchData.search_text}`;
    try {
      const response = await axios.get(url, { headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" } });
      setContacts(response.data.fetchedItems);
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
  }, [id, currentPage, searchData.search_text]);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  const handlePageChange = (event, value) => {
    setCurrentPage(value);
    navigate(`?page=${value}`);
  };
  function searchHandle(e) {
    const searchNewData = { ...searchData };
    searchNewData[e.target.id] = e.target.value;
    setSearchData(searchNewData);
    setCurrentPage(1);
  }
  return (
    <React.Fragment>
      <Row className="GeneralHeading mt-3 SearchBar">
        <Col md={1}>
          <HeadingTwo>Orders</HeadingTwo>
        </Col>
        <Col md={4} className="SearchTextBox">
          <TextField onChange={e => searchHandle(e)} className="textarea" required id="search_text" placeholder="Search Order here..." value={searchData.search_text} variant="standard" />
        </Col>
      </Row>
      <Row>
        <Col md={12}>
          {loading ? (
            <HeadingFour className="text-center">Loading...</HeadingFour>
          ) : (
            <MyDiv className="GeneralTable tableOverflow customerOrderForm">
              <TableContainer>
                <Table className="bgGrey" aria-label="Employee table">
                  <TableHead>
                    <TableRow>
                      <TableCell align="left">Order No</TableCell>
                      <TableCell align="left">Date</TableCell>
                      <TableCell align="left">Price</TableCell>
                      <TableCell align="left">Status</TableCell>
                      <TableCell align="center">Action</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {contacts?.length ? (
                      contacts.map(item => (
                        <React.Fragment key={item._id}>
                          <TableRow>
                            <TableCell align="left" component="th" scope="row">
                              <Link to={`/orders/${item._id}`}>
                                <StrongTag>{item.order_unique_id}</StrongTag>
                              </Link>
                            </TableCell>
                            <TableCell align="left">{moment(item.order_delivery_date).format("DD-MM-YYYY")}</TableCell>
                            <TableCell align="left">
                              <CurrencyDisplay value={item.order_Overall_Price} currency="AUD" locale="en-US" />
                            </TableCell>
                            <TableCell align="left">
                              <MyDiv>
                                <Badge bg="info" text="light">
                                  {item.order_status}
                                </Badge>
                              </MyDiv>
                            </TableCell>
                            <TableCell align="center">
                              <Link to={`/orders/${item._id}`}>
                                <Tooltip title="View Profile">
                                  <IconButton aria-label="fingerprint" color="secondary">
                                    <MdRemoveRedEye />
                                  </IconButton>
                                </Tooltip>
                              </Link>
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
    </React.Fragment>
  );
}

export default CustomerOrderManage;
