import React, { useState, useEffect, useCallback, useRef } from "react";
import { useSelector, useDispatch } from "react-redux";
import { setFilters, resetFiltersAndSorting } from "../../store/masterOrderSlice";
import { Row, Col, Badge } from "react-bootstrap";
import { HeadingTwo, HeadingFour, MyDiv, StrongTag, LabelTag, PTag } from "../Common/Components";
import { MdKeyboardArrowLeft } from "react-icons/md";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { TableBody, Table, TableContainer, TableHead, TableRow, TableCell, Pagination, Drawer, MenuItem, Button, TextField } from "@mui/material";
import axios from "axios";
import FormOrder from "./form";
import moment from "moment";
import NoDataFound from "../Common/noDataFound";
import DateRangePicker from "react-bootstrap-daterangepicker";
import "bootstrap-daterangepicker/daterangepicker.css";
import { orderStatus } from "../Common/staticjson";
import { DateTime } from "luxon";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function ErrorOrderManage() {
  let location = useLocation();
  const dispatch = useDispatch();
  const [orders, setOrders] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState({
    startDate: moment().startOf("week").format("YYYY-MM-DD"),
    endDate: moment().endOf("week").format("YYYY-MM-DD"),
  });
  const [pageCount, setPageCount] = useState(1);
  const [currentPage, setCurrentPage] = useState(parseInt(new URLSearchParams(location.search).get("page")) ? parseInt(new URLSearchParams(location.search).get("page")) : 1);

  const { filters, sorting } = useSelector(state => state.orders);

  let navigate = useNavigate();
  const pageParam = new URLSearchParams(location.search).get("page");

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
    const url = `${API_BASE_URL}email-sent-defect-list?page=${currentPage - 1}&query=${filters.search_text}&myob=${filters.myobStatus}&sortField=${sorting.sortField}&sortDirection=${
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

  const handlePageChange = selectedObject => {
    const selectedPage = selectedObject.selected;
    setCurrentPage(selectedPage);
    navigate(`?page=${selectedPage}`);
  };

  const [orderDrawerState, setOrderDrawerState] = React.useState(false);
  const handleOrderDrawerToggle = () => {
    setData();
    orderDrawerState === false ? setOrderDrawerState(true) : setOrderDrawerState(false);
  };

  const updateDrawer = () => {
    orderDrawerState === false ? setOrderDrawerState(true) : setOrderDrawerState(false);
    loadOrders();
  };

  const ranges = {
    Today: [moment(), moment()],
    Yesterday: [moment().subtract(1, "days"), moment().subtract(1, "days")],
    "Last 7 Days": [moment().subtract(6, "days"), moment()],
    "Last 30 Days": [moment().subtract(29, "days"), moment()],
    "This Month": [moment().startOf("month"), moment().endOf("month")],
    "Last Month": [moment().subtract(1, "month").startOf("month"), moment().subtract(1, "month").endOf("month")],
  };
  /* Search Module End*/

  return (
    <React.Fragment>
      <Row className="GeneralHeading withBackArrow">
        <Col md={6} xs={6}>
          <HeadingTwo>
            <Link className="arrow-btn" onClick={() => navigate(-1)}>
              <MdKeyboardArrowLeft />
            </Link>
            Mail Sent Defect List
          </HeadingTwo>
        </Col>
        <Col md={6} xs={6} className="text-end"></Col>
      </Row>
      <Row className="SearchBar GeneralHeading mt-3 hide">
        <Col md={12}>
          <Row>
            <Col md={3} xs={9} className="SearchTextBox">
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
                      <TableCell className="cursor-pointer" align="left">
                        Order ID
                      </TableCell>
                      <TableCell className="cursor-pointer" align="left">
                        Department
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {orders?.length ? (
                      orders.map(item => (
                        <React.Fragment key={item._id}>
                          <TableRow className={item.order_flashing_checker === true ? "HaveFlashing" : null}>
                            <TableCell align="left">
                              <Link to={`/orders/${item._id}`}>
                                <StrongTag>{item.order_unique_id}</StrongTag>
                                {item.order_quote_id !== "Nil" ? <PTag className="m-0">{item.order_quote_id} </PTag> : ""}
                              </Link>
                            </TableCell>
                            <TableCell align="left">
                              {item.f_mail_push_status === false ? <Badge className="flashingBg mx-1">Flashing</Badge> : null}
                              {item.cl_mail_push_status === false ? <Badge className="claddingBg mx-1">Cladding</Badge> : null}
                              {item.fg_mail_push_status === false ? <Badge className="faciaBg mx-1">Facia Gutter</Badge> : null}
                              {item.j_mail_push_status === false ? <Badge className="jobbingBg mx-1">Jobbing</Badge> : null}
                              {item.roof_mail_push_status === false ? <Badge className="roofingBg mx-1">Roofing</Badge> : null}
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
      <Drawer anchor="right" open={orderDrawerState} onClose={handleOrderDrawerToggle}>
        <FormOrder handleClose={updateDrawer} orderInfo={data} />
      </Drawer>
    </React.Fragment>
  );
}

export default ErrorOrderManage;
