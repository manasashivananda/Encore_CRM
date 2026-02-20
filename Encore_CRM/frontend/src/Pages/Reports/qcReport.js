import React, { useState, useEffect, useCallback, useRef } from "react";
import { useSelector, useDispatch } from "react-redux";
import { setFilters, resetFilters } from "../../store/qcReportSlice";
import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";
import { Link, useNavigate } from "react-router-dom";
import {
  HeadingTwo,
  HeadingFour,
  MyDiv,
  SpanTag,
  HeadingThree,
  PTag,
  LabelTag,
  getFormattedDeliveryTime,
} from "../Common/Components";
import {
  TableBody,
  Table,
  TableContainer,
  TableHead,
  TableRow,
  TableCell,
  MenuItem,
  Button,
  TextField,
  IconButton,
  Pagination,
  Tooltip,
} from "@mui/material";
import { IoMdArrowBack } from "react-icons/io";
import DateRangePicker from "react-bootstrap-daterangepicker";
import "bootstrap-daterangepicker/daterangepicker.css";
import moment from "moment";
import axios from "axios";
import NoDataFound from "../Common/noDataFound";
import * as XLSX from "xlsx";
import { TbTableExport } from "react-icons/tb";
import { GiStack } from "react-icons/gi";
import { ImStackoverflow } from "react-icons/im";
import swal from "sweetalert2";
import { green } from "@mui/material/colors";
import { FiLoader } from "react-icons/fi";
import { DateTime } from "luxon";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

const RolePermission = JSON.parse(localStorage.getItem("role"));

function QCReport() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [filteredEmployees, setFilteredEmployee] = useState([]);
  const [exportBtnLoading, setExportBtnLoading] = useState(false);
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pageCount, setPageCount] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const { filters } = useSelector(state => state.qcReport);

  const loadReport = useCallback(async () => {
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
    const url = `${API_BASE_URL}qc-reports-generate?page=${currentPage - 1}&orderUID=${
      filters.search_text
    }&fromTime=${fromTimeUTC}&toTime=${toTimeUTC}&orderQC=${filters.designer}`;
    try {
      const response = await axios.get(url, {
        headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" },
        cancelToken: source.token,
      });
      setFilteredOrders(response.data);

      setPageCount(response.data.totalPages);
    } catch (error) {
      if (!axios.isCancel(error)) {
      }
    } finally {
      if (!source.token.reason) {
        setLoading(false);
      }
    }
  }, [currentPage, filters]);

  useEffect(() => {
    loadReport();
  }, [currentPage, filters, loadReport]);

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

  const loadEmployee = async () => {
    if (RolePermission?.DesignReport?.add === "1") {
      const url = API_BASE_URL + "fetch-user-data-report?role=design";
      try {
        const response = await axios.get(url, {
          headers: {
            "x-access-token": localStorage.getItem("token"),
            Accept: "application/json",
            "Content-Type": "application/json",
          },
        });
        setFilteredEmployee(response.data);
      } catch (error) {
      } finally {
      }
    }
  };

  useEffect(() => {
    loadEmployee();
  }, []);

  const handlePageChange = (event, value) => {
    setCurrentPage(value);
    navigate(`?page=${value}`);
  };

  const ranges = {
    Today: [moment(), moment()],
    Yesterday: [moment().subtract(1, "days"), moment().subtract(1, "days")],
    "Last 7 Days": [moment().subtract(6, "days"), moment()],
    "Last 30 Days": [moment().subtract(29, "days"), moment()],
    "This Month": [moment().startOf("month"), moment().endOf("month")],
    "Last Month": [moment().subtract(1, "month").startOf("month"), moment().subtract(1, "month").endOf("month")],
  };

  const cancelToken = useRef(null);
  const handleExport = () => {
    loadFilterReportExport();
  };

  const exportToExcel = useCallback(dataForExport => {
    const ws = XLSX.utils.json_to_sheet(dataForExport);
    const wb = XLSX.utils.book_new();
    ws["!cols"] = autoColumnWidth(dataForExport);
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    XLSX.writeFile(wb, "Quality-checking-report.xlsx");
  }, []);

  const loadFilterReportExport = useCallback(async () => {
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
    setExportBtnLoading(true);
    const url = `${API_BASE_URL}qc-reports-generate-export?orderUID=${filters.search_text}&fromTime=${fromTimeUTC}&toTime=${toTimeUTC}&orderQC=${filters.designer}`;
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
        if (response.data.length > 0) {
          swal.fire({
            text: "Successfully Exported",
            icon: "success",
            type: "success",
          });
          const preparedData = prepareDataForExport(response.data);
          exportToExcel(preparedData);
        } else {
          swal.fire({
            text: "No data to export",
            icon: "info",
            type: "info",
          });
        }
        setExportBtnLoading(false);
      }
    } catch (error) {
    } finally {
      if (!source.token.reason) {
        setLoading(false);
      }
    }
  }, [exportToExcel, filters.designer, filters.endDate, filters.search_text, filters.startDate]);

  const prepareDataForExport = data => {
    return data.map(item => {
      return {
        "Order ID": item.order_unique_id,
        "QCed Person": item.qcFullName,
        Designer: item.designerFullName,
        "QC Start Time": item.order_qc_assigned_time
          ? moment(item.order_qc_assigned_time).format("DD-MM-YYYY hh:mm a")
          : "-",
        "QC Completion Time": item.order_qc_completed_time
          ? moment(item.order_qc_completed_time).format("DD-MM-YYYY hh:mm a")
          : "-",
        "Expected Delivery date": item.order_delivery_date_str ? item.order_delivery_date_str : "-",
        "Pieces Count": item.Order_Flashing_Count,
        "Drawings Count": item.shapeIDCount,
        "Customer Name": item.account_Name,
      };
    });
  };

  const autoColumnWidth = data => {
    const keys = Object.keys(data[0]);
    return keys.map(key => ({
      wch: Math.max(key.length, ...data.map(row => (row[key] ? row[key].toString().length : 0))),
    }));
  };

  return (
    <React.Fragment>
      <Row className="GeneralHeading withBackArrow">
        <Col md={6}>
          <HeadingTwo>
            <Link className="arrow-btn" onClick={() => navigate(-1)}>
              <IoMdArrowBack />
            </Link>
            QC Report
          </HeadingTwo>
        </Col>
      </Row>
      <Row>
        <Col md={12}>
          <MyDiv className="searchBar GeneralHeading mt-2 d-block">
            <Row>
              <Col md={2} xs={9} className="SearchTextBox">
                <TextField
                  id="search_text"
                  placeholder="Order id"
                  variant="outlined"
                  size="small"
                  onChange={handleSearchChange}
                  value={filters.search_text}
                />
              </Col>
              {RolePermission?.DesignReport?.add === "1" ? (
                <Col md={2}>
                  <TextField
                    select
                    variant="outlined"
                    size="small"
                    label="QC"
                    name="designer"
                    value={filters.designer}
                    SelectProps={{ onChange: handleFieldChange }}
                    className="form-control">
                    {filteredEmployees.map(filteredEmployee => (
                      <MenuItem key={filteredEmployee._id} value={filteredEmployee._id}>
                        {filteredEmployee.user_firstName} {filteredEmployee.user_lastName}
                      </MenuItem>
                    ))}
                  </TextField>
                </Col>
              ) : (
                ""
              )}
              <Col md={2} className="SearchTextBox dateRangePicker">
                <LabelTag>Start Date</LabelTag>
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
                  placeholdertext="Start Date">
                  <input
                    type="text"
                    value={filters.startDate + "-" + filters.endDate}
                    className="form-control data-range-picker"
                    placeholdertext={"Start Date"}
                    readOnly
                  />
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
                      sx={{
                        color: "#fff",
                        width: "40px",
                        height: "40px",
                        backgroundColor: "#30bf5c",
                        "&:hover": { backgroundColor: "#30bf5c" },
                      }}
                      component="a"
                      onClick={handleExport}>
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
                  <HeadingFour>{filteredOrders.TotalOrders ? filteredOrders.TotalOrders : "0"}</HeadingFour>
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
                  <HeadingThree>Total Pieces</HeadingThree>
                  <HeadingFour>{filteredOrders.TotalPieces ? filteredOrders.TotalPieces : "0"}</HeadingFour>
                </MyDiv>
                <MyDiv className="DashboardTopItemNotes">
                  <PTag>Based On Flashing Items</PTag>
                </MyDiv>
              </MyDiv>
            </Col>
            <Col md={3}>
              <MyDiv className="DashboardTopItem">
                <SpanTag className="DashboardTopItemIcon">
                  <GiStack />
                </SpanTag>
                <MyDiv className="DashboardTopItemContent">
                  <HeadingThree>Total Drawings</HeadingThree>
                  <HeadingFour>{filteredOrders.TotalShapeIDs ? filteredOrders.TotalShapeIDs : "0"}</HeadingFour>
                </MyDiv>
                <MyDiv className="DashboardTopItemNotes">
                  <PTag>Based On Shape Id</PTag>
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
                        <TableCell align="left">Order ID</TableCell>
                        <TableCell align="left">QCed Person</TableCell>
                        <TableCell align="left">Designer</TableCell>
                        <TableCell align="left">QC Start Time</TableCell>
                        <TableCell align="left">QC Completion Time</TableCell>
                        <TableCell align="left">Expected Delivery date</TableCell>
                        <TableCell align="left">Pieces Count</TableCell>
                        <TableCell align="left">Drawings Count</TableCell>
                        <TableCell align="left">Customer Name</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {filteredOrders.orderReportPagination?.length ? (
                        filteredOrders.orderReportPagination.map(item => (
                          <React.Fragment key={item._id}>
                            <TableRow>
                              <TableCell align="left" component="th" scope="row">
                                <Link to={`/orders/${item._id}`}> {item.order_unique_id}</Link>
                              </TableCell>
                              <TableCell align="left" component="th" scope="row">
                                {item.qcFullName}
                              </TableCell>
                              <TableCell align="left" component="th" scope="row">
                                {item.designerFullName}
                              </TableCell>
                              <TableCell align="left" component="th" scope="row">
                                {item.order_qc_assigned_time
                                  ? moment(item.order_qc_assigned_time).format("DD-MM-YYYY hh:mm a")
                                  : "-"}
                              </TableCell>
                              <TableCell align="left" component="th" scope="row">
                                {item.order_qc_completed_time
                                  ? moment(item.order_qc_completed_time).format("DD-MM-YYYY hh:mm a")
                                  : "-"}
                              </TableCell>
                              <TableCell align="left" component="th" scope="row">
                                {item.order_delivery_date_str} -{" "}
                                {getFormattedDeliveryTime(item.order_delivery_time, item.order_delivery_session)}
                              </TableCell>
                              <TableCell align="left" component="th" scope="row">
                                {item.Order_Flashing_Count}
                              </TableCell>
                              <TableCell align="left" component="th" scope="row">
                                {item.shapeIDCount}
                              </TableCell>
                              <TableCell align="left" component="th" scope="row">
                                {item.account_Name}
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

export default QCReport;
