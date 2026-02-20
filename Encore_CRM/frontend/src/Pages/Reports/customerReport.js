import React, { useState, useEffect, useCallback, useRef } from "react";
import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";
import { Link, useNavigate } from "react-router-dom";
import { HeadingTwo, HeadingFour, MyDiv, StrongTag, SpanTag, PTag, HeadingThree, LabelTag, CurrencyDisplay } from "../Common/Components";
import { TableBody, Table, TableContainer, TableHead, TableRow, TableCell, MenuItem, Button, TextField, IconButton, Pagination, Tooltip } from "@mui/material";
import { IoMdArrowBack } from "react-icons/io";
import DateRangePicker from "react-bootstrap-daterangepicker";
import "bootstrap-daterangepicker/daterangepicker.css";
import moment from "moment";
import axios from "axios";
import NoDataFound from "../Common/noDataFound";
import { TbTableExport } from "react-icons/tb";
import * as XLSX from "xlsx";
import { FaUsers, FaUserCheck } from "react-icons/fa";
import { ImStackoverflow } from "react-icons/im";
import swal from "sweetalert2";
import { green } from "@mui/material/colors";
import { FiLoader } from "react-icons/fi";
import { DateTime } from "luxon";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function CustomerReport() {
  const navigate = useNavigate();
  const [customerId, setCustomerId] = useState("");
  const [customersList, setCustomersList] = useState([]);
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pageCount, setPageCount] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchData, setSearchData] = useState({ search_text: "" });
  const [dateFilter, setDateFilter] = useState({ startDate: moment().startOf("").format("YYYY-MM-DD"), endDate: moment().endOf("").format("YYYY-MM-DD") });

  const [exportBtnLoading, setExportBtnLoading] = useState(false);
  const cancelToken = useRef(null);
  const setDatesCallback = (e, { startDate, endDate }) => {
    setDateFilter({
      startDate: startDate.format("YYYY-MM-DD"),
      endDate: endDate.format("YYYY-MM-DD"),
    });
  };

  const loadCustomerReport = useCallback(async () => {
    if (cancelToken.current) {
      cancelToken.current.cancel("Operation canceled due to new request.");
    }
    const source = axios.CancelToken.source();
    cancelToken.current = source;

    const startDate = DateTime.fromISO(dateFilter.startDate).set({ hour: 0, minute: 0, second: 0, millisecond: 0 });
    const endDate = DateTime.fromISO(dateFilter.endDate).set({ hour: 23, minute: 59, second: 59, millisecond: 999 });
    const toAEST = date => date.setZone("Australia/Sydney", { keepLocalTime: true }).toUTC();
    const fromTimeUTC = toAEST(startDate).toISO();
    const toTimeUTC = toAEST(endDate).toISO();

    setLoading(true);
    const url = `${API_BASE_URL}customer-dashboard-report?page=${currentPage - 1}&orderUID=${searchData.search_text}&fromTime=${fromTimeUTC}&toTime=${toTimeUTC}&customerId=${customerId}`;
    try {
      const response = await axios.get(url, { headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" }, cancelToken: source.token });
      setFilteredOrders(response.data);
      setPageCount(response.data.totalPages);
    } catch (error) {
      console.log(error);
    } finally {
      if (!source.token.reason) {
        setLoading(false);
      }
    }
  }, [currentPage, searchData.search_text, dateFilter, customerId]);

  useEffect(() => {
    loadCustomerReport();
  }, [currentPage, loadCustomerReport]);

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = async () => {
    const url = API_BASE_URL + `fetch-account-data-dropdown`;
    axios.get(url, { headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" } }).then(
      res => {
        setCustomersList(res.data);
      },
      error => {
        //alert('Customer fetching failed: ' + error)
      }
    );
  };

  const handlePageChange = (event, value) => {
    setCurrentPage(value);
    navigate(`?page=${value}`);
  };

  const handleFieldChange = event => {
    const { name, value } = event.target;
    if (name === "customerId") {
      setCustomerId(value);
    }
  };
  const handleReset = () => {
    setCustomerId("");
    setSearchData({ search_text: "" });
    setDateFilter({
      startDate: moment().startOf("").format("YYYY-MM-DD"),
      endDate: moment().endOf("").format("YYYY-MM-DD"),
    });
    setCurrentPage(1);
  };

  const ranges = {
    Today: [moment(), moment()],
    Yesterday: [moment().subtract(1, "days"), moment().subtract(1, "days")],
    "Last 7 Days": [moment().subtract(6, "days"), moment()],
    "Last 30 Days": [moment().subtract(29, "days"), moment()],
    "This Month": [moment().startOf("month"), moment().endOf("month")],
    "Last Month": [moment().subtract(1, "month").startOf("month"), moment().subtract(1, "month").endOf("month")],
  };

  const exportToExcel = useCallback(dataForExport => {
    const ws = XLSX.utils.json_to_sheet(dataForExport);
    const wb = XLSX.utils.book_new();
    ws["!cols"] = autoColumnWidth(dataForExport);
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    XLSX.writeFile(wb, "Customer_report.xlsx");
  }, []);

  const loadFilterReportExport = useCallback(async () => {
    setExportBtnLoading(true);

    const startDate = DateTime.fromISO(dateFilter.startDate).set({ hour: 0, minute: 0, second: 0, millisecond: 0 });
    const endDate = DateTime.fromISO(dateFilter.endDate).set({ hour: 23, minute: 59, second: 59, millisecond: 999 });
    const toAEST = date => date.setZone("Australia/Sydney", { keepLocalTime: true }).toUTC();
    const fromTimeUTC = toAEST(startDate).toISO();
    const toTimeUTC = toAEST(endDate).toISO();

    const url = `${API_BASE_URL}customer-dashboard-report-export?orderUID=${searchData.search_text}&fromTime=${fromTimeUTC}&toTime=${toTimeUTC}&customerId=${customerId}`;
    try {
      const response = await axios.get(url, { headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" } });
      if (response.status === 200) {
        swal.fire({
          text: "Successfully Exported",
          icon: "success",
          type: "success",
        });
        const preparedData = prepareDataForExport(response.data.CustomerReportItems);
        exportToExcel(preparedData);
        setExportBtnLoading(false);
      }
    } catch (error) {
      setExportBtnLoading(false);
      swal.fire({
        text: error.response.data,
        icon: "error",
        type: "error",
      });
    }
  }, [searchData.search_text, dateFilter.startDate, dateFilter.endDate, customerId, exportToExcel]);

  const prepareDataForExport = data => {
    return data.map(item => ({
      "Customer Name": item.CusName,
      "Order Count": item.totalOrders,
      "Total Price": parseFloat(item.totalOrderPrice).toFixed(2),
    }));
  };

  const autoColumnWidth = data => {
    const keys = Object.keys(data[0]);
    return keys.map(key => ({ wch: Math.max(key.length, ...data.map(row => (row[key] ? row[key].toString().length : 0))) }));
  };

  return (
    <React.Fragment>
      <Row className="GeneralHeading withBackArrow">
        <Col md={6}>
          <HeadingTwo>
            <Link className="arrow-btn" onClick={() => navigate(-1)}>
              <IoMdArrowBack />
            </Link>
            Customer Report
          </HeadingTwo>
        </Col>
      </Row>
      <Row>
        <Col md={12}>
          <MyDiv className="searchBar GeneralHeading mt-2 d-block">
            <Row>
              <Col md={2} xs={9} className="SearchTextBox">
                <TextField select variant="outlined" size="small" label="Customer Name" name="customerId" value={customerId} SelectProps={{ onChange: handleFieldChange }} className="form-control">
                  {customersList.map(customerList => (
                    <MenuItem key={customerList._id} value={customerList._id}>
                      {customerList.account_Name} - {customerList.account_UID}
                    </MenuItem>
                  ))}
                </TextField>
              </Col>
              <Col md={2} className="SearchTextBox dateRangePicker">
                <LabelTag>Order Created Date</LabelTag>
                <DateRangePicker onApply={setDatesCallback} initialSettings={{ ranges: ranges }}>
                  <input type="text" value={`${dateFilter.startDate}-${dateFilter.endDate}`} className="form-control data-range-picker" readOnly />
                </DateRangePicker>
              </Col>
              <Col md={3} className="d-flex">
                <Button className="btn secondary-btn add-cta search mx-1 mt-1" onClick={handleReset}>
                  Reset
                </Button>
                {exportBtnLoading ? (
                  <IconButton aria-label="fingerprint" sx={{ color: green[500] }} className="IconBtnLoader">
                    <FiLoader />
                  </IconButton>
                ) : (
                  <Tooltip title="Export Excel" className="mx-2">
                    <IconButton
                      aria-label="Export To Excel"
                      color="success"
                      sx={{ color: "#fff", width: "40px", height: "40px", backgroundColor: "#30bf5c", "&:hover": { backgroundColor: "#30bf5c" } }}
                      component="a"
                      onClick={loadFilterReportExport}
                    >
                      <TbTableExport />
                    </IconButton>
                  </Tooltip>
                )}
              </Col>
            </Row>
          </MyDiv>
        </Col>
      </Row>
      {loading ? (
        <HeadingFour className="text-center">Loading...</HeadingFour>
      ) : (
        <React.Fragment>
          <Row className="DashboardTop mt-3">
            <Col md={3}>
              <MyDiv className="DashboardTopItem">
                <SpanTag className="DashboardTopItemIcon">
                  <FaUsers />
                </SpanTag>
                <MyDiv className="DashboardTopItemContent">
                  <HeadingThree>Total Customers</HeadingThree>
                  <HeadingFour>{filteredOrders.totalItems}</HeadingFour>
                </MyDiv>
                <MyDiv className="DashboardTopItemNotes">
                  <PTag>Filtered Customers</PTag>
                </MyDiv>
              </MyDiv>
            </Col>
            <Col md={3}>
              <MyDiv className="DashboardTopItem">
                <SpanTag className="DashboardTopItemIcon">
                  <ImStackoverflow />
                </SpanTag>
                <MyDiv className="DashboardTopItemContent">
                  <HeadingThree>Total Orders</HeadingThree>
                  <HeadingFour>{filteredOrders.TotalOrders}</HeadingFour>
                </MyDiv>
                <MyDiv className="DashboardTopItemNotes">
                  <PTag>All Orders</PTag>
                </MyDiv>
              </MyDiv>
            </Col>
            <Col md={3}>
              <MyDiv className="DashboardTopItem">
                <SpanTag className="DashboardTopItemIcon">
                  <FaUserCheck />
                </SpanTag>
                <MyDiv className="DashboardTopItemContent">
                  <HeadingThree>Total Amount</HeadingThree>
                  <HeadingFour>
                    <CurrencyDisplay value={filteredOrders.TotalPrice} currency="AUD" locale="en-US" />
                  </HeadingFour>
                </MyDiv>
                <MyDiv className="DashboardTopItemNotes">
                  <PTag>Based On filter</PTag>
                </MyDiv>
              </MyDiv>
            </Col>
          </Row>
          <Row>
            <Col md={12}>
              <MyDiv className="GeneralTable">
                <TableContainer>
                  <Table className="bgGrey" aria-label="Order table">
                    <TableHead>
                      <TableRow>
                        <TableCell align="left">Customer Name</TableCell>
                        <TableCell align="left">Order Count</TableCell>
                        <TableCell align="left">Total Price</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {filteredOrders.CustomerReportItems?.length ? (
                        filteredOrders.CustomerReportItems.map(item => (
                          <React.Fragment key={item._id}>
                            <TableRow>
                              <TableCell align="left" component="th" scope="row">
                                <StrongTag>{item.CusName}</StrongTag>
                              </TableCell>
                              <TableCell align="left" component="th" scope="row">
                                {item.totalOrders}
                              </TableCell>
                              <TableCell align="left" component="th" scope="row">
                                <CurrencyDisplay value={item.totalOrderPrice} currency="AUD" locale="en-US" />
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
            </Col>
          </Row>
        </React.Fragment>
      )}
    </React.Fragment>
  );
}

export default CustomerReport;
