import React, { useState, useEffect, useCallback, useRef } from "react";
import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";
import Badge from "react-bootstrap/Badge";
import { Link, useNavigate } from "react-router-dom";
import { HeadingTwo, HeadingFour, MyDiv, StrongTag, SpanTag, getFormattedDeliveryTime } from "../Common/Components";
import { TableBody, Table, TableContainer, TableHead, TableRow, TableCell, Button, TextField, IconButton, Pagination, Tooltip } from "@mui/material";
import { IoMdArrowBack } from "react-icons/io";
import { TbTableExport } from "react-icons/tb";
import "bootstrap-daterangepicker/daterangepicker.css";
import axios from "axios";
import NoDataFound from "../Common/noDataFound";
import OrderTracking from "../Orders/OrderTracking";
import * as XLSX from "xlsx";
import swal from "sweetalert2";
import { green } from "@mui/material/colors";
import { FiLoader } from "react-icons/fi";
import { DateTime } from "luxon";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterLuxon } from "@mui/x-date-pickers/AdapterLuxon";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function LoadingReport() {
  const navigate = useNavigate();
  const [exportBtnLoading, setExportBtnLoading] = useState(false);
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pageCount, setPageCount] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchData, setSearchData] = useState({ search_text: "" });
  const [selectedDate, setSelectedDate] = useState(DateTime.now().plus({ days: 1 }));
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
    setLoading(true);
    const url = `${API_BASE_URL}loading-dashboard-order-list?page=${currentPage - 1}&orderUID=${searchData.search_text}&fromTime=${fromTime}&toTime=${toTime}`;
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
        setLoading(false);
      }
    }
  }, [currentPage, searchData.search_text, selectedDate]);

  useEffect(() => {
    loadLoadersReport();
  }, [currentPage, loadLoadersReport]);

  const searchHandle = e => {
    const searchNewData = { ...searchData, [e.target.id]: e.target.value };
    setSearchData(searchNewData);
    setCurrentPage("1");
  };

  const handlePageChange = (event, value) => {
    setCurrentPage(value);
    navigate(`?page=${value}`);
  };
  const handleReset = () => {
    setSearchData({ search_text: "" });
    const resetDate = DateTime.now().plus({ days: 1 });

    setSelectedDate(resetDate);
    setFilteredOrders([]);
    loadLoadersReport();
  };

  //Export Functionlaity
  const handleExport = () => {
    loadFilterReportExport();
  };

  const exportToExcel = useCallback(dataForExport => {
    const ws = XLSX.utils.json_to_sheet(dataForExport);
    ws["!cols"] = autoColumnWidth(dataForExport);
    const wrapText = { wrapText: true };
    Object.keys(ws).forEach(cell => {
      if (ws[cell] && typeof ws[cell] === "object") {
        ws[cell].s = { alignment: wrapText };
      }
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    XLSX.writeFile(wb, "Loader_report.xlsx");
  }, []);

  const loadFilterReportExport = useCallback(async () => {
    if (cancelToken.current) {
      cancelToken.current.cancel("Operation canceled due to new request.");
    }
    const source = axios.CancelToken.source();
    cancelToken.current = source;
    const fromTime = selectedDate.setZone("Australia/Sydney").startOf("day").toUTC().toISO();
    const toTime = selectedDate.setZone("Australia/Sydney").endOf("day").toUTC().toISO();

    setExportBtnLoading(true);
    const url = `${API_BASE_URL}loading-dashboard-order-list-export?orderUID=${searchData.search_text}&fromTime=${fromTime}&toTime=${toTime}`;
    try {
      const response = await axios.get(url, { headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" } });

      if (response.status === 200) {
        swal.fire({
          text: "Successfully Exported",
          icon: "success",
          type: "success",
        });
        const preparedData = prepareDataForExport(response.data);
        exportToExcel(preparedData);
        setExportBtnLoading(false);
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
  }, [exportToExcel, searchData.search_text, selectedDate]);

  const prepareDataForExport = data => {
    const formatAddress = item => {
      return item.order_delivery_address_mode === "0"
        ? `${item.order_store_delivery_address1}, \n${item.order_store_delivery_city}, \n${item.order_store_delivery_state}, \n${item.order_store_delivery_country}-${item.order_store_delivery_postalcode}`
        : `${item.order_site_delivery_address1}, \n${item.order_site_delivery_city}, \n${item.order_site_delivery_state}, \n${item.order_site_delivery_country}-${item.order_site_delivery_postalcode}`;
    };

    const formatItemCount = item => {
      let itemCount = "";
      const counts = [
        { label: "F", value: item.Order_Flashing_Count },
        { label: "CL", value: item.Order_Cladding_Count },
        { label: "FG", value: item.Order_Faciagutter_Count },
        { label: "J", value: item.Order_Jobbing_Count },
        { label: "GBI", value: item.Order_GBI_Count },
        { label: "Roof", value: item.Order_Roofing_Count },
        { label: "GBI.L", value: item.Order_GBIL_Count },
      ];
      counts.forEach(count => {
        if (count.value && count.value !== "0") {
          itemCount += `${count.label}: ${count.value}; \n`;
        }
      });
      return itemCount;
    };

    const formatRack = item => {
      let rack = "";
      const racks = [
        { label: "F", value: item?.f_order_racking_table || getStatus(Number(item?.f_order_prod_push_status), item?.f_order_prod_current_status, "F").display },
        { label: "CL", value: item.cl_order_racking_table },
        { label: "FG", value: item.fg_order_racking_table },
        { label: "J", value: item.j_order_racking_table },
        { label: "GBI", value: item.gbi_order_racking_table },
        { label: "Roof", value: item.roof_order_racking_table },
      ];
      racks.forEach(r => {
        if (r.value && r.value !== "0") {
          rack += `${r.label}: ${r.value}; \n`;
        }
      });
      return rack;
    };

    const formatDimensions = item => {
      let dimensions = "";
      const dimensionPairs = [
        { label: "F", dim1: item.f_order_racking_dimension1, dim2: item.f_order_racking_dimension2 },
        { label: "CL", dim1: item.cl_order_racking_dimension1, dim2: item.cl_order_racking_dimension2 },
        { label: "FG", dim1: item.fg_order_racking_dimension1, dim2: item.fg_order_racking_dimension2 },
        { label: "J", dim1: item.j_order_racking_dimension1, dim2: item.j_order_racking_dimension2 },
        { label: "GBI", dim1: item.gbi_order_racking_dimension1, dim2: item.gbi_order_racking_dimension2 },
        { label: "Roof", dim1: item.roof_order_racking_dimension1, dim2: item.roof_order_racking_dimension2 },
      ];
      dimensionPairs.forEach(d => {
        if (d.dim1 && d.dim1 !== "0") {
          dimensions += `${d.label}: ${d.dim1} x ${d.dim2}; \n`;
        }
      });
      return dimensions;
    };

    return data.map(item => ({
      "Order ID": item.order_unique_id,
      "Customer Details": item.account_Name,
      "PO / Contact Name / Phone number":
        `${item.order_customer_PO_number} - ` +
        (item.order_delivery_address_mode === "1"
          ? `${item.order_site_delivery_attention_person}, ${item.order_site_delivery_attention_contact}`
          : item.order_delivery_address_mode === "0"
          ? `${item.order_customer_contact_phone}`
          : item.order_delivery_address_mode === "2"
          ? `Pickup Order`
          : ""),
      "Delivery Address": formatAddress(item),
      "Order Count": formatItemCount(item),
      Rack: formatRack(item),
      Dimensions: formatDimensions(item),
      "Expected Delivery Date": `${item.order_delivery_date_str} - ${getFormattedDeliveryTime(item.order_delivery_time, item.order_delivery_session)}`,
    }));
  };

  const autoColumnWidth = data => {
    const keys = Object.keys(data[0]);
    return keys.map(key => ({
      wch: Math.max(key.length, ...data.map(row => (row[key] ? row[key].toString().length : 0))),
    }));
  };

  const getStatus = (pushStatus, currentStatus, departmentCode) => {
    const status = Number(currentStatus);
    if (pushStatus === 0) return { text: "Production In Progress", display:"PIP" };
    if (pushStatus === 1) return { text: "Created", display: "C" };
    if (pushStatus === 2) {
      const isFabric = departmentCode === "F";
      if (status === 2) return { text: "Rolled", display: "RO" };
      if (status === 4) {
        return { text: isFabric ? "Rolled & Folded" : "Folded", display: isFabric ? "FO" : "FO" };
      }
      return { text: "Production In Progress", display: "PIP" };
    }
    return { text: "Production In Progress", display:"PIP" };
  };

  return (
    <React.Fragment>
      <Row className="GeneralHeading withBackArrow">
        <Col md={6}>
          <HeadingTwo>
            <Link className="arrow-btn" onClick={() => navigate(-1)}>
              <IoMdArrowBack />
            </Link>
            Loading Report
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
              <Col md={2}>
                <LocalizationProvider dateAdapter={AdapterLuxon}>
                  <DatePicker label="Delivery Date" value={selectedDate} onChange={handleDateChange} format="yyyy-MM-dd" slotProps={{ textField: { size: "small", variant: "outlined" } }} />
                </LocalizationProvider>
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
                  <Tooltip title="Export Excel">
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
          {loading ? (
            <HeadingFour className="text-center">Loading...</HeadingFour>
          ) : (
            <MyDiv className="GeneralTable">
              <TableContainer>
                <Table className="bgGrey" aria-label="Order table">
                  <TableHead>
                    <TableRow>
                      <TableCell align="left">Order ID</TableCell>
                      <TableCell align="left">Customer Details</TableCell>
                      <TableCell align="left">PO / Contact Name / Phone number</TableCell>
                      <TableCell align="left">Delivery Address</TableCell>
                      <TableCell align="left">Order Count</TableCell>
                      <TableCell align="left">Rack Number</TableCell>
                      <TableCell align="left">Dimensions</TableCell>
                      <TableCell align="left">Expected Delivery Date</TableCell>
                      <TableCell align="left">Detail</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredOrders.loaderReportItems?.length ? (
                      filteredOrders.loaderReportItems.map(item => (
                        <React.Fragment key={item._id}>
                          <TableRow>
                            <TableCell align="left" component="th" scope="row">
                              {item.order_unique_id}
                            </TableCell>
                            <TableCell>
                              <StrongTag>{item.account_Name}</StrongTag>
                            </TableCell>
                            <TableCell>
                              #{item.order_customer_PO_number} -
                              {item.order_delivery_address_mode === "1" ? (
                                <>
                                  {item.order_site_delivery_attention_person}, <br /> {item.order_site_delivery_attention_contact}
                                </>
                              ) : (
                                ""
                              )}
                              {item.order_delivery_address_mode === "0" ? <> {item.order_customer_contact_phone} </> : ""}
                              {item.order_delivery_address_mode === "2" ? <> Pickup Order </> : ""}
                            </TableCell>
                            <TableCell>
                              <SpanTag>
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
                              </SpanTag>
                            </TableCell>
                            <TableCell>
                              <MyDiv className="BadgeBlock">
                                {item.Order_Flashing_Count !== 0 ? (
                                  <Badge className="flashingBg">
                                    F <SpanTag> {Number.isInteger(Number(item.Order_Flashing_Count)) ? Number(item.Order_Flashing_Count) : Number(item.Order_Flashing_Count).toFixed(2)}</SpanTag>
                                  </Badge>
                                ) : null}
                                {item.Order_Cladding_Count && item.Order_Cladding_Count !== 0 ? (
                                  <Badge className="claddingBg">
                                    CL <SpanTag> {Number.isInteger(Number(item.Order_Cladding_Count)) ? Number(item.Order_Cladding_Count) : Number(item.Order_Cladding_Count).toFixed(2)}</SpanTag>
                                  </Badge>
                                ) : null}
                                {item.Order_Faciagutter_Count && item.Order_Faciagutter_Count !== 0 ? (
                                  <Badge className="faciaBg">
                                    FG
                                    <SpanTag>{Number.isInteger(Number(item.Order_Faciagutter_Count)) ? Number(item.Order_Faciagutter_Count) : Number(item.Order_Faciagutter_Count).toFixed(2)}</SpanTag>
                                  </Badge>
                                ) : null}
                                {item.Order_Jobbing_Count && item.Order_Jobbing_Count !== 0 ? (
                                  <Badge className="jobbingBg">
                                    J<SpanTag> {Number.isInteger(Number(item.Order_Jobbing_Count)) ? Number(item.Order_Jobbing_Count) : Number(item.Order_Jobbing_Count).toFixed(2)}</SpanTag>
                                  </Badge>
                                ) : null}
                                {item.Order_GBI_Count && item.Order_GBI_Count !== 0 ? (
                                  <Badge className="gbiBg">
                                    GBI<SpanTag> {Number.isInteger(Number(item.Order_GBI_Count)) ? Number(item.Order_GBI_Count) : Number(item.Order_GBI_Count).toFixed(2)}</SpanTag>
                                  </Badge>
                                ) : null}
                                {item.Order_Roofing_Count && item.Order_Roofing_Count !== 0 ? (
                                  <Badge className="roofingBg">
                                    ROOF<SpanTag> {Number.isInteger(Number(item.Order_Roofing_Count)) ? Number(item.Order_Roofing_Count) : Number(item.Order_Roofing_Count).toFixed(2)}</SpanTag>
                                  </Badge>
                                ) : null}
                                {item.Order_GBIL_Count && item.Order_GBIL_Count !== 0 ? (
                                  <Badge className="gbilBg">
                                    GBIL<SpanTag> {Number.isInteger(Number(item.Order_GBIL_Count)) ? Number(item.Order_GBIL_Count) : Number(item.Order_GBIL_Count).toFixed(2)}</SpanTag>
                                  </Badge>
                                ) : null}
                              </MyDiv>
                            </TableCell>
                            <TableCell>
                              <MyDiv className="BadgeBlock">
                                {item.f_order_racking_table ? (
                                  <Badge className="flashingBg">
                                    F<SpanTag> {item.f_order_racking_table}</SpanTag>
                                  </Badge>
                                ) : (
                                    item?.f_order_prod_push_status ? 
                                    <Badge className="flashingBg">
                                        F<SpanTag> {getStatus(Number(item?.f_order_prod_push_status), item?.f_order_prod_current_status, "F").display}</SpanTag>
                                    </Badge> : null 
                                )}

                                {item.cl_order_racking_table ? (
                                  <Badge className="claddingBg">
                                    CL <SpanTag>{item.cl_order_racking_table}</SpanTag>
                                  </Badge>
                                ) 
                                : null
                                // (
                                //     item?.cl_order_prod_push_status ? 
                                //     <Badge className="noRackBg">
                                //         CL<SpanTag> {getStatus(Number(item?.cl_order_prod_push_status), item?.cl_order_prod_current_status, "CL").display}</SpanTag>
                                //     </Badge> : null 
                                // )
                                }

                                {item.fg_order_racking_table ? (
                                  <Badge className="faciaBg">
                                    FG<SpanTag>{item.fg_order_racking_table}</SpanTag>
                                  </Badge>
                                ) : null
                                // (
                                //     item?.fg_order_prod_push_status ? 
                                //     <Badge className="noRackBg">
                                //         FG<SpanTag> {getStatus(Number(item?.fg_order_prod_push_status), item?.fg_order_prod_current_status, "FG").display}</SpanTag>
                                //     </Badge> : null 
                                // )
                                }

                                {item.j_order_racking_table ? (
                                  <Badge className="jobbingBg">
                                    J<SpanTag>{item.j_order_racking_table}</SpanTag>
                                  </Badge>
                                ) : null
                                // (
                                //     item?.j_order_prod_push_status ? 
                                //     <Badge className="noRackBg">
                                //         J<SpanTag> {getStatus(Number(item?.j_order_prod_push_status), item?.j_order_prod_current_status, "J").display}</SpanTag>
                                //     </Badge> 
                                //     : null 
                                // )
                                }

                                {item.gbi_order_racking_table ? (
                                  <Badge className="gbiBg">
                                    GBI<SpanTag>{item.gbi_order_racking_table}</SpanTag>
                                  </Badge>
                                ) : null
                                // (
                                //     item?.gbi_order_prod_push_status ? 
                                //     <Badge className="noRackBg">
                                //         GBI<SpanTag> {getStatus(Number(item?.gbi_order_prod_push_status), item?.gbi_order_prod_current_status, "GBI").display}</SpanTag>
                                //     </Badge> 
                                //     : null 
                                // )
                                }

                                {item.roof_order_racking_table ? (
                                  <Badge className="roofingBg">
                                    ROOF<SpanTag>{item.roof_order_racking_table}</SpanTag>
                                  </Badge>
                                ) : null
                                // (
                                //     item?.roof_order_prod_push_status ? 
                                //     <Badge className="noRackBg">
                                //         ROOF<SpanTag> {getStatus(Number(item?.roof_order_prod_push_status), item?.roof_order_prod_current_status, "ROOF").display}</SpanTag>
                                //     </Badge> : null 
                                // )
                                }

                              </MyDiv>
                            </TableCell>
                            <TableCell>
                              <MyDiv className="BadgeBlock">
                                {item.f_order_racking_dimension1 ? (
                                  <Badge className="flashingBg">
                                    F
                                    <SpanTag>
                                      {item.f_order_racking_dimension1} x {item.f_order_racking_dimension2}
                                    </SpanTag>
                                  </Badge>
                                ) : null}
                                {item.cl_order_racking_dimension1 ? (
                                  <Badge className="claddingBg">
                                    CL
                                    <SpanTag>
                                      {item.cl_order_racking_dimension1} x {item.cl_order_racking_dimension2}
                                    </SpanTag>
                                  </Badge>
                                ) : null}
                                {item.fg_order_racking_dimension1 ? (
                                  <Badge className="faciaBg">
                                    FG
                                    <SpanTag>
                                      {item.fg_order_racking_dimension1} x {item.fg_order_racking_dimension2}
                                    </SpanTag>
                                  </Badge>
                                ) : null}
                                {item.j_order_racking_dimension1 ? (
                                  <Badge className="jobbingBg">
                                    J
                                    <SpanTag>
                                      {item.j_order_racking_dimension1} x {item.j_order_racking_dimension2}
                                    </SpanTag>
                                  </Badge>
                                ) : null}
                                {item.gbi_order_racking_dimension1 ? (
                                  <Badge className="gbiBg">
                                    GBI
                                    <SpanTag>
                                      {item.gbi_order_racking_dimension1} x {item.gbi_order_racking_dimension2}
                                    </SpanTag>
                                  </Badge>
                                ) : null}
                                {item.roof_order_racking_dimension1 ? (
                                  <Badge className="roofingBg">
                                    ROOF
                                    <SpanTag>
                                      {item.roof_order_racking_dimension1} x {item.roof_order_racking_dimension2}
                                    </SpanTag>
                                  </Badge>
                                ) : null}
                              </MyDiv>
                            </TableCell>
                            <TableCell align="left" component="th" scope="row">
                              {item.order_delivery_date_str} - {getFormattedDeliveryTime(item.order_delivery_time, item.order_delivery_session)}
                            </TableCell>
                            <TableCell align="left" component="th" scope="row">
                              <OrderTracking CoreOrderId={item._id} />
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
    </React.Fragment>
  );
}

export default LoadingReport;
