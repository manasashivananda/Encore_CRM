import React, { useState, useEffect, useCallback, useRef } from "react";
import { Row, Col } from "react-bootstrap";
import { Link, useNavigate } from "react-router-dom";
import { getFormattedDeliveryTime, HeadingTwo, MyDiv, SpanTag } from "../../Common/Components";
import { Button, TextField, IconButton, MenuItem, Chip, Tooltip } from "@mui/material";
import { IoMdArrowBack } from "react-icons/io";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterLuxon } from "@mui/x-date-pickers/AdapterLuxon";
import moment from "moment";
import axios from "axios";
import swal from "sweetalert2";
import { green } from "@mui/material/colors";
import { FiLoader, FiRefreshCw } from "react-icons/fi";
import { DateTime } from "luxon";
import { departments } from "../../Common/staticjson";
import { DataGrid } from "@mui/x-data-grid";
import * as XLSX from "xlsx";
import { TbReload, TbTableExport } from "react-icons/tb";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function OperationDashboard() {
  const navigate = useNavigate();
  const [exportBtnDelivery, setExportBtnDelivery] = useState(false);
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [searchData, setSearchData] = useState({ search_text: "" });
  const [dateFilter, setDateFilter] = useState(() => {
    const today = DateTime.now();
    const nextDay = today.weekday === 5 ? today.plus({ days: 3 }) : today.plus({ days: 1 });
    return nextDay.toISODate();
  });

  const [loading, setLoading] = useState(false);
  const [selectedDepartments, setSelectedDepartments] = useState(["All Departments"]);
  const allDepartments = ["F", "J", "FG", "CL", "GBI", "ROOF"];
  const [selectedDepartment, setSelectedDepartment] = useState("All Departments");
  const cancelToken = useRef(null);
  const [sortModel, setSortModel] = useState([]);

  const setDateCallback = newValue => {
    setDateFilter(DateTime.fromJSDate(newValue.toJSDate()).toISODate());
  };

  const [selectedDeptValues, setSelectedDeptValues] = useState({
    F: "",
    J: "",
    FG: "",
    CL: "",
    GBI: "",
    ROOF: "",
  });

  const handleSelectChange = event => {
    const { name, value } = event.target;
    setSelectedDeptValues(prevState => ({
      ...prevState,
      [name]: value,
    }));
  };

  const loadLoadersReport = useCallback(async () => {
    setLoading(true);
    setFilteredOrders([]);
    if (cancelToken.current) {
      cancelToken.current.cancel("Operation canceled due to new request.");
    }
    const source = axios.CancelToken.source();
    cancelToken.current = source;
    const deliveryDate = DateTime.fromISO(dateFilter, { zone: "Australia/Sydney" }).startOf("day").toUTC().toISO();
    let departmentParams = "";
    if (selectedDepartments.includes("All Departments")) {
      departmentParams = `deptcode=All&` + allDepartments.map(dept => `${dept}=${selectedDeptValues[dept] || ""}`).join("&");
    } else {
      departmentParams = `deptcode=${selectedDepartments[0]}&` + allDepartments.map(dept => `${dept}=${selectedDeptValues[dept] || ""}`).join("&");
    }

    const url = `${API_BASE_URL}operations-dashboard-report?orderUID=${searchData.search_text}&deliveryDate=${deliveryDate}&${departmentParams}`;
    try {
      const response = await axios.get(url, {
        headers: {
          "x-access-token": localStorage.getItem("token"),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        cancelToken: source.token,
      });
      if (!axios.isCancel(source.token.reason)) {
        setFilteredOrders(response.data);
        setLoading(false);
      }
    } catch (error) {
      if (!axios.isCancel(error)) {
        swal.fire({
          text: "Data load Failed",
          icon: "error",
        });
      }
    } finally {
      if (!source.token.reason) {
        setLoading(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFilter, selectedDepartments, searchData.search_text, selectedDeptValues]);

  const exportData = () => {
    setExportBtnDelivery(true);
    if (!filteredOrders?.ReportItems?.length) {
      swal.fire("No Data", "There are no records to export.", "warning");
      return;
    }

    const exportDeptConfig = {
      F: {
        title: "Flashing",
        countKey: "ReportFlashingCount",
        totalKey: "Total_Flashing_Rows",
        countField: "f_order_prod_push_status",
        currentField: "f_order_prod_current_status",
        lineItemKey: "F",
      },
      J: {
        title: "Jobbing",
        countKey: "Total_J_Rows_Job",
        totalKey: "Total_J_Rows",
        countField: "j_order_prod_push_status",
        currentField: "j_order_prod_current_status",
        lineItemKey: "J",
      },
      FG: {
        title: "Facia Gutter",
        countKey: "Total_FG_Rows_Job",
        totalKey: "Total_FG_Rows",
        countField: "fg_order_prod_push_status",
        currentField: "fg_order_prod_current_status",
        lineItemKey: "FG",
      },
      CL: {
        title: "Cladding",
        countKey: "Total_CL_Rows_Job",
        totalKey: "Total_CL_Rows",
        countField: "cl_order_prod_push_status",
        currentField: "cl_order_prod_current_status",
        lineItemKey: "CL",
      },
      GBI: {
        title: "GBI",
        countKey: "Total_GBI_Rows_Job",
        totalKey: "Total_GBI_Rows",
        countField: "gbi_order_prod_push_status",
        currentField: "gbi_order_prod_current_status",
        lineItemKey: "GBI",
      },
      ROOF: {
        title: "Roofing",
        countKey: "Total_ROOF_Rows_Job",
        totalKey: "Total_ROOF_Rows",
        countField: "roof_order_prod_push_status",
        currentField: "roof_order_prod_current_status",
        lineItemKey: "ROOF",
      },
    };

    const selectedExportDepts = selectedDepartments.includes("All Departments") ? Object.keys(exportDeptConfig) : [selectedDepartments[0]];

    const csvRows = [];

    // Summary row
    const summaryRow = ["Total Orders", filteredOrders.Total_Rows || "0"];
    selectedExportDepts.forEach(dept => {
      const config = exportDeptConfig[dept];
      summaryRow.push(config.title);
      summaryRow.push(`${filteredOrders[config.countKey] || "0"}/${filteredOrders[config.totalKey] || "0"}`);
    });
    csvRows.push(summaryRow);

    // Header row
    const headers = ["S.No", "Created Date", "Customer Name", "Order ID", "Time"];
    selectedExportDepts.forEach(dept => {
      const config = exportDeptConfig[dept];
      headers.push(`${config.title} Count`);
      headers.push(`${config.title} Status`);
    });
    csvRows.push(headers);

    // Helper to get status
    const getStatus = (pushStatus, currentStatus, departmentCode) => {
      const status = Number(currentStatus);
      if (pushStatus === 0) return { text: "-" };
      if (pushStatus === 1) return { text: "Created" };
      if (pushStatus === 2) {
        const isFabric = departmentCode === "F";
        if (status === 2) return { text: "Rolled" };
        if (status === 4) {
          return { text: isFabric ? "Rolled & Folded" : "Folded" };
        }
        if (status === 6) {
          return { text: isFabric ? "Rolled, Folded & Racked" : "Folded & Racked" };
        }
        return { text: "Production In Progress" };
      }
      return { text: "-" };
    };

    // Data rows
    filteredOrders.ReportItems.forEach((item, index) => {
      const isCancelled = item.order_status === "Order Cancelled";
      const row = [index + 1, item.created_str?.split(" ")[0] || "-", item.order_customer_name || "-", item.order_unique_id || "-", getFormattedDeliveryTime(item.order_delivery_time, item.order_delivery_session) || "-"];

      selectedExportDepts.forEach(dept => {
        const config = exportDeptConfig[dept];
        const count = config.lineItemKey && item[config.countField] === 0 ? "-" : item.departmentLineItemCounts?.[config.lineItemKey] || "-";
        const status = isCancelled ? "Order Canceled" : item.order_hold ? "On Hold" : getStatus(item[config.countField], item[config.currentField], dept).text;

        row.push(count);
        row.push(status);
      });

      csvRows.push(row);
    });

    const worksheet = XLSX.utils.aoa_to_sheet(csvRows);
    const colWidths = headers.map((header, colIndex) => {
      const maxLength = csvRows.reduce((max, row) => Math.max(max, (row[colIndex] || "").toString().length), header.length);
      return { wch: maxLength + 2 };
    });
    worksheet["!cols"] = colWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Report");
    XLSX.writeFile(workbook, `Operations_Report_${moment().format("YYYYMMDD")}.xlsx`);
    setExportBtnDelivery(false);
  };

  useEffect(() => {
    loadLoadersReport();
  }, [loadLoadersReport, selectedDeptValues]);

  const searchHandle = e => {
    const searchNewData = { ...searchData, [e.target.id]: e.target.value };
    setSearchData(searchNewData);
  };

  const [resetFlag, setResetFlag] = useState(false);

  const handleReset = () => {
    setSearchData({ search_text: "" });
    setSelectedDepartments(["All Departments"]);
    setSelectedDepartment("All Departments");
    setSelectedDeptValues({ F: "", J: "", FG: "", CL: "", GBI: "", ROOF: "" });
    const today = DateTime.now();
    const nextDay = today.weekday === 5 ? today.plus({ days: 3 }) : today.plus({ days: 1 });
    setDateFilter(nextDay.toISODate());
    setFilteredOrders([]);
    setSortModel([])
    setResetFlag(true);
  };

  useEffect(() => {
    if (resetFlag) {
      loadLoadersReport();
      setResetFlag(false);
    }
  }, [loadLoadersReport, resetFlag]);

  const handleDepartmentChange = event => {
    const value = event.target.value;
    setSelectedDepartment(event.target.value);
    if (value === "All Departments") {
      setSelectedDepartments(["All Departments"]);
    } else {
      setSelectedDepartments([value]);
    }
  };
  const commonOptions = [
    { value: "4", label: "Folded" },
    { value: "6", label: "Racked" },
  ];
  const orderCategories = [
    { key: "Flashing", name: "F", totalKey: "Total_Flashing_Rows", jobKey: "ReportFlashingCount", options: [{ value: "2", label: "Rolled" }, ...commonOptions] },
    { key: "Jobbing", name: "J", totalKey: "Total_J_Rows", jobKey: "Total_J_Rows_Job", options: commonOptions },
    { key: "Facia Gutter", name: "FG", totalKey: "Total_FG_Rows", jobKey: "Total_FG_Rows_Job", options: commonOptions },
    { key: "Cladding", name: "CL", totalKey: "Total_CL_Rows", jobKey: "Total_CL_Rows_Job", options: commonOptions },
    { key: "GBI", name: "GBI", totalKey: "Total_GBI_Rows", jobKey: "Total_GBI_Rows_Job", options: commonOptions },
    { key: "Roofing", name: "ROOF", totalKey: "Total_ROOF_Rows", jobKey: "Total_ROOF_Rows_Job", options: commonOptions },
  ];

  const getStatus = (pushStatus, currentStatus, departmentCode) => {
    const status = Number(currentStatus);
    const isFabric = departmentCode === "F";

    if (pushStatus === 0) return { label: "-", text: "-", raw: 0 };
    if (pushStatus === 1) {
      return {
        label: <Chip className="chipStatus" label="Created" color="error" size="small" variant="outlined" />,
        text: "Created",
        raw: 1,
      };
    }

    if (pushStatus !== 2) return { label: "-", text: "-", raw: 0 };

    const statusMap = {
      2: {
        label: isFabric ? "RO" : null,
        title: isFabric ? "ROLLED" : "",
        text: "Rolled",
        raw: 2,
        color: "warning",
      },
      4: {
        label: isFabric ? "RO & FO" : "FO",
        title: isFabric ? "ROLLED & FOLDED" : "FOLDED",
        text: "Folded",
        raw: 4,
        color: "info",
      },
      6: {
        label: isFabric ? "RO, FO & RA" : "FO & RA",
        title: isFabric ? "ROLLED, FOLDED & RACKED" : "FOLDED & RACKED",
        text: "Racked",
        raw: 6,
        color: "success",
      },
    };

    const mapped = statusMap[status];
    if (mapped) {
      return {
        label: <Chip className="chipStatus" label={mapped.label} title={mapped.title} color={mapped.color} size="small" variant="outlined" />,
        text: mapped.text,
        raw: mapped.raw,
      };
    }
    return {
      label: <Chip className="chipStatus" label="PIP" color="secondary" size="small" variant="outlined" title="Production In Progress" />,
      text: "Production In Progress",
      raw: 3,
    };
  };

  const getCancelledStatus = () => ({
    label: <Chip className="chipStatus" label="OC" color="error" size="small" variant="standard" title="Order Cancelled" />,
    text: "Order Cancelled",
    raw: -1,
  });

  const rows =
    filteredOrders?.ReportItems?.map((item, index) => {
      const isCancelled = item.order_status === "Order Cancelled";

      return {
        serial_no: index + 1,
        created_str: item?.created_str?.split(" ")[0],
        created: item?.created,
        account_Name: item.order_customer_name,
        id: item._id,
        order_unique_id: item.order_unique_id,
        order_delivery_time: getFormattedDeliveryTime(item.order_delivery_time, item.order_delivery_session),
        flashing_count: item.f_order_prod_push_status === 0 ? "-" : item.departmentLineItemCounts?.F || "-",
        flashing_status: isCancelled ? getCancelledStatus() : item.order_hold
          ? { label: <Chip className="chipStatus" label="On Hold" color="warning" size="small" variant="standard" title="Order On Hold" />, text: "On hold", raw: -2 }
          : getStatus(item.f_order_prod_push_status, item.f_order_prod_current_status, "F"),
        jobbing_count: item.j_order_prod_push_status === 0 ? "-" : item.departmentLineItemCounts?.J || "-",
        jobbing_status: isCancelled
          ? getCancelledStatus()
          : item.order_hold
          ? { label: <Chip className="chipStatus" label="On Hold" color="warning" size="small" variant="standard" title="Order On Hold" />, text: "On hold", raw: -2 }
          : getStatus(item.j_order_prod_push_status, item.j_order_prod_current_status, "J"),
        facia_gutter_count: item.fg_order_prod_push_status === 0 ? "-" : item.departmentLineItemCounts?.FG || "-",
        facia_gutter_status: isCancelled
          ? getCancelledStatus()
          : item.order_hold
          ? { label: <Chip className="chipStatus" label="On Hold" color="warning" size="small" variant="standard" title="Order On Hold" />, text: "On hold", raw: -2 }
          : getStatus(item.fg_order_prod_push_status, item.fg_order_prod_current_status, "FG"),
        cladding_count: item.cl_order_prod_push_status === 0 ? "-" : item.departmentLineItemCounts?.CL || "-",
        cladding_status: isCancelled
          ? getCancelledStatus()
          : item.order_hold
          ? { label: <Chip className="chipStatus" label="On Hold" color="warning" size="small" variant="standard" title="Order On Hold" />, text: "On hold", raw: -2 }
          : getStatus(item.cl_order_prod_push_status, item.cl_order_prod_current_status, "CL"),
        gbi_count: item.gbi_order_prod_push_status === 0 ? "-" : item.departmentLineItemCounts?.GBI || "-",
        gbi_status: isCancelled
          ? getCancelledStatus()
          : item.order_hold
          ? { label: <Chip className="chipStatus" label="On Hold" color="warning" size="small" variant="standard" title="Order On Hold" />, text: "On hold", raw: -2 }
          : getStatus(item.gbi_order_prod_push_status, item.gbi_order_prod_current_status, "GBI"),
        roof_count: item.roof_order_prod_push_status === 0 ? "-" : item.departmentLineItemCounts?.ROOF || "-",
        roof_status: isCancelled
          ? getCancelledStatus()
          : item.order_hold
          ? { label: <Chip className="chipStatus" label="On Hold" color="warning" size="small" variant="standard" title="Order On Hold" />, text: "On hold", raw: -2 }
          : getStatus(item.roof_order_prod_push_status, item.roof_order_prod_current_status, "ROOF"),
      };
    }) || [];

  const allColumns = [
    { field: "serial_no", headerName: "S.No", width: 70 },
    { field: "created_str", headerName: "Created At", width: 100 },
    { field: "account_Name", headerName: "Customer Name", width: 150 },
    { field: "order_unique_id", headerName: "Order ID", width: 100 },
    { field: "order_delivery_time", headerName: "Time", width: 80 },
  ];
  const numericSort = (v1, v2) => {
    const num1 = v1 === "-" ? -1 : parseInt(v1, 10);
    const num2 = v2 === "-" ? -1 : parseInt(v2, 10);
    return num1 - num2;
  };

  const departmentColumns = {
    F: [
      { field: "flashing_count", headerName: "Flashing", flex: 1, renderCell: params => params.value, sortComparator: numericSort },
      { field: "flashing_status", headerName: "Status", flex: 1, renderCell: params => params.row.flashing_status?.label || "-", valueGetter: params => params.raw ?? 0 },
    ],
    J: [
      { field: "jobbing_count", headerName: "Jobbing", flex: 1, renderCell: params => params.value, sortComparator: numericSort },
      { field: "jobbing_status", headerName: "Status", flex: 1, renderCell: params => params.row.jobbing_status?.label || "-", valueGetter: params => params.raw ?? 0 },
    ],
    FG: [
      { field: "facia_gutter_count", headerName: "Facia Gutter", flex: 1, renderCell: params => params.value, sortComparator: numericSort },
      { field: "facia_gutter_status", headerName: "Status", flex: 1, renderCell: params => params.row.facia_gutter_status?.label || "-", valueGetter: params => params.raw ?? 0 },
    ],
    CL: [
      { field: "cladding_count", headerName: "Cladding", flex: 1, renderCell: params => params.value, sortComparator: numericSort },
      { field: "cladding_status", headerName: "Status", flex: 1, renderCell: params => params.row.cladding_status?.label || "-", valueGetter: params => params.raw ?? 0 },
    ],
    GBI: [
      { field: "gbi_count", headerName: "GBI", flex: 1, renderCell: params => params.value, sortComparator: numericSort },
      { field: "gbi_status", headerName: "Status", flex: 1, renderCell: params => params.row.gbi_status?.label || "-", valueGetter: params => params.raw ?? 0 },
    ],
    ROOF: [
      { field: "roof_count", headerName: "Roofing", flex: 1, renderCell: params => params.value, sortComparator: numericSort },
      { field: "roof_status", headerName: "Status", flex: 1, renderCell: params => params.row.roof_status?.label || "-", valueGetter: params => params.raw ?? 0 },
    ],
  };
  const displayedColumns = selectedDepartment === "All Departments" ? [...allColumns, ...Object.values(departmentColumns).flat()] : [...allColumns, ...(departmentColumns[selectedDepartment] || [])];

  return (
    <React.Fragment>
      <Row className="GeneralHeading withBackArrow">
        <Col md={6}>
          <HeadingTwo>
            <Link className="arrow-btn" onClick={() => navigate(-1)}>
              <IoMdArrowBack />
            </Link>
            Operation Dashboard
          </HeadingTwo>
        </Col>
      </Row>
      <Row>
        <Col md={12}>
          <MyDiv className="searchBar GeneralHeading mt-2 d-block">
            <Row>
              <Col md={2} xs={9} className="SearchTextBox">
                <TextField id="search_text" placeholder="Order id" variant="outlined" size="small" onChange={searchHandle} value={searchData.search_text} />
              </Col>
              <Col md={2} className="SearchTextBox">
                <TextField select label="Department" value={selectedDepartments[0]} onChange={handleDepartmentChange} size="small" fullWidth>
                  <MenuItem value="All Departments">All Departments</MenuItem>
                  {departments.length ? (
                    departments.map(depart => (
                      <MenuItem key={depart.value} value={depart.value}>
                        {depart.label}
                      </MenuItem>
                    ))
                  ) : (
                    <MenuItem>You don't have customer access or Department empty</MenuItem>
                  )}
                </TextField>
              </Col>
              <LocalizationProvider dateAdapter={AdapterLuxon}>
                <Col md={2} className="SearchTextBox dateRangePicker">
                  <DatePicker
                    slotProps={{ textField: { size: "small" } }}
                    label="Delivery Date"
                    value={DateTime.fromISO(dateFilter)}
                    onChange={newValue => setDateCallback(newValue)}
                    renderInput={params => <TextField {...params} fullWidth />}
                  />
                </Col>
              </LocalizationProvider>
              <Col md={3} className="d-flex">
                <Button className="btn secondary-btn add-cta search mx-1  mt-1" onClick={handleReset}>
                  Reset
                </Button>
                {exportBtnDelivery ? (
                  <IconButton aria-label="fingerprint" sx={{ color: green[500] }} className="IconBtnLoader">
                    <FiLoader />
                  </IconButton>
                ) : (
                  <Tooltip title="Export Excel">
                    <IconButton
                      aria-label="Export To Excel"
                      color="success"
                      sx={{ color: "#fff", width: "40px", height: "40px", backgroundColor: "#30bf5c", "&:hover": { backgroundColor: "#30bf5c" } }}
                      component="a"
                      onClick={exportData}
                    >
                      <TbTableExport />
                    </IconButton>
                  </Tooltip>
                )}
                <Tooltip title="Reload">
                  <IconButton
                    aria-label="Reload"
                    color="success"
                    sx={{ color: "#fff", width: "40px", height: "40px", marginLeft: "5px", backgroundColor: "var(--primary)", "&:hover": { backgroundColor: "var(--primary)" }  }}
                    component="button"
                    onClick={loadLoadersReport}
                  >
                    <TbReload />
                  </IconButton>
                </Tooltip>
              </Col>
            </Row>
          </MyDiv>
        </Col>
      </Row>
      {loading ? (
        <MyDiv className="BulkUploadLoader">
          <SpanTag>
            <IconButton aria-label="fingerprint" color="info" className="IconBtnLoader">
              <FiLoader />
            </IconButton>
            <br />
            Calculating Order Dashboard Counts
            <br /> Please Wait. Don't Press Back or Refresh. <br /> This Process May Take Some Seconds to Complete
          </SpanTag>
        </MyDiv>
      ) : (
        <React.Fragment>
          <Row className="DashboardTop mt-3 orderDashboardReportCard">
            <Col md={2}>
              <MyDiv className="DashboardTopItem">
                <MyDiv className="DashboardTopItemContent">
                  <h3>Total Orders</h3>
                  <h4>{filteredOrders?.Total_Rows}</h4>
                </MyDiv>
              </MyDiv>
            </Col>
            {filteredOrders && Object.keys(filteredOrders).length > 0 ? (
              orderCategories.map(({ key, name, totalKey, jobKey, options }) =>
                filteredOrders?.[totalKey] > 0 || filteredOrders?.[jobKey] > 0 ? (
                  <Col md={2} key={name}>
                    <MyDiv className="DashboardTopItem">
                      <MyDiv className="DashboardTopItemContent">
                        <MyDiv className="d-flex justify-content-between">
                          <h3>{key}</h3>
                          <select name={name} value={selectedDeptValues?.[name] || ""} onChange={handleSelectChange}>
                            <option value="">Select</option>
                            {options.map(option => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </MyDiv>
                        <h4>
                          {filteredOrders[jobKey]} / {filteredOrders[totalKey]}
                        </h4>
                      </MyDiv>
                    </MyDiv>
                  </Col>
                ) : null
              )
            ) : (
              <SpanTag className="w-100 text-center">No Data data...</SpanTag>
            )}
          </Row>

          <MyDiv className="DataTable">
            <DataGrid
              rows={rows}
              columns={displayedColumns}
              rowHeight={32}
              filterMode="client"
              disableColumnMenu
              disableRowSelectionOnClick
              sortModel={sortModel}
              onSortModelChange={(newModel) => setSortModel(newModel)}
              sx={{ "&.MuiButton-root:hover": { backgroundColor: "white" } }}
            />
          </MyDiv>
        </React.Fragment>
      )}
    </React.Fragment>
  );
}

export default OperationDashboard;