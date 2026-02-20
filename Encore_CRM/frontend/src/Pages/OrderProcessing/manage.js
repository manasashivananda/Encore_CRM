import React, { useState, useEffect, useCallback } from 'react';
import Row from 'react-bootstrap/Row';
import Col from 'react-bootstrap/Col';
import Badge from 'react-bootstrap/Badge';
import { HeadingTwo, HeadingFour, MyDiv, StrongTag, HeadingFive, LabelTag, SpanTag } from "../Common/Components";
import { Link, useNavigate } from "react-router-dom";
import { IoMdArrowBack } from 'react-icons/io';
import axios from 'axios';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Typography from '@mui/material/Typography';
import swal from "sweetalert2";
import { TableBody, Table, TableContainer, TableHead, TableRow, TableCell, Box, IconButton, Tooltip, Card, Button, TextField } from "@mui/material";
import moment from 'moment';
import NoDataFound from '../Common/noDataFound';
import { MdRemoveRedEye } from "react-icons/md";
import QrReader from 'react-qr-scanner'

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function OrderProcessingManage() {
    const [department, setDepartment] = useState([]);
    const [subDepartment, setSubDepartment] = useState([]);
    const [loading, setLoading] = useState(false);
    const [orders, setOrders] = useState('');
    const [specOrders, setSpecOrders] = useState([]);
    const [selectedDepartment, setSelectedDepartment] = useState('');
    const [selectedSubDepartmentId, setSelectedSubDepartmentId] = useState('');
    const [previousSubDepartmentId, setPreviousSubDepartmentId] = useState('');
    const [searchQuery, setSearchQuery] = useState('');

    let navigate = useNavigate();

    const loadDepartment = useCallback(() => {
        setLoading(true);
        var url = API_BASE_URL + `fetch-department-data`;
        axios
            .get(url, {
                headers: { "x-access-token": localStorage.getItem("token"), 'Accept': 'application/json', 'Content-Type': 'application/json' }
            })
            .then((res) => {
                setDepartment(res.data);
                setLoading(false);
                if (res.data.length > 0) {
                    setSelectedDepartment(res.data[0]._id);
                }
            })
            .catch((error) => {
                setLoading(false);
                console.error('OrderProcessing fetching failed:', error);
            });
    }, []);

    useEffect(() => {
        loadDepartment();
    }, []);

    const loadSubDepartment = useCallback(async (departmentId) => {
        setLoading(true);
        const url = API_BASE_URL + `fetch-department-child-data/${departmentId}`;
        try {
            const response = await axios.get(url, {
                headers: { "x-access-token": localStorage.getItem("token"), 'Accept': 'application/json', 'Content-Type': 'application/json' }
            });
            const subDepartmentData = response.data;
            setSubDepartment(subDepartmentData);
            if (subDepartmentData.length > 1) {
                setSelectedSubDepartmentId(subDepartmentData[1]._id); // Set the second subDepartment tab as active
                setPreviousSubDepartmentId(subDepartmentData[0]._id); // Set the first subDepartment tab as the previous tab
            } else if (subDepartmentData.length === 1) {
                setSelectedSubDepartmentId(subDepartmentData[0]._id); // Set the only available subDepartment tab as active
                setPreviousSubDepartmentId(''); // No previous tab available
            } else {
                setSelectedSubDepartmentId(''); // No valid subDepartment ID available
                setPreviousSubDepartmentId(''); // No previous tab available
            }
        } catch (error) {
            swal.fire({ text: error.response.data, icon: "error", type: "error" });
        } finally {
            setLoading(false);
        }
    }, [API_BASE_URL, localStorage.getItem("token")]);

    useEffect(() => {
        if (selectedDepartment) {
            loadSubDepartment(selectedDepartment);
        }
    }, [selectedDepartment, loadSubDepartment]);

    const handleDepartmentChange = (event, departmentId) => {
        setSelectedDepartment(departmentId);
        if (departmentId === department[0]._id) {
            loadBaseOrders(departmentId, selectedSubDepartmentId, previousSubDepartmentId, 'fetch-order-processing-info');
        } else {
            loadBaseOrders(departmentId, selectedSubDepartmentId, previousSubDepartmentId, 'fetch-custom-order-processing-info');
        }
        setOrders('');
        setSpecOrders([]);
        setSelectedSubDepartmentId('');
        setPreviousSubDepartmentId('');
        setSearchQuery('');
        if (departmentId && searchQuery) {
            handleOrderSearch(event, departmentId, selectedSubDepartmentId);
          }

       
    };

    const handleSubDepartmentChange = (event, subDepartmentId) => {
        const currentIndex = subDepartment.findIndex((item) => item._id === subDepartmentId);
  const precedingTabId = currentIndex > 0 ? subDepartment[currentIndex - 1]._id : null;
        setSelectedSubDepartmentId(subDepartmentId);
        if (selectedDepartment === department[0]._id) {
            loadBaseOrders(selectedDepartment, subDepartmentId, precedingTabId, 'fetch-order-processing-info');
        } else {
            loadBaseOrders(selectedDepartment, subDepartmentId, precedingTabId, 'fetch-custom-order-processing-info');
        }
        setOrders('');
        setSpecOrders([]);
        setSearchQuery('');
      
        if (selectedDepartment && subDepartmentId && precedingTabId && searchQuery) {
            handleOrderSearch(event, selectedDepartment, subDepartmentId, precedingTabId);
          }
    };

    const loadBaseOrders = useCallback(async (departmentId, subDepartmentId, precedingTabId, apiEndpoint) => {
        setLoading(true);
        const url = `${API_BASE_URL}${apiEndpoint}?department=${departmentId}&subDepartment=${precedingTabId}`;
        try {
            const response = await axios.get(url, {
                headers: {
                    "x-access-token": localStorage.getItem("token"),
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });
            setOrders(response.data);
        } catch (error) {
            swal.fire({ text: error.response.data, icon: "error", type: "error" });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (selectedDepartment && selectedSubDepartmentId) {
            const currentIndex = subDepartment.findIndex((item) => item._id === selectedSubDepartmentId);
            const precedingTabId = subDepartment[currentIndex - 1]?._id;
            if (selectedDepartment === department[0]._id) {
                loadBaseOrders(selectedDepartment, selectedSubDepartmentId, precedingTabId, 'fetch-order-processing-info');
            } else {
                loadBaseOrders(selectedDepartment, selectedSubDepartmentId, precedingTabId, 'fetch-custom-order-processing-info');
            }
        }
    }, [selectedDepartment, selectedSubDepartmentId, department, subDepartment, loadBaseOrders]);

    const handleOrderSearch = async (event, departmentId) => {
        event.preventDefault();
        console.log("selectedSubDepartmentId 3", selectedSubDepartmentId)
        const currentIndex = subDepartment.findIndex((item) => item._id === selectedSubDepartmentId);
        const precedingTabId = subDepartment[currentIndex - 1]?._id;
        console.log("precedingTabId 3", precedingTabId)
        const url = `${API_BASE_URL}fetch-specific-order-for-processing?department=${departmentId}&subDepartment=${precedingTabId}&keyword=${searchQuery}&orderCategory=Flashing`;
        setLoading(true);
        try {
            const response = await axios.get(url, {
                headers: {
                    "x-access-token": localStorage.getItem("token"),
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });
            setSpecOrders(response.data);
            setLoading(false);
        } catch (error) {
            setLoading(false);
            swal.fire({ text: error.response.data, icon: "error", type: "error" });
        } finally {
            setLoading(false);
        }
    };

    const handleSearchQueryChange = (event) => {
        setSearchQuery(event.target.value);
    };

    const [value, setValue] = useState(0);
    const TabPanel = ({ children, index }) => {
        return value === index && (
            <Typography component="div" role="tabpanel" hidden={value !== index}>
                {children}
            </Typography>
        );
    };

    const [delay, setDelay] = useState(100);
    const [result, setResult] = useState('No result');
  
    const handleScan = (data) => {
        console.log('scan', data)
      setResult(data);
    };
  
    const handleError = (err) => {
      console.error(err);
    };
  
    const previewStyle = {
      height: 240,
      width: 320,
    };
  
    return (
        <React.Fragment>
            <Row className="GeneralHeading withBackArrow">
                <Col md={6}>
                    <HeadingTwo>
                        <Link className="arrow-btn" onClick={() => navigate(-1)}><IoMdArrowBack /></Link>
                        Order Processing
                    </HeadingTwo>
                </Col>
                <Col md={6} className="text-end">
                <QrReader
        delay={delay}
        style={previewStyle}
        onError={handleError}
        onScan={handleScan}
      />
      <p>Result : {result ? result.text : ""}</p>
   
                </Col>
            </Row>
            <Row className="trackingTab mt-2">
                <Col md={12} className="p-1">
                    <Tabs value={selectedDepartment} className="SearchBar GeneralHeading mt-2" onChange={handleDepartmentChange} aria-label="department-tabs">
                        {department.length ? department.map((item, index) => (
                            <Tab key={item._id} label={item.department_name} value={item._id} />
                        )) : ""}
                    </Tabs>

                    <MyDiv className="TrackingContainer">
                        <Tabs value={selectedSubDepartmentId} className="SearchBar GeneralHeading mt-2 subDepartmentTabs" onChange={handleSubDepartmentChange} aria-label="sub-department-tabs">
                            {subDepartment.length ? subDepartment.map((subDeptItem) => (
                                <Tab
                                    key={subDeptItem._id}
                                    label={subDeptItem.department_child_name}
                                    value={subDeptItem._id}
                                />
                            )) : ""}
                        </Tabs>

                        <Row className='mt-2'>
                            <Col>
                                <MyDiv className="TrackingContainer  mt-3">
                                    {department?.map((item, index) => (
                                        <TabPanel key={index} index={index}>
                                            {loading ? (
                                                <HeadingFour className="text-center">Loading...</HeadingFour>) : <>
                                                <Col md={12}>
                                                    <React.Fragment >
                                                        <Row >
                                                            {specOrders?.length
                                                                ? specOrders.map((item) => (
                                                                    <Col md={8} className="mb-4" key={item._id}>
                                                                        <MyDiv className="ProfileBasicDetail order-profile">
                                                                            <Card className="ProfileBasicDetailLeftHeader" >
                                                                                <Row>
                                                                                    <Col md={6} className="text-start">
                                                                                        <MyDiv className="ProfileCard p-0">
                                                                                            <Row>
                                                                                                <Col md={12}> <HeadingFour className="mt-0">{item.order_unique_id}</HeadingFour></Col>
                                                                                            </Row>
                                                                                            <Row>
                                                                                                <Col md={5}><LabelTag>Customer Name</LabelTag></Col>
                                                                                                <Col md={7}><SpanTag>{item.account_Name}</SpanTag></Col>
                                                                                            </Row>
                                                                                            <Row>
                                                                                                <Col md={5}><LabelTag>Customer PO Number</LabelTag></Col>
                                                                                                <Col md={7}><SpanTag>{item.order_customer_PO_number}</SpanTag></Col>
                                                                                            </Row>
                                                                                            <Row>
                                                                                                <Col md={5}><LabelTag>Contact Name</LabelTag></Col>
                                                                                                <Col md={7}><SpanTag>{item.account_Contact_Name}</SpanTag></Col>
                                                                                            </Row>
                                                                                            <Row>
                                                                                                <Col md={5}><LabelTag>Contact Phone Number</LabelTag></Col>
                                                                                                <Col md={7}><SpanTag>{item.account_Contact_Phone}</SpanTag></Col>
                                                                                            </Row>
                                                                                        </MyDiv>
                                                                                    </Col>
                                                                                    <Col md={6} className="text-start">
                                                                                        <MyDiv className="ProfileCard">
                                                                                            <Row>
                                                                                                <Col md={5}><LabelTag>Order Status</LabelTag></Col>
                                                                                                <Col md={7}>
                                                                                                    <SpanTag>
                                                                                                        <Badge bg="info" text="light">
                                                                                                            {item.order_status}
                                                                                                        </Badge>
                                                                                                    </SpanTag>
                                                                                                </Col>
                                                                                            </Row>
                                                                                            <Row>
                                                                                                <Col md={5}><LabelTag>Delivery Date</LabelTag></Col>
                                                                                                <Col md={7}><SpanTag>{moment(item.order_delivery_date).format('DD-MM-YYYY')}</SpanTag></Col>
                                                                                            </Row>
                                                                                            <Row>
                                                                                                <Col md={5}><LabelTag>Delivery Mode</LabelTag></Col>
                                                                                                <Col md={7}><SpanTag>  {item.order_delivery_address_mode === "0" ? "Store" : "Site"}</SpanTag></Col>
                                                                                            </Row>
                                                                                            <Row>
                                                                                                <Col md={5}><LabelTag>Delivery Address</LabelTag></Col>
                                                                                                <Col md={7}><SpanTag> {item.order_delivery_address !== "Nil" ? item.order_delivery_address : item.account_StoreAddress}</SpanTag></Col>
                                                                                            </Row>
                                                                                        </MyDiv>
                                                                                    </Col>
                                                                                </Row>
                                                                            </Card>
                                                                        </MyDiv>
                                                                    </Col>
                                                                )) : null || <Col md={8} className="mb-4"> <MyDiv className="ProfileBasicDetail order-profile">
                                                                    <Card className="ProfileBasicDetailLeftHeader" ><HeadingFive className="text-center mt-0">Please Scan or Type with the Order Number</HeadingFive></Card>
                                                                </MyDiv>
                                                                </Col>}
                                                            <Col md={4} className='text-end'>
                                                                <MyDiv className="ProfileBasicDetail order-profile">
                                                                    <Card className="ProfileBasicDetailLeftHeader" >
                                                                        <MyDiv className="BarcodeScanArea text-center">
                                                                            <form onSubmit={(event) => handleOrderSearch(event, selectedDepartment)}>
                                                                                <input autoFocus type="text" placeholder="Scan or Type Order No" name="search" value={searchQuery} onChange={handleSearchQueryChange} />
                                                                                <button type="submit">Search</button>
                                                                            </form>
                                                                        </MyDiv>
                                                                    </Card>
                                                                </MyDiv>
                                                            </Col>
                                                        </Row>
                                                    </React.Fragment>
                                                </Col>
                                                <Col md={12} className='mt-3 GeneralTable'>
                                                    <TableContainer>
                                                        <Table className='bgGrey' aria-label="Order table">
                                                            <TableHead>
                                                                <TableRow>
                                                                    <TableCell align="left">Order ID</TableCell>
                                                                    <TableCell align="left">Customer Name / ID</TableCell>
                                                                    <TableCell align="left">Contact Name / Phone number</TableCell>
                                                                    <TableCell align="left">Contact PO number</TableCell>
                                                                    <TableCell align="left">Delivery Address</TableCell>
                                                                    <TableCell align="left">Delivery date</TableCell>
                                                                    <TableCell align="left">Status</TableCell>
                                                                    <TableCell align="left">Department</TableCell>
                                                                    <TableCell align="center">Action</TableCell>
                                                                </TableRow>
                                                            </TableHead>
                                                            <TableBody>
                                                                {orders?.length
                                                                    ? orders.map((item) => (
                                                                        <React.Fragment key={item._id}>
                                                                            <TableRow >
                                                                                <TableCell align="left">
                                                                                    <Link to={"/orders/" + `${item._id}`}>
                                                                                        <StrongTag>{item.order_unique_id}</StrongTag>
                                                                                    </Link>
                                                                                </TableCell>
                                                                                <TableCell align="left" component="th" scope="row" >
                                                                                    <Link to={`${item._id}`}> {item.account_Name}<br />
                                                                                        {item.account_UID}</Link>
                                                                                </TableCell>
                                                                                <TableCell align="left">
                                                                                    {item.account_Contact_Name}<br />
                                                                                    {item.account_Contact_Phone}
                                                                                </TableCell>
                                                                                <TableCell align="left">
                                                                                    {item.order_customer_PO_number}
                                                                                </TableCell>
                                                                                <TableCell align="left">
                                                                                    {item.order_delivery_address !== "Nil" ? item.order_delivery_address : item.account_StoreAddress}
                                                                                </TableCell>
                                                                                <TableCell align="left">
                                                                                    {moment(item.order_delivery_date).format('DD-MM-YYYY')}
                                                                                </TableCell>
                                                                                <TableCell align="left">
                                                                                    <MyDiv> <Badge bg='info' text="light">{item.order_status}</Badge> </MyDiv>
                                                                                </TableCell>
                                                                                <TableCell align="left">
                                                                                    {item.departments}
                                                                                </TableCell>
                                                                                <TableCell align="center">
                                                                                    <Box className="custom-flex">
                                                                                        <Link to={"/orders/" + `${item._id}`}>
                                                                                            <Tooltip title="View Profile">
                                                                                                <IconButton aria-label="fingerprint" color="secondary">
                                                                                                    <MdRemoveRedEye />
                                                                                                </IconButton>
                                                                                            </Tooltip>
                                                                                        </Link>
                                                                                    </Box>
                                                                                </TableCell>
                                                                            </TableRow>
                                                                        </React.Fragment>
                                                                    )) : <><TableRow><TableCell colSpan={8}><NoDataFound /></TableCell></TableRow></>}
                                                            </TableBody>
                                                        </Table>
                                                    </TableContainer>
                                                </Col>
                                            </>
                                            }
                                        </TabPanel>
                                    ))}
                                </MyDiv>
                            </Col>
                        </Row>
                    </MyDiv>
                </Col>
            </Row>
        </React.Fragment>
    );
}

export default OrderProcessingManage;
