import { Button, Drawer, FormControlLabel, IconButton, Switch, Tooltip, Grid, Chip, Typography } from "@mui/material";
import { pink } from "@mui/material/colors";
import axios from "axios";
import moment from "moment";
import React, { useCallback, useEffect, useState } from "react";
import { Badge, Card, Col, Row, Spinner } from "react-bootstrap";
import { FaPause, FaPlay, FaUser } from "react-icons/fa";
import { FiLoader } from "react-icons/fi";
import { MdKeyboardArrowLeft, MdOutlineModeEditOutline, MdCheck, MdEmail, MdLocalPrintshop, MdCancel, MdInfo } from "react-icons/md";
import { SiMyob } from "react-icons/si";
import { Link, useNavigate, useParams, useLocation } from "react-router-dom";
import { SlArrowDown, SlArrowUp } from "react-icons/sl";
import swal from "sweetalert2";
import { CiSquareMore } from "react-icons/ci";
import { Dialog, DialogTitle, DialogContent, DialogActions } from "@mui/material";
import {
  CurrencyDisplay,
  GetDayFromDate,
  HeadingFour,
  HeadingSix,
  HeadingThree,
  LabelTag,
  MyDiv,
  SpanTag,
  StrongTag,
  getFormattedDeliveryTime,
  getProductionStatusBadge,
  hasAnyProductionInProgress,
} from "../Common/Components";
import NoDataFound from "../Common/noDataFound";
import FormOrder from "./form";
import OrderItemManage from "./manageOrderItem";
import OrderInvoice from "./OrderInvoice";
import OrderTracking from "./OrderTracking";
import { RxReset } from "react-icons/rx";
import { computeOrderFields } from "../Common/methods";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

const RolePermission = JSON.parse(localStorage.getItem("role"));
const USER_ID = localStorage.getItem("userId");

function OrderDetail() {
  let { id } = useParams();
  const [loading, setLoading] = useState(false);
  const [InvoiceShow, setInvoiceShow] = useState(false);
  const [order, setOrder] = useState("");
  const [myobBtnLoadingMap, setMyobBtnLoadingMap] = useState(false);
  const [orderCancelLoading, setOrderCancelLoading] = useState(false);
  const [printOrderBtnLoading, setPrintOrderBtnLoading] = useState(false);
  const [data, setData] = useState("");
  // Added by Bhaskar c start
  const [orderItemQCStatus, setOrderItemQCStatus] = useState(0);
  const [wOrderItemQCStatus, setWOrderItemQCStatus] = useState(0);
  // Added by Bhaskar c end

  const [collapsed, setCollapsed] = useState(false);

  const [openDialog, setOpenDialog] = useState(false);

  const [printDeliveryDocket, setPrintDeliveryDocket] = useState(false)
  const [emailSalesOrderCopy, setEmailSalesOrderCopy] = useState(false)
  const [emailDeliveryDocketCopy, setEmailDeliveryDocketCopy] = useState(false)


  let navigate = useNavigate();
  const location = useLocation();

  const loadSpecificOrder = useCallback(async () => {
    setLoading(true);
    const url = API_BASE_URL + `fetch-specific-order-details/` + id;
    axios
      .get(url, {
        headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" },
      })
      .then(
        res => {
          setOrder(res.data);
          setOrderItemQCStatus(res.data[0].order_item_qc_status || 0);
          setWOrderItemQCStatus(res.data[0].w_order_item_qc_status || 0);
          setHold(res.data[0].order_hold || false);
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
    loadSpecificOrder();
  }, [loadSpecificOrder]);

  const orderCancelId = async item => {
    const {
      order_designed_person_fullName: designer,
      order_qced_person_fullName: qc,
      f_order_prod_current_status: fProd,
      j_order_prod_current_status: jProd,
      fg_order_prod_current_status: fgProd,
      cl_order_prod_current_status: clProd,
      gbi_order_prod_current_status: gbiProd,
      roof_order_prod_current_status: roofProd,
    } = order[0];

    // Build the custom warning message
    let warningMessage = "Are you sure you want to cancel this order?";

    if (designer) {
      warningMessage += `\n\n This order is assigned to Designer (${designer}). Please inform them.`;
    }
    if (qc) {
      warningMessage += `\n\n This order is assigned to QC (${qc}). Please inform them.`;
    }
    if (fProd || jProd || fgProd || clProd || gbiProd || roofProd) {
      warningMessage += `\n\n This order is already taken for Production. Please inform the Production Team.`;
    }

    const url = `${API_BASE_URL}cancel-sale-order/${item}/${USER_ID}`;

    swal
      .fire({
        title: "Are you sure?",
        text: warningMessage,
        icon: "warning",
        showCancelButton: true,
        reverseButtons: true,
        customClass: {
          confirmButton: "primary-btn",
          cancelButton: "secondary-btn",
        },
        confirmButtonText: "Yes, Cancel it!",
        cancelButtonText: "No, Keep it",
      })
      .then(result => {
        if (result.isConfirmed) {
          setOrderCancelLoading(true);

          axios
            .post(
              url,
              {},
              {
                headers: {
                  "x-access-token": localStorage.getItem("token"),
                  Accept: "application/json",
                  "Content-Type": "application/json",
                },
              }
            )
            .then(res => {
              if (res.status === 200) {
                swal.fire("Cancelled!", "This Order has been Cancelled.", "success");
                loadSpecificOrder();
                handleCloseDialog();
              } else {
                swal.fire("Sorry :(", "This Order file not Cancelled.", "error");
              }
            })
            .catch(error => {
              swal.fire("Error", error.response?.data || "An unexpected server error occurred.", "error");
            })
            .finally(() => {
              setOrderCancelLoading(false);
            });
        }
      });
  };

  const PrintDeliveryDocket = async (order, sendMail) => {
    if (!sendMail) {
      setPrintDeliveryDocket(true);
    } else {
      setEmailDeliveryDocketCopy(true)
    }

    const finalOrderNo = computeOrderFields(order).order_unique_id
    const url = `${API_BASE_URL}generate-docket-pdf-docketwise?mode=individual-order&orderUID=${finalOrderNo}&sendMail=${sendMail}`;

    try {
      const response = await axios.get(url, {
        headers: {
          "x-access-token": localStorage.getItem("token"),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });

      if (response.status === 200) {
        const filePath = response.data;
        if (filePath) {
          const pdfUrl = `${API_BASE_URL}${filePath}`;
          if (!sendMail) {
            window.open(pdfUrl, "_blank");
            swal.fire({ text: "Delivery Docket PDF has been generated and opened successfully.", icon: "success", showConfirmButton: false, timer: 1000 });
          } else {
            swal.fire({ text: "Delivery Docket has been emailed successfully.", icon: "success", showConfirmButton: false, timer: 1000 });
          }
          handleCloseDialog();
        } else {
          swal.fire({ text: "No data to export", icon: "info" });
        }
      }
    } catch (error) {
      swal.fire({ text: error.response?.data || "Error exporting", icon: "error" });
    } finally {
      setPrintDeliveryDocket(false);
      setEmailDeliveryDocketCopy(false)
    }
  };

  const [orderDrawerState, setOrderDrawerState] = React.useState(false);
  const handleOrderDrawerToggle = () => {
    setData();
    orderDrawerState === false ? setOrderDrawerState(true) : setOrderDrawerState(false);
  };
  const orderEditId = _id => {
    orderDrawerState === false ? setOrderDrawerState(true) : setOrderDrawerState(false);
    setData(_id);
  };
  const updateDrawer = () => {
    orderDrawerState === false ? setOrderDrawerState(true) : setOrderDrawerState(false);
    loadSpecificOrder();
  };

  const getStatusBadge = (status, order) => {
    let color, backgroundColor;

    switch (status) {
      case "Order Created":
        color = "primary";
        backgroundColor = "#00AFD7";
        break;
      case "Order In Progress":
        // Check if any department is in PIP, if so show production badges instead
        if (order && hasAnyProductionInProgress(order)) {
          return getProductionStatusBadge(order);
        }
        color = "info";
        backgroundColor = "#e567ba";
        break;
      case "Production In Progress":
        return getProductionStatusBadge(order);
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

  const orderValuesReSendMyob = async id => {
    const result = await swal.fire({
      title: "Confirmation",
      text: "Are you sure you want to resend order items to MYOB?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Resend",
      cancelButtonText: "No, Cancel",
    });

    if (!result.isConfirmed) {
      return;
    }
    setMyobBtnLoadingMap(true);
    try {
      const url = `${API_BASE_URL}resent-ordermaster-item-details-to-myob/${id}?userid=${USER_ID}`;
      await axios.post(
        url,
        {},
        {
          headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" },
        }
      );
      swal.fire({ text: "Order Items ReSent to MYOB", icon: "success", type: "success" });
      loadSpecificOrder();
    } catch (error) {
      const errorMessages = error?.response?.data?.errors[1] || error?.response?.data?.errors[0];
      swal.fire({
          title: error?.response?.data?.code || "",
          text: errorMessages || error.message,
          icon: "error",
          type: "error"
      });
    } finally {
      setMyobBtnLoadingMap(false);
    }
  };

  const orderValuesSendMyob = async item => {
    const { order_quote_checker_status, order_Overall_Price, order_quote_price } = item;

    // First Confirmation (Base)
    const result = await swal.fire({
      title: "Confirmation",
      text: "Are you sure you want to send order items to MYOB?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Send",
      cancelButtonText: "No, Cancel",
      customClass: {
        confirmButton: "primary-btn",
        cancelButton: "secondary-btn",
      },
    });

    if (!result.isConfirmed) {
      return;
    }

    if (order_quote_checker_status === true) {
      const quoteConfirm = await swal.fire({
        title: "Converted from Quotation",
        text: "This order was converted from a quotation. Please ensure all details are correct. Are you sure you want to proceed?",
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Yes, Proceed",
        cancelButtonText: "No, Cancel",
        customClass: {
          confirmButton: "primary-btn",
          cancelButton: "secondary-btn",
        },
      });

      if (!quoteConfirm.isConfirmed) {
        return;
      }

      if (Number(order_Overall_Price) !== Number(order_quote_price)) {
        const priceMismatchConfirm = await swal.fire({
          title: "Price Mismatch",
          text: "The quote price and order price do not match. Do you still want to proceed?",
          icon: "warning",
          showCancelButton: true,
          confirmButtonText: "Yes, Proceed",
          cancelButtonText: "No, Cancel",
          customClass: {
            confirmButton: "primary-btn",
            cancelButton: "secondary-btn",
          },
        });

        if (!priceMismatchConfirm.isConfirmed) {
          return;
        }
      }
    }

    // Proceed with sending to MYOB
    setMyobBtnLoadingMap(true);
    try {
      const url = `${API_BASE_URL}sent-ordermaster-item-details-to-myob/${id}?userid=${USER_ID}`;
      await axios.post(
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
        text: "Order Items sent to MYOB",
        icon: "success",
      });

      loadSpecificOrder();
    } catch (error) {
      const errorMessages = error?.response?.data?.errors[1] || error?.response?.data?.errors[0];
      swal.fire({
          title: error?.response?.data?.code || "",
          text: errorMessages || error.message,
          icon: "error",
          type: "error"
      });
    } finally {
      setMyobBtnLoadingMap(false);
    }
  };

  const handleSwitchChange = e => {
    const { checked } = e.target;
    const url = `${API_BASE_URL}remake-sale-order/${id}`;

    swal
      .fire({
        title: "Are you sure?",
        text: `Do you want to ${checked ? "enable" : "disable"} Remake for this order?`,
        icon: "question",
        showCancelButton: true,
        reverseButtons: true,
        confirmButtonText: "Yes, confirm",
        cancelButtonText: "Cancel",
        customClass: {
          confirmButton: "primary-btn",
          cancelButton: "secondary-btn",
        },
      })
      .then(result => {
        if (result.isConfirmed) {
          // Update local state
          setData(prev => ({
            ...prev,
            order_remake_checker: checked,
          }));

          axios
            .post(
              url,
              { order_remake_checker: checked },
              {
                headers: {
                  "x-access-token": localStorage.getItem("token"),
                  Accept: "application/json",
                  "Content-Type": "application/json",
                },
              }
            )
            .then(res => {
              if (res.status === 200) {
                swal.fire("Updated!", "Remake status has been updated.", "success");
                loadSpecificOrder();
              } else {
                swal.fire("Oops!", "Failed to update Remake status.", "error");
              }
            })
            .catch(error => {
              swal.fire({
                text: error.response?.data || "An error occurred",
                icon: "error",
              });
            });
        }
      });
  };


  const orderDocketId = useCallback(async (item, sendMail) => {
    if (!sendMail) {
      setPrintOrderBtnLoading(true);
    }
    if (sendMail) {
      setEmailSalesOrderCopy(true)
    }
    let url = `${API_BASE_URL}generate-sale-order-docket/${item}?sendMail=${sendMail}`;
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
          if (!sendMail) {
            window.open(pdfUrl, "_blank");
            swal.fire({ text: "Sales order PDF has been generated and opened successfully.", icon: "success", showConfirmButton: false, timer: 1000 });
          }
          else {
            swal.fire({ text: "Sales order has been emailed successfully.", icon: "success", showConfirmButton: false, timer: 1000 });
          }
          handleCloseDialog();
        } else {
          swal.fire({ text: "No data to export", icon: "info" });
        }
        setPrintOrderBtnLoading(false);
        setEmailSalesOrderCopy(false)
      }
    } catch (error) {
      swal.fire({ text: error.response?.data || "Error exporting", icon: "error" });
    } finally {
      setLoading(false);
      setPrintOrderBtnLoading(false);
      setEmailSalesOrderCopy(false)
    }
  }, []);

  const handleOrderItemQCStatus = async (id, status, w_status, type, person, userId) => {
    try {
      const url = `${API_BASE_URL}update-order-item-qc-status/${id}`;
      const response = await axios.post(url, { order_item_qc_status: status, w_order_item_qc_status: w_status, user_id: userId, w_user_id: userId, type, person }, {
        headers: {
          "x-access-token": localStorage.getItem("token"),
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
      });
      setOrderItemQCStatus(response.data.order_item_qc_status);
      setWOrderItemQCStatus(response.data.w_order_item_qc_status);
      swal.fire({
        text: response.data.message,
        icon: 'success',
        type: 'success',
      });
      loadSpecificOrder();
    } catch (error) {
      swal.fire({
        text: error.response?.data || "An error occurred",
        icon: 'error',
        type: 'error',
      });
    }
  }

  const handleCloseDialog = () => {
    setOpenDialog(false);
  };

  const handleOpenDialog = () => {
    setOpenDialog(true);
  };

  const [hold, setHold] = useState(false)
  const [orderHoldLoading, setOrderHoldLoading] = useState(false)

const orderHold = async () => {
  const result = await swal.fire({
    title: "Confirmation",
    text: "Are you sure you want to hold/unhold this order?",
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "Yes, Proceed",
    cancelButtonText: "No, Cancel",
    customClass: {
      confirmButton: "primary-btn",
      cancelButton: "secondary-btn",
    },
  });
  
  if (!result.isConfirmed) {
    return;
  }
  setOrderHoldLoading(true);

  const orderId = id;
    try {
      const response = await axios.patch(
        `${API_BASE_URL}hold-unhold-order/${orderId}`,
        { order_hold: !hold,
          order_hold_person: USER_ID
         },
        {
          headers: {
            "x-access-token": localStorage.getItem("token"),
            Accept: "application/json",
            "Content-Type": "application/json",
          },
        }
      );
      
      setOrderHoldLoading(false);
      // Update local state immediately after successful API call
      setHold(!hold);
      
      // Reload order details to sync with backend
      loadSpecificOrder();
      
      swal.fire({
        text: "Order hold status updated successfully.",
        icon: "success",
        showConfirmButton: false,
        timer: 1000,
      });
    } catch (error) {
      setOrderHoldLoading(false);
      swal.fire({
        text: error.response?.data || "Error updating order hold status",
        icon: "error",
      });
    }
  };

  return (
    <React.Fragment>
      {orderCancelLoading ? (
        <MyDiv className="BulkUploadLoader">
          <SpanTag>
            <IconButton aria-label="fingerprint" color="info" className="IconBtnLoader">
              <FiLoader />
            </IconButton>
            <br />
            Order Canceling Inprogress <br /> Please Wait. Don't Press Back or Refresh. <br /> This Process May Take
            Some Time to Complete
          </SpanTag>
        </MyDiv>
      ) : (
        ""
      )}
      {loading || orderHoldLoading ? (
        <MyDiv className="BulkUploadLoader">
          <SpanTag>
            <IconButton aria-label="fingerprint" color="info" className="IconBtnLoader">
              <FiLoader />
            </IconButton>
          </SpanTag>
        </MyDiv>
      ) : (
        <>
          {order?.length ? (
            order.map(item => (
              <React.Fragment key={item._id}>
                <Row>
                  {/* Order basic Details start */}
                  <Col md={12}>
                    <MyDiv className={`ProfileBasicDetail order-profile ${collapsed ? "collapsed" : ""}`}>
                      <Card className={`ProfileBasicDetailLeftHeader ${collapsed ? "collapsed" : ""} pt-0 pb-1`}>
                        {/* Top Bar */}
                        <Grid 
                          container
                          className={`${!item.order_flashing_checker ? "withoutFlashing" : ""} DetailHeader ${collapsed ? "collapsed" : ""}`}
                          title={item.order_flashing_checker === false ? "This Order have only Custom Order" : ""}
                          alignItems="center"
                          sx={{ flexWrap: { xs: 'wrap', md: 'nowrap' } }}
                        >
                          {location.state?.currentPage ? (
                            <Link className="arrow-btn" to="/orders" style={{ left: "10px" }}>
                              <MdKeyboardArrowLeft />
                            </Link>
                          ) : (
                            <button
                              className="arrow-btn"
                              style={{ left: "10px", background: "none", border: "none", cursor: "pointer" }}
                              onClick={() => navigate(-1)}
                            >
                              <MdKeyboardArrowLeft />
                            </button>
                          )}
                          <Grid item xs={12} sm={6} md={5} lg={5}>
                            <HeadingThree style={{ fontSize: 'clamp(1rem, 2vw, 1.45rem)', margin: 0 }}>
                              {item.account_Name} - {item.d_order_unique_id}
                            </HeadingThree>
                          </Grid>
                          <Grid item xs={6} sm={3} md={1.9} lg={1.9}>
                            <h5 style={{ fontWeight: "bold", fontSize: 'clamp(0.875rem, 1.5vw, 1rem)', margin: 0 }}>
                              {item.created_str
                                ? item.created_str.toUpperCase()
                                : moment(item.created).format("DD-MM-YYYY hh:mm A")}
                            </h5>
                          </Grid>
                          <Grid item xs={6} sm={3} md={2.8} lg={2.8} className="text-end" sx={{ textAlign: { xs: 'start', md: 'end' } }}>
                            {item.order_po_checker === true ? (
                              <HeadingThree className="text-danger" style={{ fontSize: 'clamp(0.75rem, 1.5vw, 1.15rem)', margin: 0 }}>
                                PO Number Already Exist
                              </HeadingThree>
                            ) : null}
                          </Grid>
                          <Grid item xs={10} sm={9} md={2} lg={2} className="text-end" sx={{ textAlign: { xs: 'start', md: 'end' } }}>
                            <HeadingThree title="Delivery Day" style={{ fontSize: 'clamp(1rem, 2vw, 1.45rem)', margin: 0 }}>
                              <GetDayFromDate deliveryDate={item.order_delivery_date_str} />
                            </HeadingThree>
                          </Grid>
                          <Grid item xs={2} sm={3} md="auto" lg="auto" sx={{ textAlign: 'right' }}>
                            <IconButton
                              size="small"
                              style={{ color: "#d22530" }}
                              onClick={() => setCollapsed(!collapsed)}>
                              {collapsed ? <SlArrowDown /> : <SlArrowUp />}
                            </IconButton>
                          </Grid>
                        </Grid>
                        {!collapsed && (
                          <Grid container spacing={2}>
                            {/* Left Column - Delivery Details */}
                            <Grid item xs={12} sm={12} md={6} lg={item.order_status === "Order Cancelled" || item.order_hold ? 3 : 4} className="text-start">
                              <MyDiv className="ProfileCard">
                                <Grid container spacing={1}>
                                  <Grid item xs={5} md={5}>
                                    <LabelTag style={{ fontSize: 'clamp(0.75rem, 1vw, 0.875rem)' }}>Po number</LabelTag>
                                  </Grid>
                                  <Grid item xs={7} md={7}>
                                    <SpanTag style={{ fontSize: 'clamp(0.75rem, 1vw, 0.875rem)', wordBreak: 'break-word', fontWeight: 'bold' }}>
                                      {item.d_order_customer_PO_number}
                                    </SpanTag>
                                  </Grid>
                                </Grid>
                                {item.order_quote_checker_status === true && (
                                  <Grid container spacing={1}>
                                    <Grid item xs={5} md={5}>
                                      <LabelTag style={{ fontSize: 'clamp(0.75rem, 1vw, 0.875rem)' }}>Quote No</LabelTag>
                                    </Grid>
                                    <Grid item xs={7} md={7}>
                                      <SpanTag>
                                        <Badge bg="info" text="light" style={{ fontSize: 'clamp(0.65rem, 1vw, 0.75rem)' }}>
                                          {item.order_quote_id}
                                        </Badge>
                                      </SpanTag>
                                    </Grid>
                                  </Grid>
                                )}
                                <Grid container spacing={1}>
                                  <Grid item xs={5} md={5}>
                                    <LabelTag style={{ fontSize: 'clamp(0.75rem, 1vw, 0.875rem)' }}>Promised date</LabelTag>
                                  </Grid>
                                  <Grid item xs={7} md={7}>
                                    <SpanTag style={{ fontSize: 'clamp(0.75rem, 1vw, 0.875rem)', fontWeight: 'bold' }}>
                                      {item.order_delivery_date_str} -{" "}
                                      {getFormattedDeliveryTime(item.order_delivery_time, item.order_delivery_session)}
                                    </SpanTag>
                                  </Grid>
                                </Grid>
                                {item.order_delivery_address_mode !== "0" && (
                                  <Grid container spacing={1}>
                                    <Grid item xs={5} md={5}>
                                      <LabelTag style={{ fontSize: 'clamp(0.75rem, 1vw, 0.875rem)' }}>Site Contact</LabelTag>
                                    </Grid>
                                    <Grid item xs={7} md={7}>
                                      <SpanTag style={{ fontSize: 'clamp(0.75rem, 1vw, 0.875rem)', wordBreak: 'break-word', fontWeight: 'bold' }}>
                                        {item.order_delivery_address_mode === "1" && (
                                          <MyDiv className="siteDelivery">
                                            {item.order_site_delivery_attention_person}{", "}
                                            {item.order_site_delivery_attention_contact}
                                          </MyDiv>
                                        )}
                                        {item.order_delivery_address_mode === "2" && (
                                          <MyDiv className="pickupOrder">
                                            {item.order_site_delivery_attention_person}{", "}
                                            {item.order_site_delivery_attention_contact}
                                          </MyDiv>
                                        )}
                                      </SpanTag>
                                    </Grid>
                                  </Grid>
                                )}
                                <Grid container spacing={1}>
                                  <Grid item xs={5} md={5}>
                                    <LabelTag style={{ fontSize: 'clamp(0.75rem, 1vw, 0.875rem)' }}>Delivery Mode</LabelTag>
                                  </Grid>
                                  <Grid item xs={7} md={7}>
                                    <SpanTag style={{ fontSize: 'clamp(0.75rem, 1vw, 0.875rem)', fontWeight: 'bold' }}>
                                      {item.order_delivery_address_mode === "0" && "Store"}
                                      {item.order_delivery_address_mode === "1" && "Site"}
                                      {item.order_delivery_address_mode === "2" && "Pickup"}
                                    </SpanTag>
                                  </Grid>
                                </Grid>
                                <Grid container spacing={1}>
                                  <Grid item xs={5} md={5}>
                                    <LabelTag style={{ fontSize: 'clamp(0.75rem, 1vw, 0.875rem)' }}>Delivery Address</LabelTag>
                                  </Grid>
                                  <Grid item xs={7} md={7}>
                                    <SpanTag style={{ fontSize: 'clamp(0.75rem, 1vw, 0.875rem)',wordBreak: 'break-word', fontWeight: 'bold' }}>
                                      {item.order_delivery_address_mode === "0" && (
                                        <MyDiv className="storeDelivery">
                                          {item.order_store_delivery_address1},{" "}{item.order_store_delivery_city},{" "}
                                          {item.order_store_delivery_state},{" "}{item.order_store_delivery_country}-
                                          {item.order_store_delivery_postalcode}
                                        </MyDiv>
                                      )}
                                      {item.order_delivery_address_mode === "1" && (
                                        <MyDiv className="siteDelivery">
                                          {item.order_site_delivery_address1},{" "}{item.order_site_delivery_city},{" "}
                                          {item.order_site_delivery_state},{" "}{item.order_site_delivery_country}-
                                          {item.order_site_delivery_postalcode}
                                        </MyDiv>
                                      )}
                                      {item.order_delivery_address_mode === "2" && (
                                        <MyDiv className="pickupOrder">PickUp Order</MyDiv>
                                      )}
                                    </SpanTag>
                                  </Grid>
                                </Grid>
                              </MyDiv>
                            </Grid>

                            {/* Middle Column - Site Info */}
                            <Grid item xs={12} sm={12} md={6} lg={item.order_status === "Order Cancelled" || item.order_hold ? 4 : 5} className="text-start">
                              <MyDiv className="ProfileCard">
                                {item.order_delivery_address_mode === "2" && 
                                  <Grid container display={"flex"} justifyContent={"center"} alignItems={"center"}>
                                    <Typography variant="h2" fontWeight={"bold"}>PICK UP</Typography>
                                  </Grid>
                                }
                                {(item.order_loaders_info && item.order_loaders_info !== "-") && 
                                  <Grid container spacing={1}>
                                    <Grid item xs={4} md={3.6}>
                                      <LabelTag style={{ fontSize: 'clamp(0.75rem, 1vw, 0.875rem)' }}>Loader Info</LabelTag>
                                    </Grid>
                                    <Grid item xs={8} md={8.2}>
                                      <SpanTag style={{ fontSize: 'clamp(0.75rem, 1vw, 0.875rem)', wordBreak: 'break-word' }}>
                                        {item.order_loaders_info}
                                      </SpanTag>
                                    </Grid>
                                  </Grid>
                                }
                                {(item.order_custom_note && item.order_custom_note !== "-") &&
                                  <Grid container spacing={1}>
                                    <Grid item xs={4} md={3.6}>
                                      <LabelTag style={{ fontSize: 'clamp(0.75rem, 1vw, 0.875rem)' }}>Driver Info</LabelTag>
                                    </Grid>
                                    <Grid item xs={8} md={8.2}>
                                      <SpanTag style={{ fontSize: 'clamp(0.75rem, 1vw, 0.875rem)', wordBreak: 'break-word' }}>
                                        {item.order_custom_note}
                                      </SpanTag>
                                    </Grid>
                                  </Grid>
                                }
                                {item.order_site_delivery_details && item.order_site_delivery_details !== "-" &&
                                  <Grid container spacing={1}>
                                    <Grid item xs={4} md={3.6}>
                                      <LabelTag style={{ fontSize: 'clamp(0.75rem, 1vw, 0.875rem)' }}>Site Info</LabelTag>
                                    </Grid>
                                    <Grid item xs={8} md={8.2}>
                                      <SpanTag style={{ fontSize: 'clamp(0.75rem, 1vw, 0.875rem)', wordBreak: 'break-word' }}>
                                        {item.order_site_delivery_details}
                                      </SpanTag>
                                    </Grid>
                                  </Grid>
                                }
                                {item.order_delivery_address_mode === "1" && 
                                  <Grid container spacing={1}>
                                    <Grid item xs={4} md={3.6}>
                                      <LabelTag style={{ fontSize: 'clamp(0.75rem, 1vw, 0.875rem)' }}>Crane Lift</LabelTag>
                                    </Grid>
                                    <Grid item xs={8} md={7}>
                                      <SpanTag>
                                        {item.order_crane_lift_checker === true ? (
                                          <Badge className="HaveCraneLiftBadge" text="light" style={{ fontSize: 'clamp(0.65rem, 1vw, 0.75rem)' }}>
                                            Yes
                                          </Badge>
                                        ) : (
                                          <Badge bg="info" text="light" style={{ fontSize: 'clamp(0.65rem, 1vw, 0.75rem)' }}>
                                            No
                                          </Badge>
                                        )}
                                      </SpanTag>
                                    </Grid>
                                  </Grid>
                                }
                                {(item.order_delivery_address_mode === "0" || item.order_delivery_address_mode === "1") && 
                                  <Grid container spacing={1}>
                                    <Grid item xs={4} md={3.6}>
                                      <LabelTag style={{ fontSize: 'clamp(0.75rem, 1vw, 0.875rem)' }}>Far Suburb</LabelTag>
                                    </Grid>
                                    <Grid item xs={8} md={7}>
                                      <SpanTag>
                                        {item.order_far_suburb === true ? (
                                          <Badge className="HaveFarSuburbBadge" text="light" style={{ fontSize: 'clamp(0.65rem, 1vw, 0.75rem)' }}>
                                            Yes
                                          </Badge>
                                        ) : (
                                          <Badge bg="info" text="light" style={{ fontSize: 'clamp(0.65rem, 1vw, 0.75rem)' }}>
                                            No
                                          </Badge>
                                        )}
                                      </SpanTag>
                                    </Grid>
                                  </Grid>
                                }
                              </MyDiv>
                            </Grid>

                            {/* Right Column - Order Status & Pricing */}
                            <Grid item xs={12} sm={12} md={6} lg={3} className="text-start">
                              <MyDiv className="ProfileCard">
                                <Grid container spacing={1}>
                                  <Grid item xs={6} md={6}>
                                    <LabelTag style={{ fontSize: 'clamp(0.75rem, 1vw, 0.875rem)' }}>Created by</LabelTag>
                                  </Grid>
                                  <Grid item xs={6} md={6}>
                                    <SpanTag style={{ fontSize: 'clamp(0.75rem, 1vw, 0.875rem)', wordBreak: 'break-word' }}>
                                      {item.order_created_person_fullName}
                                    </SpanTag>
                                  </Grid>
                                </Grid>
                                
                                <Grid container spacing={1}>
                                  <Grid item xs={6} md={6}>
                                    <LabelTag style={{ fontSize: 'clamp(0.75rem, 1vw, 0.875rem)' }}>Order Status</LabelTag>
                                  </Grid>
                                  <Grid item xs={6} md={6}>
                                    <MyDiv>{item.order_hold ? getStatusBadge("Order Hold", item) : getStatusBadge(item.order_status, item)}</MyDiv>
                                  </Grid>
                                </Grid>
                                {(item.order_inter_department_instruction && item.order_inter_department_instruction !== "-") && 
                                  <Grid container spacing={1}>
                                    <Grid item xs={6} md={6}>
                                      <LabelTag style={{ fontSize: 'clamp(0.75rem, 1vw, 0.875rem)' }}>MYOB Desc</LabelTag>
                                    </Grid>
                                    <Grid item xs={6} md={6}>
                                      <MyDiv>{item.order_inter_department_instruction}</MyDiv>
                                    </Grid>
                                  </Grid>
                                }
                                <MyDiv className={`${RolePermission?.PriceManagement?.view === "1" ? "" : "hide"} gstCard`}>
                                  <Grid container className="border-top bg-light" style={{ padding: "0 2px" }}>
                                    <Grid item xs={6} md={6}>
                                      <LabelTag style={{ fontSize: 'clamp(0.75rem, 1vw, 0.875rem)' }}>Sales Total</LabelTag>
                                    </Grid>
                                    <Grid item xs={6} md={6}>
                                      <SpanTag style={{ fontSize: 'clamp(0.75rem, 1vw, 0.875rem)' }}>
                                        <CurrencyDisplay value={item.order_GST_Taxable_Total ? item.order_GST_Taxable_Total : "0"} />
                                      </SpanTag>
                                    </Grid>
                                  </Grid>
                                  <Grid container className="border-top" style={{ padding: "0 2px" }}>
                                    <Grid item xs={6} md={6}>
                                      <LabelTag style={{ fontSize: 'clamp(0.75rem, 1vw, 0.875rem)' }}>Tax Total</LabelTag>
                                    </Grid>
                                    <Grid item xs={6} md={6}>
                                      <SpanTag style={{ fontSize: 'clamp(0.75rem, 1vw, 0.875rem)' }}>
                                        <CurrencyDisplay value={item.order_Tax_Total ? item.order_Tax_Total : "0"} />
                                      </SpanTag>
                                    </Grid>
                                  </Grid>
                                  <Grid container className="border-top bg-secondary text-white" style={{ padding: "0 2px" }}>
                                    <Grid item xs={6} md={6}>
                                      <LabelTag className="text-white" style={{ fontSize: 'clamp(0.75rem, 1vw, 0.875rem)' }}>
                                        Total (AUD)
                                      </LabelTag>
                                    </Grid>
                                    <Grid item xs={6} md={6}>
                                      <StrongTag style={{ fontSize: 'clamp(0.75rem, 1vw, 0.875rem)' }}>
                                        <CurrencyDisplay value={item.order_Overall_Price} />
                                      </StrongTag>
                                    </Grid>
                                  </Grid>
                                </MyDiv>
                              </MyDiv>
                            </Grid>

                            {/* Order cancel card */}
                            {item.order_status === "Order Cancelled" ? (
                              <Grid item xs={12} sm={12} md={6} lg={2} className="text-start">
                              <MyDiv className="ProfileCard CanceledCard">
                                <Row>
                                  <Col md={12}>
                                    <LabelTag>Order Cancelled Person</LabelTag>
                                  </Col>
                                  <Col md={12}>
                                    <SpanTag>{item.order_cancelled_user}</SpanTag>
                                  </Col>
                                </Row>
                                <Row>
                                  <Col md={12}>
                                    <LabelTag>Order Cancelled On</LabelTag>
                                  </Col>
                                  <Col md={12}>
                                    <SpanTag>{moment(item.order_cancelled_date).format("DD-MM-YYYY hh:mm a")}</SpanTag>
                                  </Col>
                                </Row>
                              </MyDiv>
                              </Grid>
                            ) : ( null )}

                             {/* Order cancel card */}
                            {item.order_hold ? (
                              <Grid item xs={12} sm={12} md={6} lg={2} className="text-start">
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
                              </Grid>
                            ) : ( null )}
                                
                            {item.account_notes && (
                              <MyDiv style={{ margin: "2px 15px", width: "100%" }}>
                                <Chip label={item.account_notes} color="warning" icon={<MdInfo size={20} />} />
                              </MyDiv>
                            )}
                          </Grid>
                        )}

                      </Card>
                    </MyDiv>
                    
                    {/* Icon Bar */}
                    {item.order_status !== "Order Cancelled" ? (
                    <MyDiv className="GeneralHeading flex-wrap mt-3" style={{ position: 'relative' }}>
                        <Grid container className="flex-wrap" spacing={2} display={"flex"} justifyContent={"space-between"}>
                          <Grid item className="flex-wrap" xs={6} sm={12} md={3} lg={3}>
                            {myobBtnLoadingMap ? (
                                    <IconButton size="small" aria-label="fingerprint" sx={{ color: pink[500] }} className="IconBtnLoader">
                                      <FiLoader />
                                    </IconButton>
                                  ) : (
                                    <>
                                      {item.order_qc_status === "4" &&
                                        item.order_myob_push_status === false &&
                                        item.order_status !== "Order Cancelled" ? (
                                        <Tooltip title="Send Order Items to MYOB" sx={{ marginTop: "5px" }}>
                                          <IconButton
                                            size="small"
                                            aria-label="fingerprint"
                                            disabled={hold}
                                            sx={{ 
                                              color: pink[500],
                                              border: '1px solid black',
                                              "&:disabled" : { border: "1px solid gray" }
                                            }}
                                            onClick={e => orderValuesSendMyob(item)}>
                                            <SiMyob size={35}/>
                                          </IconButton>
                                        </Tooltip>
                                      ) : null}
                                    </>
                                  )}
                                  {item.order_myob_push_status === true &&
                                    RolePermission?.MYOBResend?.view === "1" &&
                                    item.order_status !== "Order Cancelled" && !item.order_hold ? (
                                    <Tooltip title="Re Send Order Items to MYOB">
                                      <IconButton
                                        size="small"
                                        aria-label="fingerprint"
                                        sx={{ 
                                          color: pink[500],
                                          border: `1px solid ${pink[500]}`,
                                        }}
                                        onClick={e => orderValuesReSendMyob(item._id)}>
                                        <SiMyob size={30}/>
                                      </IconButton>
                                    </Tooltip>
                                  ) : null}
                              
                                  {item.order_myob_push_status === true &&
                                    RolePermission?.MYOBResend?.view === "1" &&
                                    item.order_status !== "Order Cancelled" && !item.order_hold ? (
                                    <small className="blockquote-footer text-danger" style={{ fontSize: '0.9rem', lineHeight: '1' }}>
                                      Note: Already moved to MYOB
                                    </small>
                                  ) : null}
                          </Grid>
                          <Grid item gap={3} className="flex-wrap" xs={6} sm={12} md={9} lg={9} display={"flex"} justifyContent={"flex-end"}>
                            <MyDiv style={{ position: "relative" }}>
                              <Tooltip title="Hold">
                                <IconButton
                                  size="small"
                                  aria-label="fingerprint"
                                  color="success"
                                  disabled={item.order_status === "Order Cancelled" ? true : false}
                                  sx={{
                                    color: "#fff",
                                    width: { xs: "30px", md: "35px" },
                                    height: { xs: "30px", md: "35px" },
                                    backgroundColor: "#229b2c",
                                    "&:hover": { backgroundColor: "#135c19" },
                                  }}
                                  onClick={(e) => orderHold()}>
                                  {hold ? <FaPlay /> : <FaPause />}
                                </IconButton>
                              </Tooltip>
                              <MyDiv style={{ position: "absolute", top: -22, left: -2 }}>
                                <Typography variant="body2" style={{ backgroundColor: '#fff', borderRadius: "10px", padding: "0px 5px", fontWeight: 'bold' }}>Hold</Typography>
                              </MyDiv>
                            </MyDiv>

                            {RolePermission?.MYOBResend?.view === "1" ? (
                              <MyDiv style={{ position: "relative" }}>
                              <FormControlLabel
                                labelPlacement="start"
                                className="mx-0"
                                name="order_remake_checker"
                                control={
                                  <Tooltip title="Mark As Remake">
                                    <Switch
                                      disabled={hold}
                                      checked={!!item.order_remake_checker}
                                      onChange={e => handleSwitchChange(e)}
                                    />
                                  </Tooltip>
                                }
                                
                              />
                              <MyDiv style={{ position: "absolute", top: -22 }}>
                                <Typography variant="body2" style={{ backgroundColor: '#fff', borderRadius: "10px", padding: "0px 5px", fontWeight: 'bold' }}>Remake</Typography>
                              </MyDiv>
                              </MyDiv>
                              
                            ) : (
                              ""
                            )}

                            <MyDiv style={{ position: "relative" }}>
                              <OrderTracking 
                                CoreOrderId={item._id}
                                sx={{
                                  color: "#fff",
                                  width: { xs: "30px", md: "35px" },
                                  height: { xs: "30px", md: "35px" },
                                  backgroundColor: "#229b2c",
                                  "&:hover": { backgroundColor: "#135c19" },
                                }} 
                              />
                            <MyDiv style={{ position: "absolute", top: -22, left: -5 }}>
                              <Typography variant="body2" style={{ backgroundColor: '#fff', borderRadius: "10px", padding: "0px 5px", fontWeight: 'bold' }}>Track</Typography>
                            </MyDiv>
                            </MyDiv>
                            {item.order_myob_push_status !== true || RolePermission?.MYOBResend?.view === "1" ? (
                              <MyDiv style={{ position: "relative" }}>
                              <Tooltip title="Edit">
                                <IconButton
                                  size="small"
                                  aria-label="fingerprint"
                                  color="success"
                                  disabled={hold}
                                  sx={{
                                    color: "#fff",
                                    width: { xs: "30px", md: "35px" },
                                    height: { xs: "30px", md: "35px" },
                                    backgroundColor: "#229b2c",
                                    "&:hover": { backgroundColor: "#135c19" },
                                    "&:disabled" : { backgroundColor: "#229b2c3a" }
                                  }}
                                  onClick={e => orderEditId(item._id)}>
                                  <MdOutlineModeEditOutline />
                                </IconButton>
                              </Tooltip>
                              <MyDiv style={{ position: "absolute", top: -22, left: -2 }}>
                                <Typography variant="body2" style={{ backgroundColor: '#fff', borderRadius: "10px", padding: "0px 5px", fontWeight: 'bold' }}>Edit</Typography>
                              </MyDiv>
                              </MyDiv>
                            ) : null}
                            {(item.order_status?.toLowerCase() !== "order created" && RolePermission?.OrderItemQC?.view === "1") && 
                              <>
                                {orderItemQCStatus === 0 &&
                                  // <Grid item xs={5} sm={5} md={6} lg={5}>
                                    <Tooltip title={"Primary QC"}>
                                      <MyDiv style={{ position: "relative" }}>
                                      <IconButton
                                        size="small"
                                        disabled={hold}
                                        sx={{
                                          color: "#fff",
                                          width: { xs: "30px", md: "35px" },
                                          height: { xs: "30px", md: "35px" },
                                          backgroundColor: "#229b2c ",
                                          "&:hover": { backgroundColor: "#135c19" },
                                          "&:disabled" : { backgroundColor: "#229b2c3a" }
                                        }}
                                        aria-label="fingerprint" color="success" onClick={(e) => handleOrderItemQCStatus(item._id, 1, 1, "assign", "", USER_ID)}>
                                        <FaUser />
                                      </IconButton>
                                      <MyDiv style={{ position: "absolute", top: -10, left: 18 }}>
                                        <Typography variant="body2" color={'white'} style={{ backgroundColor: '#229b2c', borderRadius: "10px", padding: "0px 5px", fontWeight: 'bold' }}>1</Typography>
                                      </MyDiv>
                                      </MyDiv>
                                    </Tooltip>
                                  // </Grid>
                                  }
                                {orderItemQCStatus !== 0 &&
                                  // <Grid item xs={5} sm={5} md={6} lg={5}>
                                    <Tooltip title={"Primary QC Person - " + item.order_item_qc_person_fullName}>
                                      <IconButton
                                        size="small"
                                        sx={{
                                          color: "#fff",
                                          width: { xs: "30px", md: "35px" },
                                          height: { xs: "30px", md: "35px" },
                                          backgroundColor: "#229b2c ",
                                          "&:hover": { backgroundColor: "#135c19" },
                                        }}
                                        aria-label="fingerprint" color="success">
                                        <MdCheck />
                                      </IconButton>
                                    </Tooltip>
                                  // </Grid>
                                  }
                                {orderItemQCStatus !== 0 && (RolePermission && RolePermission.OrderItemQC && RolePermission.OrderItemQC.edit === "1") &&
                                  // <Grid item xs={2} sm={2} md={6} lg={2}>
                                    <Tooltip title={"Reset Primary QC"}>
                                      <IconButton 
                                        size='small' 
                                        aria-label="fingerprint" 
                                        color="success" 
                                        onClick={(e) => handleOrderItemQCStatus(item._id, 0, 0, "reset", "", "")}>
                                        <RxReset />
                                      </IconButton>
                                    </Tooltip>
                                  // </Grid>
                                  }
                              </>
                            }
                                  
                            {(item.order_status?.toLowerCase() !== "order created" && RolePermission?.OrderItemQC?.view === "1") &&
                                  <>
                                    {wOrderItemQCStatus === 0 &&
                                      // <Grid item xs={5} sm={5} md={6} lg={5}>
                                        <Tooltip title={"Secondary QC"}>
                                          <MyDiv style={{ position: "relative" }}>
                                            <IconButton
                                              size="small"
                                              disabled={hold}
                                              sx={{
                                                color: "#fff",
                                                width: { xs: "30px", md: "35px" },
                                                height: { xs: "30px", md: "35px" },
                                                backgroundColor: "#0c9effff",
                                                "&:hover": { backgroundColor: "#0b42f8ff" },
                                                "&:disabled" : { backgroundColor: "#0c9eff37" }
                                              }}
                                              aria-label="fingerprint"
                                              color="success"
                                              onClick={(e) => handleOrderItemQCStatus(item._id, 1, 1, "assign", "w", USER_ID)}>
                                              <FaUser />
                                            </IconButton>
                                            <MyDiv style={{ position: "absolute", top: -10, left: 18 }}>
                                              <Typography variant="body2" color={'white'} style={{ backgroundColor: '#0c9effff', borderRadius: "10px", padding: "0px 5px", fontWeight: 'bold' }}>2</Typography>
                                            </MyDiv>
                                          </MyDiv>
                                        </Tooltip>
                                      // </Grid> 
                                      }
                                    {wOrderItemQCStatus !== 0 &&
                                      // <Grid item xs={5} sm={5} md={6} lg={5}>
                                        <Tooltip title={"Secondary QC Person - " + item.w_order_item_qc_person_fullName}>
                                          <IconButton
                                            size="small"
                                            sx={{
                                              color: "#fff",
                                              width: { xs: "30px", md: "35px" },
                                              height: { xs: "30px", md: "35px" },
                                              backgroundColor: "#229b2c",
                                              "&:hover": { backgroundColor: "#135c19" },
                                            }}
                                            aria-label="fingerprint"
                                            color="success"
                                          >
                                            <MdCheck />
                                          </IconButton>
                                        </Tooltip>
                                      // </Grid>
                                      }
                                    {wOrderItemQCStatus !== 0 && (RolePermission && RolePermission.OrderItemQC && RolePermission.OrderItemQC.edit === "1") &&
                                      // <Grid item xs={2} sm={2} md={6} lg={2}>
                                        <Tooltip title={"Reset Secondary QC"}>
                                          <IconButton 
                                            size='small' 
                                            aria-label="fingerprint" 
                                            color="success" 
                                            onClick={(e) => handleOrderItemQCStatus(item._id, 0, 0, "reset", "w", "")}>
                                            <RxReset />
                                          </IconButton>
                                        </Tooltip>
                                      // </Grid>
                                      }
                                  </>
                                  }
                                  <MyDiv style={{ position: "relative" }}>
                                    <Tooltip title="More Actions">
                                      <IconButton
                                        size="small"
                                        aria-label="fingerprint"
                                        color="success"
                                        disabled={hold}
                                        sx={{
                                          color: "#fff",
                                          width: { xs: "30px", md: "35px" },
                                          height: { xs: "30px", md: "35px" },
                                          backgroundColor: "#229b2c",
                                          "&:hover": { backgroundColor: "#135c19" },
                                          "&:disabled" : { backgroundColor: "#135c192b" }
                                        }}
                                        onClick={e => handleOpenDialog()}>
                                        <CiSquareMore/>
                                      </IconButton>
                                    </Tooltip>
                                    <MyDiv style={{ position: "absolute", top: -22, left: -2 }}>
                                    <Typography variant="body2" style={{ backgroundColor: '#fff', borderRadius: "10px", padding: "0px 5px", fontWeight: 'bold' }}>More</Typography>
                                  </MyDiv>
                            </MyDiv>
                          </Grid>
                        </Grid>
                    </MyDiv>
                    ) : (null)}
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
                      <OrderItemManage orderUpdates={loadSpecificOrder} CoreOrderDetails={item} collapsed={collapsed}/>
                    </Col>
                  </Row>
                )}
                <Dialog open={openDialog} onClose={handleCloseDialog} fullWidth maxWidth="md" className="GeneralModal">
                  <DialogTitle className="text-end">
                    <MyDiv className="mx-2">More Actions</MyDiv>
                    <Button onClick={handleCloseDialog} className="btn">
                      X
                    </Button>
                  </DialogTitle>

                  <DialogContent>
                    <MyDiv className="documentContainer">
                      <Grid container spacing={2}>
                        <Grid item xs={4}>
                          <Button
                            variant="outlined"
                            fullWidth
                            onClick={e => orderDocketId(item._id, false)}
                            disabled={printOrderBtnLoading}>
                            {printOrderBtnLoading ? (
                              <Spinner animation="border" size="sm" />
                            ) : (
                              <MdLocalPrintshop />
                            )} &nbsp;
                            Print Sales order Copy
                          </Button>
                        </Grid>
                        <Grid item xs={4}>
                          <Button
                            variant="outlined"
                            fullWidth
                            onClick={() => PrintDeliveryDocket(item, false)}
                            disabled={printDeliveryDocket}
                          > {printDeliveryDocket ? (
                            <Spinner animation="border" size="sm" />
                          ) : (
                            <MdLocalPrintshop />
                          )}
                            &nbsp;Print Delivery Docket
                          </Button>
                        </Grid>
                        <Grid item xs={4}>
                          <Button
                            variant="outlined"
                            aria-label="fingerprint"
                            className="ColoredIcon"
                            color="error"
                            fullWidth
                            onClick={e => orderCancelId(item._id)}
                          >
                            <MdCancel /> &nbsp;
                            Cancel Order
                          </Button>
                        </Grid>
                        <Grid item xs={4} sx={{ position: 'relative' }}>
                          <span style={{ position: 'absolute', top: "3px", right: '10px', backgroundColor: 'orange', borderRadius: '10px', fontSize: '12px', zIndex: 8, padding: '2px' }}>coming soon</span>
                          <Button
                            variant="outlined"
                            fullWidth
                            onClick={e => orderDocketId(item._id, true)}
                            disabled={true}
                          >
                            {emailSalesOrderCopy ? (
                              <Spinner animation="border" size="sm" />
                            ) : (
                              <MdEmail />
                            )}
                            &nbsp; Email Sales Order Copy
                          </Button>
                        </Grid>
                        <Grid item xs={4}>
                          <Button
                            variant="outlined"
                            fullWidth
                            onClick={() => PrintDeliveryDocket(item, true)}
                            disabled={emailDeliveryDocketCopy}
                          >
                            {emailDeliveryDocketCopy ? (
                              <Spinner animation="border" size="sm" />
                            ) : (
                              <MdEmail />
                            )}
                            &nbsp;Email Delivery Docket
                          </Button>
                        </Grid>
                        {/* <Grid item xs={4}>
                          <Button
                            variant="outlined"
                            aria-label="fingerprint"
                            className="ColoredIcon"
                            color="error" 
                            fullWidth
                            onClick={e => orderCancelId(item._id)}
                          >
                            <MdPauseCircle /> &nbsp;
                            Hold Order
                          </Button>
                        </Grid> */}
                      </Grid>
                    </MyDiv>
                  </DialogContent>

                  <DialogActions className="d-flex justify-content-start flex-column">
                    <Row className="dialogFooter">
                      <Col md={6}></Col>
                      <Col md={6} className="d-flex justify-content-end"></Col>
                    </Row>
                  </DialogActions>
                </Dialog>

              </React.Fragment>
            ))
          ) : (
            <NoDataFound />
          )}
        </>
      )}
      <Drawer
        PaperProps={{
          sx: {
            width: "80%"
          }
        }}
        hideBackdrop={true}
        anchor="right"
        open={orderDrawerState}
        onClose={handleOrderDrawerToggle}>
        <FormOrder handleClose={updateDrawer} orderInfo={data} />
      </Drawer>
    </React.Fragment>
  );
}
export default OrderDetail;
