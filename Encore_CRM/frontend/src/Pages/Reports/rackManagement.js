import React, { useState, useEffect, useCallback, useRef } from "react";
import { Row, Col, Badge, Button } from "react-bootstrap";
import { Link, useNavigate } from "react-router-dom";
import { HeadingTwo, MyDiv, StrongTag, SpanTag, getFormattedDeliveryTime, HeadingFour } from "../Common/Components";
import { TableBody, Table, TableContainer, TableHead, TableRow, TableCell, TextField, MenuItem } from "@mui/material";
import { IoMdArrowBack } from "react-icons/io";
import axios from "axios";
import swal from "sweetalert2";
import { rackList, departments } from "../Common/staticjson";
import OrderTracking from "../Orders/OrderTracking";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function RackManagement() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState("");
  const [searchData, setSearchData] = useState({ search_text: "" });
  const [loading, setLoading] = useState(false);
  const [orderDetailCard, setOrderDetailCard] = useState(false);
  const [racks, setRacks] = useState([]);
  const cancelToken = useRef(null);
  const [data, setData] = useState({
    order_master_rack: "",
    order_department: "",
    order_sub_rack: "",
  });

  const loadOrders = useCallback(async () => {
    if (cancelToken.current) {
      cancelToken.current.cancel("Operation canceled due to new request.");
    }
    const source = axios.CancelToken.source();
    cancelToken.current = source;
    setLoading(true);
    const url = `${API_BASE_URL}fetch-order-racking-details?orderId=${searchData.search_text}`;
    try {
      const response = await axios.get(url, {
        headers: {
          "x-access-token": localStorage.getItem("token"),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        cancelToken: source.token,
      });
      setOrderDetailCard(true);
      setOrders(response.data[0]);
      const specificOrder = response.data[0];
      setData(specificOrder);
    } catch (error) {
      swal.fire({
        text: error.response?.data || "An error occurred",
        icon: "error",
      });
    } finally {
      if (!source.token.reason) {
        setLoading(false);
      }
    }
  }, [searchData.search_text]);

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
      console.log(`Exception while doing something: ${error}`);
    }
  };

  useEffect(() => {
    loadRacks();
  }, []);

  useEffect(() => {
    if (searchData.search_text.length >= 8) {
      loadOrders();
    }
  }, [searchData.search_text, loadOrders]);

  const searchHandle = e => {
    const searchNewData = { ...searchData, [e.target.id]: e.target.value };
    setSearchData(searchNewData);
  };

  const handleFieldChange = event => {
    setData(data => ({
      ...data,
      [event.target.name]: event.target.type === "checkbox" ? event.target.checked : event.target.value,
    }));
  };

  const updateOrderDetails = e => {
    const dept = data.order_department || "";
    const mRack = data.order_master_rack || "";
    const sRack = data.order_sub_rack || "";
    e.preventDefault();
    const formData = new FormData();
    for (const key in data) {
      formData.append(key, data[key]);
    }
    const url = `${API_BASE_URL}update-order-department-rack-details?OrderID=${searchData.search_text}&Dept=${dept}&MRack=${mRack}&SRack=${sRack}`;
    const method = "patch";
    axios({
      method,
      url,
      data: formData,
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
        }
        loadOrders();
      })
      .catch(error => {
        swal.fire({
          text: error.response.data,
          icon: "error",
          type: "error",
        });
      });
  };

  const resetOrderDetails = () => {
    setOrderDetailCard(false);
    setSearchData({ search_text: "" });
    setData({
      order_master_rack: "",
      order_department: "",
      order_sub_rack: "",
    });
  };

  return (
    <React.Fragment>
      <Row className="GeneralHeading withBackArrow">
        <Col md={6}>
          <HeadingTwo>
            <Link className="arrow-btn" onClick={() => navigate(-1)}>
              <IoMdArrowBack />
            </Link>
            Rack Management
          </HeadingTwo>
        </Col>
      </Row>
      <Row>
        <Col md={12}>
          <MyDiv className="searchBar GeneralHeading mt-2 d-block">
            <Row>
              <Col md={2} xs={9} className="SearchTextBox pt-2">
                <TextField id="search_text" placeholder="Order id" variant="outlined" size="small" onChange={searchHandle} value={searchData.search_text} />
              </Col>
              <Col md={2} className="SearchTextBox hide">
                <TextField select required name="order_master_rack" id="order_master_rack" variant="standard" label="Master Rack" value={data.order_master_rack || ""} onChange={handleFieldChange}>
                  {rackList.length ? (
                    rackList.map(rack => (
                      <MenuItem key={rack.value} value={rack.value}>
                        {rack.label}
                      </MenuItem>
                    ))
                  ) : (
                    <MenuItem disabled>No Racks Available</MenuItem>
                  )}
                </TextField>
              </Col>
              <Col md={2} className="SearchTextBox">
                <TextField select required name="order_department" id="order_department" variant="standard" label="Department" value={data.order_department} onChange={handleFieldChange}>
                  {departments.length ? (
                    departments.map(depart => (
                      <MenuItem key={depart.value} value={depart.value}>
                        {depart.label}
                      </MenuItem>
                    ))
                  ) : (
                    <MenuItem disabled>No Departments Available</MenuItem>
                  )}
                </TextField>
              </Col>
              <Col md={2} className="SearchTextBox">
                <TextField select required name="order_sub_rack" id="order_sub_rack" variant="standard" label="Sub Rack" value={data.order_sub_rack} onChange={handleFieldChange}>
                  {racks.length ? (
                    racks.map(SubRackList => (
                      <MenuItem key={SubRackList._id} value={SubRackList._id}>
                        {SubRackList.rack_name}
                      </MenuItem>
                    ))
                  ) : (
                    <MenuItem disabled>No Sub Racks Available</MenuItem>
                  )}
                </TextField>
              </Col>
              <Col md={3} className="d-flex">
                <Button className="btn primary-btn mt-2" variant="contained" color="primary" onClick={updateOrderDetails}>
                  Update
                </Button>
                <Button className="btn secondary-btn mx-1 mt-2" onClick={resetOrderDetails}>
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
        <>
          {orderDetailCard ? (
            <MyDiv className="GeneralTable">
              <TableContainer>
                <Table className="bgGrey" aria-label="Order table">
                  <TableHead>
                    <TableRow>
                      <TableCell align="left">Order ID</TableCell>
                      <TableCell align="left">Customer Details</TableCell>
                      <TableCell align="left">Contact Details</TableCell>
                      <TableCell align="left">Delivery Address</TableCell>
                      <TableCell align="left">Order Count</TableCell>
                      <TableCell align="left">Rack Number</TableCell>
                      <TableCell align="left">Dimensions</TableCell>
                      <TableCell align="left">Expected Delivery Date</TableCell>
                      <TableCell align="left">Detail</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    <TableRow>
                      <TableCell align="left" component="th" scope="row">
                        {orders.order_unique_id}
                        <StrongTag>
                          <br />
                          Master Rack : {orders.order_master_rack}
                        </StrongTag>
                      </TableCell>
                      <TableCell>
                        <StrongTag>{orders.account_Name}</StrongTag>
                      </TableCell>
                      <TableCell>
                        <StrongTag>{orders.account_Contact_FName}</StrongTag>
                        <br />
                        Phone: {orders.account_Contact_Phone}
                      </TableCell>
                      <TableCell>
                        <SpanTag>
                          {orders.order_delivery_address_mode === "0" ? (
                            <MyDiv className="storeDelivery">
                              {orders.order_store_delivery_address1}, <br />
                              {orders.order_store_delivery_city}, {orders.order_store_delivery_state}, &nbsp;{orders.order_store_delivery_country}-{orders.order_store_delivery_postalcode}
                            </MyDiv>
                          ) : (
                            ""
                          )}
                          {orders.order_delivery_address_mode === "1" ? (
                            <MyDiv className="siteDelivery">
                              {orders.order_site_delivery_address1}, <br />
                              {orders.order_site_delivery_city}, {orders.order_site_delivery_state}, &nbsp;{orders.order_site_delivery_country}-{orders.order_site_delivery_postalcode}
                            </MyDiv>
                          ) : (
                            ""
                          )}
                          {orders.order_delivery_address_mode === "2" ? <MyDiv className="pickupOrder"> PickUp Order</MyDiv> : ""}
                        </SpanTag>
                      </TableCell>
                      <TableCell>
                        <MyDiv className="BadgeBlock">
                          {orders.Order_Flashing_Count !== "0" ? (
                            <Badge className="flashingBg">
                              F <SpanTag>{orders.Order_Flashing_Count}</SpanTag>
                            </Badge>
                          ) : null}
                          {orders.Order_Cladding_Count && orders.Order_Cladding_Count !== "0" ? (
                            <Badge className="claddingBg">
                              CL <SpanTag>{orders.Order_Cladding_Count}</SpanTag>
                            </Badge>
                          ) : null}
                          {orders.Order_Faciagutter_Count && orders.Order_Faciagutter_Count !== "0" ? (
                            <Badge className="faciaBg">
                              FG <SpanTag>{orders.Order_Faciagutter_Count}</SpanTag>
                            </Badge>
                          ) : null}
                          {orders.Order_Jobbing_Count && orders.Order_Jobbing_Count !== "0" ? (
                            <Badge className="jobbingBg">
                              J <SpanTag>{orders.Order_Jobbing_Count}</SpanTag>
                            </Badge>
                          ) : null}
                          {orders.Order_GBI_Count && orders.Order_GBI_Count !== "0" ? (
                            <Badge className="gbiBg">
                              GBI <SpanTag>{orders.Order_GBI_Count}</SpanTag>
                            </Badge>
                          ) : null}
                          {orders.Order_Roofing_Count && orders.Order_Roofing_Count !== "0" ? (
                            <Badge className="roofingBg">
                              ROOF <SpanTag>{orders.Order_Roofing_Count}</SpanTag>
                            </Badge>
                          ) : null}
                        </MyDiv>
                      </TableCell>
                      <TableCell>
                        <MyDiv className="BadgeBlock">
                          {orders.f_order_racking_table ? (
                            <Badge className="flashingBg">
                              F <SpanTag>{orders.f_order_racking_table}</SpanTag>
                            </Badge>
                          ) : null}
                          {orders.cl_order_racking_table ? (
                            <Badge className="claddingBg">
                              CL <SpanTag>{orders.cl_order_racking_table}</SpanTag>
                            </Badge>
                          ) : null}
                          {orders.gbi_order_racking_table ? (
                            <Badge className="claddingBg">
                              GBI <SpanTag>{orders.gbi_order_racking_table}</SpanTag>
                            </Badge>
                          ) : null}
                          {orders.fg_order_racking_table ? (
                            <Badge className="faciaBg">
                              FG <SpanTag>{orders.fg_order_racking_table}</SpanTag>
                            </Badge>
                          ) : null}
                          {orders.j_order_racking_table ? (
                            <Badge className="jobbingBg">
                              J<SpanTag>{orders.j_order_racking_table}</SpanTag>
                            </Badge>
                          ) : null}
                          {orders.roof_order_racking_table ? (
                            <Badge className="roofingBg">
                              ROOF<SpanTag>{orders.roof_order_racking_table}</SpanTag>
                            </Badge>
                          ) : null}
                        </MyDiv>
                      </TableCell>
                      <TableCell>
                        <MyDiv className="BadgeBlock">
                          {orders.f_order_racking_dimension1 ? (
                            <Badge className="flashingBg">
                              F
                              <SpanTag>
                                {orders.f_order_racking_dimension1} x {orders.f_order_racking_dimension2}
                              </SpanTag>
                            </Badge>
                          ) : null}
                          {orders.cl_order_racking_dimension1 ? (
                            <Badge className="claddingBg">
                              CL
                              <SpanTag>
                                {orders.cl_order_racking_dimension1} x {orders.cl_order_racking_dimension2}
                              </SpanTag>
                            </Badge>
                          ) : null}
                          {orders.gbi_order_racking_dimension1 ? (
                            <Badge className="claddingBg">
                              GBI
                              <SpanTag>
                                {orders.gbi_order_racking_dimension1} x {orders.cl_order_racking_dimension2}
                              </SpanTag>
                            </Badge>
                          ) : null}
                          {orders.fg_order_racking_dimension1 ? (
                            <Badge className="faciaBg">
                              FG
                              <SpanTag>
                                {orders.fg_order_racking_dimension1} x {orders.fg_order_racking_dimension2}
                              </SpanTag>
                            </Badge>
                          ) : null}
                          {orders.j_order_racking_dimension1 ? (
                            <Badge className="jobbingBg">
                              J
                              <SpanTag>
                                {orders.j_order_racking_dimension1} x {orders.j_order_racking_dimension2}
                              </SpanTag>
                            </Badge>
                          ) : null}
                          {orders.roof_order_racking_dimension1 ? (
                            <Badge className="roofingBg">
                              ROOF
                              <SpanTag>
                                {orders.roof_order_racking_dimension1} x {orders.roof_order_racking_dimension2}
                              </SpanTag>
                            </Badge>
                          ) : null}
                        </MyDiv>
                      </TableCell>
                      <TableCell align="left" component="th" scope="row">
                        {orders.order_delivery_date_str} - {getFormattedDeliveryTime(orders.order_delivery_time, orders.order_delivery_session)}
                      </TableCell>
                      <TableCell align="left" component="th" scope="row">
                        <OrderTracking CoreOrderId={orders._id} />
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
            </MyDiv>
          ) : null}
        </>
      )}
    </React.Fragment>
  );
}

export default RackManagement;
