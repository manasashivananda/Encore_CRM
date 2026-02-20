import React, { useState, useEffect, useRef, useCallback } from "react";
import { Row, Col, Card, Badge } from "react-bootstrap";
import { MyDiv, LabelTag, SpanTag, HeadingFour, HeadingFive } from "../Common/Components";
import { Box, Tabs, Tab, TextField, MenuItem, TableBody, Table, TableContainer, TableHead, TableRow, TableCell } from "@mui/material";
import axios from "axios";
import swal from "sweetalert2";
import moment from "moment";
import NoDataFound from "../Common/noDataFound";
// import Operator from '../Socket/Operator';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

const RolePermission = JSON.parse(localStorage.getItem("role"));

// Department Barcode Prefixes
const departmentBarcodes = {
  Flashing: /^IN\d{6}$/,
  Jobbing: /^IN\d{6}J$/,
  "Facia Gutter": /^IN\d{6}FG$/,
  Cladding: /^IN\d{6}CL$/,
  GBI: /^IN\d{6}GBI$/,
  Roofing: /^IN\d{6}ROOF$/,
};

const departmentBarcodesForAWF = {
  Flashing: /^\d{6}$/,
  Jobbing: /^\d{6}J$/,
  "Facia Gutter": /^\d{6}FG$/,
  Cladding: /^\d{6}CL$/,
  GBI: /^\d{6}GBI$/,
  Roofing: /^\d{6}ROOF$/,
};

function OrderProductionDashboard() {
  const [activeTab, setActiveTab] = useState("Rolled");
  const [searchQuery, setSearchQuery] = useState("");
  const inputRef = useRef(null);
  const scanTimeout = useRef(null);
  const [loading, setLoading] = useState(false);
  const [specificSearchOrders, setSpecSearchOrders] = useState([]);
  const [filteredOrders, setFilteredOrders] = useState([]);
  //  const [status, setStatus] = useState("");
  const [setProductionEmp] = useState("");
  const cancelToken = useRef(null);
  // eslint-disable-next-line
  const [rackUpdated, setRackUpdated] = useState(true);

  // Fetch Order Data Based on Barcode
  const handleOrderSearch = useCallback(async query => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const { data } = await axios.get(`${API_BASE_URL}fetch-specific-order-for-processing?keyword=${query}`, {
        headers: {
          "x-access-token": localStorage.getItem("token"),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });
      setSpecSearchOrders(data);
      setSearchQuery("");
    } catch (error) {
      setSpecSearchOrders("");
      swal.fire({
        text: error.response?.data || "Error fetching order",
        icon: "error",
      });
      setSearchQuery("");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleScan = useCallback(
    query => {
      if (!query.trim()) return;
      let department = ""
      const upperQuery = query.toUpperCase();
      if(upperQuery.startsWith("IN"))
        department = Object.keys(departmentBarcodes).find(dept => departmentBarcodes[dept].test(upperQuery));
      else
        department = Object.keys(departmentBarcodesForAWF).find(dept => departmentBarcodesForAWF[dept].test(upperQuery));


      if (!department) {
        swal.fire({ text: "Invalid barcode", icon: "error" });
        setSearchQuery("");
        return;
      }

      if (activeTab === "Rolled" && department !== "Flashing") {
        swal.fire({ text: "Not a Flashing order", icon: "warning" });
        setSearchQuery("");
        return;
      }

      handleOrderSearch(upperQuery);
    },
    [activeTab, handleOrderSearch]
  );

  useEffect(() => {
    if (!searchQuery) return;
    clearTimeout(scanTimeout.current);
    scanTimeout.current = setTimeout(() => {
      if (searchQuery.length >= searchQuery.startsWith("IN") ? 8 : 6) {
        handleScan(searchQuery);
      }
    }, 1000);

    return () => clearTimeout(scanTimeout.current);
  }, [searchQuery, handleScan]);

  useEffect(() => {
    const handler = () => {
      const input = inputRef.current;
      if (input) input.focus();
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
    };
  }, []);

  const handleTabChange = (_, newTab) => {
    setActiveTab(newTab);
    setSearchQuery("");
    setSpecSearchOrders([]);
  };

  const renderButtons = item => {
    if (!item) return null;
    const statusMapping = {
      Rolled: {
        empty: (
          <button className="btn success-btn me-2" onClick={() => AssignToMeForProduction(item, activeTab, "Rolled")}>
            Mark as Rolled
          </button>
        ),
        2: <Badge>This Order is already Rolled</Badge>,
        4: <Badge>This Order is already Rolled and Folded</Badge>,
        6: <Badge>This Order is already Rolled, Folded and Racked</Badge>,
      },
      Fold: {
        empty:
          item.department_name === "Flashing" ? (
            <Badge>This Order is ready for Rolling</Badge>
          ) : (
            <button className="btn btn-primary me-2" onClick={() => AssignToMeForProduction(item, activeTab, "Fold")}>
              Mark as Fold
            </button>
          ),
        2: (
          <button className="btn success-btn me-2" onClick={() => AssignToMeForProduction(item, activeTab, "Fold")}>
            Mark as Fold
          </button>
        ),
        4: <Badge>This order is already Folded</Badge>,
        6: <Badge>This order is already Racked</Badge>,
      },
      Racking: {
        empty: item.department_name === "Flashing" ? <Badge>This Order is ready for Rolling</Badge> : <Badge>This Order is ready for Folding</Badge>,
        2: <Badge>This Order Needs to be Folded</Badge>,
        4: (
          <>
            {rackUpdated ? (
              <>
                <Row className="ProdScanRack w-100">
                  <Col md={12}>
                    <TextField select required className="w-100" name="rackid" id="rackid" variant="standard" label="Rack No" SelectProps={{ multiple: false, value: data.rackid, onChange: handleFieldChange }}>
                      {racks.map((rack, index) => (
                        <MenuItem key={index} value={rack._id}>
                          {rack.rack_name}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Col>
                </Row>
                <Row className="w-100 mt-2">
                  <Col md={6}>
                    <TextField name="DimensionOne" id="DimensionOne" variant="standard" label="Meter" value={data.DimensionOne} onChange={handle}></TextField>
                  </Col>
                  <Col md={6}>
                    <TextField name="DimensionTwo" id="DimensionTwo" variant="standard" label="MM" value={data.DimensionTwo} onChange={handle}></TextField>
                  </Col>
                </Row>
                <Row>
                  <Col md={12} className="mt-2">
                    <button onClick={() => AssignToMeForProduction(item, activeTab, "Racking", data.rackid, data.DimensionOne, data.DimensionTwo)} disabled={!data.rackid} className="btn success-btn add-cta search mx-1 mt-2">
                      Mark As Racked
                    </button>
                  </Col>
                </Row>
              </>
            ) : (
              ""
            )}
          </>
        ),
        6: <Badge>This order is already Racked</Badge>,
      },
    };
    const departments = {
      Flashing: "f_order_prod_current_status",
      Jobbing: "j_order_prod_current_status",
      "Fascia Gutter": "fg_order_prod_current_status",
      Cladding: "cl_order_prod_current_status",
      "GBI Orders": "gbi_order_prod_current_status",
      Roofing: "roof_order_prod_current_status",
    };

    // if (!departments[item.department_name]) return null;
    // const orderStatusKey = departments[item.department_name];
    // const currentStatus = item[orderStatusKey];
    // return statusMapping[activeTab]?.[currentStatus || "empty"] || null;

    if (!departments[item.department_name]) return null;
    const orderStatusKey = departments[item.department_name];
    const currentStatusRaw = item[orderStatusKey];
    const currentStatus = currentStatusRaw === "0" || currentStatusRaw == null ? "empty" : currentStatusRaw;
    return statusMapping[activeTab]?.[currentStatus] || null;
  };

  const AssignToMeForProduction = (item, activeTab, prodStatus, selectedRackId, DimensionOne, DimensionTwo) => {
    let orderProdStatus = prodStatus || item.department_code === "F" ? 2 : 4;
    switch (item.department_code) {
      case "F":
        orderProdStatus = item.f_order_prod_current_status > 1 ? parseInt(item.f_order_prod_current_status, 10) + 2 : 2;
        break;
      case "J":
        orderProdStatus = item.j_order_prod_current_status > 2 ? parseInt(item.j_order_prod_current_status, 10) + 2 : 4;
        break;
      case "FG":
        orderProdStatus = item.fg_order_prod_current_status > 2 ? parseInt(item.fg_order_prod_current_status, 10) + 2 : 4;
        break;
      case "CL":
        orderProdStatus = item.cl_order_prod_current_status > 2 ? parseInt(item.cl_order_prod_current_status, 10) + 2 : 4;
        break;
      case "GBI":
        orderProdStatus = item.gbi_order_prod_current_status > 2 ? parseInt(item.gbi_order_prod_current_status, 10) + 2 : 4;
        break;
      case "ROOF":
        orderProdStatus = item.roof_order_prod_current_status > 2 ? parseInt(item.roof_order_prod_current_status, 10) + 2 : 4;
        break;
      default:
        break;
    }
    const url = `${API_BASE_URL}assign-to-start-production/${item._id}?prodStatus=${orderProdStatus}&department=${item.department_code}` + (selectedRackId ? `&rackid=${selectedRackId}` : "") + (DimensionOne ? `&dimensionOne=${DimensionOne}` : "") + (DimensionTwo ? `&dimensionTwo=${DimensionTwo}` : "");
    axios
      .post(
        url,
        {},
        {
          headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "multipart/form-data" },
        }
      )
      .then(res => {
        if (res.status === 200) {
          setSpecSearchOrders([]);
          swal.fire({ text: "Order Successfully Processed", icon: "success" });
          loadEmployeeOrders();
        }
      })
      .catch(error => {
        swal.fire({ text: error.response.data || "Error updating order", icon: "error" });
      });
  };
  // Handle field change
  const handleRackFieldChange = (event, orderUID, deptCode) => {
    const { name, value } = event.target;
    if (name === "order_sub_rack") {
      updateRackDetails(orderUID, deptCode, value);
    }
    // else if (name === "status") {
    //   setStatus(value);
    // }
    else if (name === "productionEmp") {
      setProductionEmp(value);
    }
  };

  const loadEmployeeOrders = useCallback(async () => {
    if (cancelToken.current) {
      cancelToken.current.cancel("Operation canceled due to new request.");
    }
    const source = axios.CancelToken.source();
    cancelToken.current = source;
    try {
      const response = await axios.get(`${API_BASE_URL}fetch-racking-data-production-dashboard`, {
        headers: { "x-access-token": localStorage.getItem("token") },
        cancelToken: source.token,
      });
      setFilteredOrders(response.data);
    } catch (error) {}
  }, []);

  useEffect(() => {
    loadRacks();
    loadEmployeeOrders();
  }, [loadEmployeeOrders]);

  /* Rack Filed*/
  const [racks, setRacks] = useState("");

  const loadRacks = async () => {
    const url = API_BASE_URL + `fetch-racking-data-dropdown`;
    axios.get(url, { headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" } }).then(
      res => {
        setRacks(res.data);
      },
      error => {
        console.log(error);
      }
    );
  };

  useEffect(() => {
    loadRacks();
  }, []);

  const [data, setData] = useState({
    rackid: "",
    DimensionOne: "",
    DimensionTwo: "",
  });
  const handleFieldChange = event => {
    setData(data => ({
      ...data,
      [event.target.name]: event.target.type === "checkbox" ? event.target.checked : event.target.value,
    }));
  };
  function handle(e) {
    const newData = { ...data };
    newData[e.target.id] = e.target.value;
    setData(newData);
  }

  // Update rack details
  const updateRackDetails = (orderUId, deptCode, subRackId) => {
    const url = `${API_BASE_URL}update-order-department-rack-details-custom?OrderID=${orderUId}&Dept=${deptCode}&SRack=${subRackId}`;
    const method = "patch";
    axios({ method, url, headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "multipart/form-data" } })
      .then(res => {
        if (res.status === 200) {
          swal.fire({ text: res.data, icon: "success", type: "success" });
          loadEmployeeOrders();
        }
      })
      .catch(error => {
        swal.fire({ text: error.response.data, icon: "error", type: "error" });
      });
  };

  const barcodeInputRef = useRef(null);
  const handleClickOutside = event => {
    if (barcodeInputRef.current && !event.target.closest("input, textarea, select")) {
      barcodeInputRef.current.focus();
    }
  };

  useEffect(() => {
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  return (
    <React.Fragment>
      <MyDiv className="GeneralHeading pb-0 flex-wrap mt-2">
        <Row>
          <Col md={12}>
            <Box sx={{ maxWidth: { xs: 320, md: 1000 }, bgcolor: 'background.paper' }}>
              <Tabs value={activeTab} onChange={handleTabChange} variant="scrollable" scrollButtons="auto"
                TabIndicatorProps={{ sx: { backgroundColor: '#d22530' } }}
                sx={{ '& .MuiTab-root': { color: '#000' }, '& .Mui-selected': { color: '#d22530' } }}>
                {["Rolled", "Fold", "Racking"].map((tab) => (
                  <Tab key={tab} label={tab} value={tab} />
                ))}
              </Tabs>
            </Box>
          </Col>
        </Row>
      </MyDiv>
      {RolePermission?.OrderCoordinator?.view === "1" ? 
      <MyDiv className="GeneralTable p-2">
        <Row>
          <Col md={6}>
            <BarcodeScanner searchQuery={searchQuery} setSearchQuery={setSearchQuery} inputRef={inputRef} />
            <Row className='p-2 text-center barcodeSearchArea row'>
              {loading ? (
                <HeadingFour className="text-center">Loading...</HeadingFour>
              ) : (
                <>
                  {specificSearchOrders.length > 0 ? (
                    specificSearchOrders.slice(0, 1).map((item) => (
                      <React.Fragment key={item._id}>
                        <Col md={12} className='text-start'>
                          <HeadingFour className="mt-2">
                            Order ID - {item?.order_unique_id} / {item?.department_name}
                          </HeadingFour>
                        </Col>
                        <Col md={7}>
                          <MyDiv className="ProfileBasicDetail order-profile p-0 pt-2">
                            <Row className="ProfileBasicDetailLeftHeader p-0">
                              <Col md={12} className="text-start">
                                <MyDiv className="ProfileCard">
                                  <OrderDetails item={item} />
                                </MyDiv>
                              </Col>
                            </Row>
                          </MyDiv>
                        </Col>
                        <Col md={5} className="d-flex flex-column align-items-center justify-content-center renderedBtn">
                          {renderButtons(item)}
                        </Col>
                      </React.Fragment>
                    ))
                  ) : (
                    <Col md={12}>
                      <MyDiv className="ProfileBasicDetail order-profile">
                        <Card className="ProfileBasicDetailLeftHeader">
                          <HeadingFive className="text-center mt-0">
                            Please Scan or Type with the Order Number
                          </HeadingFive>
                        </Card>
                      </MyDiv>
                    </Col>
                  )}
                </>
              )}
            </Row>
            {activeTab === "Racking" && (
            <Row>
              <Col md={12} className='RackingTable'>
                {loading ? (
                  <HeadingFour className="text-center">Loading...</HeadingFour>) : <MyDiv className="GeneralTable">
                  <TableContainer>
                    <Table className="bgGrey" aria-label="Department table">
                      <TableHead>
                        <TableRow>
                          <TableCell align="left">Order Id</TableCell>
                          <TableCell align="left">
                            <Row className='m-0'>
                              <Col md={3}>Department</Col>
                              <Col md={3}>Status</Col>
                              <Col md={3}>Employee</Col>
                              <Col md={3}>Rack</Col>
                            </Row>
                          </TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {filteredOrders?.length ? (
                          filteredOrders.map((item, index) => (
                            <TableRow key={index}>
                              <TableCell align="left" component="th" scope="row" width="100" className="py-1">
                                {item.d_order_unique_id}
                              </TableCell>
                              <TableCell align="left" component="th" scope="row" colSpan={3} className="py-1">
                                {[
                                  { statusKey: "f_order_prod_current_status", className: "flashingBg", department: "Flashing", deptCode: "F" },
                                  { statusKey: "j_order_prod_current_status", className: "jobbingBg", department: "Jobbing", deptCode: "J" },
                                  { statusKey: "fg_order_prod_current_status", className: "faciaBg", department: "Facia Gutter", deptCode: "FG" },
                                  { statusKey: "cl_order_prod_current_status", className: "claddingBg", department: "Cladding", deptCode: "CL" },
                                  { statusKey: "gbi_order_prod_current_status", className: "gbiBg", department: "GBI", deptCode: "GBI" },
                                  { statusKey: "roof_order_prod_current_status", className: "roofingBg", department: "Roofing", deptCode: "ROOF" }
                                ].map(({ statusKey, className, department, deptCode }) =>
                                  item[statusKey] === "4" ? (
                                    <Row key={statusKey} className={`${className} m-0 my-1`}>
                                      <Col md={3}>
                                        <Badge className={className}>{department}</Badge>
                                      </Col>
                                      <Col md={3}><Badge> Folded </Badge></Col>
                                      <Col md={3}>{item.user_name}</Col>
                                      <Col md={3}>
                                        <select required  name="order_sub_rack" id="order_sub_rack"  value={item.rackID || ""} onChange={(e) => handleRackFieldChange(e, item.order_unique_id, deptCode)} >
                                          <option value="">Select a Rack</option>
                                          {racks.length ? racks.map((SubRackList) => (
                                            <option key={SubRackList._id} value={SubRackList._id}>
                                              {SubRackList.rack_name}
                                            </option>
                                          )) : ""}
                                        </select>
                                      </Col>
                                    </Row>
                                  ) : null
                                )}
                              </TableCell>
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
                </MyDiv>
                }
              </Col>
            </Row>
          )}
          </Col>
            <Col md={6} style={{ height: "750px", overflowY: 'scroll' }}>
              {/* <Operator /> */}
            </Col>
        </Row>
      </MyDiv> : 
      
      <>
              <MyDiv className="GeneralTable p-2">
        <Row>
          <Col md={8}>
            <Row className="p-2 text-center barcodeSearchArea row">
              {loading ? (
                <HeadingFour className="text-center">Loading...</HeadingFour>
              ) : (
                <>
                  {specificSearchOrders.length > 0 ? (
                    specificSearchOrders.slice(0, 1).map(item => (
                      <React.Fragment key={item._id}>
                        <Col md={12} className="text-start">
                          <HeadingFour className="mt-2">
                            Order ID - {item?.order_unique_id} / {item?.department_name}
                          </HeadingFour>
                        </Col>
                        <Col md={7}>
                          <MyDiv className="ProfileBasicDetail order-profile p-0 pt-2">
                            <Row className="ProfileBasicDetailLeftHeader p-0">
                              <Col md={12} className="text-start">
                                <MyDiv className="ProfileCard">
                                  <OrderDetails item={item} />
                                </MyDiv>
                              </Col>
                            </Row>
                          </MyDiv>
                        </Col>
                        <Col md={5} className="d-flex flex-column align-items-center justify-content-center renderedBtn">
                          {renderButtons(item)}
                        </Col>
                      </React.Fragment>
                    ))
                  ) : (
                    <Col md={12}>
                      <MyDiv className="ProfileBasicDetail order-profile">
                        <Card className="ProfileBasicDetailLeftHeader">
                          <HeadingFive className="text-center mt-0">Please Scan or Type with the Order Number</HeadingFive>
                        </Card>
                      </MyDiv>
                    </Col>
                  )}
                </>
              )}
            </Row>
          </Col>
          <Col md={4}>
            <BarcodeScanner searchQuery={searchQuery} setSearchQuery={setSearchQuery} inputRef={inputRef} />
          </Col>
        </Row>
      </MyDiv>

      {activeTab === "Racking" && (
        <MyDiv className="GeneralTable mt-3">
          <Row>
            <Col md={12} className="RackingTable ">
              {loading ? (
                <HeadingFour className="text-center">Loading...</HeadingFour>
              ) : (
                <MyDiv className="GeneralTable">
                  <TableContainer>
                    <Table className="bgGrey" aria-label="Department table">
                      <TableHead>
                        <TableRow>
                          <TableCell align="left">Order Id</TableCell>
                          <TableCell align="left">
                            <Row className="m-0">
                              <Col md={2}>Department</Col>
                              <Col md={2}>Status</Col>
                              <Col md={2}>Employee</Col>
                              <Col md={2}>Rack</Col>
                            </Row>
                          </TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {filteredOrders?.length ? (
                          filteredOrders.map((item, index) => (
                            <TableRow key={index}>
                              <TableCell align="left" component="th" scope="row" width="100" className="py-1">
                                {item.d_order_unique_id}
                              </TableCell>
                              <TableCell align="left" component="th" scope="row" colSpan={3} className="py-1">
                                {[
                                  { statusKey: "f_order_prod_current_status", className: "flashingBg", department: "Flashing", deptCode: "F" },
                                  { statusKey: "j_order_prod_current_status", className: "jobbingBg", department: "Jobbing", deptCode: "J" },
                                  { statusKey: "fg_order_prod_current_status", className: "faciaBg", department: "Facia Gutter", deptCode: "FG" },
                                  { statusKey: "cl_order_prod_current_status", className: "claddingBg", department: "Cladding", deptCode: "CL" },
                                  { statusKey: "gbi_order_prod_current_status", className: "gbiBg", department: "GBI", deptCode: "GBI" },
                                  { statusKey: "roof_order_prod_current_status", className: "roofingBg", department: "Roofing", deptCode: "ROOF" },
                                ].map(({ statusKey, className, department, deptCode }) =>
                                  item[statusKey] === "4" ? (
                                    <Row key={statusKey} className={`${className} m-0 my-1`}>
                                      <Col md={2}>
                                        <Badge className={className}>{department}</Badge>
                                      </Col>
                                      <Col md={2}>
                                        <Badge> Folded </Badge>
                                      </Col>
                                      <Col md={2}>{item.user_name}</Col>
                                      <Col md={2}>
                                        <select required name="order_sub_rack" id="order_sub_rack" value={item.rackID || ""} onChange={e => handleRackFieldChange(e, item.order_unique_id, deptCode)}>
                                          <option value="">Select a Rack</option>
                                          {racks.length
                                            ? racks.map(SubRackList => (
                                                <option key={SubRackList._id} value={SubRackList._id}>
                                                  {SubRackList.rack_name}
                                                </option>
                                              ))
                                            : ""}
                                        </select>
                                      </Col>
                                    </Row>
                                  ) : null
                                )}
                              </TableCell>
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
                </MyDiv>
              )}
            </Col>
          </Row>
        </MyDiv>
      )}
      </>
      }
    </React.Fragment>
  );
}

const OrderDetails = ({ item }) => (
  <>
    <Row>
      <Col md={5}>
        <LabelTag>Customer Name</LabelTag>
      </Col>
      <Col md={7}>
        <SpanTag>{item.account_Name}</SpanTag>
      </Col>
    </Row>
    <Row>
      <Col md={5}>
        <LabelTag>PO Name</LabelTag>
      </Col>
      <Col md={7}>
        <SpanTag>{item.order_customer_PO_number}</SpanTag>
      </Col>
    </Row>
    <Row>
      <Col md={5}>
        <LabelTag>Delivery Date</LabelTag>
      </Col>
      <Col md={7}>
        <SpanTag>{item.order_delivery_date_str ? item.order_delivery_date_str : moment(item.order_delivery_date).format("DD-MM-YYYY hh:mm a")}</SpanTag>
      </Col>
    </Row>
    <Row>
      <Col md={5}>
        <LabelTag>Order Item Count</LabelTag>
      </Col>
      <Col md={7}>
        <SpanTag>
          {item.department_name === "Flashing" ? item.Order_Flashing_Count : ""}
          {item.department_code === "J" ? item.Order_Jobbing_Count : ""}
          {item.department_code === "FG" ? item.Order_Faciagutter_Count : ""}
          {item.department_code === "CL" ? item.Order_Cladding_Count : ""}
          {item.department_code === "ROOF" ? item.Order_Roofing_Count : ""}
        </SpanTag>
      </Col>
    </Row>
    <Row>
      <Col md={5}>
        <LabelTag>Order Status</LabelTag>
      </Col>
      <Col md={7}>
        <SpanTag>
          <Badge bg="info" text="light">
            {item.order_status}
          </Badge>
        </SpanTag>
      </Col>
    </Row>
  </>
);

const BarcodeScanner = ({ searchQuery, setSearchQuery }) => {
  const barcodeInputRef = useRef(null);
  const handleClickOutside = event => {
    if (barcodeInputRef.current && !event.target.closest("input, textarea, select")) {
      barcodeInputRef.current.focus();
    }
  };
  useEffect(() => {
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  return (
    <Card className="BarcodeScanArea text-center">
      <form>
        <input
          ref={barcodeInputRef}
          autoFocus
          type="text"
          placeholder="Scan Order No"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value.trim().toUpperCase())}
          onKeyDown={e => {
            if (e.key === "Enter") {
              e.preventDefault();
            }
          }}
        />
      </form>
    </Card>
  );
};

export default OrderProductionDashboard;
