import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Row, Col, Card, Badge, } from "react-bootstrap";
import { MyDiv, LabelTag, SpanTag, HeadingFour, HeadingFive, HeadingThree } from "../Common/Components";
import { Box, Tabs, Tab, TextField, MenuItem, TableBody, Table, TableContainer, TableHead, TableRow, TableCell, } from "@mui/material";
import axios from 'axios';
import swal from "sweetalert2";
import moment from 'moment';
import NoDataFound from '../Common/noDataFound';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


const departmentBarcodes = {
  "Flashing": /^IN\d{6}$/,
  "Jobbing": /^IN\d{6}J$/,
  "Facia Gutter": /^IN\d{6}FG$/,
  "Cladding": /^IN\d{6}CL$/,
  "GBI": /^IN\d{6}GBI$/,
  "Roofing": /^IN\d{6}ROOF$/,
};

function OrderProductionDashboard() {
  const [activeTab, setActiveTab] = useState('Rolled');
  const [searchQuery, setSearchQuery] = useState('');
  const inputRef = useRef(null);
  const scanTimeout = useRef(null);
  const [loading, setLoading] = useState(false);
  const [jobDoneMessage, setJobDoneMessage] = useState(false);
  const [rackUpdated, setRackUpdated] = useState(true);
  const [specificSearchOrders, setSpecSearchOrders] = useState([]);
  const [racks, setRacks] = useState('');
  const [data, setData] = useState({ rackid: "", DimensionOne: "", DimensionTwo: "" });
  const [status, setStatus] = useState('');
  const [productionEmp, setProductionEmp] = useState('');
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [cancelToken, setCancelToken] = useState(null);

  const handleOrderSearch = useCallback(async (query) => {
    if (!query.trim()) return;
    setJobDoneMessage(false);
    setLoading(true);
    try {
      const { data } = await axios.get(
        `${API_BASE_URL}fetch-specific-order-for-processing?keyword=${query}`,
        { headers: { "x-access-token": localStorage.getItem("token") } }
      );
      setSpecSearchOrders(data);
      setSearchQuery('');
      setRackUpdated(true);
    } catch (error) {
      swal.fire({ text: error.response?.data || "Error fetching order", icon: 'error' });
      setSearchQuery('');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleScan = (query) => {
    if (!query.trim()) return;
    const department = Object.keys(departmentBarcodes).find(dept => departmentBarcodes[dept].test(query));

    if (!department) {
      swal.fire({ text: "Invalid barcode", icon: "error" });
      setSearchQuery('');
      return;
    }

    if (activeTab === "Rolled" && department !== "Flashing") {
      swal.fire({ text: "Not a Flashing order", icon: "warning" });
      setSearchQuery('');
      return;
    }
    handleOrderSearch(query);
  };

  useEffect(() => {
    if (searchQuery) {
      clearTimeout(scanTimeout.current);
      scanTimeout.current = setTimeout(() => handleScan(searchQuery), 300);
    }
    return () => clearTimeout(scanTimeout.current);
  }, [searchQuery]);

  useEffect(() => {
    document.addEventListener("keydown", () => inputRef.current?.focus());
    return () => document.removeEventListener("keydown", () => inputRef.current?.focus());
  }, []);

  useEffect(() => {
    if (specificSearchOrders.length > 0) {
      const item = specificSearchOrders[0];
      const departments = {
        "Flashing": "f_order_prod_current_status",
        "Jobbing": "j_order_prod_current_status",
        "Fascia Gutter": "fg_order_prod_current_status",
        "Cladding": "cl_order_prod_current_status",
        "GBI Orders": "gbi_order_prod_current_status",
        "Roofing": "roof_order_prod_current_status"
      };
      const orderStatusKey = departments[item.department_name];
      const currentStatus = item[orderStatusKey] || '0';

      if (activeTab === 'Rolled' && currentStatus === '0') {
        AssignToMeForProduction(item, activeTab, "Rolled");
      } else if (activeTab === 'Fold') {
        if ((item.department_name === 'Flashing' && currentStatus === '2') ||
          (item.department_name !== 'Flashing' && currentStatus === '0')) {
          AssignToMeForProduction(item, activeTab, "Fold");
        }
      }
    }
  }, [specificSearchOrders, activeTab]);

  const handleTabChange = (_, newTab) => {
    setActiveTab(newTab);
    setSearchQuery('');
    setSpecSearchOrders([]);
    if (newTab === "Racking") loadEmployeeOrders();
  };

  const renderButtons = (item) => {
    if (!item) return null;
    const statusMapping = {
      "Rolled": {
        "2": <Badge>Already Rolled</Badge>,
        "4": <Badge>Rolled & Folded</Badge>,
        "6": <Badge>Fully Processed</Badge>
      },
      "Fold": {
        empty: item.department_name === "Flashing" ? <Badge>Ready for Rolling</Badge> : null,
        "4": <Badge>Already Folded</Badge>,
        "6": <Badge>Already Racked</Badge>
      },
      "Racking": {
        empty: item.department_name === "Flashing" ? <Badge>Ready for Rolling</Badge> : <Badge>Ready for Folding</Badge>,
        "2": <Badge>Needs Folding</Badge>,
        "4": (
          <>
          {rackUpdated ? <>
            <Row className='ProdScanRack w-100'>
              <Col md={12}>
                <TextField select required className='w-100' name="rackid" id="rackid" variant="standard" label="Rack No" SelectProps={{ multiple: false, value: data.rackid, onChange: handleFieldChange }}>
                  {racks.map((rack, index) => (
                    <MenuItem key={index} value={rack._id}>{rack.rack_name}</MenuItem>
                  ))}
                </TextField>
              </Col>
            </Row>
            <Row className='w-100 mt-2'>
              <Col md={6}>
                <TextField  name="DimensionOne" id="DimensionOne" variant="standard" label="Meter" value={data.DimensionOne} onChange={handle}></TextField>
              </Col>
              <Col md={6}>
                <TextField  name="DimensionTwo" id="DimensionTwo" variant="standard" label="MM" value={data.DimensionTwo} onChange={handle}></TextField>
              </Col>
            </Row>     
            <Row>
              <Col md={12} className='mt-2'>
                <button onClick={() => AssignToMeForProduction(item, activeTab, "Racking", data.rackid, data.DimensionOne, data.DimensionTwo)}
                  disabled={!data.rackid} className="btn success-btn add-cta search mx-1 mt-2">
                  Mark As Racked
                </button>
              </Col>
            </Row></> : ""}
          </>
        ),
        "6": <Badge >Already Racked</Badge>
      }
    };
    const orderStatusKey = {
      "Flashing": "f_order_prod_current_status",
      "Jobbing": "j_order_prod_current_status",
      "Fascia Gutter": "fg_order_prod_current_status",
      "Cladding": "cl_order_prod_current_status",
      "GBI Orders": "gbi_order_prod_current_status",
      "Roofing": "roof_order_prod_current_status"
    }[item.department_name];
    const currentStatus = item[orderStatusKey];
    return statusMapping[activeTab]?.[currentStatus || "empty"];
  };

  const AssignToMeForProduction = (item, activeTab, prodStatus, selectedRackId, DimensionOne, DimensionTwo) => {
    let orderProdStatus;
    const currentStatusKey = `${item.department_code.toLowerCase()}_order_prod_current_status`;
    const currentStatus = item[currentStatusKey] !== undefined ? parseInt(item[currentStatusKey]) : null;
    if (item.department_name === "Flashing") {
      orderProdStatus = currentStatus !== null ? currentStatus + 2 : 2;
    } else {
      orderProdStatus = currentStatus !== null ? currentStatus + 2 : 4;
    }

    const url = `${API_BASE_URL}assign-to-start-production/${item._id}?prodStatus=${orderProdStatus}&department=${item.department_code}` +
      (selectedRackId ? `&rackid=${selectedRackId}` : "") +
      (DimensionOne ? `&dimensionOne=${DimensionOne}` : "") +
      (DimensionTwo ? `&dimensionTwo=${DimensionTwo}` : "");

    axios.post(url, null, { headers: { "x-access-token": localStorage.getItem("token") } })
      .then((res) => {
        if (res.status === 200) {
          //setSpecSearchOrders([]);
          swal.fire({ text: "You Done the Job, Order Processed Successfully", icon: "success" });
          setData("");
          //loadRacks();
          setJobDoneMessage(true);
          loadEmployeeOrders();
          setRackUpdated(false)
        }
      })
      .catch(error => swal.fire({ text: error.response.data || "Error", icon: "error" }));
  };

  const loadRacks = async () => {
    axios.get(`${API_BASE_URL}fetch-racking-data-dropdown`, { headers: { "x-access-token": localStorage.getItem("token") } })
      .then(res => setRacks(res.data))
      .catch(() => swal.fire("Rack fetch failed"));
  };
  const handleFieldChange = event => {
    setData(data => ({
      ...data,
      [event.target.name]:
        event.target.type === "checkbox"
          ? event.target.checked
          : event.target.value
    }));
  };
  function handle(e) {
    const newData = { ...data };
    newData[e.target.id] = e.target.value;
    setData(newData);
  }

  const loadEmployeeOrders = useCallback(async () => {
    const source = axios.CancelToken.source();
    setCancelToken(source);
    try {
      const response = await axios.get(`${API_BASE_URL}fetch-racking-data-production-dashboard`, {
        headers: { "x-access-token": localStorage.getItem("token") },
        cancelToken: source.token
      });
      setFilteredOrders(response.data);
    } catch (error) {
      if (!axios.isCancel(error)) console.error('Fetch error:', error);
    }
  }, [productionEmp]);

  useEffect(() => { loadRacks(); loadEmployeeOrders(); }, []);

  // Handle field change
  const handleRackFieldChange = (event, orderUID, deptCode) => {
    const { name, value } = event.target;
    if (name === 'order_sub_rack') {
      updateRackDetails(orderUID, deptCode, value);
    } else if (name === 'status') {
      setStatus(value);
    } else if (name === 'productionEmp') {
      setProductionEmp(value);
    }
  };

  // Update rack details
  const updateRackDetails = (orderUId, deptCode, subRackId) => {
    const url = `${API_BASE_URL}update-order-department-rack-details-custom?OrderID=${orderUId}&Dept=${deptCode}&SRack=${subRackId}`;
    const method = 'patch';
    axios({
      method,
      url,
      headers: {
        "x-access-token": localStorage.getItem("token"),
        'Accept': 'application/json',
        'Content-Type': 'multipart/form-data'
      }
    })
      .then((res) => {
        if (res.status === 200) {
          swal.fire({
            text: res.data,
            icon: "success",
            type: "success"
          });
          loadEmployeeOrders();
        }
      })
      .catch((error) => {
        swal.fire({
          text: error.response.data,
          icon: "error",
          type: "error"
        });
      });
  };

 const barcodeInputRef = useRef(null);
  // Function to handle clicks outside input fields
const handleClickOutside = (event) => {
  if (barcodeInputRef.current && !event.target.closest("input, textarea, select")) {
    barcodeInputRef.current.focus();
  }
};

// Attach event listener on mount and remove on unmount
useEffect(() => {
  document.addEventListener("click", handleClickOutside);
  return () => document.removeEventListener("click", handleClickOutside);
}, []);

  return (
    <React.Fragment>
      <MyDiv className="GeneralHeading pb-0 flex-wrap mt-2">
        <Row>
          <Col md={12}>
            <Box sx={{ maxWidth: 1000, bgcolor: 'background.paper' }}>
              <Tabs value={activeTab} onChange={handleTabChange} variant="scrollable"
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

      <MyDiv className="GeneralTable p-2">
        <Row>
          <Col md={8}>
            <Row className='p-2 text-center barcodeSearchArea row'>
              {loading ? <HeadingFour>Loading...</HeadingFour> :
                specificSearchOrders.length > 0 ? specificSearchOrders.slice(0, 1).map(item => (
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
                      {jobDoneMessage ? <HeadingFour>Job has been Done</HeadingFour> : ""}
                    </Col>
                  </React.Fragment>
                )) : (
                  <Col md={12}>
                    <MyDiv className="ProfileBasicDetail order-profile">
                      <Card className="ProfileBasicDetailLeftHeader">
                        <HeadingFive className="text-center mt-0">
                          Please Scan Order Number
                        </HeadingFive>
                      </Card>
                    </MyDiv>
                  </Col>
                )}
            </Row>
          </Col>
          <Col md={4}>
            <BarcodeScanner searchQuery={searchQuery} setSearchQuery={setSearchQuery} inputRef={inputRef} />
          </Col>
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
                              {item.order_unique_id}
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
                                    <Col md={2}>
                                      <Badge className={className}>{department}</Badge>
                                    </Col>
                                    <Col md={2}><Badge> Folded </Badge></Col>
                                    <Col md={2}>{item.user_name}</Col>

                                    <Col md={2}>
                                      <select
                                        required
                                        name="order_sub_rack"
                                        id="order_sub_rack"
                                        value={item.rackID || ""}
                                        onChange={(e) => handleRackFieldChange(e, item.order_unique_id, deptCode)}
                                      >
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
      </MyDiv>
    </React.Fragment>
  );
}

const OrderDetails = ({ item }) => (
  <>
    <Row><Col md={5}><LabelTag>Customer</LabelTag></Col><Col md={7}><SpanTag>{item.account_Name}</SpanTag></Col></Row>
    <Row><Col md={5}><LabelTag>PO</LabelTag></Col><Col md={7}><SpanTag>{item.order_customer_PO_number}</SpanTag></Col></Row>
    <Row><Col md={5}><LabelTag>Delivery</LabelTag></Col><Col md={7}><SpanTag>{moment(item.order_delivery_date).format('DD-MM-YYYY hh:mm a')}</SpanTag></Col></Row>
    <Row><Col md={5}><LabelTag>Item Count</LabelTag></Col><Col md={7}><SpanTag>{item[`Order_${item.department_name}_Count`]}</SpanTag></Col></Row>
    <Row><Col md={5}><LabelTag>Status</LabelTag></Col><Col md={7}> <SpanTag>
              <Badge bg="info" text="light">{item.order_status}</Badge>
            </SpanTag></Col></Row>
  </>
);

const BarcodeScanner = ({ searchQuery, setSearchQuery }) => {
  const barcodeInputRef = useRef(null);
  const handleClickOutside = (event) => {
    if (
      barcodeInputRef.current &&
      !event.target.closest("input, textarea, select")
    ) {
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
        <input  ref={barcodeInputRef} autoFocus type="text" placeholder="Scan Order No" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value.trim())}
        />
      </form>
    </Card>
  );
};

export default OrderProductionDashboard;