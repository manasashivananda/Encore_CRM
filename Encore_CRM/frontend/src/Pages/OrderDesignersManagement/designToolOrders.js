import React, { useState, useEffect, useCallback, useRef } from "react";
import { Row, Col, Badge, Spinner } from "react-bootstrap";
import { HeadingTwo, HeadingFour, MyDiv, StrongTag, HeadingFive } from "../Common/Components";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { TableBody, Table, TableContainer, TableHead, Switch, TableRow, TableCell, IconButton, Tooltip, Button, Dialog, DialogTitle, DialogContent, DialogActions } from "@mui/material";
import axios from "axios";
import swal from "sweetalert2";
import NoDataFound from "../Common/noDataFound";
import moment from "moment";
import OrderDocuments from "../Orders/documents";
import { TbShieldCheckered } from "react-icons/tb";
import { LuRefreshCw } from "react-icons/lu";

import { startTransition } from 'react';
import { Tabs, Tab } from "@mui/material";
import DrawingDetailsTab from '../Drawings/DrawingDetailsTab';
import AWFDetailsTab from '../Drawings/AWFDetailsTab';
import { FaArrowUp, FaArrowDown } from "react-icons/fa";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;
const API_TOKEN = localStorage.getItem("token");
const USER_ID = localStorage.getItem("userId");

function DesignToolOrders({ CoreOrderDetails, orderUpdates }) {
  let navigate = useNavigate();
  let { id } = useParams();
  const location = useLocation();
  const [orders, setOrders] = useState("");
  const [loading, setLoading] = useState(false);
  const [openQCReportDialog, setOpenQCReportDialog] = useState(false);
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
  const [activeDesignTab, setActiveDesignTab] = useState(
    location.state?.activeTab === 'AWF' ? 'AWF' : 'Flashing'
  );
    
    useEffect(() => {
        loadSubItems();
    }, [loadSubItems]);
    // Code Ended By Rahul;

  const orderFetchFromDesignTool = async () => {
    loadSubItems();
  };

  useEffect(() => {
    if (CoreOrderDetails?.order_designed_person_fullName && orderUpdates) {
      loadSubItems();
    }
  }, [CoreOrderDetails?.order_designed_person_fullName, loadSubItems, orderUpdates]);

  //QC Result Functions
  const [qcFailedShapeIDs, setQCFailedShapeIDs] = useState([]);

  const fetchQCFailedShapeIDs = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}qc-failed-shapeid-list/${id}`, {
        headers: {
          "x-access-token": localStorage.getItem("token"),
        },
      });
      setQCFailedShapeIDs(response.data);
    } catch (error) {}
  }, [id]);

  useEffect(() => {
    if (openQCReportDialog) {
      fetchQCFailedShapeIDs();
    }
  }, [openQCReportDialog, fetchQCFailedShapeIDs]);

  const handleCloseQCReportDialog = () => {
    setOpenQCReportDialog(false);
  };

  const handleOrderMoveToQC = async () => {
    try {
      const url = `${API_BASE_URL}assign-order-to-qc/${id}`;
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
        text: "This Order Successfully Moved to QC",
        icon: "success",
        type: "success",
      });
      navigate("/designers");
    } catch (error) {
      swal.fire({
        text: error.response.data,
        icon: "error",
        type: "error",
      });
    }
  };

  //code change by rahul
  // Add this function to fetch color count
  const fetchColorCount = useCallback(async () => {
    if (!CoreOrderDetails?.d_order_unique_id) return;
      
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
    }, [CoreOrderDetails?.d_order_unique_id]);

  // Add useEffect to fetch color count when order details change
  useEffect(() => {
    fetchColorCount();
  }, [CoreOrderDetails?.d_order_unique_id, fetchColorCount]);

  return (
    <React.Fragment>
      <div ref={topRef}></div>
      {/* Flashing / AWF tab switcher */}
      <Tabs
        value={activeDesignTab}
        onChange={(e, val) => setActiveDesignTab(val)}
        sx={{ mb: 1 }}
      >
        <Tab label="Flashing" value="Flashing" />
        <Tab label="AWF" value="AWF" />
      </Tabs>
      {/* Flashing tab content */}
      {activeDesignTab === "Flashing" && (
        <>
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
             {/* Code By Rahul */}
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
              {/* code by Rahul end */}
            {CoreOrderDetails.order_status !== "Order Cancelled"  && !CoreOrderDetails.order_hold ? (
              <>
                <OrderDocuments CoreOrder={CoreOrderDetails} department="F" orderUpdates={orderUpdates} />
                {CoreOrderDetails.order_designed_person_fullName ? (
                  <>
                    {/* Code Added By Rahul */}
                    {/* <Tooltip title="Fetch From Design Tool" className='me-2 ms-2'>
                        <IconButton aria-label="fingerprint" sx={{ color: "#fff", width: "40px", height: "40px", backgroundColor: "#229b2c ", '&:hover': { backgroundColor: "#135c19" } }} onClick={(e) => orderFetchFromDesignTool()} >
                            <LuRefreshCw />
                        </IconButton>
                    </Tooltip> */}
                    {(CoreOrderDetails?.order_flashing_checker && CoreOrderDetails.order_designed_person_id === USER_ID) && (
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
                                enteredDate: CoreOrderDetails?.created_str,
                                customerPoNumber: CoreOrderDetails?.d_order_customer_PO_number,
                                currentPage: "designers",
                                partClass: "My Library",
                                    }
                                });
                            });
                            }}
                            className="btn primary-btn"
                            style={{ whiteSpace: 'nowrap', marginRight: '10px' }}>

                            Add a Design
                        </Button>
                        )}
                    {/* Code Ended By Rahul */}
                    {orders.length !== 0 ? (
                      <>
                        {/* <Tooltip title="Fetch From Design Tool" className="me-2 ms-2">
                          <IconButton
                            aria-label="fingerprint"
                            sx={{ color: "#fff", width: "40px", height: "40px", backgroundColor: "#229b2c ", "&:hover": { backgroundColor: "#135c19" } }}
                            onClick={e => orderFetchFromDesignTool()}
                          >
                            <LuRefreshCw />
                          </IconButton>
                        </Tooltip> */}
                        {/* {CoreOrderDetails.order_qced_person_fullName ? (
                          <Button
                            onClick={e => {
                              setOpenQCReportDialog(true);
                            }}
                            className="btn primary-btn"
                          >
                            QC Report
                          </Button>
                        ) : (
                          ""
                        )} */}
                        {CoreOrderDetails.order_designed_person_id === USER_ID ? (
                          <>
                            {(CoreOrderDetails.order_design_stage === "1" || CoreOrderDetails.order_design_stage === "4") && CoreOrderDetails.order_images_f.length > 0 ? (
                              <Button onClick={e => handleOrderMoveToQC()} className="btn success-btn ms-2" startIcon={<TbShieldCheckered />}>
                                Move to QC
                              </Button>
                            ) : (
                              <Badge bg="danger" className="ms-2">
                                Yet to Add Documents
                              </Badge>
                            )}
                          </>
                        ) : (
                          <Badge bg="danger" className="ms-2">
                            Already Assigned Another Designer
                          </Badge>
                        )}
                      </>
                    ) : (
                      <Badge bg="warning" className="mx-2">
                        Assign to Designer
                      </Badge>
                    )}
                  </>
                ) : (
                  ""
                )}
              </>
            ) : (
              ""
            )}
          </MyDiv>
        </Col>
      </MyDiv>
          {showDrawingTab ? (
              <DrawingDetailsTab
                  orderId={CoreOrderDetails.d_order_unique_id}
                  mongoId={CoreOrderDetails._id}
                  onDesignDelete={() => {
                    loadSubItems();
                    fetchColorCount();
                  }}
                  currentPage={"designers"}
                  type={"order"}
                  showEditDelete={CoreOrderDetails.order_designed_person_id === USER_ID}
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
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {orders?.length ? (
                      orders.map((item, index) => (
                        <React.Fragment key={item._id}>
                          <TableRow className={item.order_item_exact_fold > 10 || item.order_item_exact_grith >= (item.product_Color.toUpperCase().startsWith("GALVANISED") ? 1220 : 1203) ? "OrderGFExceed" : null}>
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
        </>
      )}
      {/* AWF tab content */}
      {activeDesignTab === "AWF" && (
        <>
          <MyDiv className="GeneralHeading">
            <Col md={7}></Col>
            <Col md={5} className="d-flex justify-content-end">
              <MyDiv className="ms-2 d-flex align-items-center">
                {CoreOrderDetails.order_designed_person_id === USER_ID && CoreOrderDetails.order_status !== "Order Cancelled" && (
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
                            enteredDate: CoreOrderDetails?.created_str,
                            customerPoNumber: CoreOrderDetails?.d_order_customer_PO_number,
                            currentPage: "designers",
                            partGroup: "AWF",
                          }
                        });
                      });
                    }}
                    className="btn primary-btn"
                    style={{ whiteSpace: 'nowrap', marginRight: '10px' }}>
                    Add AWF Product
                  </Button>
                )}
              </MyDiv>
            </Col>
          </MyDiv>
          <AWFDetailsTab
            orderId={CoreOrderDetails.d_order_unique_id}
            mongoId={CoreOrderDetails._id}
            onEntryDelete={() => orderUpdates()}
            currentPage={"designers"}
            type={"order"}
            showEditDelete={CoreOrderDetails.order_designed_person_id === USER_ID}
          />
        </>
      )}
      <Dialog open={openQCReportDialog} onClose={handleCloseQCReportDialog} fullWidth maxWidth="md" className="GeneralModal">
        <DialogTitle>QC Log Reports</DialogTitle>
        <DialogContent>
          <MyDiv className="documentContainer">
            <Row>
              {qcFailedShapeIDs.length > 0 ? (
                qcFailedShapeIDs.map((item, index) => (
                  <Col key={index} md={12} className="mb-3">
                    <MyDiv>
                      <StrongTag>
                        QC Log Date: {moment(item.def_created).format("DD-MM-YYYY")} / QC - {item.def_qced_person}
                      </StrongTag>
                      <Row className="mt-2">{item.def_Design_Shape_Id.length > 0 ? item.def_Design_Shape_Id.map((item, index) => <Col md={12}> SID - {item}</Col>) : <NoDataFound />}</Row>
                    </MyDiv>
                  </Col>
                ))
              ) : (
                <NoDataFound />
              )}
            </Row>
          </MyDiv>
        </DialogContent>
        <DialogActions>
          <Row className="dialogFooter">
            <Col md={12} className="d-flex justify-content-end">
              <Button onClick={handleCloseQCReportDialog} className="btn primary-btn mb-2 ">
                Close
              </Button>
            </Col>
          </Row>
        </DialogActions>
      </Dialog>
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
