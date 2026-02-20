import React, { useState, useEffect, useCallback, useRef } from "react";
import { Col, Badge, Spinner } from "react-bootstrap";
import { HeadingTwo, HeadingFour, MyDiv, StrongTag, SpanTag, HeadingFive } from "../Common/Components";
import { useParams, useNavigate } from "react-router-dom";
import { TableBody, Table, TableContainer, TableHead, Switch, TableRow, TableCell, IconButton, Tooltip, Button } from "@mui/material";
import axios from "axios";
import NoDataFound from "../Common/noDataFound";
import swal from "sweetalert2";
import BarCodeList from "../Orders/barcodeList";
import OrderDocuments from "../Orders/documents";
import { TbShieldCheckered } from "react-icons/tb";
import { FiLoader } from "react-icons/fi";
import { LuRefreshCw } from "react-icons/lu";
import DrawingDetailsTab from '../Drawings/DrawingDetailsTab';
import { startTransition } from 'react';
import { FaArrowUp, FaArrowDown } from "react-icons/fa";
import { MdAssignmentInd } from "react-icons/md";



const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;
const API_TOKEN = localStorage.getItem("token");
const USER_ID = localStorage.getItem("userId");
const AWF_CUST_ID = localStorage.getItem("awfCustId");

function DesignToolOrders({ CoreOrderDetails, orderUpdates }) {
  let { id } = useParams();
  let navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState([]);

  const [barcodeSetLoading, setBarcodeSetLoading] = useState(false);

  // Add refs for top and bottom
  const topRef = useRef(null);
  const bottomRef = useRef(null);
  // Add state to track scroll position
  const [isAtTop, setIsAtTop] = useState(true);

  // Add scroll listener to detect position
  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      setIsAtTop(scrollTop < 100);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleScrollToTop = () => {
    topRef.current?.scrollIntoView({ behavior: "smooth" });
    setIsAtTop(true);
  };

  // Scroll to the bottom of the page
  const handleScrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    setIsAtTop(false);
  };

  // Toggle scroll function
  const handleScrollToggle = () => {
    if (isAtTop) {
      handleScrollToBottom();
    } else {
      handleScrollToTop();
    }
  };

  const loadSubItems = useCallback(async () => {
    setLoading(true);
    const url = API_BASE_URL + `fetch-ordersubitems-from-designtool/` + id;
    axios
      .post(url, {}, { headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" } })
      .then(res => {
        setOrders(res.data);
      })
      .catch(error => {
        swal.fire({
          text: error.response.data,
          icon: "error",
          type: "error",
        });
      })
      .finally(() => {
        setLoading(false);
      });
  }, [id]);

  //Code Added By Rahul
  // Add this state at the top with other states
  const [loadingDrawingCounts, setLoadingDrawingCounts] = useState(false);
  const [drawingCounts, setDrawingCounts] = useState({ colorCount: 0, totalDrawings: 0, totalPieces: 0 });
  // Add toggle state
  const [showDrawingTab, setShowDrawingTab] = useState(true);
  
  useEffect(() => {
      loadSubItems();
  }, [loadSubItems]);
  // Code Ended By Rahul

  useEffect(() => {
    if (orderUpdates || CoreOrderDetails.order_designed_person_fullName) {
      loadSubItems();
    }
  }, [CoreOrderDetails.order_designed_person_fullName, loadSubItems, orderUpdates]);

  const orderFetchFromDesignTool = async () => {
    loadSubItems();
  };
  // eslint-disable-next-line
  const [qcStatus, setQcStatus] = useState(CoreOrderDetails?.order_qc_status == "4" ? "" : CoreOrderDetails?.order_qc_status || "");
  const [isMoveToProductionLoading, setIsMoveToProductionLoading] = useState(false);
  const [showBarcodeList, setShowBarcodeList] = useState(false);
  const [triggerBarcodeLoad, setTriggerBarcodeLoad] = useState(false);

  const markAsQCPass = async boolean => {
    const order_quote_checker_status = CoreOrderDetails.order_quote_checker_status;
    if(CoreOrderDetails?.account_UID === AWF_CUST_ID && CoreOrderDetails?.order_delivery_address_mode === "1" && !CoreOrderDetails?.docket?.length){
        swal.fire({
          text: "Uplaod AWF docket to proceed.",
          icon: "warning",
          type: "warning",
        });
      return
    }
    const result = await swal.fire({
      title: "Confirmation",
      text: "Are you sure you want to mark this order as QC Passed and move it to production?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Move",
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
        text: "This order was converted from a quotation. Please ensure all information is correct. Are you sure you want to proceed?",
        icon: "warning",
        showCancelButton: true,
        confirmButtonText: "Yes, Proceed",
        cancelButtonText: "No, Cancel",
      });

      if (!quoteConfirm.isConfirmed) {
        return;
      }
    }
    const orderID = id;
    axios
      .patch(API_BASE_URL + `assign-order-to-production/${orderID}/F`, {}, { headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" } })
      .then(response => {
        setBarcodeSetLoading(true);
        setIsMoveToProductionLoading(true);
        loadSubItems();
        //  onNotifyChange();
        setShowBarcodeList(true);
        setTriggerBarcodeLoad(true);
      })
      .catch(error => {
        setBarcodeSetLoading(false);
        swal.fire({
          text: error.response?.data || "An error occurred",
          icon: "error",
        });
      });
  };

  // const handleOrderBackToDesigner = async () => {
  //     try {
  //       const url = `${API_BASE_URL}assign-order-back-to-designer/${id}`;
  //       await axios.patch(
  //         url,
  //         {},
  //         {
  //           headers: {
  //             "x-access-token": localStorage.getItem("token"),
  //             Accept: "application/json",
  //             "Content-Type": "application/json",
  //           },
  //         }
  //       );
  //       swal.fire({
  //         text: "This Order Successfully Moved to QC",
  //         icon: "success",
  //         type: "success",
  //       });
  //       navigate("/quality-checking");
  //     } catch (error) {
  //       swal.fire({
  //         text: error.response.data,
  //         icon: "error",
  //         type: "error",
  //       });
  //     }
  //   };

  const BarcodeSuccessInfo = e => {
    orderUpdates();
    setIsMoveToProductionLoading(false);
    setBarcodeSetLoading(false);
    setBarCodeListId();
  };

  const [barCodeListId, setBarCodeListId] = useState({ id: id, department: "F" });

  //code change by rahul
    // Add this function to fetch color count
    const fetchColorCount = useCallback(async () => {
      if (!CoreOrderDetails?.order_unique_id) return;
      
      setLoadingDrawingCounts(true);
      try {
        const response = await axios.get(
          `${API_BASE_URL}api/templates/get-drawing-counts/${CoreOrderDetails.d_order_unique_id}`,
          {
            headers: {
              "x-access-token": `${API_TOKEN}`,
              Accept: "application/json",
              "Content-Type": "application/json",
            },
          }
        );
        
        if (response.data.success) {
          setDrawingCounts({
            colorCount: response.data.colorCount,
            totalDrawings: response.data.totalDrawings,
            totalPieces: response.data.totalPieces,
          });
        }
      } catch (error) {
        console.error('Error fetching color count:', error);
        setDrawingCounts({ colorCount: 0, totalDrawings: 0, totalPieces: 0 });
      } finally {
        setLoadingDrawingCounts(false);
      }
    }, [CoreOrderDetails?.order_unique_id]);
  
    // Add useEffect to fetch color count when order details change
    useEffect(() => {
      fetchColorCount();
    }, [CoreOrderDetails?.order_unique_id, fetchColorCount]);

  return (
    <React.Fragment>
      <div ref={topRef}></div>
      {barcodeSetLoading ? (
        <MyDiv className="BulkUploadLoader">
          <SpanTag>
            <IconButton aria-label="fingerprint" color="info" className="IconBtnLoader">
              <FiLoader />
            </IconButton>
            <br />
            Sending Barcode and Documents <br /> Please Wait. Don't Press Back or Refresh. <br /> This Process May Take Some Time to Complete
          </SpanTag>
        </MyDiv>
      ) : (
        ""
      )}
      <MyDiv className="GeneralHeading">
        <Col md={1}>
          <HeadingTwo>Order Item</HeadingTwo>
        </Col>
        <Col md={4} className="d-flex align-items-center justify-content-start">
        {loadingDrawingCounts ? (
          <Spinner animation="border" size="sm" className="ms-2" />
          ) : (
          <>
            <Badge bg="danger"> 
              <HeadingFive className="mb-0" style={{ fontWeight: '700', color: '#fff' }}>Colors : {drawingCounts.colorCount}</HeadingFive>
            </Badge>
            <Badge bg="success" className="ms-3">
              <HeadingFive className="mb-0" style={{ fontWeight: '700', color: '#fff' }}>Drawings : {drawingCounts.totalDrawings}</HeadingFive>
            </Badge>
            <Badge bg="primary" className="ms-3">
              <HeadingFive className="mb-0" style={{ fontWeight: '700', color: '#fff' }}>Pieces : {drawingCounts.totalPieces}</HeadingFive>
            </Badge>
          </>
        )}
        </Col>
        <Col md={7} className="d-flex justify-content-end">
          <MyDiv className="ms-2 d-flex align-items-center">
             {/* //code change by Rahul */}
              <HeadingFive>Table</HeadingFive>
              <Tooltip title="Toggle Drawing/Order View" className='me-2'>
                  <Switch
                      checked={showDrawingTab}
                      onChange={() => setShowDrawingTab(prev => {
                        if (prev) {
                          loadSubItems();
                        }
                        return !prev;
                      })}
                      color="primary"
                  />
              </Tooltip>
              <HeadingFive>Drawings</HeadingFive>
              {/* //code end by Rahul */}
            {CoreOrderDetails?.order_status !== "Order Cancelled"  && !CoreOrderDetails.order_hold ? (
              <>
                <OrderDocuments CoreOrder={CoreOrderDetails} department="F" orderUpdates={orderUpdates} />
                {CoreOrderDetails?.order_design_stage === "3" ? (
                  <>
                    {/* Code Added By Rahul */}
                    {/* <Tooltip title="Fetch From Design Tool" className='me-2 ms-2'>
                        <IconButton aria-label="fingerprint" sx={{ color: "#fff", width: "40px", height: "40px", backgroundColor: "#229b2c ", '&:hover': { backgroundColor: "#135c19" } }} onClick={(e) => orderFetchFromDesignTool()} >
                            <LuRefreshCw />
                        </IconButton>
                    </Tooltip> */}      
                    {CoreOrderDetails?.order_images_f.length ? (
                      <>
                        {/* <Tooltip title="Fetch From Design Tool" className="me-2 ms-2">
                          <IconButton aria-label="fingerprint" sx={{ color: "#fff", backgroundColor: "#229b2c ", "&:hover": { backgroundColor: "#135c19" } }} onClick={e => orderFetchFromDesignTool()}>
                            <LuRefreshCw />
                          </IconButton>
                        </Tooltip> */}
                        <Button
                          disabled={!CoreOrderDetails?._id}
                          onClick={() => {
                          startTransition(() => {
                          navigate(`/orders/${CoreOrderDetails?.d_order_unique_id}/drawings/templates`, {
                          state: {
                              orderNumber: CoreOrderDetails?.d_order_unique_id,
                              customerName: CoreOrderDetails?.account_Name,
                              customerId: CoreOrderDetails?.account_ID,
                              orderId: CoreOrderDetails?._id,
                              orderDeliveryDate: CoreOrderDetails?.order_delivery_date_str,
                              customerPoNumber: CoreOrderDetails?.d_order_customer_PO_number,
                              enteredDate: CoreOrderDetails?.created_str,
                              currentPage: "quality-checking",
                              partClass: "My Library",
                                  }
                              });
                          });
                          }}
                          className="btn primary-btn"
                          style={{ whiteSpace: 'nowrap', marginRight: '10px' }}>

                          Add a Design
                        </Button>
                        {/* <Button onClick={e => handleOrderBackToDesigner()} className="btn primary-btn " startIcon={<MdAssignmentInd />}>
                          Mark As QC Fail
                        </Button> */}
                        {/* Code Ended By Rahul */}
                        {CoreOrderDetails && CoreOrderDetails?.order_design_stage === "3" && CoreOrderDetails?.order_images_f.length > 0 ? (
                          <Button
                            onClick={e => markAsQCPass()}
                            className="btn success-btn ms-2"
                            startIcon={!isMoveToProductionLoading ? <TbShieldCheckered /> : null}
                            disabled={isMoveToProductionLoading}
                          >
                            {isMoveToProductionLoading ? <Spinner animation="border" size="sm" /> : "Move to Production"}
                          </Button>
                        ) : (
                          <Badge bg="danger" className="ms-2">
                            Yet to Add Documents
                          </Badge>
                        )}
                      </>
                    ) : (
                      <Badge bg="warning" className="me-2">
                        Document Yet to Add
                      </Badge>
                    )}
                  </>
                ) : null}
              </>
            ) : (
              ""
            )}
          </MyDiv>
        </Col>
      </MyDiv>
      <MyDiv className="barcodeHideSection">
        {CoreOrderDetails?.order_design_stage === "3" && showBarcodeList ? <BarCodeList orderId={barCodeListId} triggerLoad={triggerBarcodeLoad} BarcodeSuccessInfo={BarcodeSuccessInfo} /> : null}
        {/* {CoreOrderDetails.order_design_stage === "5" ? <>
                {qcStatus == "4" ? <BarCodeList orderId={barCodeListId} onImagesReady={updateBarcodeInfo}  /> : null}</>: null
            } */}
      </MyDiv>
      {/* code by Rahul */}
        {showDrawingTab ? (
            <DrawingDetailsTab 
                orderId={CoreOrderDetails.d_order_unique_id} 
                mongoId={CoreOrderDetails._id}
                onDesignDelete={() => {
                  loadSubItems();
                  fetchColorCount();
                  // setRefreshFlashing(prev => !prev)
                }}
                currentPage={"quality-checking"}
                // Quotation check handled
                type={"order"}
                showEditDelete={CoreOrderDetails?.order_design_stage === "3"}
            />
        ) : (
      <MyDiv className="GeneralTable">
        {loading ? (
          <HeadingFour className="text-center">Loading...</HeadingFour>
        ) : (
          <TableContainer>
            <Table className="bgGrey stripedTable" aria-label="Order table">
              <TableHead>
                <TableRow>
                  <TableCell align="left"> SI NO</TableCell>
                  <TableCell align="left">Shape ID / Item Code / Desc</TableCell>
                  <TableCell align="left">Material Name</TableCell>
                  <TableCell align="left">Color</TableCell>
                  <TableCell align="center">Exact Girth</TableCell>
                  <TableCell align="center">Rounded Off Girth</TableCell>
                  <TableCell align="center">Folds</TableCell>
                  <TableCell align="center">Length</TableCell>
                  <TableCell align="center">Pieces</TableCell>
                  <TableCell align="center">Quantity</TableCell>
                  {/* <TableCell align="center">QC Result</TableCell> */}
                  {/* <TableCell align="left">Status</TableCell>
                   */}
                </TableRow>
              </TableHead>
              <TableBody>
                {orders?.length ? (
                  orders.map((item, index) => (
                    <React.Fragment key={item._id}>
                      <TableRow className={item.order_item_exact_fold > 10 || item.order_item_exact_grith >= (item.product_Color?.startsWith("GALVANISED") ? 1220 : 1203) ? "OrderGFExceed" : null}>
                        <TableCell align="left">{index + 1}</TableCell>
                        <TableCell align="left">
                          <StrongTag>
                            SID - {item.order_item_shape_id} / {item.order_item_code}
                          </StrongTag>
                          <br />
                          {item.order_item_description}
                        </TableCell>
                        <TableCell align="left">{item.core_Product_Thickness + " - " + item.core_Product_Name}</TableCell>
                        <TableCell align="left">
                          {item.product_Color}
                          <span
                            style={{
                              backgroundColor: item.product_Color_Hex_Code ? item.product_Color_Hex_Code : "transparent",
                              width: "100%",
                              height: "15px",
                              display: "block",
                            }}
                          ></span>
                        </TableCell>
                        <TableCell align="center">{item.order_item_exact_grith}</TableCell>
                        <TableCell align="center">{item.product_Girth}</TableCell>
                        <TableCell align="center">
                          {item.product_Fold}
                          {item.order_item_exact_fold > 10 ? <>({item.order_item_exact_fold})</> : null}
                        </TableCell>
                        <TableCell align="center">{item.order_item_length}</TableCell>
                        <TableCell align="center">{item.order_item_pieces}</TableCell>
                        <TableCell align="center">{parseFloat(item.order_item_quantity).toFixed(2)}</TableCell>
                      </TableRow>
                    </React.Fragment>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={11}>
                      <NoDataFound />
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </MyDiv>
        )}
         {/* code by Rahul end */}

         {/* Scroll Toggle Button - MOVED TO RIGHT SIDE */}
      <div
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px', // Changed from 'left' to 'right'
          zIndex: 9999,
        }}
      >
       <Tooltip title={isAtTop ? "Scroll to Bottom" : "Scroll to Top"}>
          <IconButton
            onClick={handleScrollToggle}
            sx={{
              width: '50px',
              height: '50px',
              backgroundColor: '#229b2c',
              color: '#fff',
              boxShadow: '0 4px 8px rgba(0,0,0,0.3)',
              transition: 'all 0.3s ease',
              '&:hover': {
                backgroundColor: '#135c19',
                transform: 'scale(1.1)',
              },
            }}
          >
            {isAtTop ? <FaArrowDown size={20} /> : <FaArrowUp size={20} />}
          </IconButton>
        </Tooltip>
      </div>
    <div ref={bottomRef} style={{ height: '1px' }}></div>
    </React.Fragment>
  );
}

export default DesignToolOrders;
