import React, { useState, useEffect, useCallback } from "react";
import { Row, Col, Badge, Card } from "react-bootstrap";
import { HeadingFour, MyDiv, LabelTag, SpanTag, HeadingThree, GetDayFromDate, getFormattedDeliveryTime } from "../Common/Components";
import { MdKeyboardArrowLeft } from "react-icons/md";
import { MdAssignmentInd } from "react-icons/md";
import { Button } from "@mui/material";
import { Link, useNavigate, useParams } from "react-router-dom";
import DesignToolOrders from "./designToolOrders";
import moment from "moment";
import axios from "axios";
import NoDataFound from "../Common/noDataFound";
import swal from "sweetalert2";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function OrderDesignerDetail() {
  let { id } = useParams();
  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState("");
  const [notification, setNotification] = useState(false);
  let navigate = useNavigate();

  const loadSpecificOrder = useCallback(async () => {
    setLoading(true);
    const url = API_BASE_URL + `fetch-specific-order-details/` + id;
    try {
      const res = await axios.get(url, {
        headers: {
          "x-access-token": localStorage.getItem("token"),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });
      setOrder(res.data);
    } catch (error) {
      swal.fire({
        text: error.response?.data || "Failed to load order",
        icon: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadSpecificOrder();
  }, [notification, loadSpecificOrder]);

  const handleOrderSelfAssign = async () => {
    const userId = localStorage.getItem("userId");
    try {
      const url = `${API_BASE_URL}assign-order-to-designer/${id}/${userId}`;
      await axios.patch(
        url,
        {},
        {
          headers: {
            "x-access-token": localStorage.getItem("token"),
            Accept: "application/json",
            "Content-Type": "application/json",
          },
        }
      );
      swal.fire({
        text: "This Order Successfully Assigned to You",
        icon: "success",
        type: "success",
      });
      loadSpecificOrder();
      setNotification(prev => !prev);
    } catch (error) {
      swal.fire({
        text: error.response.data,
        icon: "error",
        type: "error",
      });
    }
  };

  const getStatusBadge = status => {
    let color, backgroundColor;

    switch (status) {
      case "Order Created":
        color = "primary";
        backgroundColor = "#00AFD7";
        break;
      case "Order In Progress":
        color = "info";
        backgroundColor = "#e567ba";
        break;
      case "Production In Progress":
        color = "default";
        backgroundColor = "#3aad76";
        break;
      case "Order Cancelled":
        color = "default";
        backgroundColor = "#f00000";
        break;
      case "Order Hold":
        color = "default";
        backgroundColor = "#f0ad4e";
        break;
      default:
        color = "secondary";
        backgroundColor = "#00AFD7";
        break;
    }
    return (
      <Badge bg="" color={color} style={{ backgroundColor }} text="light">
        {status}
      </Badge>
    );
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
                  <Col md={12} className="mb-2">
                    <MyDiv className="ProfileBasicDetail order-profile designerDashboardBg">
                      <Card className="ProfileBasicDetailLeftHeader pt-0">
                        <Row
                          className={`${!item.order_flashing_checker ? "withoutFlashing" : ""} DetailHeader`}
                          title={item.order_flashing_checker === false ? "This Order have only Custom Order" : ""}
                        >
                          <Link className="arrow-btn" to="/designers">
                            <MdKeyboardArrowLeft />
                          </Link>
                          <Col md="6">
                            <HeadingThree>
                              {item.account_Name} - {item.d_order_unique_id}
                            </HeadingThree>
                          </Col>
                          <Col md="6" className="text-end">
                            <HeadingThree title="Delivery Day">
                              <GetDayFromDate deliveryDate={item.order_delivery_date_str} />
                            </HeadingThree>
                          </Col>
                        </Row>
                        <Row>
                          <Col md={5} className="text-start">
                            <MyDiv className="ProfileCard">
                              <Row>
                                <Col md={5}>
                                  <LabelTag>Customer Po number</LabelTag>
                                </Col>
                                <Col md={7}>
                                  <SpanTag>{item.d_order_customer_PO_number}</SpanTag>
                                </Col>
                              </Row>
                              {item.order_delivery_address_mode === "1" ? (
                                <Row>
                                  <Col md={5}>
                                    <LabelTag>Attention in Ship to contact</LabelTag>
                                  </Col>
                                  <Col md={7}>
                                    <SpanTag>{item.order_delivery_address_mode === "1" ? <MyDiv className="siteDelivery">{item.order_site_delivery_attention_person}</MyDiv> : ""}</SpanTag>
                                  </Col>
                                </Row>
                              ) : (
                                ""
                              )}
                              <Row>
                                <Col md={5}>
                                  <LabelTag>Phone number</LabelTag>
                                </Col>
                                <Col md={7}>
                                  <SpanTag>
                                    {item.order_delivery_address_mode === "0" ? <MyDiv className="storeDelivery"> {item.order_customer_contact_phone} </MyDiv> : ""}
                                    {item.order_delivery_address_mode === "1" ? <MyDiv className="siteDelivery"> {item.order_site_delivery_attention_contact}</MyDiv> : ""}
                                    {item.order_delivery_address_mode === "2" ? <MyDiv className="pickupOrder"> PickUp Order</MyDiv> : ""}
                                  </SpanTag>
                                </Col>
                              </Row>
                              <Row>
                                <Col md={5}>
                                  <LabelTag>Overall Order Status</LabelTag>
                                </Col>
                                <Col md={7}>
                                  <MyDiv>{item.order_hold ? getStatusBadge("Order Hold") : getStatusBadge(item.order_status)}</MyDiv>
                                </Col>
                              </Row>
                              <Row>
                                <Col md={5}>
                                  <LabelTag>Designer Name</LabelTag>
                                </Col>
                                <Col md={7}>
                                  <SpanTag> {item.order_designed_person_fullName ? item.order_designed_person_fullName : ""}</SpanTag>
                                </Col>
                              </Row>
                              <Row>
                                <Col md={5}>
                                  <LabelTag>Qc Name</LabelTag>
                                </Col>
                                <Col md={7}>
                                  <SpanTag> {item.order_qced_person_fullName ? item.order_qced_person_fullName : ""}</SpanTag>
                                </Col>
                              </Row>
                            </MyDiv>
                          </Col>
                          <Col md={5} className="text-start">
                            <MyDiv className="ProfileCard">
                              <Row>
                                <Col md={5}>
                                  <LabelTag>Order Created Date</LabelTag>
                                </Col>
                                <Col md={7}>
                                  <SpanTag>{item.created_str ? item.created_str : moment(item.created).format("DD-MM-YYYY hh:mm a")}</SpanTag>
                                </Col>
                              </Row>
                              <Row>
                                <Col md={5}>
                                  <LabelTag>Order Created Person</LabelTag>
                                </Col>
                                <Col md={7}>
                                  <SpanTag>{item.order_created_person_fullName}</SpanTag>
                                </Col>
                              </Row>
                              <Row>
                                <Col md={5}>
                                  <LabelTag>Promised date</LabelTag>
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
                                  <SpanTag>
                                    {item.order_delivery_address_mode === "0" ? "Store" : ""}
                                    {item.order_delivery_address_mode === "1" ? "Site" : ""}
                                    {item.order_delivery_address_mode === "2" ? "Pickup" : ""}
                                  </SpanTag>
                                </Col>
                              </Row>
                              <Row>
                                <Col md={5}>
                                  <LabelTag>Delivery Address</LabelTag>
                                </Col>
                                <Col md={7}>
                                  <SpanTag>
                                    {item.order_delivery_address_mode === "0" ? (
                                      <MyDiv className="storeDelivery">
                                        {item.order_store_delivery_address1},<br /> {item.order_store_delivery_city}, {item.order_store_delivery_state}, &nbsp;{item.order_store_delivery_country}-
                                        {item.order_store_delivery_postalcode}
                                      </MyDiv>
                                    ) : (
                                      ""
                                    )}
                                    {item.order_delivery_address_mode === "1" ? (
                                      <MyDiv className="siteDelivery">
                                        {item.order_site_delivery_address1},<br /> {item.order_site_delivery_city}, {item.order_site_delivery_state}, &nbsp;{item.order_site_delivery_country}-
                                        {item.order_site_delivery_postalcode}
                                      </MyDiv>
                                    ) : (
                                      ""
                                    )}
                                    {item.order_delivery_address_mode === "2" ? <MyDiv className="pickupOrder"> PickUp Order</MyDiv> : ""}
                                  </SpanTag>
                                </Col>
                              </Row>
                              <Row>
                                <Col md={5}>
                                  <LabelTag>Crane Lift</LabelTag>
                                </Col>
                                <Col md={7}>
                                  <SpanTag>
                                    {item.order_crane_lift_checker === true ? (
                                      <Badge className="HaveCraneLiftBadge" text="light">
                                        Yes
                                      </Badge>
                                    ) : (
                                      <Badge bg="info" text="light">
                                        No
                                      </Badge>
                                    )}
                                  </SpanTag>
                                </Col>
                              </Row>
                            </MyDiv>
                          </Col>
                          <Col md={2} className=" d-flex flex-column align-items-end">
                            {!item.order_designed_person_fullName && item.order_status !== "Order Cancelled" && !item.order_hold ? (
                              <Button onClick={e => handleOrderSelfAssign()} className="btn primary-btn mt-2 mb-2" startIcon={<MdAssignmentInd />}>
                                Assign to Me
                              </Button>
                            ) : (
                              ""
                            )}
                            {/* Order cancel card */}
                            {item.order_hold ? (
                            <MyDiv className="ProfileCard HoldCard">
                              <Row>
                                <Col md={12}>
                                  <LabelTag style={{fontWeight: "bold", fontSize:"25px"}}>Order On Hold</LabelTag>
                                </Col>
                                <Col md={12}>
                                  <SpanTag>By {item.order_hold_person_fullName}</SpanTag>
                                </Col>
                              </Row>
                            </MyDiv>
                            ) : ( null )}
                          </Col>
                        </Row>
                      </Card>
                    </MyDiv>
                  </Col>
                  {/* Order basic Details */}
                </Row>
                <Row>
                  <Col md={12}>
                    <DesignToolOrders CoreOrderDetails={item} orderUpdates={loadSpecificOrder} />
                  </Col>
                </Row>
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
export default OrderDesignerDetail;
