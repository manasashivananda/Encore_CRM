import React, { useState, useEffect, useCallback, useRef } from "react";
import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";
import { Link, useNavigate } from "react-router-dom";
import { HeadingTwo, HeadingFour, MyDiv, SpanTag, PTag, HeadingThree, LabelTag } from "../Common/Components";
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
  Tooltip,
} from "@mui/material";
import { IoMdArrowBack } from "react-icons/io";
import DateRangePicker from "react-bootstrap-daterangepicker";
import "bootstrap-daterangepicker/daterangepicker.css";
import moment from "moment";
import axios from "axios";
import { departments } from "../Common/staticjson";
import NoDataFound from "../Common/noDataFound";
import { TbTableExport } from "react-icons/tb";
import * as XLSX from "xlsx";
import { FaUsers, FaUserCheck } from "react-icons/fa";
import { green } from "@mui/material/colors";
import { GiStack } from "react-icons/gi";
import { FiLoader } from "react-icons/fi";
import { ImStackoverflow } from "react-icons/im";
import { DateTime } from "luxon";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function ProductionReport() {
  const RolePermission = JSON.parse(localStorage.getItem("role"));
  const navigate = useNavigate();
  const [filteredEmployees, setFilteredEmployee] = useState([]);
  const [exportBtnLoading, setExportBtnLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [department, setDepartment] = useState("");
  const [productionEmp, setProductionEmp] = useState("");
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [filteredOrdersSummary, setFilteredOrdersSummary] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dateFilter, setDateFilter] = useState({
    startDate: moment().startOf("").format("YYYY-MM-DD"),
    endDate: moment().endOf("").format("YYYY-MM-DD"),
    convertedStartDate: moment().startOf("").format("YYYY-MM-DD"),
    convertedEndDate: moment().endOf("").format("YYYY-MM-DD"),
    dateMode: "",
  });

  useEffect(() => {
    loadEmployee();
  }, []);

  const setDates = (e, { startDate, endDate }) => {
    let chosenDateMode;
    for (const key in e.target) {
      if (key.startsWith("jQuery")) {
        const jQueryObject = e.target[key];
        const chosenLabel = jQueryObject.daterangepicker.chosenLabel;
        chosenDateMode = chosenLabel;
        break;
      }
    }
    setDateFilter({
      startDate: startDate.format(chosenDateMode === "Custom Range" ? "DD-MMM-YYYY HH:mm A" : "YYYY-MM-DD"),
      endDate: endDate.format(chosenDateMode === "Custom Range" ? "DD-MMM-YYYY HH:mm A" : "YYYY-MM-DD"),
      convertedStartDate: startDate.format("YYYY-MM-DDTHH:mm:ss.SSSZ"),
      convertedEndDate: endDate.format("YYYY-MM-DDTHH:mm:ss.SSSZ"),
      dateMode: chosenDateMode,
    });
  };

  const cancelToken = useRef(null);
  const loadEmployeeReport = useCallback(async () => {
    setLoading(true);
    if (cancelToken.current) {
      cancelToken.current.cancel("Operation canceled due to new request.");
    }
    const source = axios.CancelToken.source();
    cancelToken.current = source;
    let fromTimeUTC, toTimeUTC;
    if (dateFilter.dateMode === "Custom Range") {
      fromTimeUTC = new Date(dateFilter.convertedStartDate).toISOString();
      toTimeUTC = new Date(dateFilter.convertedEndDate).toISOString();
    } else {
      const startDate = DateTime.fromISO(dateFilter.startDate)
        .set({ hour: 0, minute: 0, second: 0, millisecond: 0 })
        .toUTC();
      const endDate = DateTime.fromISO(dateFilter.endDate)
        .set({ hour: 23, minute: 59, second: 59, millisecond: 999 })
        .toUTC();
      const toAEST = date => date.setZone("Australia/Sydney", { keepLocalTime: true }).toUTC();
      fromTimeUTC = toAEST(startDate).toISO();
      toTimeUTC = toAEST(endDate).toISO();
    }

    const url = `${API_BASE_URL}employee-production-dashboard-report?fromTime=${fromTimeUTC}&toTime=${toTimeUTC}&empid=${productionEmp}&deptcode=${department}`;
    try {
      const response = await axios.get(url, {
        headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" },
        cancelToken: source.token,
      });
      setFilteredOrders(response.data.Data);
      setFilteredOrdersSummary(response.data.OverAllTotal);
      setLoading(false);
    } catch (error) {
    } finally {
      if (!source.token.reason) {
        setLoading(false);
      }
    }
  }, [dateFilter, department, productionEmp]);

  useEffect(() => {
    loadEmployeeReport();
  }, [dateFilter, status, department, productionEmp, loadEmployeeReport]);

  const loadEmployee = async () => {
    const url = API_BASE_URL + "fetch-user-data-report?role=production";
    try {
      const response = await axios.get(url, {
        headers: {
          "x-access-token": localStorage.getItem("token"),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });
      setFilteredEmployee(response.data);
    } catch (error) {}
  };

  const handleFieldChange = event => {
    const { name, value } = event.target;
    if (name === "status") {
      setStatus(value);
    } else if (name === "productionEmp") {
      setProductionEmp(value);
    } else if (name === "department") {
      setDepartment(value);
    }
  };

  const handleReset = () => {
    setStatus("");
    setProductionEmp("");
    setDepartment("");
    setFilteredOrders([]);

    setDateFilter({
      startDate: moment().startOf("").format("YYYY-MM-DD"),
      endDate: moment().endOf("").format("YYYY-MM-DD"),
      convertedStartDate: moment().startOf("").format("YYYY-MM-DD"),
      convertedEndDate: moment().endOf("").format("YYYY-MM-DD"),
      dateMode: "",
    });

    loadEmployeeReport();

    setTimeout(() => {
      loadEmployeeReport();
    }, 0);
  };

  const ranges = {
    Today: [moment(), moment()],
    Yesterday: [moment().subtract(1, "days"), moment().subtract(1, "days")],
    "Last 7 Days": [moment().subtract(6, "days"), moment()],
    "Last 30 Days": [moment().subtract(29, "days"), moment()],
    "This Month": [moment().startOf("month"), moment().endOf("month")],
    "Last Month": [moment().subtract(1, "month").startOf("month"), moment().subtract(1, "month").endOf("month")],
  };

  const handleExport = () => {
    setExportBtnLoading(true);
    const dataForExport = prepareDataForExport();
    const ws = XLSX.utils.json_to_sheet(dataForExport);
    const wb = XLSX.utils.book_new();
    ws["!cols"] = autoColumnWidth(dataForExport);
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    XLSX.writeFile(wb, "production_report.xlsx");
  };

  const prepareDataForExport = () => {
    const dataForExport = filteredOrders.map(item => ({
      "Employee Name": item.empFName + " " + item.EmpName,
      Department: item.Department,
      Rolled: item.Roll_Count,
      Folded: item.Fold_Count,
      "No of Flashing Folds": item.TotalFlashingFoldCount,
      "Total Jobs Count": item.Total_Jobs,
    }));
    setExportBtnLoading(false);
    return dataForExport;
  };

  const autoColumnWidth = data => {
    const keys = Object.keys(data[0]);
    const colWidth = keys.map(key => {
      const maxWidth = data.reduce((max, row) => {
        if (row[key] && row[key].toString().length > max) {
          return row[key].toString().length;
        }
        return max;
      }, key.length);
      return { wch: maxWidth };
    });
    return colWidth;
  };

  return (
    <React.Fragment>
      <Row className="GeneralHeading withBackArrow">
        <Col md={6}>
          <HeadingTwo>
            <Link className="arrow-btn" onClick={() => navigate(-1)}>
              <IoMdArrowBack />
            </Link>
            Employee Production Report
          </HeadingTwo>
        </Col>
      </Row>
      <Row>
        <Col md={12}>
          <MyDiv className="searchBar GeneralHeading mt-2 d-block">
            <Row>
              {RolePermission?.ProductionReport?.add === "1" ? (
                <Col md={2}>
                  <TextField
                    select
                    variant="outlined"
                    size="small"
                    label="Production Employee"
                    name="productionEmp"
                    className="form-control"
                    SelectProps={{ multiple: false, value: productionEmp, onChange: handleFieldChange }}>
                    {filteredEmployees.map(filteredEmployee => (
                      <MenuItem key={filteredEmployee._id} value={filteredEmployee._id}>
                        {filteredEmployee.user_firstName} {filteredEmployee.user_lastName}
                      </MenuItem>
                    ))}
                  </TextField>
                </Col>
              ) : null}
              <Col md={2}>
                <TextField
                  select
                  variant="outlined"
                  size="small"
                  label="Department"
                  name="department"
                  value={department}
                  onChange={handleFieldChange}
                  className="form-control">
                  <MenuItem key="all-department" value="-">
                    -- All Department --
                  </MenuItem>
                  {departments.map(departments => (
                    <MenuItem key={departments.value} value={departments.value}>
                      {departments.label}
                    </MenuItem>
                  ))}
                </TextField>
              </Col>
              <Col md={3} className="SearchTextBox dateRangePicker">
                <LabelTag>Worked Date</LabelTag>

                <DateRangePicker
                  onApply={setDates}
                  initialSettings={{
                    ranges: ranges,
                    timePicker: true,
                    timePickerIncrement: 15,
                    locale: { format: "MM/DD/YYYY hh:mm A" },
                  }}>
                  <input
                    type="text"
                    value={`${dateFilter.startDate}-${dateFilter.endDate}`}
                    className="form-control data-range-picker"
                    readOnly
                  />
                </DateRangePicker>
              </Col>
              <Col md={2}>
                <Button className="btn secondary-btn add-cta search  me-2 mt-1" onClick={handleReset}>
                  Reset
                </Button>

                {exportBtnLoading ? (
                  <IconButton aria-label="fingerprint" sx={{ color: green[500] }} className="IconBtnLoader">
                    <FiLoader />
                  </IconButton>
                ) : (
                  <Tooltip title="Export Excel">
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
          {filteredOrdersSummary?.length
            ? filteredOrdersSummary.map((item, index) => (
                <React.Fragment key={index}>
                  <Row className="DashboardTop mt-3">
                    <Col md={3}>
                      <MyDiv className="DashboardTopItem">
                        <SpanTag className="DashboardTopItemIcon">
                          <FaUsers />
                        </SpanTag>
                        <MyDiv className="DashboardTopItemContent">
                          <HeadingThree>Total Employee</HeadingThree>
                          <HeadingFour>{item.OverallgeneratedEmployees}</HeadingFour>
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
                          <HeadingThree>Total Department</HeadingThree>
                          <HeadingFour>6</HeadingFour>
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
                          <HeadingThree>Total Rolled / Folded</HeadingThree>
                          <HeadingFour>
                            {item.overallTotalRollCount} / {item.overallTotalFoldCount}
                          </HeadingFour>
                        </MyDiv>
                        <MyDiv className="DashboardTopItemNotes">
                          <PTag>In All Departments</PTag>
                        </MyDiv>
                      </MyDiv>
                    </Col>
                    <Col md={3}>
                      <MyDiv className="DashboardTopItem">
                        <SpanTag className="DashboardTopItemIcon">
                          <GiStack />
                        </SpanTag>
                        <MyDiv className="DashboardTopItemContent">
                          <HeadingThree>Total Jobs Count</HeadingThree>
                          <HeadingFour>{item.OverallgeneratedTotalJobs}</HeadingFour>
                        </MyDiv>
                        <MyDiv className="DashboardTopItemNotes">
                          <PTag>Based On filter</PTag>
                        </MyDiv>
                      </MyDiv>
                    </Col>
                  </Row>
                </React.Fragment>
              ))
            : null}

          <Row>
            <Col md={12}>
              <MyDiv className="GeneralTable">
                <TableContainer>
                  <Table className="bgGrey" aria-label="Order table">
                    <TableHead>
                      <TableRow>
                        <TableCell align="left">Employee Name</TableCell>
                        <TableCell align="left">Department</TableCell>
                        <TableCell align="left">Rolled</TableCell>
                        <TableCell align="left">Folded</TableCell>
                        <TableCell align="left">No of Flashing Folds</TableCell>
                        <TableCell align="left">Total Jobs Count</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {filteredOrders?.length ? (
                        filteredOrders.map(item => (
                          <React.Fragment key={item._id}>
                            <TableRow>
                              <TableCell align="left" component="th" scope="row">
                                {item.empFName} {item.EmpName}
                              </TableCell>
                              <TableCell align="left" component="th" scope="row">
                                {item.Department}
                              </TableCell>
                              <TableCell align="left" component="th" scope="row">
                                {item.Roll_Count}
                              </TableCell>
                              <TableCell align="left" component="th" scope="row">
                                {item.Fold_Count}
                              </TableCell>
                              <TableCell align="left" component="th" scope="row">
                                {item.TotalFlashingFoldCount}
                              </TableCell>
                              <TableCell align="left" component="th" scope="row">
                                {item.Total_Jobs}
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
              </MyDiv>
            </Col>
          </Row>
        </React.Fragment>
      )}
    </React.Fragment>
  );
}

export default ProductionReport;
