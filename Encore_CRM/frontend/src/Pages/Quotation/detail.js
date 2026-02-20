import React, { useState, useEffect, useCallback } from "react";
import { Row, Col, Badge, Card, Spinner } from "react-bootstrap";
import { HeadingFour, MyDiv, LabelTag, SpanTag, HeadingThree, GetDayFromDate, CurrencyDisplay, StrongTag, getFormattedDeliveryTime } from "../Common/Components";
import { MdKeyboardArrowLeft } from "react-icons/md";
import { Drawer, Tooltip, IconButton } from "@mui/material";
import { Link, useNavigate, useParams } from "react-router-dom";
import FormQuotation from "./form";
import moment from "moment";
import axios from "axios";
import NoDataFound from "../Common/noDataFound";
import QuotationItemManage from "./manageQuoteItem";
import swal from "sweetalert2";
import { MdOutlineModeEditOutline } from "react-icons/md";
import { GrDocumentPdf } from "react-icons/gr";
import { FiLoader } from "react-icons/fi";
import QuoteAttachments from "./attachments";
import { SiConvertio } from "react-icons/si";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

const RolePermission = JSON.parse(localStorage.getItem("role"));

function QuotationDetail() {
  let { id } = useParams();
  const [loading, setLoading] = useState(false);
  const [orderConvertLoading, setOrderConvertLoading] = useState(false);
  const [quote, setQuotation] = useState("");
  const [printQuoteBtnLoading, setPrintQuoteBtnLoading] = useState(false);
  const [data, setData] = useState("");
  let navigate = useNavigate();

  const loadSpecificQuotation = useCallback(async () => {
    setLoading(true);
    const url = API_BASE_URL + `fetch-specific-quotation-details/` + id;
    axios.get(url, { headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" } }).then(
      res => {
        setQuotation(res.data);
      },
      error => {
        swal.fire({
          text: error.response.data,
          icon: "error",
          type: "error",
        });
      }
    );
    setLoading(false);
  }, [id]);

  useEffect(() => {
    loadSpecificQuotation();
  }, [loadSpecificQuotation]);

  const [quoteDrawerState, setQuotationDrawerState] = React.useState(false);
  const handleQuotationDrawerToggle = () => {
    setData();
    quoteDrawerState === false ? setQuotationDrawerState(true) : setQuotationDrawerState(false);
  };
  const quoteEditId = _id => {
    quoteDrawerState === false ? setQuotationDrawerState(true) : setQuotationDrawerState(false);
    setData(_id);
  };
  const updateDrawer = () => {
    quoteDrawerState === false ? setQuotationDrawerState(true) : setQuotationDrawerState(false);
    loadSpecificQuotation();
  };

  const quoteDocketId = useCallback(async item => {
    setPrintQuoteBtnLoading(true);
    let url = `${API_BASE_URL}generate-quotation-docket/${item}`;
    try {
      const response = await axios.post(
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
      if (response.status === 200) {
        const filePath = response.data;
        if (filePath) {
          const pdfUrl = `${API_BASE_URL}${filePath}`;
          window.open(pdfUrl, "_blank");
          swal.fire({ text: "Successfully Exported", icon: "success" });
        } else {
          swal.fire({ text: "No data to export", icon: "info" });
        }
        setPrintQuoteBtnLoading(false);
      }
    } catch (error) {
      swal.fire({ text: error.response?.data || "Error exporting", icon: "error" });
    } finally {
      setLoading(false);
      setPrintQuoteBtnLoading(false);
    }
  }, []);

  const ConvertToOrder = async item => {
    const confirmation = await swal.fire({
      title: "Are you sure?",
      text: "Do you want to convert this quote to a sale order?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Convert it!",
      cancelButtonText: "No, Cancel",
      customClass: {
        confirmButton: "primary-btn",
        cancelButton: "secondary-btn",
      },
      reverseButtons: true,
    });

    if (confirmation.isConfirmed) {
      // Proceed only if user confirms
      setOrderConvertLoading(true);
      try {
        const url = API_BASE_URL + `convert-quote-to-sale-order/${item}`;
        const method = "post";
        await axios({
          method,
          url,
          headers: {
            "x-access-token": localStorage.getItem("token"),
            Accept: "application/json",
            "Content-Type": "application/json",
          },
        });
        swal.fire({
          text: "Successfully Converted",
          icon: "success",
          timer: 1000,
        });
        setOrderConvertLoading(false);
        loadSpecificQuotation();
      } catch (error) {
        swal.fire({
          text: error.response.data.error || "An error occurred. Please try again.",
          icon: "error",
        });
        setOrderConvertLoading(false);
      }
    } else {
      swal.fire({
        text: "Conversion Cancelled",
        icon: "info",
        timer: 1000,
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
      {orderConvertLoading ? (
        <MyDiv className="BulkUploadLoader">
          <SpanTag>
            <IconButton aria-label="fingerprint" color="info" className="IconBtnLoader">
              <FiLoader />
            </IconButton>
            <br />
            Quotation Converting to Order... <br /> Please Wait. Don't Press Back or Refresh. <br /> This Process May Take Some Time to Complete
          </SpanTag>
        </MyDiv>
      ) : (
        ""
      )}
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
                          title={item.quote_flashing_checker === false ? "This Quote have only Custom Quote" : ""}
                        >
                          <Link className="arrow-btn" to="/quotation/master">
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
                          <Col md={2} className="text-start pe-0">
                            <MyDiv className={`${RolePermission?.PriceManagement?.view === "1" ? "" : "hide"} gstCard`}>
                              <MyDiv className="ProfileCard px-2 ">
                                <Row>
                                  <Col md={7}>
                                    <LabelTag>GST Exempt Total</LabelTag>
                                  </Col>
                                  <Col md={5} className="text-end">
                                    <SpanTag>
                                      <CurrencyDisplay value={item.quote_GST_EXP_Total ? item.quote_GST_EXP_Total : "0"} currency="AUD" locale="en-US" />
                                    </SpanTag>
                                  </Col>
                                </Row>
                                <Row>
                                  <Col md={7}>
                                    <LabelTag>Discount Total</LabelTag>
                                  </Col>
                                  <Col md={5} className="text-end">
                                    <SpanTag>
                                      <CurrencyDisplay value={item.quote_Discount_Total ? item.quote_Discount_Total : "0"} currency="AUD" locale="en-US" />
                                    </SpanTag>
                                  </Col>
                                </Row>
                                <Row className="border-top bg-light pb-1">
                                  <Col md={7}>
                                    <LabelTag>GST Taxable Total</LabelTag>
                                  </Col>
                                  <Col md={5} className="text-end">
                                    <SpanTag>
                                      <CurrencyDisplay value={item.quote_GST_Taxable_Total ? item.quote_GST_Taxable_Total : "0"} currency="AUD" locale="en-US" />
                                    </SpanTag>
                                  </Col>
                                </Row>
                                <Row className="border-top">
                                  <Col md={7}>
                                    <LabelTag>Tax Total</LabelTag>
                                  </Col>
                                  <Col md={5} className="text-end">
                                    <SpanTag>
                                      <CurrencyDisplay value={item.quote_Tax_Total ? item.quote_Tax_Total : "0"} currency="AUD" locale="en-US" />
                                    </SpanTag>
                                  </Col>
                                </Row>
                                <Row className="border-top bg-secondary text-white pb-1">
                                  <Col md={7}>
                                    <LabelTag className="text-white">Grand Total</LabelTag>
                                  </Col>
                                  <Col md={5} className="text-end">
                                    <StrongTag>
                                      <CurrencyDisplay value={item.quote_Overall_Price ? item.quote_Overall_Price : "0"} currency="AUD" locale="en-US" />
                                    </StrongTag>
                                  </Col>
                                </Row>
                              </MyDiv>
                            </MyDiv>
                          </Col>
                          <Col md={4} className="text-start">
                            <MyDiv className="ProfileCard">
                              <Row>
                                <Col md={5}>
                                  <LabelTag>Customer PO Number</LabelTag>
                                </Col>
                                <Col md={7}>
                                  <SpanTag>{item.quote_customer_PO_number}</SpanTag>
                                </Col>
                              </Row>
                              {item.quote_delivery_address_mode !== "0" ? (
                                <Row>
                                  <Col md={5}>
                                    <LabelTag>Attention in Ship to contact</LabelTag>
                                  </Col>
                                  <Col md={7}>
                                    <SpanTag>
                                      {item.quote_delivery_address_mode === "1" ? <MyDiv className="siteDelivery">{item.quote_site_delivery_attention_person}</MyDiv> : ""}
                                      {item.quote_delivery_address_mode === "2" ? <MyDiv className="pickupOrder">{item.quote_site_delivery_attention_person}</MyDiv> : ""}
                                    </SpanTag>
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
                                    {item.quote_delivery_address_mode === "2" ? <MyDiv className="pickupOrder"> {item.quote_site_delivery_attention_contact}</MyDiv> : ""}
                                  </SpanTag>
                                </Col>
                              </Row>
                              <Row>
                                <Col md={5}>
                                  <LabelTag>Quotation Status</LabelTag>
                                </Col>
                                <Col md={7}>
                                  <SpanTag>
                                    <MyDiv>{getStatusBadge(item.quote_status)}</MyDiv>
                                  </SpanTag>
                                </Col>
                              </Row>
                              {item.quote_inter_department_instruction && item.quote_inter_department_instruction !== "" ? (
                                <Row>
                                  <Col md={5}>
                                    <LabelTag>Internal Instruction</LabelTag>
                                  </Col>
                                  <Col md={7}>
                                    <SpanTag>{item.quote_inter_department_instruction}</SpanTag>
                                  </Col>
                                </Row>
                              ) : null}
                              {item.quote_designed_person_fullName ? (
                                <Row>
                                  <Col md={5}>
                                    <LabelTag>Designer Name</LabelTag>
                                  </Col>
                                  <Col md={7}>
                                    <SpanTag> {item.quote_designed_person_fullName}</SpanTag>
                                  </Col>
                                </Row>
                              ) : (
                                ""
                              )}
                              {item.quote_qced_person_fullName ? (
                                <Row>
                                  <Col md={5}>
                                    <LabelTag>Qc Name</LabelTag>
                                  </Col>
                                  <Col md={7}>
                                    <SpanTag> {item.quote_qced_person_fullName}</SpanTag>
                                  </Col>
                                </Row>
                              ) : (
                                ""
                              )}
                            </MyDiv>
                          </Col>
                          <Col md={4} className="text-start">
                            <MyDiv className="ProfileCard">
                              <Row>
                                <Col md={5}>
                                  <LabelTag>Quote Created Date</LabelTag>
                                </Col>
                                <Col md={7}>
                                  <SpanTag>{item.created_str ? item.created_str : moment(item.created).format("DD-MM-YYYY hh:mm a")}</SpanTag>
                                </Col>
                              </Row>
                              <Row>
                                <Col md={5}>
                                  <LabelTag>Quote Created Person</LabelTag>
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
                                  <SpanTag>
                                    {item.quote_delivery_date_str} - {getFormattedDeliveryTime(item.quote_delivery_time, item.quote_delivery_session)}
                                  </SpanTag>
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
                                    {item.quote_delivery_address_mode === "2" ? "PickUp Order" : ""}
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
                                        {item.quote_store_delivery_address1}, <br />
                                        {item.quote_store_delivery_city}, {item.quote_store_delivery_state}, &nbsp;{item.quote_store_delivery_country}-{item.quote_store_delivery_postalcode}
                                      </MyDiv>
                                    ) : (
                                      ""
                                    )}
                                    {item.quote_delivery_address_mode === "1" ? (
                                      <MyDiv className="siteDelivery">
                                        {item.quote_site_delivery_address1},<br />
                                        {item.quote_site_delivery_city}, {item.quote_site_delivery_state}, &nbsp;{item.quote_site_delivery_country}-{item.quote_site_delivery_postalcode}
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
                                  <LabelTag>Far Suburb</LabelTag>
                                </Col>
                                <Col md={7}>
                                  <SpanTag>
                                    {item.quote_far_suburb === true ? (
                                      <Badge className="HaveFarSuburbBadge" text="light">
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
                          <Col md={2} className=" d-flex flex-column align-items-end controlsIcon">
                            {item.quote_status !== "Quote Converted To SO" ? (
                              <Tooltip title="Edit" className="my-2">
                                <IconButton
                                  aria-label="fingerprint"
                                  color="success"
                                  sx={{ color: "#fff", width: "40px", height: "40px", backgroundColor: "#229b2c ", "&:hover": { backgroundColor: "#135c19" } }}
                                  onClick={e => quoteEditId(item._id)}
                                >
                                  <MdOutlineModeEditOutline />
                                </IconButton>
                              </Tooltip>
                            ) : null}

                            <Tooltip title="Download Quotation" className="my-2">
                              <IconButton
                                aria-label="fingerprint"
                                sx={{ color: "#fff", width: "40px", height: "40px", backgroundColor: "#7f76cf ", "&:hover": { backgroundColor: "#185c19" } }}
                                onClick={e => quoteDocketId(item._id)}
                                disabled={printQuoteBtnLoading}
                              >
                                {printQuoteBtnLoading ? <Spinner animation="border" size="sm" /> : <GrDocumentPdf />}
                              </IconButton>
                            </Tooltip>
                            {item.quote_payment_images && item.quote_payment_images.length > 0 && item.quote_status !== "Quote Converted To SO" && item.quote_status === "Quote Ready" ? (
                              <Tooltip title="Covert to Order" className="my-2">
                                <IconButton
                                  aria-label="fingerprint"
                                  sx={{ color: "#fff", width: "40px", height: "40px", backgroundColor: "#bf3030 ", "&:hover": { backgroundColor: "#7c0d0d" } }}
                                  onClick={e => ConvertToOrder(item._id)}
                                >
                                  <SiConvertio />
                                </IconButton>
                              </Tooltip>
                            ) : (
                              ""
                            )}

                            <MyDiv className="mt-2">
                              <QuoteAttachments CoreQuotationDetails={item} attachmentUpdates={loadSpecificQuotation} />
                            </MyDiv>
                          </Col>
                        </Row>
                      </Card>
                    </MyDiv>
                  </Col>
                </Row>
                <Row>
                  <Col md={12}>
                    <QuotationItemManage quoteUpdates={loadSpecificQuotation} CoreQuotationDetails={item} />
                  </Col>
                </Row>
              </React.Fragment>
            ))
          ) : (
            <NoDataFound />
          )}
        </>
      )}
      <Drawer anchor="right" open={quoteDrawerState} onClose={handleQuotationDrawerToggle}>
        <FormQuotation handleClose={updateDrawer} quoteInfo={data} />
      </Drawer>
    </React.Fragment>
  );
}
export default QuotationDetail;
