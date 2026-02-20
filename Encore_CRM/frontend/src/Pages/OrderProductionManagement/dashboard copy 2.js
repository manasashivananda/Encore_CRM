import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Row, Col, Card, Badge } from "react-bootstrap";
import { MyDiv, LabelTag, SpanTag, HeadingFour, HeadingFive } from "../Common/Components";
import { Box, Tabs, Tab } from "@mui/material";
import axios from 'axios';
import swal from "sweetalert2";
import moment from 'moment';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


// Department Barcode Prefixes
const departmentBarcodes = {
  "Flashing": /^IN\d{6}$/,         // Flashing Example: IN107459
  "Jobbing": /^IN\d{6}J$/,         // Jobbing Example: IN107459J
  "Facia Gutter": /^IN\d{6}FG$/,   // Facia Gutter Example: IN107459FG
  "Cladding": /^IN\d{6}CL$/,       // Cladding Example: IN107459CL
  "GBI": /^IN\d{6}GBI$/,           // GBI Example: IN107459GBI
  "Roofing": /^IN\d{6}ROOF$/,      // Roofing Example: IN107459ROOF
};

function OrderProductionDashboard() {
  const [activeTab, setActiveTab] = useState('Rolled');
  const [searchQuery, setSearchQuery] = useState('');
  const inputRef = useRef(null);
  const scanTimeout = useRef(null);
  const [loading, setLoading] = useState(false);
  const [specificSearchOrders, setSpecSearchOrders] = useState([]);
  const renderButtons = (item) => {
    if (!item) return null;
  
    const checkStatus = (status) => {
      switch (activeTab) {
        case "Rolled":
          if (status === 1) return <button className="btn btn-primary me-2">Assign to Me</button>;
          if (status === 2) return <button className="btn btn-success">Mark as Rolled</button>;
          break;
        
        case "Fold":
          if (status === 3) return <button className="btn btn-primary me-2">Assign to Me</button>;
          if (status === 4) return <button className="btn btn-success">Mark as Folded</button>;
          break;
  
        case "Racking":
          if (status === 5) return <button className="btn btn-primary me-2">Assign to Me</button>;
          if (status === 6) return <button className="btn btn-success">Mark as Racked</button>;
          break;
  
        default:
          return null;
      }
      return null;
    };
  
    return (
      <>
        {checkStatus(item.f_order_prod_push_status)}
        {checkStatus(item.j_order_prod_push_status)}
        {checkStatus(item.cl_order_prod_push_status)}
        {checkStatus(item.gbi_order_prod_push_status)}
        {checkStatus(item.roof_order_prod_push_status)}
        {checkStatus(item.fg_order_prod_push_status)}
      </>
    );
  };
  
  
  

  // Fetch Order Data Based on Barcode
  const handleOrderSearch = useCallback(async (query) => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const { data } = await axios.get(
        `${API_BASE_URL}fetch-specific-order-for-processing?keyword=${query}`,
        {
          headers: {
            "x-access-token": localStorage.getItem("token"),
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
        }
      );
      setSpecSearchOrders(data);
      setSearchQuery('');
    } catch (error) {
      swal.fire({
        text: error.response?.data || "Error fetching order",
        icon: 'error',
      });
      setSearchQuery('');
    } finally {
      setLoading(false);
    }
  }, []);

  // Validate Barcode Based on Active Tab
  const handleScan = (query) => {
    if (!query.trim()) return;
    const department = Object.keys(departmentBarcodes).find((dept) =>
      departmentBarcodes[dept].test(query)
    );

    if (!department) {
      swal.fire({
        text: "Invalid barcode scanned. Please try again.",
        icon: "error",
      });
      setSearchQuery('');
      return;
    }
    if (activeTab === "Rolled" && department !== "Flashing") {
      swal.fire({
        text: "This order is not a Flashing order.",
        icon: "warning",
      });
      setSearchQuery('');
      return;
    }
    handleOrderSearch(query);
  };

  // Debounced Scan Handler
  useEffect(() => {
    if (searchQuery) {
      if (scanTimeout.current) clearTimeout(scanTimeout.current);
      scanTimeout.current = setTimeout(() => {
        handleScan(searchQuery);
      }, 300);
    }
    return () => clearTimeout(scanTimeout.current);
  }, [searchQuery]);

  useEffect(() => {
    document.addEventListener("keydown", () => inputRef.current?.focus());
    return () => document.removeEventListener("keydown", () => inputRef.current?.focus());
  }, []);

  const handleTabChange = (_, newTab) => {
    setActiveTab(newTab);
    setSearchQuery('');
    setSpecSearchOrders([]);
  };

  
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

      <MyDiv className="GeneralTable p-2">
        <Row>
          <Col md={8}>
            <Row className='p-2 text-center barcodeSearchArea row'>
              {loading ? (
                <HeadingFour className="text-center">Loading...</HeadingFour>
              ) : (
                <>
                  {specificSearchOrders.length > 0 ? (
                    specificSearchOrders.slice(0, 1).map((item) => (
                      <React.Fragment key={item._id}>
                        <Col md={12} className='text-start'>
                          <HeadingFour className="mt-2 px-4">
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
                        <Col md={3}>
                        <Col md={3} className="d-flex flex-column align-items-center justify-content-center">
                          {renderButtons(item)}
                        </Col>
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
          </Col>
          <Col md={4}>
            <BarcodeScanner searchQuery={searchQuery} setSearchQuery={setSearchQuery} inputRef={inputRef} />
          </Col>
        </Row>
      </MyDiv>
    </React.Fragment>
  );
}

const OrderDetails = ({ item }) => (
  <>
    <Row>
      <Col md={5}><LabelTag>Customer Name</LabelTag></Col>
      <Col md={7}><SpanTag>{item.account_Name}</SpanTag></Col>
    </Row>
    <Row>
      <Col md={5}><LabelTag>Order Status</LabelTag></Col>
      <Col md={7}>
        <SpanTag>
          <Badge bg="info" text="light">{item.order_status}</Badge>
        </SpanTag>
      </Col>
    </Row>
  </>
);

const BarcodeScanner = ({ searchQuery, setSearchQuery, inputRef }) => (
  <Card className="BarcodeScanArea text-center">
    <form>
      <input ref={inputRef} autoFocus type="text" placeholder="Scan Order No"
        value={searchQuery} onChange={(e) => setSearchQuery(e.target.value.trim())} />
    </form>
  </Card>
);




export default OrderProductionDashboard;
