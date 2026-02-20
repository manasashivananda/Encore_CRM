import React, { useState, useEffect, useCallback, useRef } from "react";
import { useSelector, useDispatch } from "react-redux";
import { setFilters, setSorting, resetFiltersAndSorting } from "../../store/quotationSlice";
import { Row, Col, Badge } from "react-bootstrap";
import { HeadingTwo, HeadingFour, MyDiv, StrongTag, LabelTag, Avatar, getFormattedDeliveryTime } from "../Common/Components";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { TableBody, Table, TableContainer, TableHead, TableRow, TableCell, Box, IconButton, Tooltip, Drawer, MenuItem, Button, TextField, Pagination } from "@mui/material";
import { MdOutlineModeEditOutline, MdRemoveRedEye, MdKeyboardArrowDown, MdKeyboardArrowUp } from "react-icons/md";
import { FiLoader } from "react-icons/fi";
import { SiMyob } from "react-icons/si";
import { BiSortAlt2 } from "react-icons/bi";
import axios from "axios";
import swal from "sweetalert2";
import FormQuotation from "./form";
import moment from "moment";
import NoDataFound from "../Common/noDataFound";
import { pink } from "@mui/material/colors";
import DateRangePicker from "react-bootstrap-daterangepicker";
import "bootstrap-daterangepicker/daterangepicker.css";
import { quotationStatus } from "../Common/staticjson";

import { DateTime } from "luxon";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function QuotationManage() {
  let location = useLocation();
  const dispatch = useDispatch();
  const [quotations, setQuotations] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState({
    startDate: moment().startOf("week").format("YYYY-MM-DD"),
    endDate: moment().endOf("week").format("YYYY-MM-DD"),
  });
  const [pageCount, setPageCount] = useState(1);
  const [currentPage, setCurrentPage] = useState(parseInt(new URLSearchParams(location.search).get("page")) ? parseInt(new URLSearchParams(location.search).get("page")) : 1);

  let navigate = useNavigate();
  const { filters, sorting } = useSelector(state => state.quotation);
  const pageParam = new URLSearchParams(location.search).get("page");

  useEffect(() => {
    if (pageParam !== null) {
      setCurrentPage(parseInt(pageParam));
    } else {
      setCurrentPage(1);
    }
  }, [location, pageParam]);

  const cancelToken = useRef(null);

  const loadQuotations = useCallback(async () => {
    if (cancelToken.current) {
      cancelToken.current.cancel("Operation canceled due to new request.");
    }
    const source = axios.CancelToken.source();
    cancelToken.current = source;
    const startDate = DateTime.fromISO(filters.startDate).set({ hour: 0, minute: 0, second: 0, millisecond: 0 });
    const endDate = DateTime.fromISO(filters.endDate).set({
      hour: 23,
      minute: 59,
      second: 59,
      millisecond: 999,
    });

    const toAEST = date => date.setZone("Australia/Sydney", { keepLocalTime: true }).toUTC();
    const fromTimeUTC = toAEST(startDate).toISO();
    const toTimeUTC = toAEST(endDate).toISO();

    setLoading(true);

    const url = `${API_BASE_URL}fetch-quotation-details?page=${currentPage - 1}&query=${filters.search_text}&status=${filters.myobStatus}&sortField=${sorting.sortField}&sortDirection=${
      sorting.sortDirection
    }&startDate=${fromTimeUTC}&endDate=${toTimeUTC}`;

    try {
      const response = await axios.get(url, {
        headers: {
          "x-access-token": localStorage.getItem("token"),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        cancelToken: source.token,
      });

      setQuotations(response.data);
      setPageCount(response.data.totalPages);
    } catch (error) {
      console.log(error);
    } finally {
      if (!source.token.reason) {
        setLoading(false);
      }
    }
  }, [currentPage, filters, sorting]);

  useEffect(() => {
    loadQuotations();
  }, [loadQuotations, currentPage]);

  const handleReset = () => {
    dispatch(resetFiltersAndSorting());
    setCurrentPage(1);
  };
  const handleSearchChange = event => {
    dispatch(setFilters({ search_text: event.target.value }));
    setCurrentPage(1);
  };

  const handleFieldChange = event => {
    const { name, value } = event.target;
    dispatch(setFilters({ [name]: value }));
    setCurrentPage(1);
  };

  const handleSortChange = field => {
    dispatch(
      setSorting({
        sortField: field,
        sortDirection: sorting.sortField === field ? (sorting.sortDirection === "-1" ? "1" : "-1") : "-1",
      })
    );
    setCurrentPage(1);
  };
  const handlePageChange = (event, value) => {
    setCurrentPage(value);
    navigate(`?page=${value}`);
  };

  const [myobBtnLoadingMap, setMyobBtnLoadingMap] = useState({});

  const quotationValuesSendMyob = async (id, password) => {
    setMyobBtnLoadingMap(prevMap => ({
      ...prevMap,
      [id]: true,
    }));
    const requestBody = {
      password_myob: password,
    };
    try {
      const url = `${API_BASE_URL}sent-quotationmaster-item-details-to-myob/${id}`;
      await axios.post(url, requestBody, {
        headers: {
          "x-access-token": localStorage.getItem("token"),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });
      swal.fire({
        text: "Quotation Items sent to MYOB",
        icon: "success",
        type: "success",
      });
      loadQuotations();
    } catch (error) {
      swal.fire({
        text: error.response.data,
        icon: "error",
        type: "error",
      });
    } finally {
      setMyobBtnLoadingMap(prevMap => ({
        ...prevMap,
        [id]: false,
      }));
    }
  };

  const [quotationDrawerState, setQuotationDrawerState] = React.useState(false);
  const handleQuotationDrawerToggle = () => {
    setData();
    quotationDrawerState === false ? setQuotationDrawerState(true) : setQuotationDrawerState(false);
  };
  const quotationEditId = _id => {
    quotationDrawerState === false ? setQuotationDrawerState(true) : setQuotationDrawerState(false);
    setData(_id);
  };
  const updateDrawer = () => {
    quotationDrawerState === false ? setQuotationDrawerState(true) : setQuotationDrawerState(false);
    loadQuotations();
  };
  /* Search Module start*/

  const ranges = {
    Today: [moment(), moment()],
    Yesterday: [moment().subtract(1, "days"), moment().subtract(1, "days")],
    "Last 7 Days": [moment().subtract(6, "days"), moment()],
    "Last 30 Days": [moment().subtract(29, "days"), moment()],
    "This Month": [moment().startOf("month"), moment().endOf("month")],
    "Last Month": [moment().subtract(1, "month").startOf("month"), moment().subtract(1, "month").endOf("month")],
  };
  /* Search Module End*/

  const getStatusBadge = status => {
    let color, backgroundColor;

    switch (status) {
      case "Quotation Created":
        color = "primary";
        backgroundColor = "#00AFD7";
        break;
      case "Quotation In Progress":
        color = "info";
        backgroundColor = "#e567ba";
        break;
      case "Production In Progress":
        color = "default";
        backgroundColor = "#3aad76";
        break;
      case "Quotation Cancelled":
        color = "default";
        backgroundColor = "#f00000";
        break;
      case "Quote Converted To SO":
        color = "default";
        backgroundColor = "#187c19";
        break;
      default:
        color = "secondary";
        backgroundColor = "#00AFD7";
        break;
    }
    return (
      <Badge bg="" color={color} style={{ backgroundColor }} text="light">
        {status}
      </Badge>
    );
  };

  return (
    <React.Fragment>
      <Row className="GeneralHeading">
        <Col md={6} xs={6}>
          <HeadingTwo>Manage Quotations</HeadingTwo>
        </Col>
        <Col md={6} xs={6} className="text-end">
          <Button onClick={e => handleQuotationDrawerToggle()} className="btn primary-btn">
            Add Quotation
          </Button>
        </Col>
      </Row>
      <Row className="SearchBar GeneralHeading mt-3">
        <Col md={12}>
          <Row>
            <Col md={2} xs={9} className="SearchTextBox">
              <TextField onChange={handleSearchChange} className="textarea" id="search_text" placeholder="Search Here..." value={filters.search_text} variant="standard" />
            </Col>
            <Col md={2} xs={9} className="SearchTextBox dateRangePicker">
              <LabelTag>Created Date</LabelTag>
              <DateRangePicker
                onApply={(e, { startDate, endDate }) => {
                  dispatch(
                    setFilters({
                      startDate: startDate.format("YYYY-MM-DD"),
                      endDate: endDate.format("YYYY-MM-DD"),
                    })
                  );
                }}
                initialSettings={{ ranges: ranges }}
                label="Created Date"
                placeholdertext="Created Date"
              >
                <input type="text" value={filters.startDate + "-" + filters.endDate} className="form-control data-range-picker" placeholder="Created Date" readOnly />
              </DateRangePicker>
            </Col>
            <Col md={2} xs={9}>
              <TextField
                select
                variant="outlined"
                size="small"
                label="Quotation Status"
                name="myobStatus"
                value={filters.myobStatus}
                SelectProps={{ onChange: handleFieldChange }}
                className="form-control"
              >
                {quotationStatus.map(quotationStatus => (
                  <MenuItem key={quotationStatus.value} value={quotationStatus.value}>
                    {quotationStatus.label}
                  </MenuItem>
                ))}
              </TextField>
            </Col>
            <Col md={2} xs={9}>
              <Button className="btn secondary-btn add-cta search mx-1" onClick={handleReset}>
                Reset
              </Button>
            </Col>
          </Row>
        </Col>
      </Row>
      <Row>
        <Col md={12}>
          {loading ? (
            <HeadingFour className="text-center">Loading...</HeadingFour>
          ) : (
            <MyDiv className="GeneralTable">
              <TableContainer>
                <Table className="bgGrey" aria-label="Quotation table">
                  <TableHead>
                    <TableRow>
                      <TableCell className="cursor-pointer" align="left" onClick={() => handleSortChange("quote_unique_id")}>
                        <BiSortAlt2 /> Quotation ID
                        {sorting.sortField === "quote_unique_id" && (sorting.sortDirection === "-1" ? <MdKeyboardArrowDown /> : <MdKeyboardArrowUp />)}
                      </TableCell>
                      <TableCell align="left">Customer Name / ID</TableCell>
                      <TableCell align="left">Contact PO number</TableCell>
                      <TableCell align="left">Delivery Address</TableCell>
                      <TableCell className="cursor-pointer" align="left" onClick={() => handleSortChange("created")}>
                        <BiSortAlt2 /> Created Date
                        {sorting.sortField === "quote_created_date" && (sorting.sortDirection === "-1" ? <MdKeyboardArrowDown /> : <MdKeyboardArrowUp />)}
                      </TableCell>
                      <TableCell className="cursor-pointer" align="left" onClick={() => handleSortChange("quote_delivery_date")}>
                        <BiSortAlt2 /> Delivery Date
                        {sorting.sortField === "quote_delivery_date" && (sorting.sortDirection === "-1" ? <MdKeyboardArrowDown /> : <MdKeyboardArrowUp />)}
                      </TableCell>
                      <TableCell align="left">Status</TableCell>
                      <TableCell align="right">Action</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {quotations.fetchedItems?.length ? (
                      quotations.fetchedItems.map(item => (
                        <React.Fragment key={item._id}>
                          <TableRow className={item.quote_flashing_checker === true ? "HaveFlashing" : null}>
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
                                  {item.quote_store_delivery_address1}, <br />
                                  {item.quote_store_delivery_city}, {item.quote_store_delivery_state}, &nbsp;
                                  {item.quote_store_delivery_country}-{item.quote_store_delivery_postalcode}
                                </MyDiv>
                              ) : (
                                ""
                              )}
                              {item.quote_delivery_address_mode === "1" ? (
                                <MyDiv className="siteDelivery">
                                  {item.quote_site_delivery_address1}, <br />
                                  {item.quote_site_delivery_city}, {item.quote_site_delivery_state}, &nbsp;
                                  {item.quote_site_delivery_country}-{item.quote_site_delivery_postalcode}
                                </MyDiv>
                              ) : (
                                ""
                              )}
                              {item.quote_delivery_address_mode === "2" ? <MyDiv className="pickupOrder"> PickUp Order</MyDiv> : ""}
                            </TableCell>
                            <TableCell align="left">{item.created ? moment(item.created).format("DD-MMM-YYYY hh:mm a") : null}</TableCell>
                            <TableCell align="left">
                              {item.quote_delivery_date_str} - {getFormattedDeliveryTime(item.quote_delivery_time, item.quote_delivery_session)}
                            </TableCell>
                            <TableCell align="left">
                              <MyDiv>{getStatusBadge(item.quote_status)}</MyDiv>
                            </TableCell>
                            <TableCell align="right">
                              <Box className="custom-flex">
                                {myobBtnLoadingMap[item._id] ? (
                                  <IconButton aria-label="fingerprint" sx={{ color: pink[500] }} className="IconBtnLoader">
                                    <FiLoader />
                                  </IconButton>
                                ) : (
                                  <>
                                    {item.quotation_qc_status === "4" && item.quotation_myob_push_status === false ? (
                                      <Tooltip title="Send Quotation Items to MYOB">
                                        <IconButton aria-label="fingerprint" sx={{ color: pink[500] }} onClick={e => quotationValuesSendMyob(item._id)}>
                                          <SiMyob />
                                        </IconButton>
                                      </Tooltip>
                                    ) : null}
                                  </>
                                )}
                                {item.quote_status !== "Quote Converted To SO" ? (
                                  <Tooltip title="Edit">
                                    <IconButton aria-label="fingerprint" color="success" onClick={e => quotationEditId(item._id)}>
                                      <MdOutlineModeEditOutline />
                                    </IconButton>
                                  </Tooltip>
                                ) : null}
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
      <Drawer anchor="right" open={quotationDrawerState} onClose={handleQuotationDrawerToggle}>
        <FormQuotation handleClose={updateDrawer} quoteInfo={data} />
      </Drawer>
    </React.Fragment>
  );
}

export default QuotationManage;
