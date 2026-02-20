import React, { useState, useEffect, useCallback } from "react";
import { Row, Col, Badge, Card } from "react-bootstrap";
import { HeadingFour, MyDiv, LabelTag, SpanTag, Avatar, getFormattedDeliveryTime } from "../Common/Components";
import { MdKeyboardArrowLeft } from "react-icons/md";
import { FaFileInvoiceDollar } from "react-icons/fa";
import { Button } from "@mui/material";
import { Link, useNavigate, useParams } from "react-router-dom";
import moment from "moment";
import axios from "axios";
import NoDataFound from "../Common/noDataFound";
import OrderItemManage from "../Orders/manageOrderItem";
import OrderInvoice from "../Orders/OrderInvoice";
import BarCodeView from "../Orders/barcode";
import swal from "sweetalert2";
import OrderDocuments from "../Orders/documents";
import OrderTracking from "../Orders/OrderTracking";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function OrderProductionDetail() {
  let { id } = useParams();
  const [loading, setLoading] = useState(false);
  const [InvoiceShow, setInvoiceShow] = useState(false);
  const [order, setOrder] = useState("");

  let navigate = useNavigate();

  const loadSpecificOrder = useCallback(async () => {
    setLoading(true);
    const url = API_BASE_URL + `fetch-specific-order-details/` + id;
    try {
      const response = await axios.get(url, { headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" } });
      setOrder(response.data);
      setLoading(false);
    } catch (error) {
      swal.fire({
        text: error.response.data,
        icon: "error",
        type: "error",
      });
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadSpecificOrder();
  }, [loadSpecificOrder]);

  const InvoiceOpen = () => {
    setInvoiceShow(true);
  };
  const OrderItemOpen = () => {
    setInvoiceShow(false);
  };
  const handleOrderDocumentsChange = () => {
    loadSpecificOrder(); // Trigger the function to reload the data
  };

  return (
    <React.Fragment>
      {loading ? (
        <HeadingFour className="text-center">Loading...</HeadingFour>
      ) : (
        <>
          {order?.length ? (
            order.map(item => (
              <React.Fragment key={item._id}>
                <Row>
                  {/* Order basic Details start */}
                  <Col md={12} className="mb-4">
                    <MyDiv className="ProfileBasicDetail order-profile">
                      <Card className="ProfileBasicDetailLeftHeader">
                        <Row>
                          <Link className="arrow-btn" onClick={() => navigate(-1)}>
                            <MdKeyboardArrowLeft />
                          </Link>
                          <Col md={2} className="text-center">
                            <MyDiv className="profileImageUploader">
                              {/* <MyDiv className="uploadIcon"> <MdOutlineCloudUpload /></MyDiv>
                                        <input type="file" onChange={handleChange} /> */}
                              <Avatar round="100px" size="120" name={item.account_Name} src="" />
                            </MyDiv>
                            <HeadingFour>{item.order_unique_id}</HeadingFour>
                            {item.order_barcode_checker === true ? <BarCodeView CoreOrderId={item._id} /> : ""}
                          </Col>
                          <Col md={4} className="text-start">
                            <MyDiv className="ProfileCard">
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
                            </MyDiv>
                          </Col>
                          <Col md={4} className="text-start">
                            <MyDiv className="ProfileCard">
                              <Row>
                                <Col md={5}>
                                  <LabelTag>Order Created Date</LabelTag>
                                </Col>
                                <Col md={7}>
                                  <SpanTag>{moment(item.created).format("DD-MM-YYYY")}</SpanTag>
                                </Col>
                              </Row>
                              <Row>
                                <Col md={5}>
                                  <LabelTag>Order Created Person</LabelTag>
                                </Col>
                                <Col md={7}>
                                  <SpanTag>{item.account_Contact_Name}</SpanTag>
                                </Col>
                              </Row>
                              <Row>
                                <Col md={5}>
                                  <LabelTag>Delivery Date</LabelTag>
                                </Col>
                                <Col md={7}>
                                  <SpanTag>
                                    {item.order_delivery_date_str} -{getFormattedDeliveryTime(item.order_delivery_time, item.order_delivery_session)}
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
                          <Col md={2} className="text-end d-flex flex-column align-items-end">
                            <OrderDocuments selectedImages={item.order_images} onOrderDocumentsChange={handleOrderDocumentsChange} />
                            <OrderTracking CoreOrderId={item._id} />
                            {InvoiceShow ? (
                              item.order_status === "Completed" ? (
                                <Button className="mt-3" variant="contained" startIcon={<FaFileInvoiceDollar />} onClick={OrderItemOpen}>
                                  View Order Items
                                </Button>
                              ) : (
                                ""
                              )
                            ) : item.order_status === "Completed" ? (
                              <Button className="mt-3" variant="contained" startIcon={<FaFileInvoiceDollar />} onClick={InvoiceOpen}>
                                View Invoice
                              </Button>
                            ) : (
                              ""
                            )}
                          </Col>
                        </Row>
                      </Card>
                    </MyDiv>
                  </Col>
                  {/* Order basic Details */}
                </Row>
                {InvoiceShow ? (
                  <Row className="justify-content-center">
                    <Col md={8}>
                      <OrderInvoice />
                    </Col>
                  </Row>
                ) : (
                  <Row>
                    <Col md={12}>
                      <OrderItemManage orderUpdates={{ loadSpecificOrder }} CoreOrderDetails={item} />
                    </Col>
                  </Row>
                )}
              </React.Fragment>
            ))
          ) : (
            <NoDataFound />
          )}
        </>
      )}
    </React.Fragment>
  );
}

export default OrderProductionDetail;
