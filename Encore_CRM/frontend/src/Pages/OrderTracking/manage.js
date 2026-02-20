import React, { useState, useEffect, useCallback } from "react";
import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";
import Badge from "react-bootstrap/Badge";
import { HeadingTwo, HeadingFour, MyDiv, HeadingFive, LabelTag, SpanTag, getFormattedDeliveryTime } from "../Common/Components";
import { Link, useNavigate } from "react-router-dom";
import { IoMdArrowBack } from "react-icons/io";
import axios from "axios";
import swal from "sweetalert2";
import { TableBody, Table, TableContainer, TableHead, TableRow, TableCell, Card } from "@mui/material";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function OrderTrackingManage() {
  const [department, setDepartment] = useState([]);
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState("");
  const [specOrders, setSpecOrder] = useState("");
  const [value, setValue] = useState(0);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [prevDepartmentId, setPrevDepartmentId] = useState(null);

  let navigate = useNavigate();

  const loadDepartment = useCallback(() => {
    setLoading(true);
    const url = API_BASE_URL + `fetch-department-data`;
    axios
      .get(url, {
        headers: {
          "x-access-token": localStorage.getItem("token"),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      })
      .then(res => {
        setDepartment(res.data);
        setLoading(false);
      })
      .catch(error => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    loadDepartment();
  }, [loadDepartment]);

  //Load Order
  const loadOrders = useCallback(async departmentId => {
    setLoading(true);
    const url = `${API_BASE_URL}fetch-order-details?department=${departmentId}&keyword=ord`;
    try {
      const response = await axios.get(url, {
        headers: {
          "x-access-token": localStorage.getItem("token"),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });
      setOrders(response.data);
      setDataLoaded(true);
    } catch (error) {
      swal.fire({
        text: error.response.data,
        icon: "error",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const handleOrderSearch = async e => {
    e.preventDefault();
    const url = API_BASE_URL + `fetch-specific-order-for-processing?orderid=${searchQuery}`;
    axios
      .get(url, {
        headers: {
          "x-access-token": localStorage.getItem("token"),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      })
      .then(
        res => {
          setSpecOrder(res.data);
        },
        error => {
          swal.fire({
            text: error.response.data,
            icon: "error",
            type: "error",
          });
        }
      );
  };

  useEffect(() => {
    if (department.length > 0) {
      const firstDepartmentId = department[0]?._id;
      setPrevDepartmentId(firstDepartmentId);
      loadOrders(firstDepartmentId);
      navigate(`?department=${firstDepartmentId}`);
    }
  }, [department, loadOrders, navigate]);

  const [searchQuery, setSearchQuery] = useState("");
  const handleSearchChange = e => {
    setSearchQuery(e.target.value);
  };

  return (
    <React.Fragment>
      <Row className="GeneralHeading withBackArrow">
        <Col md={6}>
          <HeadingTwo>
            <Link className="arrow-btn" onClick={() => navigate(-1)}>
              <IoMdArrowBack />
            </Link>
            Manage Order Tracking
          </HeadingTwo>
        </Col>
        <Col md={4} className="text-end">
          <form onSubmit={handleOrderSearch}>
            <input type="text" placeholder="Search..." value={searchQuery} onChange={handleSearchChange} />
            <button type="submit">Search</button>
          </form>
        </Col>
      </Row>
      <Row className="mt-2 ">
        {specOrders?.length
          ? specOrders.map(item => (
              <Col md={12} className="mb-4" key={item._id}>
                <MyDiv className="ProfileBasicDetail order-profile">
                  <Card className="ProfileBasicDetailLeftHeader">
                    <Row>
                      <Col md={6} className="text-start">
                        <MyDiv className="ProfileCard p-0">
                          <Row>
                            <Col md={12}>
                              <HeadingFour className="mt-0">{item.order_unique_id}</HeadingFour>
                            </Col>
                          </Row>
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
                              <LabelTag>Customer PO Number</LabelTag>
                            </Col>
                            <Col md={7}>
                              <SpanTag>{item.order_customer_PO_number}</SpanTag>
                            </Col>
                          </Row>
                          <Row>
                            <Col md={5}>
                              <LabelTag>Contact Name</LabelTag>
                            </Col>
                            <Col md={7}>
                              <SpanTag>{item.account_Contact_Name}</SpanTag>
                            </Col>
                          </Row>
                          <Row>
                            <Col md={5}>
                              <LabelTag>Contact Phone Number</LabelTag>
                            </Col>
                            <Col md={7}>
                              <SpanTag>{item.account_Contact_Phone}</SpanTag>
                            </Col>
                          </Row>
                        </MyDiv>
                      </Col>
                      <Col md={6} className="text-start">
                        <MyDiv className="ProfileCard">
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
                          <Row>
                            <Col md={5}>
                              <LabelTag>Delivery Date</LabelTag>
                            </Col>
                            <Col md={7}>
                              <SpanTag>
                                {item.order_delivery_date_str} - {getFormattedDeliveryTime(item.order_delivery_time, item.order_delivery_session)}
                              </SpanTag>
                            </Col>
                          </Row>
                          <Row>
                            <Col md={5}>
                              <LabelTag>Delivery Mode</LabelTag>
                            </Col>
                            <Col md={7}>
                              <SpanTag> {item.order_delivery_address_mode === "0" ? "Store" : "Site"}</SpanTag>
                            </Col>
                          </Row>
                          <Row>
                            <Col md={5}>
                              <LabelTag>Delivery Address</LabelTag>
                            </Col>
                            <Col md={7}>
                              <SpanTag> {item.order_delivery_address !== "Nil" ? item.order_delivery_address : item.account_StoreAddress}</SpanTag>
                            </Col>
                          </Row>
                        </MyDiv>
                      </Col>
                    </Row>
                  </Card>
                </MyDiv>
              </Col>
            ))
          : null || (
              <Col md={12} className="mb-1 p-0">
                <MyDiv className="ProfileBasicDetail order-profile">
                  <Card className="ProfileBasicDetailLeftHeader">
                    <HeadingFive className="text-center mt-0">Please Scan or Search with Order Number</HeadingFive>
                  </Card>
                </MyDiv>
              </Col>
            )}
      </Row>

      <Row className="row GeneralTable">
        <Col md={12}>
          <TableContainer>
            <Table className="bgGrey" aria-label="Order table">
              <TableHead>
                <TableRow>
                  <TableCell align="left">Department</TableCell>
                  <TableCell align="left">Emp ID</TableCell>
                  <TableCell align="left">Emp Name</TableCell>
                  <TableCell align="left">Time</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow>
                  <TableCell align="left">Core Order</TableCell>
                  <TableCell align="left">EMP000342</TableCell>
                  <TableCell align="left">MJ</TableCell>
                  <TableCell align="left">26-Jun-23 - 10:30 AM</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell align="left">Rolled</TableCell>
                  <TableCell align="left">EMP000342</TableCell>
                  <TableCell align="left">MJ</TableCell>
                  <TableCell align="left">26-Jun-23 - 10:30 AM</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell align="left">Folded</TableCell>
                  <TableCell align="left">EMP000342</TableCell>
                  <TableCell align="left">MJ</TableCell>
                  <TableCell align="left">26-Jun-23 - 10:30 AM</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell align="left">Racked</TableCell>
                  <TableCell align="left">EMP000342</TableCell>
                  <TableCell align="left">MJ</TableCell>
                  <TableCell align="left">26-Jun-23 - 10:30 AM</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell align="left">Transport</TableCell>
                  <TableCell align="left">EMP000342</TableCell>
                  <TableCell align="left">MJ</TableCell>
                  <TableCell align="left">26-Jun-23 - 10:30 AM</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell align="left">Delivered</TableCell>
                  <TableCell align="left">EMP000342</TableCell>
                  <TableCell align="left">MJ</TableCell>
                  <TableCell align="left">26-Jun-23 - 10:30 AM</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </Col>
      </Row>
    </React.Fragment>
  );
}

export default OrderTrackingManage;
