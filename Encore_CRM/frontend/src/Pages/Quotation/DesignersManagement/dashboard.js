import React, { useState, useEffect, useCallback } from "react";
import { Row, Col } from "react-bootstrap";
import { HeadingTwo, HeadingFour, MyDiv, StrongTag, HeadingFive, Avatar, getFormattedDeliveryTime } from "../../Common/Components";
import { Link, useNavigate } from "react-router-dom";
import { TableBody, Table, TableContainer, TableHead, TableRow, TableCell, Box, IconButton, Tooltip, TextField, Pagination } from "@mui/material";
import { MdRemoveRedEye } from "react-icons/md";
import axios from "axios";
import swal from "sweetalert2";
import moment from "moment";
import NoDataFound from "../../Common/noDataFound";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function QuoteDesignersDashboard() {
  let navigate = useNavigate();
  const [quotes, setQuotes] = useState("");
  const [specificDesignerQuotes, setSpecificDesignerQuotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [pageAllQuoteCount, setPageAllQuoteCount] = useState(1);
  const [allQuoteCurrentPage, setAllQuoteCurrentPage] = useState(1);
  const [specificDesignerQuotePageCount, setSpecificDesignerQuotePageCount] = useState(1);
  const [specificDesignerQuoteCurrentPage, setSpecificDesignerQuoteCurrentPage] = useState(1);

  const [searchData, setSearchData] = useState({
    search_text: "",
  });
  const loadQuotes = useCallback(
    async (allQuoteCurrentPage = 0) => {
      setLoading(true);
      const url = `${API_BASE_URL}designer-dashboard-quotation-list?page=${allQuoteCurrentPage - 1}&query=${searchData.search_text}`;
      try {
        const response = await axios.get(url, { headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" } });
        setQuotes(response.data);
        setPageAllQuoteCount(response.data.totalPages);
      } catch (error) {
        setLoading(false);
        swal.fire({
          text: error.response.data,
          icon: "error",
          type: "error",
        });
      } finally {
        setLoading(false);
      }
    },
    [searchData.search_text]
  );

  useEffect(() => {
    loadQuotes(allQuoteCurrentPage);
  }, [loadQuotes, allQuoteCurrentPage]);

  const loadSpecificDesignerQuotes = useCallback(async specificDesignerQuoteCurrentPage => {
    const url = `${API_BASE_URL}specific-designer-quotation-list?page=${specificDesignerQuoteCurrentPage - 1}`;
    try {
      const response = await axios.get(url, { headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" } });
      setSpecificDesignerQuotes(response.data);
      setSpecificDesignerQuotePageCount(response.data.totalPages);
    } catch (error) {
      swal.fire({
        text: error.response.data,
        icon: "error",
        type: "error",
      });
    }
  }, []);

  useEffect(() => {
    loadSpecificDesignerQuotes(specificDesignerQuoteCurrentPage);
  }, [loadSpecificDesignerQuotes, specificDesignerQuoteCurrentPage]);

  /* Search Module */

  function searchHandle(e) {
    const searchNewData = { ...searchData };
    searchNewData[e.target.id] = e.target.value;
    setSearchData(searchNewData);
  }
  function searchSubmit(e) {
    e.preventDefault();
    loadQuotes();
  }
  const handlePageChangePendingQuote = (event, value) => {
    setSpecificDesignerQuoteCurrentPage(value);
    navigate(`?page=${value}`);
  };
  const handlePageChangeAllQuote = (event, value) => {
    setAllQuoteCurrentPage(value);
    navigate(`?page=${value}`);
  };

  return (
    <React.Fragment>
      <Row className="GeneralHeading designerDashboardBg hide">
        <Col md={6}>
          <HeadingTwo>Designer Dashboard</HeadingTwo>
        </Col>
      </Row>
      <Row className="GeneralHeading designerDashboardBg mt-2 SearchBar">
        <Col md={8}>
          <HeadingFive>Your Pending Quotes</HeadingFive>
        </Col>
      </Row>
      <Row>
        <Col md={12}>
          {loading ? (
            <HeadingFour className="text-center">Loading...</HeadingFour>
          ) : (
            <MyDiv className="GeneralTable">
              <TableContainer>
                <Table className="bgGrey" aria-label="Quote table">
                  <TableHead>
                    <TableRow>
                      <TableCell align="left">Quote ID</TableCell>
                      <TableCell align="left">Customer Name / ID</TableCell>
                      <TableCell align="left">PO / Contact Name / Phone number</TableCell>
                      <TableCell align="left">Delivery Address</TableCell>
                      <TableCell align="left">Created Date</TableCell>
                      <TableCell align="left">Delivery date</TableCell>
                      <TableCell align="center">Action</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {specificDesignerQuotes.fetchedItems?.length ? (
                      specificDesignerQuotes.fetchedItems.map(item => {
                        const deliveryDate = moment(item.quote_delivery_date).startOf("day");
                        let nextWorkingDay = moment().add(1, "days").startOf("day");
                        while ([6, 0].includes(nextWorkingDay.day())) {
                          nextWorkingDay.add(1, "days");
                        }
                        const isTomorrow = deliveryDate.isSame(nextWorkingDay, "day");
                        return (
                          <React.Fragment key={item._id}>
                            <TableRow className={` ${item.order_qc_status === "3" ? "QcFailedOrder" : ""} ${!isTomorrow ? "LaterDelivery" : ""}`}>
                              <TableCell align="left">
                                <Link to={`${item._id}`}>
                                  <StrongTag>{item.quote_unique_id}</StrongTag>
                                </Link>
                              </TableCell>
                              <TableCell component="th" align="left" scope="row" className="tableAvatar">
                                <Avatar round="50px" size="40" name={item.account_Name} src="" />
                                <Link to={`${item._id}`}>
                                  {item.account_Name}
                                  <br />
                                  {item.account_UID}
                                </Link>
                              </TableCell>
                              <TableCell align="left">
                                #{item.quote_customer_PO_number} -
                                {item.quote_delivery_address_mode === "1" ? (
                                  <>
                                    {item.quote_site_delivery_attention_person}, <br /> {item.quote_site_delivery_attention_contact}
                                  </>
                                ) : (
                                  ""
                                )}
                                {item.quote_delivery_address_mode === "0" ? <> {item.quote_customer_contact_phone} </> : ""}
                                {item.quote_delivery_address_mode === "2" ? <> Pickup Order</> : ""}
                              </TableCell>
                              <TableCell align="left">
                                {item.quote_delivery_address_mode === "0" ? (
                                  <MyDiv className="storeDelivery">
                                    {item.quote_store_delivery_address1},<br /> {item.quote_store_delivery_city}, {item.quote_store_delivery_state}, &nbsp;{item.quote_store_delivery_country}-
                                    {item.quote_store_delivery_postalcode}
                                  </MyDiv>
                                ) : (
                                  ""
                                )}
                                {item.quote_delivery_address_mode === "1" ? (
                                  <MyDiv className="siteDelivery">
                                    {item.quote_site_delivery_address1},<br /> {item.quote_site_delivery_city}, {item.quote_site_delivery_state}, &nbsp;{item.quote_site_delivery_country}-
                                    {item.quote_site_delivery_postalcode}
                                  </MyDiv>
                                ) : (
                                  ""
                                )}
                                {item.quote_delivery_address_mode === "2" ? <MyDiv className="pickupOrder"> PickUp Order</MyDiv> : ""}
                              </TableCell>
                              <TableCell align="left">{moment(item.created).format("DD-MMM-YYYY hh:mm a")}</TableCell>
                              <TableCell align="left">
                                {item.quote_delivery_date_str} - {getFormattedDeliveryTime(item.quote_delivery_time, item.quote_delivery_session)}
                              </TableCell>
                              <TableCell align="center">
                                <Box className="custom-flex">
                                  <Link to={`${item._id}`}>
                                    <Tooltip title="View Profile">
                                      <IconButton aria-label="fingerprint" color="secondary">
                                        <MdRemoveRedEye />
                                      </IconButton>
                                    </Tooltip>
                                  </Link>
                                </Box>
                              </TableCell>
                            </TableRow>
                          </React.Fragment>
                        );
                      })
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
                <Pagination count={specificDesignerQuotePageCount} page={specificDesignerQuoteCurrentPage} onChange={handlePageChangePendingQuote} />
              </MyDiv>
            </MyDiv>
          )}
        </Col>
      </Row>
      <Row className="GeneralHeading designerDashboardBg mt-3 SearchBar">
        <Col md={9}>
          <HeadingFive>All Available Quotes</HeadingFive>
        </Col>
        <Col md={3}>
          <form onSubmit={e => searchSubmit(e)} className="SearchTextBox  d-flex">
            <TextField onChange={e => searchHandle(e)} className="textarea" id="search_text" placeholder="Enter Search Text Here...." value={searchData.search_text} variant="standard" />
          </form>
        </Col>
      </Row>
      <Row>
        <Col md={12}>
          <MyDiv className="GeneralTable">
            <TableContainer>
              <Table className="bgGrey" aria-label="Quote table">
                <TableHead>
                  <TableRow>
                    <TableCell align="left">Quote ID</TableCell>
                    <TableCell align="left">Customer Name / ID</TableCell>
                    <TableCell align="left">Contact Name / Phone number</TableCell>
                    <TableCell align="left">Contact PO number</TableCell>
                    <TableCell align="left">Delivery Address</TableCell>
                    <TableCell align="left">Delivery date</TableCell>
                    <TableCell align="center">Action</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {quotes.fetchedItems?.length ? (
                    quotes.fetchedItems.map(item => {
                      const deliveryDate = moment(item.quote_delivery_date).startOf("day");
                      let nextWorkingDay = moment().add(1, "days").startOf("day");
                      while ([6, 0].includes(nextWorkingDay.day())) {
                        nextWorkingDay.add(1, "days");
                      }
                      const isTomorrow = deliveryDate.isSame(nextWorkingDay, "day");
                      return (
                        <React.Fragment key={item._id}>
                          <TableRow className={`${!isTomorrow ? "LaterDelivery" : ""}`}>
                            <TableCell align="left">
                              <Link to={`${item._id}`}>
                                <StrongTag>{item.quote_unique_id}</StrongTag>
                              </Link>
                            </TableCell>
                            <TableCell align="left" component="th" scope="row" className="tableAvatar">
                              <Avatar round="50px" size="40" name={item.account_Name} src="" />
                              <Link to={`${item._id}`}>
                                {item.account_Name}
                                <br />
                                {item.account_UID}
                              </Link>
                            </TableCell>
                            <TableCell align="left">
                              #{item.quote_customer_PO_number} -
                              {item.quote_delivery_address_mode === "1" ? (
                                <>
                                  {item.quote_site_delivery_attention_person}, <br /> {item.quote_site_delivery_attention_contact}
                                </>
                              ) : (
                                ""
                              )}
                              {item.quote_delivery_address_mode === "0" ? <> {item.quote_customer_contact_phone} </> : ""}
                              {item.quote_delivery_address_mode === "2" ? <> Pickup Order</> : ""}
                            </TableCell>
                            <TableCell align="left">
                              {item.quote_delivery_address_mode === "0" ? (
                                <MyDiv className="storeDelivery">
                                  {item.quote_store_delivery_address1},<br /> {item.quote_store_delivery_city}, {item.quote_store_delivery_state}, &nbsp;{item.quote_store_delivery_country}-
                                  {item.quote_store_delivery_postalcode}
                                </MyDiv>
                              ) : (
                                ""
                              )}
                              {item.quote_delivery_address_mode === "1" ? (
                                <MyDiv className="siteDelivery">
                                  {item.quote_site_delivery_address1},<br /> {item.quote_site_delivery_city}, {item.quote_site_delivery_state}, &nbsp;{item.quote_site_delivery_country}-
                                  {item.quote_site_delivery_postalcode}
                                </MyDiv>
                              ) : (
                                ""
                              )}
                              {item.quote_delivery_address_mode === "2" ? <MyDiv className="pickupOrder"> PickUp Order</MyDiv> : ""}
                            </TableCell>
                            <TableCell align="left">{moment(item.created).format("DD-MMM-YYYY hh:mm a")}</TableCell>
                            <TableCell align="left">
                              {item.quote_delivery_date_str} - {getFormattedDeliveryTime(item.quote_delivery_time, item.quote_delivery_session)}
                            </TableCell>
                            <TableCell align="center">
                              <Box className="custom-flex">
                                <Link to={`${item._id}`}>
                                  <Tooltip title="View Profile">
                                    <IconButton aria-label="fingerprint" color="secondary">
                                      <MdRemoveRedEye />
                                    </IconButton>
                                  </Tooltip>
                                </Link>
                              </Box>
                            </TableCell>
                          </TableRow>
                        </React.Fragment>
                      );
                    })
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
              <Pagination count={pageAllQuoteCount} page={allQuoteCurrentPage} onChange={handlePageChangeAllQuote} />
            </MyDiv>
          </MyDiv>
        </Col>
      </Row>
    </React.Fragment>
  );
}

export default QuoteDesignersDashboard;
