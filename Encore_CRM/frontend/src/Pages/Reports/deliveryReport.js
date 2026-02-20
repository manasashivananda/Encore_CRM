import React, { useState, useEffect, useCallback, useRef } from "react";
import { Row, Col, Badge } from "react-bootstrap";
import { Link, useNavigate } from "react-router-dom";
import { HeadingTwo, HeadingFour, MyDiv, SpanTag, CurrencyDisplay, getFormattedDeliveryTime } from "../Common/Components";
import { TableBody, Table, TableContainer, TableHead, TableRow, TableCell, Button, TextField, IconButton, Pagination, Tooltip } from "@mui/material";
import { IoMdArrowBack } from "react-icons/io";
import { TbTableExport } from "react-icons/tb";
import "bootstrap-daterangepicker/daterangepicker.css";
import axios from "axios";
import NoDataFound from "../Common/noDataFound";
import swal from "sweetalert2";
import { green } from "@mui/material/colors";
import { FiLoader } from "react-icons/fi";
import { DateTime } from "luxon";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterLuxon } from "@mui/x-date-pickers/AdapterLuxon";
import { Workbook } from "exceljs";
import { getNextBusinessDay } from "../Common/methods";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function DeliveryReport() {
  const navigate = useNavigate();
  const [exportBtnDelivery, setExportBtnDelivery] = useState(false);
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [delivery, setDelivery] = useState(false);
  const [pageCount, setPageCount] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchData, setSearchData] = useState({ search_text: "" });

  const [selectedDate, setSelectedDate] = useState(getNextBusinessDay());
  const handleDateChange = newDate => {
    if (newDate) {
      setSelectedDate(newDate);
    }
  };

  const cancelToken = useRef(null);

  const loadLoadersReport = useCallback(async () => {
    if (cancelToken.current) {
      cancelToken.current.cancel("Operation canceled due to new request.");
    }
    const source = axios.CancelToken.source();
    cancelToken.current = source;
    const fromTime = selectedDate.setZone("Australia/Sydney").startOf("day").toUTC().toISO();
    const toTime = selectedDate.setZone("Australia/Sydney").endOf("day").toUTC().toISO();
    setDelivery(true);
    const url = `${API_BASE_URL}runs-report-list?page=${currentPage - 1}&orderUID=${searchData.search_text}&fromTime=${fromTime}&toTime=${toTime}`;
    try {
      const response = await axios.get(url, {
        headers: {
          "x-access-token": localStorage.getItem("token"),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        cancelToken: source.token,
      });
      setFilteredOrders(response.data);
      setPageCount(response.data.totalPages);
    } catch (error) {
      if (!axios.isCancel(error)) {
        swal.fire({
          text: "Data load Failed",
          icon: "error",
        });
      }
    } finally {
      if (!source.token.reason) {
        setDelivery(false);
      }
    }
  }, [currentPage, searchData.search_text, selectedDate]);

  useEffect(() => {
    loadLoadersReport();
  }, [currentPage, loadLoadersReport]);

  const searchHandle = e => {
    const searchNewData = { ...searchData, [e.target.id]: e.target.value };
    setSearchData(searchNewData);
    setCurrentPage("0");
  };

  const handlePageChange = (event, value) => {
    setCurrentPage(value);
    navigate(`?page=${value}`);
  };

  const handleReset = () => {
    const resetDate = DateTime.now().plus({ days: 1 });
    setSearchData({ search_text: "" });
    setSelectedDate(resetDate);
    setCurrentPage(1);
    setFilteredOrders([]);
    loadLoadersReport();
  };

  //Export Functionality
  const handleExport = () => {
    loadFilterReportExport();
  };

  const loadFilterReportExport = useCallback(async () => {
    if (cancelToken.current) {
      cancelToken.current.cancel("Operation canceled due to new request.");
    }
    const source = axios.CancelToken.source();
    cancelToken.current = source;
    const fromTime = selectedDate.setZone("Australia/Sydney").startOf("day").toUTC().toISO();
    const toTime = selectedDate.setZone("Australia/Sydney").endOf("day").toUTC().toISO();

    setExportBtnDelivery(true);
    const url = `${API_BASE_URL}runs-report-list-export?&orderUID=${searchData.search_text}&fromTime=${fromTime}&toTime=${toTime}`;
    try {
      const response = await axios.get(url, { headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" } });
      if (response.status === 200 && Array.isArray(response.data) && response.data.length > 0) {
        swal.fire({
          text: "Successfully Exported",
          icon: "success",
          type: "success",
        });
        const preparedData = prepareDataForExport(response.data);
        exportToExcel(preparedData);
        setExportBtnDelivery(false);
      } else {
        swal.fire({
          text: "No data to export",
          icon: "warning",
        });
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
        setDelivery(false);
      }
      setExportBtnDelivery(false);
    }
  }, [searchData.search_text, selectedDate]);

  const prepareDataForExport = data => {
    return data.map(item => {
      let address = "";
      switch (item.order_delivery_address_mode) {
        case "0":
          address = item.order_store_delivery_address1;
          break;
        case "1":
          address = item.order_site_delivery_address1;
          break;
        case "2":
          address = "Pickup Order";
          break;
        default:
          address = "";
      }

      return {
        rowData: {
          Customer: item.account_Name,
          Address: address,
          City: (item.order_delivery_address_mode === "0" ? item.order_store_delivery_city : item.order_site_delivery_city)?.toUpperCase(),
          "Cust P.O Number": item.order_customer_PO_number,
          Time: item.order_delivery_session === "A/T" ? "" : getFormattedDeliveryTime(item.order_delivery_time, item.order_delivery_session),
          "Order Number": item.order_unique_id,
          "Order Value(AUD)": "$" + Number(item.order_Overall_Price).toFixed(2),
          Length: item.largest_length,
          "Item Count": [
            item.Order_Flashing_Count && `F:${item.Order_Flashing_Count}, `,
            item.Order_Cladding_Count && `CL:${item.Order_Cladding_Count}, `,
            item.Order_Faciagutter_Count && `FG:${item.Order_Faciagutter_Count}, `,
            item.Order_Jobbing_Count && `J:${item.Order_Jobbing_Count}, `,
            item.Order_GBI_Count && `G:${item.Order_GBI_Count}, `,
            item.Order_GBIL_Count && `G.L:${item.Order_GBIL_Count}, `,
            item.Order_Roofing_Count && `R:${item.Order_Roofing_Count}`,
          ]
            .filter(Boolean)
            .join(" "),
          Rack: [
            item.f_order_racking_table && `F:${item.f_order_racking_table}, `,
            item.cl_order_racking_table && `CL:${item.cl_order_racking_table}, `,
            item.fg_order_racking_table && `FG:${item.fg_order_racking_table}, `,
            item.j_order_racking_table && `J:${item.j_order_racking_table}, `,
            item.gbi_order_racking_table && `G:${item.gbi_order_racking_table}, `,
            item.roof_order_racking_table && `R:${item.roof_order_racking_table}`,
          ]
            .filter(Boolean)
            .join(" "),
          "Drivers Info": (item.order_custom_note ? item.order_custom_note : "") + (item.order_site_delivery_details ? ` ${item.order_site_delivery_details}` : ""),
          "Loaders Info	": item.order_loaders_info,
          "Crane Lift": item.order_crane_lift_checker === true ? "Yes" : "No",
          "Master Rack": item.order_master_rack,
          "Created Date": item.created_str,
        },
        highlight: item.order_crane_lift_checker,
      };
    });
  };

  const exportToExcel = async dataForExport => {
    const workbook = new Workbook();
    const worksheet = workbook.addWorksheet("Delivery Report");

    const headers = Object.keys(dataForExport[0].rowData);
    worksheet.addRow(headers);

    const headerRow = worksheet.getRow(1);
    headerRow.eachCell(cell => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "E8F0F8" },
      };
      cell.font = { bold: true, color: { argb: "000000" } };
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
      cell.alignment = { wrapText: true };
    });

    dataForExport.forEach(item => {
      const rowValues = Object.values(item.rowData);
      const row = worksheet.addRow(rowValues);

      row.eachCell((cell, colNumber) => {
        const header = headers[colNumber - 1];

        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: item.highlight ? "fcefe3" : "FFFFFF" },
        };
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };

        // Alignment logic based on header
        if (header === "Order Value(AUD)") {
          cell.alignment = { horizontal: "right", wrapText: true };
        } else if (header === "Length") {
          cell.alignment = { horizontal: "left", wrapText: true };
        } else {
          cell.alignment = { wrapText: true }; // default
        }
      });
    });

    // Auto-width logic
    worksheet.columns.forEach(column => {
      let maxLength = 10;
      column.eachCell({ includeEmpty: true }, cell => {
        const columnLength = cell.value ? cell.value.toString().length : 0;
        if (columnLength > maxLength) {
          maxLength = columnLength;
        }
      });
      column.width = maxLength + 2;
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "delivery_report.xlsx";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <React.Fragment>
      <Row className="GeneralHeading withBackArrow">
        <Col md={6}>
          <HeadingTwo>
            <Link className="arrow-btn" onClick={() => navigate(-1)}>
              <IoMdArrowBack />
            </Link>
            Delivery Report
          </HeadingTwo>
        </Col>
      </Row>
      <Row>
        <Col md={12}>
          <MyDiv className="searchBar GeneralHeading mt-2 d-block">
            <Row>
              <Col md={2} xs={9} className="SearchTextBox hide">
                <TextField id="search_text" placeholder="Order id" variant="outlined" size="small" onChange={searchHandle} value={searchData.search_text} />
              </Col>
              <Col md={2} className="SearchTextBox dateRangePicker">
                <LocalizationProvider dateAdapter={AdapterLuxon}>
                  <DatePicker label="Delivery Date" value={selectedDate} onChange={handleDateChange} format="yyyy-MM-dd" slotProps={{ textField: { size: "small", variant: "outlined" } }} />
                </LocalizationProvider>
              </Col>
              <Col md={3} className="d-flex">
                <Button className="btn secondary-btn add-cta search mx-1 mt-1" onClick={handleReset}>
                  Reset
                </Button>
                {exportBtnDelivery ? (
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
                      onClick={handleExport}
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
      <Row>
        <Col md={12}>
          {delivery ? (
            <HeadingFour className="text-center">Delivery Report Loading...</HeadingFour>
          ) : (
            <MyDiv className="GeneralTable reportTable">
              <TableContainer>
                <Table className="bgGrey" aria-label="Order table">
                  <TableHead>
                    <TableRow>
                      <TableCell align="left">Customer</TableCell>
                      <TableCell align="left">Address</TableCell>
                      <TableCell align="left">City</TableCell>
                      <TableCell align="left">Cust P.O Number</TableCell>
                      <TableCell align="left">Time</TableCell>
                      <TableCell align="left">Order Number</TableCell>
                      <TableCell align="left">Order Value</TableCell>
                      <TableCell align="left">Length</TableCell>
                      <TableCell align="left">Item Count</TableCell>
                      <TableCell align="left">Rack</TableCell>
                      <TableCell align="left">Driver's Info</TableCell>
                      <TableCell align="left">Loader's Info</TableCell>
                      <TableCell align="left">Crane Lift</TableCell>
                      <TableCell align="left">Master Rack</TableCell>
                      <TableCell align="left">Created Date</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredOrders.loaderReportItems?.length ? (
                      filteredOrders.loaderReportItems.map(item => (
                        <React.Fragment key={item._id}>
                          <TableRow className={item.order_crane_lift_checker === true ? "HaveCraneLift" : null}>
                            <TableCell align="left" component="th" scope="row">
                              {item.account_Name}
                            </TableCell>
                            <TableCell>
                              {item.order_delivery_address_mode === "0" ? <MyDiv className=""> {item.order_store_delivery_address1} </MyDiv> : ""}
                              {item.order_delivery_address_mode === "1" ? <MyDiv className=""> {item.order_site_delivery_address1}</MyDiv> : ""}
                            </TableCell>
                            <TableCell>
                              {item.order_delivery_address_mode === "0" && item.account_Address_City ? item.account_Address_City.toUpperCase() : ""}
                              {item.order_delivery_address_mode === "1" && item.order_site_delivery_city ? item.order_site_delivery_city.toUpperCase() : ""}
                            </TableCell>
                            <TableCell>{item.order_customer_PO_number}</TableCell>
                            <TableCell>{item.order_delivery_session === "A/T" ? "" : getFormattedDeliveryTime(item.order_delivery_time, item.order_delivery_session)}</TableCell>
                            <TableCell>{item.order_unique_id}</TableCell>
                            <TableCell align="right">
                              <CurrencyDisplay value={item.order_Overall_Price} currency="AUD" locale="en-US" />
                            </TableCell>
                            <TableCell>{item.largest_length}</TableCell>
                            <TableCell>
                              <MyDiv className="BadgeBlock3">
                                {item.Order_Flashing_Count ? (
                                  <Badge className="flashingBg">
                                    F<SpanTag> {item.Order_Flashing_Count}</SpanTag>
                                  </Badge>
                                ) : null}
                                {item.Order_Cladding_Count ? (
                                  <Badge className="claddingBg">
                                    CL <SpanTag>{item.Order_Cladding_Count}</SpanTag>
                                  </Badge>
                                ) : null}
                                {item.Order_Faciagutter_Count ? (
                                  <Badge className="faciaBg">
                                    FG<SpanTag>{item.Order_Faciagutter_Count}</SpanTag>
                                  </Badge>
                                ) : null}
                                {item.Order_Jobbing_Count ? (
                                  <Badge className="jobbingBg">
                                    J<SpanTag>{item.Order_Jobbing_Count}</SpanTag>
                                  </Badge>
                                ) : null}
                                {item.Order_GBI_Count ? (
                                  <Badge className="gbiBg">
                                    G<SpanTag>{item.Order_GBI_Count}</SpanTag>
                                  </Badge>
                                ) : null}
                                {item.Order_Roofing_Count ? (
                                  <Badge className="roofingBg">
                                    R<SpanTag>{item.Order_Roofing_Count}</SpanTag>
                                  </Badge>
                                ) : null}
                                {item.Order_GBIL_Count ? (
                                  <Badge className="gbilBg">
                                    G.L<SpanTag>{item.Order_GBIL_Count}</SpanTag>
                                  </Badge>
                                ) : null}
                              </MyDiv>
                            </TableCell>
                            <TableCell>
                              <MyDiv className="BadgeBlock3">
                                {item.f_order_racking_table ? (
                                  <Badge className="flashingBg">
                                    F<SpanTag> {item.f_order_racking_table}</SpanTag>
                                  </Badge>
                                ) : null}
                                {item.cl_order_racking_table ? (
                                  <Badge className="claddingBg">
                                    CL <SpanTag>{item.cl_order_racking_table}</SpanTag>
                                  </Badge>
                                ) : null}
                                {item.fg_order_racking_table ? (
                                  <Badge className="faciaBg">
                                    FG<SpanTag>{item.fg_order_racking_table}</SpanTag>
                                  </Badge>
                                ) : null}
                                {item.j_order_racking_table ? (
                                  <Badge className="jobbingBg">
                                    J<SpanTag>{item.j_order_racking_table}</SpanTag>
                                  </Badge>
                                ) : null}
                                {item.gbi_order_racking_table ? (
                                  <Badge className="gbiBg">
                                    G<SpanTag>{item.gbi_order_racking_table}</SpanTag>
                                  </Badge>
                                ) : null}
                                {item.roof_order_racking_table ? (
                                  <Badge className="roofingBg">
                                    R<SpanTag>{item.roof_order_racking_table}</SpanTag>
                                  </Badge>
                                ) : null}
                              </MyDiv>
                            </TableCell>
                            <TableCell>{item.order_custom_note}{" "}{item.order_site_delivery_details}</TableCell>
                            <TableCell>{item.order_loaders_info}</TableCell>
                            <TableCell>{item.order_crane_lift_checker === true ? "Yes" : "No"}</TableCell>
                            <TableCell>{item.order_master_rack}</TableCell>
                            <TableCell>{item.created_str}</TableCell>
                          </TableRow>
                        </React.Fragment>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={15}>
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
    </React.Fragment>
  );
}

export default DeliveryReport;
