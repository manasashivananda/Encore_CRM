import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Row, Col, Card, Badge } from "react-bootstrap";
import { HeadingFour, MyDiv, HeadingFive, HeadingThree, LabelTag, SpanTag } from "../Common/Components";
import { TextField, MenuItem } from "@mui/material";
import moment from 'moment';
import axios from 'axios';
import swal from "sweetalert2";
import ProductionEmployeeMaster from './employeeMaster';


const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function OrderProductionDashboard() {
  const [specificSearchOrders, setSpecSearchOrders] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const inputRef  = useRef(null);
  const buffer = useRef('');
  const typingTimeoutRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [racks, setRacks] = useState('');
  const [orderSearchQuery, setOrderSearchQuery] = useState('');
  const [orderUpdated, setOrderUpdated] = useState('');

  const DELAY_DURATION = 1500;

  const handleSearchQueryChange = (event) => {    
    const query = event.target.value.toUpperCase();
    setSearchQuery(query);
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      if (query.length >= 8) {
        handleOrderSearch(query);
      }
    }, DELAY_DURATION);
  };



  const handleGlobalKeyPress = useCallback((event) => {
    if (event.target.tagName.toLowerCase() !== 'input' && event.target.tagName.toLowerCase() !== 'textarea') {
      if (inputRef.current) {
        inputRef.current.focus();
        buffer.current += event.key;
        if (event.key === 'Enter') {
          setSearchQuery(buffer.current.trim().toUpperCase());
          buffer.current = '';
        }
      }
    }
  }, []);

  useEffect(() => {
    document.addEventListener('keydown', handleGlobalKeyPress);  
    return () => {
      document.removeEventListener('keydown', handleGlobalKeyPress);
    };
  }, [handleGlobalKeyPress]);

  // const handleGlobalKeyPress = useCallback((event) => {
  //   console.log('1', event);
  //   if (event.target.tagName.toLowerCase() !== 'input' && event.target.tagName.toLowerCase() !== 'textarea') {
  //     if(document.activeElement === inputRef.current){
  //       console.log('5', event);
  //       // if (inputRef.current) {
  //       //   inputRef.current.focus();
  //       //   buffer.current += event.key;
  //       //   if (event.key === 'Enter') {
  //       //     setSearchQuery(buffer.current.trim().toUpperCase());
  //       //     buffer.current = '';
  //       //   }
  //       // }
  //     }
   
  //   }
  // }, []);


  

  const handleOrderSearch = async (query) => {
    setLoading(true);
    try {
      const { data } = await axios.get(`${API_BASE_URL}fetch-specific-order-for-processing?keyword=${query}`, {
        headers: {
          "x-access-token": localStorage.getItem("token"),
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
      });
      setSpecSearchOrders(data);
      setSearchQuery('');
      setData(prevData => ({
        ...prevData,
        rackid: "",
        DimensionOne: "",
        DimensionTwo: ""
      }));
    } catch (error) {
      swal.fire({
        text: error.response.data,
        icon: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  const AssignToMeForProduction = (item, orderSearchQuery, selectedRackId, DimensionOne, DimensionTwo) => {
    console.log('query', orderSearchQuery)
    let orderProdStatus = item.department_code === "F" ? 2 : 4;
    switch (item.department_code) {
      case "F":
        if (item.f_order_prod_current_status) {
          orderProdStatus = parseInt(item.f_order_prod_current_status, 10) + 2;
        }
        break;
      case "J":
        if (item.j_order_prod_current_status >= "3") {
          orderProdStatus = parseInt(item.j_order_prod_current_status, 10) + 2;
        }
        break;
      case "FG":
        if (item.fg_order_prod_current_status >= "3") {
          orderProdStatus = parseInt(item.fg_order_prod_current_status, 10) + 2;
        }
        break;
      case "CL":
        if (item.cl_order_prod_current_status >= "3") {
          orderProdStatus = parseInt(item.cl_order_prod_current_status, 10) + 2;
        }
        break;
      case "ROOF":
        if (item.roof_order_prod_current_status >= "3") {
          orderProdStatus = parseInt(item.roof_order_prod_current_status, 10) + 2;
        }
        break;
      default:
        break;
    }
    const url = API_BASE_URL + 'assign-to-start-production/' + item._id + "?prodStatus=" + orderProdStatus + "&department=" + item.department_code + (selectedRackId ? "&rackid=" + selectedRackId : "") + (DimensionOne ? "&dimensionOne=" + DimensionOne : "") + (DimensionTwo ? "&dimensionTwo=" + DimensionTwo : "");
    axios
      .post(url, null, {
        headers: {
          "x-access-token": localStorage.getItem("token"),
          'Accept': 'application/json',
          'Content-Type': 'multipart/form-data',
        },
      })
      .then((res) => {
        if (res.status === 200) {
          // handleOrderSearch("");
          setSpecSearchOrders('');
          // handleOrderRefresh(orderSearchQuery);
          // swal.fire({
          //   text: "This Order Successfully Processed",
          //   icon: "success",
          //   type: "success",
          // });
          setOrderUpdated('updated');
        }
      })
      .catch((error) => {
        swal.fire({
          text: error.response.data,
          icon: "error",
        });
      });
  };

  const loadRacks = async () => {
    var url = API_BASE_URL + `fetch-racking-data`;
    axios.get(url, { headers: { "x-access-token": localStorage.getItem("token"), 'Accept': 'application/json', 'Content-Type': 'application/json' } })
      .then(res => {
        setRacks(res.data)
      },
        (error) => {
          //alert('Customer fetching failed: ' + error)
        })
  }

  useEffect(() => {
    loadRacks();
  }, []);
  const [data, setData] = useState({
    rackid: "",
    DimensionOne: "",
    DimensionTwo: ""
  })
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

  return (
    <React.Fragment>
      <Row>
        <Col md={8}>
          <Row className='p-2 text-center barcodeSearchArea row'>
            {loading ? (<HeadingFour className="text-center">Loading...</HeadingFour>) : <>
              {specificSearchOrders.length > 0 ? (
                specificSearchOrders.slice(0, 1).map((item) => (
                  <React.Fragment key={item._id}>
                    <Col md={12} className='text-start'>
                      <HeadingFour className="mt-2 px-4">Order ID - {item?.order_unique_id} / {item?.department_name}</HeadingFour>
                    </Col>
                    <Col md={7} key={item._id}>
                      <MyDiv className="ProfileBasicDetail order-profile p-0 pt-2">
                        <Row className="ProfileBasicDetailLeftHeader p-0">
                          <Col md={12} className="text-start">
                            <MyDiv className="ProfileCard">
                              <Row>
                                <Col md={5}><LabelTag>Customer Name</LabelTag></Col>
                                <Col md={7}><SpanTag>{item.account_Name}</SpanTag></Col>
                              </Row>
                              <Row>
                                <Col md={5}><LabelTag>PO Name</LabelTag></Col>
                                <Col md={7}><SpanTag>{item.order_customer_PO_number}</SpanTag></Col>
                              </Row>
                              <Row>
                                <Col md={5}><LabelTag>Delivery Date</LabelTag></Col>
                                <Col md={7}><SpanTag>{item.order_delivery_date_str ? item.order_delivery_date_str : moment(item.order_delivery_date).format('DD-MM-YYYY hh:mm a')}</SpanTag></Col>
                              </Row>
                              <Row>
                                <Col md={5}><LabelTag>Order Item Count</LabelTag></Col>
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
                                <Col md={5}><LabelTag>Order Status</LabelTag></Col>
                                <Col md={7}>
                                  <SpanTag>
                                    <Badge bg="info" text="light">{item.order_status}</Badge>
                                  </SpanTag>
                                </Col>
                              </Row>
                            </MyDiv>
                          </Col>
                        </Row>
                      </MyDiv>
                    </Col>
                    <Col md={5} className="mb-4">
                      {item.department_code === "F" ? <>
                        {!item.f_order_prod_push_status === "2" ? <HeadingThree className="mt-3 mb-3 text-success">Order Not Ready for Production</HeadingThree> : ""}
                        {!item.f_order_prod_current_status ?
                          <>
                            <HeadingThree className="mt-3 mb-3 text-success">Order in Rolling  </HeadingThree>
                            <button onClick={() => AssignToMeForProduction(item, orderSearchQuery)} className="btn success-btn add-cta search mx-1 mt-2">Mark As Rolled</button>
                          </> : ""}
                        {item.f_order_prod_current_status === "2" ?
                          <>
                            <HeadingThree className="mt-3 mb-3 text-success">Order in Folding  </HeadingThree>
                            <button onClick={() => AssignToMeForProduction(item, orderSearchQuery)} className="btn success-btn add-cta search mx-1 mt-2">Mark As Folded</button>
                          </> : ""}
                        {item.f_order_prod_current_status === "4" ?
                          <MyDiv className="RackBox">
                            <HeadingThree className="mt-3 mb-3 text-success">Order in Racking  </HeadingThree>
                            <Row>
                              <Col md={12}>
                                <TextField select required name="rackid" id="rackid" variant="standard" label="Rack No" SelectProps={{ multiple: false, value: data.rackid, onChange: handleFieldChange, }}>
                                  {racks.length ? (
                                    racks.map((rack, index) => (
                                      <MenuItem key={index} value={rack._id}>{rack.rack_name}</MenuItem>
                                    ))
                                  ) : (
                                    <MenuItem>You don't have Rack access or Rack empty</MenuItem>
                                  )}
                                </TextField>
                              </Col>
                            </Row>
                            <Row>
                              <Col md={6}>
                                <TextField required name="DimensionOne" id="DimensionOne" variant="standard" label="Meter" value={data.DimensionOne} onChange={(e) => handle(e)}></TextField>
                              </Col>
                              <Col md={6}>
                                <TextField required name="DimensionTwo" id="DimensionTwo" variant="standard" label="MM" value={data.DimensionTwo} onChange={(e) => handle(e)}></TextField>
                              </Col>
                            </Row>
                            <Row>
                              <Col md={12} className='mt-2'>
                                <button onClick={() => AssignToMeForProduction(item, orderSearchQuery, data.rackid, data.DimensionOne, data.DimensionTwo)} disabled={!data.rackid} className="btn success-btn add-cta search mx-1 mt-2">Mark As Racked</button>
                              </Col>
                            </Row>
                          </MyDiv> : ""}
                        {item.f_order_prod_current_status === "6" ? <><HeadingThree className="mt-3 mb-3 text-success">Order Ready for Loading  </HeadingThree>
                        </> : ""}
                      </> : ""}
                      {item.department_code === "J" ? <>
                        {!item.j_order_prod_push_status === '2' ? <HeadingThree className="mt-3 mb-3 text-success">Order Not Ready for Production</HeadingThree> : ""}
                        {!item.j_order_prod_current_status ?
                          <>
                            <HeadingThree className="mt-3 mb-3 text-success">Order in Folding  </HeadingThree>
                            <button onClick={() => AssignToMeForProduction(item, orderSearchQuery)} className="btn success-btn add-cta search mx-1 mt-2">Mark As Folded</button>
                          </> : ""}
                        {item.j_order_prod_current_status === "4" ?
                          <MyDiv className="RackBox">
                            <HeadingThree className="mt-3 mb-3 text-success">Order in Racking  </HeadingThree>
                            <Row>
                              <Col md={12}>
                                <TextField select required name="rackid" id="rackid" variant="standard" label="Rack No" SelectProps={{ multiple: false, value: data.rackid, onChange: handleFieldChange, }}>
                                  {racks.length ? (
                                    racks.map((rack, index) => (
                                      <MenuItem key={index} value={rack._id}>{rack.rack_name}</MenuItem>
                                    ))
                                  ) : (
                                    <MenuItem>You don't have Rack access or Rack empty</MenuItem>
                                  )}
                                </TextField>
                              </Col>
                            </Row>
                            <Row>
                              <Col md={6}>
                                <TextField required name="DimensionOne" id="DimensionOne" variant="standard" label="Meter" value={data.DimensionOne} onChange={(e) => handle(e)}></TextField>
                              </Col>
                              <Col md={6}>
                                <TextField required name="DimensionTwo" id="DimensionTwo" variant="standard" label="MM" value={data.DimensionTwo} onChange={(e) => handle(e)}></TextField>
                              </Col>
                            </Row>
                            <Row>
                              <Col md={12} className='mt-2'>
                                <button onClick={() => AssignToMeForProduction(item, orderSearchQuery, data.rackid, data.DimensionOne, data.DimensionTwo)} disabled={!data.rackid} className="btn success-btn add-cta search mx-1 mt-2">Mark As Racked</button>
                              </Col>
                            </Row>
                          </MyDiv> : ""}
                        {item.j_order_prod_current_status === "6" ? <><HeadingThree className="mt-3 mb-3 text-success">Order Ready for Loading  </HeadingThree>
                        </> : ""}
                      </> : ""}
                      {item.department_code === "FG" ? <>
                        {!item.fg_order_prod_push_status === "2" ? <HeadingThree className="mt-3 mb-3 text-success">Order Not Ready for Production</HeadingThree> : ""}
                        {!item.fg_order_prod_current_status ?
                          <>
                            <HeadingThree className="mt-3 mb-3 text-success">Order in Folding  </HeadingThree>
                            <button onClick={() => AssignToMeForProduction(item, orderSearchQuery)} className="btn success-btn add-cta search mx-1 mt-2">Mark As Folded</button>
                          </> : ""}
                        {item.fg_order_prod_current_status === "4" ?
                          <MyDiv className="RackBox">
                            <HeadingThree className="mt-3 mb-3 text-success">Order in Racking  </HeadingThree>
                            <Row>
                              <Col md={12}>
                                <TextField select required name="rackid" id="rackid" variant="standard" label="Rack No" SelectProps={{ multiple: false, value: data.rackid, onChange: handleFieldChange, }}>
                                  {racks.length ? (
                                    racks.map((rack, index) => (
                                      <MenuItem key={index} value={rack._id}>{rack.rack_name}</MenuItem>
                                    ))
                                  ) : (
                                    <MenuItem>You don't have Rack access or Rack empty</MenuItem>
                                  )}
                                </TextField>
                              </Col>
                            </Row>
                            <Row>
                              <Col md={6}>
                                <TextField required name="DimensionOne" id="DimensionOne" variant="standard" label="Meter" value={data.DimensionOne} onChange={(e) => handle(e)}></TextField>
                              </Col>
                              <Col md={6}>
                                <TextField required name="DimensionTwo" id="DimensionTwo" variant="standard" label="MM" value={data.DimensionTwo} onChange={(e) => handle(e)}></TextField>
                              </Col>
                            </Row>
                            <Row>
                              <Col md={12} className='mt-2'>
                                <button onClick={() => AssignToMeForProduction(item, orderSearchQuery, data.rackid, data.DimensionOne, data.DimensionTwo)} disabled={!data.rackid} className="btn success-btn add-cta search mx-1 mt-2">Mark As Racked</button>
                              </Col>
                            </Row>
                          </MyDiv> : ""}
                        {item.fg_order_prod_current_status === "6" ? <><HeadingThree className="mt-3 mb-3 text-success">Order Ready for Loading  </HeadingThree>
                        </> : ""}
                      </> : ""}
                      {item.department_code === "CL" ? <>
                        {!item.cl_order_prod_push_status === "2" ? <HeadingThree className="mt-3 mb-3 text-success">Order Not Ready for Production</HeadingThree> : ""}
                        {!item.cl_order_prod_current_status ?
                          <>
                            <HeadingThree className="mt-3 mb-3 text-success">Order in Folding  </HeadingThree>
                            <button onClick={() => AssignToMeForProduction(item, orderSearchQuery)} className="btn success-btn add-cta search mx-1 mt-2">Mark As Folded</button>
                          </> : ""}
                        {item.cl_order_prod_current_status === "4" ?
                          <MyDiv className="RackBox">
                            <HeadingThree className="mt-3 mb-3 text-success">Order in Racking  </HeadingThree>
                            <Row>
                              <Col md={12}>
                                <TextField select required name="rackid" id="rackid" variant="standard" label="Rack No" SelectProps={{ multiple: false, value: data.rackid, onChange: handleFieldChange, }}>
                                  {racks.length ? (
                                     racks.map((rack, index) => (
                                      <MenuItem key={index} value={rack._id}>{rack.rack_name}</MenuItem>
                                    ))
                                  ) : (
                                    <MenuItem>You don't have Rack access or Rack empty</MenuItem>
                                  )}
                                </TextField>
                              </Col>
                            </Row>
                            <Row>
                              <Col md={6}>
                                <TextField required name="DimensionOne" id="DimensionOne" variant="standard" label="Meter" value={data.DimensionOne} onChange={(e) => handle(e)}></TextField>
                              </Col>
                              <Col md={6}>
                                <TextField required name="DimensionTwo" id="DimensionTwo" variant="standard" label="MM" value={data.DimensionTwo} onChange={(e) => handle(e)}></TextField>
                              </Col>
                            </Row>
                            <Row>
                              <Col md={12} className='mt-2'>
                                <button onClick={() => AssignToMeForProduction(item, orderSearchQuery, data.rackid, data.DimensionOne, data.DimensionTwo)} disabled={!data.rackid} className="btn success-btn add-cta search mx-1 mt-2">Mark As Racked</button>
                              </Col>
                            </Row>
                          </MyDiv> : ""}
                        {item.cl_order_prod_current_status === "6" ? <><HeadingThree className="mt-3 mb-3 text-success">Order Ready for Loading  </HeadingThree>
                        </> : ""}
                      </> : ""}
                      {item.department_code === "ROOF" ? <>
                        {!item.roof_order_prod_push_status === "2" ? <HeadingThree className="mt-3 mb-3 text-success">Order Not Ready for Production</HeadingThree> : ""}
                        {!item.roof_order_prod_current_status ?
                          <>
                            <HeadingThree className="mt-3 mb-3 text-success">Order in Folding  </HeadingThree>
                            <button onClick={() => AssignToMeForProduction(item, orderSearchQuery)} className="btn success-btn add-cta search mx-1 mt-2">Mark As Folded</button>
                          </> : ""}
                        {item.roof_order_prod_current_status === "4" ?
                          <MyDiv className="RackBox">
                            <HeadingThree className="mt-3 mb-3 text-success">Order in Racking  </HeadingThree>
                            <Row>
                              <Col md={12}>
                                <TextField select required name="rackid" id="rackid" variant="standard" label="Rack No" SelectProps={{ multiple: false, value: data.rackid, onChange: handleFieldChange, }}>
                                  {racks.length ? (
                                    racks.map((rack, index) => (
                                      <MenuItem key={index} value={rack._id}>{rack.rack_name}</MenuItem>
                                    ))
                                  ) : (
                                    <MenuItem>You don't have Rack access or Rack empty</MenuItem>
                                  )}
                                </TextField>
                              </Col>
                            </Row>
                            <Row>
                              <Col md={6}>
                                <TextField required name="DimensionOne" id="DimensionOne" variant="standard" label="Meter" value={data.DimensionOne} onChange={(e) => handle(e)}></TextField>
                              </Col>
                              <Col md={6}>
                                <TextField required name="DimensionTwo" id="DimensionTwo" variant="standard" label="MM" value={data.DimensionTwo} onChange={(e) => handle(e)}></TextField>
                              </Col>
                            </Row>
                            <Row>
                              <Col md={12} className='mt-2'>
                                <button onClick={() => AssignToMeForProduction(item, orderSearchQuery, data.rackid, data.DimensionOne, data.DimensionTwo)} disabled={!data.rackid} className="btn success-btn add-cta search mx-1 mt-2">Mark As Racked</button>
                              </Col>
                            </Row>
                          </MyDiv> : ""}
                        {item.roof_order_prod_current_status === "6" ? <><HeadingThree className="mt-3 mb-3 text-success">Order Ready for Loading  </HeadingThree>
                        </> : ""}
                      </> : ""}

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
              )} </>
            }
          </Row>
        </Col>
        <Col xl={4} md={12}>
          <Card className="BarcodeScanArea text-center">
            <form onSubmit={(e) => { e.preventDefault(); }}>
              <input autoFocus type="text" placeholder="Enter Order No" name="search" value={searchQuery} onChange={handleSearchQueryChange} ref={inputRef } />
            </form>
          </Card>
        </Col>
      </Row>
      <Row className='mt-2'>
        {/* <ProductionEmployeeMaster orderUpdate={orderUpdated} /> */}
      </Row>
    </React.Fragment>
  );
}

export default OrderProductionDashboard;
