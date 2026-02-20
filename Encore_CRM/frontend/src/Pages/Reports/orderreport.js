import React, { useState, useEffect, useCallback, useRef } from "react";
import { useSelector, useDispatch } from "react-redux";
import { setFilters, resetFilters } from "../../store/orderReportSlice";
import { Link, useNavigate } from "react-router-dom";
import moment from "moment";
import axios from "axios";
import swal from "sweetalert2";
import { TableBody, Table, TableContainer, TableHead, TableRow, TableCell, Button, TextField, MenuItem, IconButton, Pagination, Tooltip } from "@mui/material";
import NoDataFound from "../Common/noDataFound";
import { IoMdArrowBack } from "react-icons/io";
import { TbTableExport } from "react-icons/tb";
import { FaUserCheck } from "react-icons/fa";
import { GiStack } from "react-icons/gi";
import { ImStackoverflow } from "react-icons/im";
import DateRangePicker from "react-bootstrap-daterangepicker";
import "bootstrap-daterangepicker/daterangepicker.css";
import { Row, Col } from "react-bootstrap";
import { HeadingTwo, HeadingThree, HeadingFour, MyDiv, SpanTag, PTag, LabelTag, CurrencyDisplay } from "../Common/Components";
import * as XLSX from "xlsx";
import { green } from "@mui/material/colors";
import { FiLoader } from "react-icons/fi";
import { DateTime } from "luxon";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

const RolePermission = JSON.parse(localStorage.getItem("role"));

function OrderReport() {
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const [filteredOrders, setFilteredOrders] = useState([]);
  const [filteredOrdersSummary, setFilteredOrdersSummary] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filteredEmployees, setFilteredEmployees] = useState([]);
  const [pageCount, setPageCount] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const { filters } = useSelector(state => state.orderReport);

  const cancelToken = useRef(null);

  const loadFilterOrders = useCallback(async () => {
    setLoading(true);
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

    const url = `${API_BASE_URL}order-dashboard-report?page=${currentPage - 1}&orderUID=${filters.search_text}&fromTime=${fromTimeUTC}&toTime=${toTimeUTC}&orderEntry=${filters.employee}`;

    try {
      const response = await axios.get(url, {
        headers: {
          "x-access-token": localStorage.getItem("token"),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        cancelToken: source.token,
      });
      setFilteredOrders(response.data.Data);
      setFilteredOrdersSummary(response.data.OverAllTotal);
      setPageCount(response.data.totalPages);
    } catch (error) {
      if (!axios.isCancel(error)) {
        swal.fire({
          text: "Data load Failed",
          icon: "error",
        });
      }
    } finally {
      setLoading(false);
    }
  }, [currentPage, filters]);

  useEffect(() => {
    loadFilterOrders();
  }, [currentPage, filters, loadFilterOrders]);

  const loadEmployee = async () => {
    setLoading(true);
    const url = API_BASE_URL + "fetch-user-data-report?role=orderentry";
    try {
      const response = await axios.get(url, {
        headers: {
          "x-access-token": localStorage.getItem("token"),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });
      setFilteredEmployees(response.data);
    } catch (error) {
      console.log(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEmployee();
  }, []);

  const handleReset = () => {
    dispatch(resetFilters());
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

  const ranges = {
    Today: [moment(), moment()],
    Yesterday: [moment().subtract(1, "days"), moment().subtract(1, "days")],
    "Last 7 Days": [moment().subtract(6, "days"), moment()],
    "Last 30 Days": [moment().subtract(29, "days"), moment()],
    "This Month": [moment().startOf("month"), moment().endOf("month")],
    "Last Month": [moment().subtract(1, "month").startOf("month"), moment().subtract(1, "month").endOf("month")],
  };
  const [exportBtnLoading, setExportBtnLoading] = useState(false);

  const loadFilterOrdersExport = async () => {
    setExportBtnLoading(true);
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

    const url = `${API_BASE_URL}order-dashboard-report-excel-export?orderUID=${filters.search_text}&fromTime=${fromTimeUTC}&toTime=${toTimeUTC}&orderEntry=${filters.employee}`;

    try {
      const response = await axios.get(url, {
        headers: {
          "x-access-token": localStorage.getItem("token"),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        cancelToken: source.token,
      });

      if (response.status === 200) {
        if (response.data.Data.length > 0) {
          swal.fire({
            text: "Successfully Exported",
            icon: "success",
          });
          const preparedData = prepareDataForExport(response.data.Data);
          exportToExcel(preparedData);
        } else {
          swal.fire({
            text: "No data to export",
            icon: "info",
          });
        }
      }
    } catch (error) {
      if (!axios.isCancel(error)) {
        swal.fire({
          text: error?.response?.data || "Export failed",
          icon: "error",
        });
      }
    } finally {
      setExportBtnLoading(false);
    }
  };

  const prepareDataForExport = data => {
    return data.map(item => ({
      "Order Number": item.DOrderID,
      "Customer Name": item.CusName,
      "Order Entry Person": item.OrderEntryPerson,
      "Primary QC Person": item.OrderItemQCPerson,
      "Secondary QC Person": item.WOrderItemQCPerson,
      "Line Items": item.Total_Lines,
      "Quantity / Pieces": item.Total_Pieces,
      "Created date": item.CreatedDateStr,
      "Finished Date": item.MYOBPushedDate,
      "Total Amount": parseFloat(item.Total_Amount).toFixed(2),
    }));
  };

  const exportToExcel = dataForExport => {
    const ws = XLSX.utils.json_to_sheet(dataForExport);
    const wb = XLSX.utils.book_new();
    ws["!cols"] = autoColumnWidth(dataForExport);
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    XLSX.writeFile(wb, "Order_report.xlsx");
  };

  const autoColumnWidth = data => {
    const keys = Object.keys(data[0]);
    return keys.map(key => ({ wch: Math.max(key.length, ...data.map(row => (row[key] ? row[key].toString().length : 0))) }));
  };

  const handlePageChange = (event, value) => {
    setCurrentPage(value);
    navigate(`?page=${value}`);
  };

  return (
    <>
      <Row className="GeneralHeading withBackArrow">
        <Col md={6}>
          <HeadingTwo>
            <Link className="arrow-btn" onClick={() => navigate(-1)}>
              <IoMdArrowBack />
            </Link>
            Order-Wise Report
          </HeadingTwo>
        </Col>
      </Row>
      <Row>
        <Col md={12}>
          <MyDiv className="searchBar GeneralHeading mt-2 d-block">
            <Row>
              <Col md={2} xs={9} className="SearchTextBox">
                <TextField onChange={handleSearchChange} id="search_text" variant="outlined" size="small" placeholder="Order Id" value={filters.search_text} />
              </Col>

              <Col md={2}>
                <TextField
                  select
                  variant="outlined"
                  size="small"
                  label="Order Entry Person"
                  name="employee"
                  className="form-control"
                  value={filters.employee || ""}
                  SelectProps={{ onChange: handleFieldChange }}
                >
                  {filteredEmployees.map(filteredEmployee => (
                    <MenuItem key={filteredEmployee._id} value={filteredEmployee._id}>
                      {filteredEmployee.user_firstName} {filteredEmployee.user_lastName}
                    </MenuItem>
                  ))}
                </TextField>
              </Col>
              <Col md={2} className="SearchTextBox dateRangePicker">
                <LabelTag>Order Created Date</LabelTag>
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
                  label="Start Date"
                  placeholdertext="Start Date"
                >
                  <input type="text" value={filters.startDate + "-" + filters.endDate} className="form-control data-range-picker" placeholder="Start Date" readOnly />
                </DateRangePicker>
              </Col>
              <Col md={3} className="d-flex">
                <Button className="btn secondary-btn add-cta search mx-1  mt-1" onClick={handleReset}>
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
                      onClick={loadFilterOrdersExport}
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
                  <ImStackoverflow />
                </SpanTag>
                <MyDiv className="DashboardTopItemContent">
                  <HeadingThree>Total Orders</HeadingThree>
                  <HeadingFour>{filteredOrdersSummary.Total_Orders}</HeadingFour>
                </MyDiv>
                <MyDiv className="DashboardTopItemNotes">
                  <PTag>All Orders</PTag>
                </MyDiv>
              </MyDiv>
            </Col>
            <Col md={3}>
              <MyDiv className="DashboardTopItem">
                <SpanTag className="DashboardTopItemIcon">
                  <GiStack />
                </SpanTag>
                <MyDiv className="DashboardTopItemContent">
                  <HeadingThree>Total Line Items</HeadingThree>
                  <HeadingFour>{filteredOrdersSummary.TotalLineItems}</HeadingFour>
                </MyDiv>
                <MyDiv className="DashboardTopItemNotes">
                  <PTag>Based On Filter</PTag>
                </MyDiv>
              </MyDiv>
            </Col>
            <Col md={3}>
              <MyDiv className="DashboardTopItem">
                <SpanTag className="DashboardTopItemIcon">
                  <GiStack />
                </SpanTag>
                <MyDiv className="DashboardTopItemContent">
                  <HeadingThree>Total Quantity</HeadingThree>
                  <HeadingFour>{filteredOrdersSummary.Total_Pieces}</HeadingFour>
                </MyDiv>
                <MyDiv className="DashboardTopItemNotes">
                  <PTag>Based On Filter</PTag>
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
                    <CurrencyDisplay value={filteredOrdersSummary.Total_Amount} currency="AUD" locale="en-US" />
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
                        <TableCell align="left">Order Number</TableCell>
                        <TableCell align="left">Customer Name</TableCell>
                        <TableCell align="left">Order Entry Person</TableCell>
                        {RolePermission?.OrderItemQC?.view === "1" &&
                          <>
                            <TableCell align="left">Primary QC Person</TableCell>
                            <TableCell align="left">Secondary QC Person</TableCell>
                          </>
                        }
                        <TableCell align="left">No Of Lines</TableCell>
                        <TableCell align="left">Quantity</TableCell>
                        <TableCell align="left">Created date</TableCell>
                        <TableCell align="left">Finished date</TableCell>
                        <TableCell align="left">Total Price</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {filteredOrders?.length ? (
                        filteredOrders.map(item => (
                          <TableRow key={item.OrderID}>
                            <TableCell align="left" component="th" scope="row">
                              {item.DOrderID}
                            </TableCell>
                            <TableCell align="left">{item.CusName}</TableCell>
                            <TableCell align="left">{item.OrderEntryPerson}</TableCell>
                            {RolePermission?.OrderItemQC?.view === "1" &&
                              <>
                                <TableCell align="left">{item.OrderItemQCPerson}</TableCell>
                                <TableCell align="left">{item.WOrderItemQCPerson}</TableCell>
                              </>
                            }
                            <TableCell align="left">{item.Total_Lines}</TableCell>
                            <TableCell align="left">{item.Total_Pieces}</TableCell>
                            <TableCell align="left">{item.CreatedDateStr}</TableCell>
                            <TableCell align="left">{item.MYOBPushedDate}</TableCell>
                            <TableCell align="left">{item.totallineamount ? <CurrencyDisplay value={item.totallineamount} currency="AUD" locale="en-US" /> : "-"}</TableCell>
                          </TableRow>
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
    </>
  );
}

export default OrderReport;
