import React, { useState, useEffect, useCallback, useRef } from "react";
import { useSelector, useDispatch } from "react-redux";
import { setFilters, setSorting, resetFiltersAndSorting } from "../../../store/masterOrderSlice";
import { Row, Col, Badge } from "react-bootstrap";
import { HeadingTwo, HeadingFour, MyDiv, StrongTag, LabelTag, PTag, Avatar } from "../../Common/Components";
import { MdKeyboardArrowLeft } from "react-icons/md";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { TableBody, Table, TableContainer, TableHead, TableRow, TableCell, Box, IconButton, Tooltip, MenuItem, Button, TextField, Pagination } from "@mui/material";
import { MdRemoveRedEye, MdKeyboardArrowDown, MdKeyboardArrowUp } from "react-icons/md";

import { BiSortAlt2 } from "react-icons/bi";
import axios from "axios";
//import FormOrder from './form';
import moment from "moment";
import NoDataFound from "../../Common/noDataFound";
import DateRangePicker from "react-bootstrap-daterangepicker";
import "bootstrap-daterangepicker/daterangepicker.css";
import { orderStatus } from "../../Common/staticjson";
import { DateTime } from "luxon";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function SupplierItemManage() {
  let location = useLocation();
  const dispatch = useDispatch();
  const [orders, setOrders] = useState("");
  const [loading, setLoading] = useState(false);

  const [pageCount, setPageCount] = useState(1);
  const [currentPage, setCurrentPage] = useState(parseInt(new URLSearchParams(location.search).get("page")) ? parseInt(new URLSearchParams(location.search).get("page")) : 1);
  const [sortField] = useState("order_unique_id");
  const [sortDirection] = useState("-1");

  const { filters, sorting } = useSelector(state => state.orders);

  let navigate = useNavigate();
  const pageParam = new URLSearchParams(location.search).get("page");

  const getStatusBadge = status => {
    let color, backgroundColor, label;
    switch (status) {
      case "1":
        color = "default";
        label = "Unattended";
        backgroundColor = "#f00000";
        break;
      case "2":
        color = "default";
        label = "Waiting on Call Back";
        backgroundColor = "#59abee";
        break;
      case "3":
        color = "default";
        label = "Cleared";
        backgroundColor = "#229b2c";
        break;
      default:
        color = "secondary";
        backgroundColor = "#00AFD7";
        break;
    }
    return (
      <Badge bg="" color={color} style={{ backgroundColor }} text="light">
        {label}
      </Badge>
    );
  };

  useEffect(() => {
    if (pageParam !== null) {
      setCurrentPage(parseInt(pageParam));
    } else {
      setCurrentPage(1);
    }
  }, [location, pageParam]);

  useEffect(() => {
    if (currentPage !== null) {
      setCurrentPage(parseInt(new URLSearchParams(location.search).get("page")) || 1);
    }
  }, [currentPage, location]);

  const cancelToken = useRef(null);
  const loadOrders = useCallback(async () => {
    if (cancelToken.current) {
      cancelToken.current.cancel("Operation canceled due to new request.");
    }
    const source = axios.CancelToken.source();
    cancelToken.current = source;

    const startDate = DateTime.fromISO(filters.startDate).set({ hour: 0, minute: 0, second: 0, millisecond: 0 });
    const endDate = DateTime.fromISO(filters.endDate).set({ hour: 23, minute: 59, second: 59, millisecond: 999 });
    const toAEST = date => date.setZone("Australia/Sydney", { keepLocalTime: true }).toUTC();
    const fromTimeUTC = toAEST(startDate).toISO();
    const toTimeUTC = toAEST(endDate).toISO();

    setLoading(true);
    const url = `${API_BASE_URL}fetch-supplier-order-details?&page=${currentPage - 1}&query=${filters.search_text}&myob=${filters.myobStatus}&sortField=${sorting.sortField}&sortDirection=${
      sorting.sortDirection
    }&startDate=${fromTimeUTC}&endDate=${toTimeUTC}&cusId=${filters.customerId}`;
    try {
      const response = await axios.get(url, { headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" }, cancelToken: source.token });
      setOrders(response.data);
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
    loadOrders();
  }, [currentPage, filters, loadOrders, sorting]);

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

  const [orderDrawerState, setOrderDrawerState] = React.useState(false);
  const handleOrderDrawerToggle = () => {
    orderDrawerState === false ? setOrderDrawerState(true) : setOrderDrawerState(false);
  };

  const ranges = {
    Today: [moment(), moment()],
    Yesterday: [moment().subtract(1, "days"), moment().subtract(1, "days")],
    "Last 7 Days": [moment().subtract(6, "days"), moment()],
    "Last 30 Days": [moment().subtract(29, "days"), moment()],
    "This Month": [moment().startOf("month"), moment().endOf("month")],
    "Last Month": [moment().subtract(1, "month").startOf("month"), moment().subtract(1, "month").endOf("month")],
  };

  return (
    <React.Fragment>
      <Row className="GeneralHeading withBackArrow">
        <Col md={6} xs={6}>
          <HeadingTwo>
            <Link className="arrow-btn" onClick={() => navigate(-1)}>
              <MdKeyboardArrowLeft />
            </Link>
            Supplier Items
          </HeadingTwo>
        </Col>
        <Col md={6} xs={6} className="text-end">
          <Button onClick={e => handleOrderDrawerToggle()} className="btn primary-btn">
            Add Order
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
                  dispatch(setFilters({ startDate: startDate.format("YYYY-MM-DD"), endDate: endDate.format("YYYY-MM-DD") }));
                }}
                initialSettings={{ ranges: ranges }}
                label="Created Date"
                placeholdertext="Created Date"
              >
                <input type="text" value={filters.startDate + "-" + filters.endDate} className="form-control data-range-picker" placeholdertext="Created Date" readOnly />
              </DateRangePicker>
            </Col>
            <Col md={2} xs={9}>
              <TextField
                select
                variant="outlined"
                size="small"
                label="Order Status"
                name="myobStatus"
                value={filters.myobStatus}
                SelectProps={{ onChange: handleFieldChange }}
                className="form-control"
              >
                {orderStatus.map(orderStatusList => (
                  <MenuItem key={orderStatusList.value} value={orderStatusList.value}>
                    {orderStatusList.label}
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
                <Table className="bgGrey" aria-label="Order table">
                  <TableHead>
                    <TableRow>
                      <TableCell className="cursor-pointer" align="left" onClick={() => handleSortChange("order_unique_id")}>
                        <BiSortAlt2 /> Order ID {sortField === "order_unique_id" && (sortDirection === "-1" ? <MdKeyboardArrowDown /> : <MdKeyboardArrowUp />)}
                      </TableCell>
                      <TableCell align="left">Customer Name / ID</TableCell>
                      <TableCell align="left">PO / Contact Name / Phone number</TableCell>
                      <TableCell align="left">Delivery Address</TableCell>
                      <TableCell className="cursor-pointer" align="left" onClick={() => handleSortChange("order_delivery_date")}>
                        <BiSortAlt2 /> Delivery Date {sortField === "order_delivery_date" && (sortDirection === "-1" ? <MdKeyboardArrowDown /> : <MdKeyboardArrowUp />)}
                      </TableCell>
                      <TableCell align="left">Status</TableCell>
                      <TableCell align="center">Action</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {orders.fetchedItems?.length ? (
                      orders.fetchedItems.map(item => (
                        <React.Fragment key={item._id}>
                          <TableRow
                            className={`${item.order_flashing_checker === true ? "HaveFlashing" : ""} ${item.order_crane_lift_checker === true ? "HaveCraneLift" : ""} ${
                              item.order_delivery_address_mode === "2" ? "pickupOrder" : ""
                            }`.trim()}
                          >
                            <TableCell align="left">
                              <Link to={`/orders/${item._id}`} state={{ openTab: "supplier-item" }}>
                                <StrongTag>{item.order_unique_id}</StrongTag>
                                {item.order_quote_id !== "Nil" ? <PTag className="m-0">{item.order_quote_id} </PTag> : ""}
                              </Link>
                            </TableCell>
                            <TableCell align="left" component="th" scope="row">
                              <MyDiv className="tableAvatar">
                                <Avatar round="50px" size="40" name={item.account_Name} src="" />
                                <Link to={`${item._id}`}>
                                  {item.account_Name}
                                  <br />
                                  {item.account_UID}
                                </Link>
                              </MyDiv>
                            </TableCell>
                            <TableCell align="left">
                              #{item.order_customer_PO_number} -
                              {item.order_delivery_address_mode === "1" ? (
                                <>
                                  {item.order_site_delivery_attention_person}, <br /> {item.order_site_delivery_attention_contact}
                                </>
                              ) : (
                                ""
                              )}
                              {item.order_delivery_address_mode === "0" ? <> {item.order_customer_contact_phone} </> : ""}
                              {item.order_delivery_address_mode === "2" ? <> Pickup Order</> : ""}
                            </TableCell>
                            <TableCell align="left">
                              {item.order_delivery_address_mode === "0" ? (
                                <MyDiv className="storeDelivery">
                                  {item.order_store_delivery_address1}, <br />
                                  {item.order_store_delivery_city}, {item.order_store_delivery_state}, &nbsp;{item.order_store_delivery_country}-{item.order_store_delivery_postalcode}
                                </MyDiv>
                              ) : (
                                ""
                              )}
                              {item.order_delivery_address_mode === "1" ? (
                                <MyDiv className="siteDelivery">
                                  {item.order_site_delivery_address1}, <br />
                                  {item.order_site_delivery_city}, {item.order_site_delivery_state}, &nbsp;{item.order_site_delivery_country}-{item.order_site_delivery_postalcode}
                                </MyDiv>
                              ) : (
                                ""
                              )}
                              {item.order_delivery_address_mode === "2" ? <MyDiv className="pickupOrder"> PickUp Order</MyDiv> : ""}
                            </TableCell>
                            <TableCell align="left">
                              {item.order_delivery_date_str}
                              <br />
                              {item.order_delivery_session === "A/T" ? item.order_delivery_session : item.order_delivery_time ? `${item.order_delivery_time} / ${item.order_delivery_session}` : ""}
                            </TableCell>
                            <TableCell align="left">
                              <MyDiv>{getStatusBadge(item.order_supplier_status)}</MyDiv>
                            </TableCell>
                            <TableCell align="right">
                              <Box className="custom-flex">
                                <Link to={`/orders/${item._id}`} state={{ openTab: "doubt" }}>
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
      {/* <Drawer anchor="right" open={orderDrawerState} onClose={() => handleOrderDrawerToggle(false)} >
                <FormOrder handleClose={updateDrawer} orderInfo={data} />
            </Drawer> */}
    </React.Fragment>
  );
}

export default SupplierItemManage;
