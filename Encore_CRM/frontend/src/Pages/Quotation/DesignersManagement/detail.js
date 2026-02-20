import React, { useState, useEffect, useCallback } from "react";
import { Row, Col, Badge, Card } from "react-bootstrap";
import { HeadingFour, MyDiv, LabelTag, SpanTag, HeadingThree, GetDayFromDate } from "../../Common/Components";
import { MdKeyboardArrowLeft, MdAssignmentInd } from "react-icons/md";
import { Button } from "@mui/material";
import { Link, useNavigate, useParams } from "react-router-dom";
import DesignToolQuotes from "./designToolQuotes";
import moment from "moment";
import axios from "axios";
import NoDataFound from "../../Common/noDataFound";
import swal from "sweetalert2";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function QuoteDesignerDetail() {
  let { id } = useParams();
  const [loading, setLoading] = useState(false);
  const [quote, setQuote] = useState("");
  let navigate = useNavigate();

  const loadSpecificQuote = useCallback(async () => {
    setLoading(true);
    const url = API_BASE_URL + `fetch-specific-quotation-details/` + id;

    try {
      const res = await axios.get(url, {
        headers: {
          "x-access-token": localStorage.getItem("token"),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });
      setQuote(res.data);
    } catch (error) {
      swal.fire({
        text: error.response?.data || "Failed to fetch quotation details",
        icon: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadSpecificQuote();
  }, [loadSpecificQuote]);

  const handleQuoteSelfAssign = async () => {
    const userId = localStorage.getItem("userId");
    try {
      const url = `${API_BASE_URL}assign-quotation-to-designer/${id}/${userId}`;
      const response = await axios.patch(
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
        text: response.data || "This Quote Successfully Assigned to You",
        icon: "success",
        type: "success",
      });
      loadSpecificQuote();
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
      case "Quotation Created":
        color = "primary";
        backgroundColor = "#00AFD7";
        break;
      case "Quotation In Progress":
        color = "info";
        backgroundColor = "#e567ba";
        break;
      case "Production In Progress":
        color = "default";
        backgroundColor = "#3aad76";
        break;
      case "Quotation Cancelled":
        color = "default";
        backgroundColor = "#f00000";
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
          {quote?.length ? (
            quote.map(item => (
              <React.Fragment key={item._id}>
                <Row>
                  <Col md={12} className="mb-4">
                    <MyDiv className="ProfileBasicDetail order-profile designerDashboardBg">
                      <Card className="ProfileBasicDetailLeftHeader pt-0">
                        <Row
                          className={`${!item.quote_flashing_checker ? "withoutFlashing" : ""} DetailHeader`}
                          title={item.quote_flashing_checker === false ? "This Quotation have only Custom Order" : ""}
                        >
                          <Link className="arrow-btn" to="/quotation/designers">
                            <MdKeyboardArrowLeft />
                          </Link>
                          <Col md="6">
                            <HeadingThree>
                              {item.account_Name} - {item.quote_unique_id}
                            </HeadingThree>
                          </Col>
                          <Col md="6" className="text-end">
                            <HeadingThree title="Delivery Day">
                              <GetDayFromDate deliveryDate={item.quote_delivery_date_str} />
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
                                  <SpanTag>{item.quote_customer_PO_number}</SpanTag>
                                </Col>
                              </Row>
                              {item.quote_delivery_address_mode === "1" ? (
                                <Row>
                                  <Col md={5}>
                                    <LabelTag>Attention in Ship to contact</LabelTag>
                                  </Col>
                                  <Col md={7}>
                                    <SpanTag>{item.quote_delivery_address_mode === "1" ? <MyDiv className="siteDelivery">{item.quote_site_delivery_attention_person}</MyDiv> : ""}</SpanTag>
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
                                    {item.quote_delivery_address_mode === "0" ? <MyDiv className="storeDelivery"> {item.quote_customer_contact_phone} </MyDiv> : ""}
                                    {item.quote_delivery_address_mode === "1" ? <MyDiv className="siteDelivery"> {item.quote_site_delivery_attention_contact}</MyDiv> : ""}
                                    {item.quote_delivery_address_mode === "2" ? <MyDiv className="pickupOrder"> PickUp Order</MyDiv> : ""}
                                  </SpanTag>
                                </Col>
                              </Row>
                              <Row>
                                <Col md={5}>
                                  <LabelTag>Overall Order Status</LabelTag>
                                </Col>
                                <Col md={7}>
                                  <MyDiv>{getStatusBadge(item.quote_status)}</MyDiv>
                                </Col>
                              </Row>
                              <Row>
                                <Col md={5}>
                                  <LabelTag>Designer Name</LabelTag>
                                </Col>
                                <Col md={7}>
                                  <SpanTag> {item.quote_designed_person_fullName ? item.quote_designed_person_fullName : ""}</SpanTag>
                                </Col>
                              </Row>
                              <Row>
                                <Col md={5}>
                                  <LabelTag>Qc Name</LabelTag>
                                </Col>
                                <Col md={7}>
                                  <SpanTag> {item.quote_qced_person_fullName ? item.quote_qced_person_fullName : ""}</SpanTag>
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
                                  <SpanTag>{item.quote_created_person_fullName}</SpanTag>
                                </Col>
                              </Row>
                              <Row>
                                <Col md={5}>
                                  <LabelTag>Promised date</LabelTag>
                                </Col>
                                <Col md={7}>
                                  <SpanTag>{item.quote_delivery_date_str ? item.quote_delivery_date_str : moment(item.quote_delivery_date).format("DD-MM-YYYY hh:mm a")}</SpanTag>
                                </Col>
                              </Row>
                              <Row>
                                <Col md={5}>
                                  <LabelTag>Delivery Mode</LabelTag>
                                </Col>
                                <Col md={7}>
                                  <SpanTag>
                                    {item.quote_delivery_address_mode === "0" ? "Store" : ""}
                                    {item.quote_delivery_address_mode === "1" ? "Site" : ""}
                                    {item.quote_delivery_address_mode === "2" ? "Pickup" : ""}
                                  </SpanTag>
                                </Col>
                              </Row>
                              <Row>
                                <Col md={5}>
                                  <LabelTag>Delivery Address</LabelTag>
                                </Col>
                                <Col md={7}>
                                  <SpanTag>
                                    {item.quote_delivery_address_mode === "0" ? (
                                      <MyDiv className="storeDelivery">
                                        {item.quote_store_delivery_address1},<br /> {item.quote_store_delivery_city}, {item.quote_store_delivery_state}, &nbsp;{item.quote_store_delivery_country}-
                                        {item.quote_store_delivery_postalcode}
                                      </MyDiv>
                                    ) : (
                                      ""
                                    )}
                                    {item.quote_delivery_address_mode === "1" ? (
                                      <MyDiv className="siteDelivery">
                                        {item.quote_site_delivery_address1},<br /> {item.quote_site_delivery_city}, {item.quote_site_delivery_state}, &nbsp;{item.quote_site_delivery_country}-
                                        {item.quote_site_delivery_postalcode}
                                      </MyDiv>
                                    ) : (
                                      ""
                                    )}
                                    {item.quote_delivery_address_mode === "2" ? <MyDiv className="pickupOrder"> PickUp Order</MyDiv> : ""}
                                  </SpanTag>
                                </Col>
                              </Row>
                              <Row>
                                <Col md={5}>
                                  <LabelTag>Crane Lift</LabelTag>
                                </Col>
                                <Col md={7}>
                                  <SpanTag>
                                    {item.quote_crane_lift_checker === true ? (
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
                            {!item.quote_designed_person_fullName ? (
                              <Button onClick={e => handleQuoteSelfAssign()} className="btn primary-btn mt-2 mb-2" startIcon={<MdAssignmentInd />}>
                                Assign to Me
                              </Button>
                            ) : (
                              ""
                            )}
                          </Col>
                        </Row>
                      </Card>
                    </MyDiv>
                  </Col>
                </Row>
                <Row>
                  <Col md={12}>
                    <DesignToolQuotes CoreOrderDetails={item} orderUpdates={loadSpecificQuote} />
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

export default QuoteDesignerDetail;
