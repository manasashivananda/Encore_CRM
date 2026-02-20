import React, { useState, useEffect, useCallback, useRef } from "react";
import { Row, Col, Badge } from "react-bootstrap";
import { HeadingTwo, MyDiv, HeadingFour, LabelTag, SpanTag, HeadingThree, PTag } from "../Common/Components";
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
} from "@mui/material";
import axios from "axios";
import NoDataFound from "../Common/noDataFound";
import DateRangePicker from "react-bootstrap-daterangepicker";
import "bootstrap-daterangepicker/daterangepicker.css";
import moment from "moment";
import swal from "sweetalert2";
import { GiStack } from "react-icons/gi";
import { ImStackoverflow } from "react-icons/im";
import { DateTime } from "luxon";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

const RolePermission = JSON.parse(localStorage.getItem("role"));

function ProductionEmployeeMaster({ orderUpdate }) {
  const [loading, setLoading] = useState(false);
  const [filteredEmployees, setFilteredEmployee] = useState([]);
  const ordersCancelToken = useRef();
  const summaryCancelToken = useRef();

  const [searchData, setSearchData] = useState({ search_text: "" });
  const [productionEmp, setProductionEmp] = useState("");
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [filteredOrderSummary, setFilteredOrderSummary] = useState([]);

  const [dateFilter, setDateFilter] = useState({
    startDate: moment().startOf("").format("YYYY-MM-DD"),
    endDate: moment().endOf("").format("YYYY-MM-DD"),
    convertedStartDate: moment().startOf("").format("YYYY-MM-DD"),
    convertedEndDate: moment().endOf("").format("YYYY-MM-DD"),
    dateMode: "",
  });

  const setDatesCallback = (event, picker) => {
    const chosenLabel = picker.chosenLabel;
    const convertedStart = picker.startDate.toISOString();
    const convertedEnd = picker.endDate.toISOString();

    setDateFilter({
      startDate: picker.startDate.format(chosenLabel === "Custom Range" ? "DD-MMM-YYYY hh:mm A" : "YYYY-MM-DD"),
      endDate: picker.endDate.format(chosenLabel === "Custom Range" ? "DD-MMM-YYYY hh:mm A" : "YYYY-MM-DD"),
      convertedStartDate: convertedStart,
      convertedEndDate: convertedEnd,
      dateMode: chosenLabel,
    });
  };

  const loadEmployeeOrders = useCallback(async () => {
    setLoading(true);
    if (ordersCancelToken.current) {
      ordersCancelToken.current.cancel("Operation canceled due to new request.");
    }
    const source = axios.CancelToken.source();
    ordersCancelToken.current = source;

    let fromTimeUTC, toTimeUTC;
    if (dateFilter.dateMode === "Custom Range") {
      fromTimeUTC = DateTime.fromISO(dateFilter.convertedStartDate).toUTC().toISO();
      toTimeUTC = DateTime.fromISO(dateFilter.convertedEndDate).toUTC().toISO();
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
    const url = `${API_BASE_URL}employee-production-dashboard-info?orderUID=${searchData.search_text}&fromTime=${fromTimeUTC}&toTime=${toTimeUTC}&empid=${productionEmp}`;

    try {
      const response = await axios.get(url, {
        headers: {
          "x-access-token": localStorage.getItem("token"),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        ordersCancelToken: source.token,
      });
      setFilteredOrders(response.data);
    } catch (error) {
      console.log(error);
    } finally {
      setLoading(true);
      if (!source.token.reason) {
        setLoading(false);
      }
    }
  }, [searchData.search_text, dateFilter, productionEmp]);

  const loadEmployeeOrderSummary = useCallback(async () => {
    setLoading(true);
    if (summaryCancelToken.current) {
      summaryCancelToken.current.cancel("Operation canceled due to new request.");
    }
    const source = axios.CancelToken.source();
    summaryCancelToken.current = source;

    let fromTimeUTC, toTimeUTC;
    if (dateFilter.dateMode === "Custom Range") {
      fromTimeUTC = DateTime.fromISO(dateFilter.convertedStartDate).toUTC().toISO();
      toTimeUTC = DateTime.fromISO(dateFilter.convertedEndDate).toUTC().toISO();
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
    const url = `${API_BASE_URL}employee-production-dashboard-info-summary?orderUID=${searchData.search_text}&fromTime=${fromTimeUTC}&toTime=${toTimeUTC}&empid=${productionEmp}`;

    try {
      const response = await axios.get(url, {
        headers: {
          "x-access-token": localStorage.getItem("token"),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        summaryCancelToken: source.token,
      });
      setFilteredOrderSummary(response.data);
    } catch (error) {
      console.log(error);
    } finally {
      setLoading(true);
      if (!source.token.reason) {
        setLoading(false);
      }
    }
  }, [searchData.search_text, dateFilter, productionEmp]);

  useEffect(() => {
    loadEmployeeOrders();
    loadEmployeeOrderSummary();
  }, [searchData.search_text, dateFilter, productionEmp, loadEmployeeOrders, loadEmployeeOrderSummary]);

  const handleReset = () => {
    setSearchData({ search_text: "" });
    setDateFilter({
      startDate: moment().startOf("").format("YYYY-MM-DD"),
      endDate: moment().endOf("").format("YYYY-MM-DD"),
    });
    setFilteredOrders([]);
    loadEmployeeOrders();
    loadEmployeeOrderSummary();
    setProductionEmp("");
  };

  const loadEmployee = async () => {
    if (RolePermission?.DesignReport?.add === "1") {
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
      } catch (error) {
        console.log(error);
      }
    }
  };

  useEffect(() => {
    loadEmployee();
    if (orderUpdate === "updated") {
      loadEmployeeOrders();
      loadEmployeeOrderSummary();
    }
  }, [loadEmployeeOrderSummary, loadEmployeeOrders, orderUpdate]);

  const searchHandle = e => {
    const searchNewData = { ...searchData, [e.target.id]: e.target.value };
    setSearchData(searchNewData);
  };
  const ranges = {
    Today: [moment(), moment()],
    Yesterday: [moment().subtract(1, "days"), moment().subtract(1, "days")],
    "Last 7 Days": [moment().subtract(6, "days"), moment()],
    "Last 30 Days": [moment().subtract(29, "days"), moment()],
    "This Month": [moment().startOf("month"), moment().endOf("month")],
    "Last Month": [moment().subtract(1, "month").startOf("month"), moment().subtract(1, "month").endOf("month")],
  };

  const getStatusBadge = status => {
    let color, backgroundColor;

    switch (status) {
      case "Order Created":
        color = "primary";
        backgroundColor = "#00AFD7";
        break;
      case "Order In Progress":
        color = "info";
        backgroundColor = "#e567ba";
        break;
      case "Production In Progress":
        color = "default";
        backgroundColor = "#3aad76";
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

  const [racks, setRacks] = useState([]);
  const loadRacks = async () => {
    const url = `${API_BASE_URL}fetch-racking-data-dropdown`;
    try {
      const response = await axios.get(url, {
        headers: {
          "x-access-token": localStorage.getItem("token"),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });
      setRacks(response.data);
    } catch (error) {
      console.log(error);
    }
  };
  useEffect(() => {
    loadRacks();
  }, []);
  // Handle field change
  const handleFieldChange = (event, orderUID, deptCode) => {
    const { name, value } = event.target;
    if (name === "order_sub_rack") {
      updateRackDetails(orderUID, deptCode, value);
    } else if (name === "productionEmp") {
      setProductionEmp(value);
    }
  };

  // Update rack details
  const updateRackDetails = (orderUId, deptCode, subRackId) => {
    const url = `${API_BASE_URL}update-order-department-rack-details-custom?OrderID=${orderUId}&Dept=${deptCode}&SRack=${subRackId}`;
    const method = "patch";
    axios({
      method,
      url,
      headers: {
        "x-access-token": localStorage.getItem("token"),
        Accept: "application/json",
        "Content-Type": "multipart/form-data",
      },
    })
      .then(res => {
        if (res.status === 200) {
          swal.fire({
            text: res.data,
            icon: "success",
            type: "success",
          });
          loadEmployeeOrders();
          loadEmployeeOrderSummary();
        }
      })
      .catch(error => {
        swal.fire({
          text: error.response.data,
          icon: "error",
          type: "error",
        });
      });
  };

  return (
    <React.Fragment>
      <Row className="GeneralHeading">
        <Col md={6} xs={6}>
          <HeadingTwo>Production Employee Job Info</HeadingTwo>
        </Col>
        <Col md={6} xs={6} className="text-end"></Col>
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
                  onChange={searchHandle}
                  value={searchData.search_text}
                />
              </Col>
              {RolePermission?.ProductionReport?.add === "1" ? (
                <Col md={2}>
                  <TextField
                    select
                    variant="outlined"
                    size="small"
                    label="Production Employee"
                    name="productionEmp"
                    value={productionEmp}
                    onChange={handleFieldChange}
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
                  onApply={setDatesCallback}
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
              <Col md={3} className="d-flex">
                <Button className="btn secondary-btn add-cta search mx-1" onClick={handleReset}>
                  Reset
                </Button>
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
              <MyDiv className="DashboardTopItem  py-2">
                <SpanTag className="DashboardTopItemIcon">
                  <ImStackoverflow />
                </SpanTag>
                <MyDiv className="DashboardTopItemContent">
                  <HeadingThree>Total Orders</HeadingThree>
                  <HeadingFour>{filteredOrders.totalCount}</HeadingFour>
                </MyDiv>
                <MyDiv className="DashboardTopItemNotes">
                  <PTag>All Orders</PTag>
                </MyDiv>
              </MyDiv>
            </Col>
            {filteredOrderSummary.OrderDetailsSummary?.length
              ? filteredOrderSummary.OrderDetailsSummary.map((item, index) => (
                  <Col md={3} key={index}>
                    <MyDiv className="DashboardTopItem py-2">
                      <SpanTag className="DashboardTopItemIcon">
                        <GiStack />
                      </SpanTag>
                      <MyDiv className="DashboardTopItemContent">
                        <HeadingThree>
                          {item.Order_Dept_Code === "F" ? "Flashing" : ""}
                          {item.Order_Dept_Code === "J" ? "Jobbing" : ""}
                          {item.Order_Dept_Code === "FG" ? "Facia Gutter" : ""}
                          {item.Order_Dept_Code === "CL" ? "Cladding" : ""}
                          {item.Order_Dept_Code === "GBI" ? "GBI" : ""}
                          {item.Order_Dept_Code === "ROOF" ? "Roofing" : ""}
                        </HeadingThree>
                        <HeadingFour>
                          <React.Fragment key={index}>
                            {(() => {
                              const jobForStatus2 = item.subDeptStatuses?.find(
                                jobs => jobs.Order_SubDept_Status === "2"
                              );
                              const jobForStatus4 = item.subDeptStatuses?.find(
                                jobs => jobs.Order_SubDept_Status === "4"
                              );
                              const jobForStatus6 = item.subDeptStatuses?.find(
                                jobs => jobs.Order_SubDept_Status === "6"
                              );
                              return (
                                <MyDiv className="d-flex">
                                  <MyDiv>{jobForStatus2 ? jobForStatus2.totalJobCount : "-"}</MyDiv>&nbsp;/&nbsp;
                                  <MyDiv>{jobForStatus4 ? jobForStatus4.totalJobCount : "-"}</MyDiv>&nbsp;/&nbsp;
                                  <MyDiv>{jobForStatus6 ? jobForStatus6.totalJobCount : "-"}</MyDiv>
                                </MyDiv>
                              );
                            })()}
                          </React.Fragment>
                        </HeadingFour>
                      </MyDiv>
                      <MyDiv className="DashboardTopItemNotes">
                        <PTag>Rolled / Folded / Racked</PTag>
                      </MyDiv>
                    </MyDiv>
                  </Col>
                ))
              : null}
          </Row>

          <Row>
            <Col md={12}>
              <MyDiv className="GeneralTable">
                <TableContainer>
                  <Table className="bgGrey" aria-label="Department table">
                    <TableHead>
                      <TableRow>
                        <TableCell align="left">Order Id</TableCell>
                        <TableCell align="left">
                          <MyDiv className="d-flex">
                            <MyDiv className="productionEmpReportDeptCount">Department</MyDiv>
                            <MyDiv className="productionEmpReportDeptCount">Count</MyDiv>
                            <MyDiv className="d-flex justify-content-between productionEmpReportJobSplit">
                              <MyDiv>Rolled</MyDiv>
                              <MyDiv>Folded</MyDiv>
                              <MyDiv>Racked</MyDiv>
                              <MyDiv className="productionRackFiled">Rack</MyDiv>
                              {/* <MyDiv></MyDiv> */}
                            </MyDiv>
                          </MyDiv>
                        </TableCell>
                        <TableCell align="left">Order Current Status</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {filteredOrders?.orderDetails?.length ? (
                        filteredOrders?.orderDetails.map((item, index) => (
                          <React.Fragment key={index}>
                            <TableRow>
                              <TableCell align="left" component="th" scope="row" width="100" className="py-1">
                                {item.D_Order_UId}
                              </TableCell>
                              <TableCell align="left" component="th" scope="row" width="500" className="p-1">
                                {item.departments?.length
                                  ? item.departments.map((dept, index) => (
                                      <React.Fragment key={index}>
                                        <MyDiv
                                          className={`d-flex mb-2 ${
                                            dept.deptCode === "F"
                                              ? "flashingBg"
                                              : dept.deptCode === "CL"
                                              ? "claddingBg"
                                              : dept.deptCode === "GBI"
                                              ? "gbiBg"
                                              : dept.deptCode === "FG"
                                              ? "faciaBg"
                                              : dept.deptCode === "J"
                                              ? "jobbingBg"
                                              : dept.deptCode === "ROOF"
                                              ? "roofingBg"
                                              : ""
                                          }`}>
                                          <MyDiv className="productionEmpReportDeptCount">
                                            {dept.deptCode === "F" ? (
                                              <>
                                                <Badge className="flashingBg">Flashing </Badge> <br />
                                              </>
                                            ) : null}
                                            {dept.deptCode === "CL" ? (
                                              <>
                                                <Badge className="claddingBg">Cladding</Badge> <br />
                                              </>
                                            ) : null}
                                            {dept.deptCode === "GBI" ? (
                                              <>
                                                <Badge className="gbiBg">GBI</Badge> <br />
                                              </>
                                            ) : null}
                                            {dept.deptCode === "FG" ? (
                                              <>
                                                <Badge className="faciaBg">Facia Gutter</Badge> <br />
                                              </>
                                            ) : null}
                                            {dept.deptCode === "J" ? (
                                              <>
                                                <Badge className="jobbingBg">Jobbing</Badge> <br />
                                              </>
                                            ) : null}
                                            {dept.deptCode === "ROOF" ? (
                                              <Badge className="roofingBg">Roofing</Badge>
                                            ) : null}
                                          </MyDiv>
                                          <MyDiv className="productionEmpReportDeptCount">
                                            <MyDiv>{dept.jobCount}</MyDiv>
                                          </MyDiv>
                                          <MyDiv className="d-flex justify-content-between productionEmpReportJobSplit">
                                            {/* Extract job statuses outside for clarity */}
                                            {(() => {
                                              const getJobUserName = status => {
                                                const job = dept.subDeptStatuses?.find(jobs => jobs.status === status);
                                                return job ? job.userName : "-";
                                              };

                                              const jobForStatus4 = dept.subDeptStatuses?.find(
                                                jobs => jobs.status === "4"
                                              );
                                              const jobForStatus6 = dept.subDeptStatuses?.find(
                                                jobs => jobs.status === "6"
                                              );
                                              const shouldShowRack = jobForStatus4 || jobForStatus6;

                                              return (
                                                <>
                                                  <MyDiv>{getJobUserName("2")}</MyDiv>
                                                  <MyDiv>{getJobUserName("4")}</MyDiv>
                                                  <MyDiv>{getJobUserName("6")}</MyDiv>

                                                  <MyDiv className="productionRackFiled">
                                                    {shouldShowRack && (
                                                      <select
                                                        required
                                                        name="order_sub_rack"
                                                        id="order_sub_rack"
                                                        label="Sub Rack"
                                                        value={dept.rackID || ""}
                                                        onChange={e =>
                                                          handleFieldChange(e, item.Order_UId, dept.deptCode)
                                                        }>
                                                        <option value="">Select a Rack</option>
                                                        {racks.length > 0 &&
                                                          racks.map(SubRackList => (
                                                            <option key={SubRackList._id} value={SubRackList._id}>
                                                              {SubRackList.rack_name}
                                                            </option>
                                                          ))}
                                                      </select>
                                                    )}
                                                  </MyDiv>
                                                </>
                                              );
                                            })()}
                                          </MyDiv>
                                        </MyDiv>
                                      </React.Fragment>
                                    ))
                                  : null}
                              </TableCell>
                              <TableCell align="left" component="th" scope="row" className="p-1">
                                <MyDiv> {getStatusBadge(item.Order_Status)}</MyDiv>
                              </TableCell>
                              <TableCell align="center" className="hide"></TableCell>
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

export default ProductionEmployeeMaster;
