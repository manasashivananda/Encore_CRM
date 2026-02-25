import React, { useState, useEffect, useCallback, startTransition, useRef } from "react";
import { Row, Col, Badge } from "react-bootstrap";
import { HeadingTwo, HeadingFour, MyDiv, StrongTag, HeadingFive } from "../../Common/Components";
import { useParams, useNavigate } from "react-router-dom";
import { TableBody, Table, TableContainer, TableHead, TableRow, TableCell, Tooltip, IconButton, Button, Dialog, DialogTitle, DialogContent, DialogActions, Switch } from "@mui/material";
import axios from "axios";
import swal from "sweetalert2";
import NoDataFound from "../../Common/noDataFound";
import moment from "moment";
import { TbShieldCheckered } from "react-icons/tb";
import { LuRefreshCw } from "react-icons/lu";
import { FaArrowUp, FaArrowDown } from "react-icons/fa";
import PropTypes from "prop-types";
import DrawingDetailsTab from "../../Drawings/DrawingDetailsTab";
import { Spinner } from "react-bootstrap";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


const API_TOKEN = localStorage.getItem("token");
const USER_ID = localStorage.getItem("userId");
function DesignToolQuotes({ CoreOrderDetails, orderUpdates }) {
  let { id } = useParams();
  let navigate = useNavigate();
  const [quotes, setQuotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [openQCReportDialog, setOpenQCReportDialog] = useState(false);

  //Code Added By Rahul
  const [refreshFlashing, setRefreshFlashing] = useState(false);
  // Add toggle state
  const [showDrawingTab, setShowDrawingTab] = useState(true);

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

  // Add this state at the top with other states
    const [loadingDrawingCounts, setLoadingDrawingCounts] = useState(false);
    const [drawingCounts, setDrawingCounts] = useState({ colorCount: 0, totalDrawings: 0, totalPieces: 0 });
  // Code Ended By Rahul 

  //code change by rahul
  // Add this function to fetch color count
  const fetchColorCount = useCallback(async () => {
    if (!CoreOrderDetails?.quote_unique_id) return;
    
    setLoadingDrawingCounts(true);
    try {
      const response = await axios.get(
        `${API_BASE_URL}api/templates/get-drawing-counts/${CoreOrderDetails.quote_unique_id}`,
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
  }, [CoreOrderDetails?.quote_unique_id]);

  // Add useEffect to fetch color count when order details change
  useEffect(() => {
      fetchColorCount();
  }, [CoreOrderDetails?.quote_unique_id, fetchColorCount]);


  const loadSubItems = useCallback(async () => {
    setLoading(true);
    const url = API_BASE_URL + `fetch-quotation-flashings-from-designtool/` + id;
    axios
      .get(url, { headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" } })
      .then(res => {
        setQuotes(res.data);
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

    useEffect(() => {
      loadSubItems();
  }, [refreshFlashing, loadSubItems]);
  // Code Ended By Rahul;

  const orderFetchFromDesignTool = async () => {
    loadSubItems();
  };

  useEffect(() => {
    if (CoreOrderDetails?.quote_designed_person_fullName && orderUpdates) {
      loadSubItems();
    }
  }, [CoreOrderDetails?.quote_designed_person_fullName, loadSubItems, orderUpdates]);

  //QC Result Functions
  const [qcFailedShapeIDs, setQCFailedShapeIDs] = useState([]);
  const fetchQCFailedShapeIDs = useCallback(async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}qc-failed-quotation-shapeid-list/${id}`, {
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

  const handleQuoteMoveToQC = async () => {
    try {
      const url = `${API_BASE_URL}assign-quotation-to-qc/${id}`;
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
        text: "This Quote Successfully Moved to QC",
        icon: "success",
        type: "success",
      });
      navigate("/quotation/designers");
    } catch (error) {
      swal.fire({
        text: error.response.data,
        icon: "error",
        type: "error",
      });
    }
  };

  return (
    <React.Fragment>
      <div ref={topRef}></div>
      <MyDiv className="GeneralHeading">
        <Col md={1}>
          <HeadingTwo>Quote Item</HeadingTwo>
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
            {CoreOrderDetails?.quote_designed_person_fullName ? (
              <>
                {/* Code By Rahul */}
                {/* <Tooltip title="Fetch From Design Tool" className="me-2 ms-2">
                  <IconButton
                    aria-label="fingerprint"
                    sx={{ color: "#fff", width: "40px", height: "40px", backgroundColor: "#229b2c ", "&:hover": { backgroundColor: "#135c19" } }}
                    onClick={e => orderFetchFromDesignTool()}
                  >
                    <LuRefreshCw />
                  </IconButton>
                </Tooltip> */}
                {/* code by Rahul end */}
                {(CoreOrderDetails?.quote_flashing_checker && CoreOrderDetails.quote_designed_person_id === USER_ID) && (
                    <Button
                        disabled={!CoreOrderDetails?._id}
                        onClick={() => {
                        startTransition(() => {
                          navigate(`/quotes/${CoreOrderDetails?.quote_unique_id}/drawings/templates`, {
                            state: {
                                orderNumber: CoreOrderDetails?.quote_unique_id,
                                customerName: CoreOrderDetails?.account_Name,
                                customerId: CoreOrderDetails?.account_ID,
                                orderId: CoreOrderDetails?._id,
                                orderDeliveryDate: CoreOrderDetails?.quote_delivery_date_str,
                                customerPoNumber: CoreOrderDetails?.quote_customer_PO_number,
                                enteredDate: CoreOrderDetails?.created_str,
                                currentPage: "quotation/designers",
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
                {quotes.length !== 0 ? (
                  <>
                    {CoreOrderDetails?.quote_qced_person_fullName ? (
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
                    )}
                    {CoreOrderDetails?.quote_design_stage === "1" || CoreOrderDetails?.quote_design_stage === "4" ? (
                      <Button onClick={e => handleQuoteMoveToQC()} className="btn success-btn ms-2" startIcon={<TbShieldCheckered />}>
                        Move to QC
                      </Button>
                    ) : (
                      <Badge bg="danger" className="ms-2">
                        Yet to Add Documents
                      </Badge>
                    )}
                  </>
                ) : (
                  <Badge bg="warning" className="me-2 mt-2 d-flex">
                    Yet to Add line Items
                  </Badge>
                )}
              </>
            ) : (
              <Badge bg="warning" className="mx-2 mt-2">
                Assign to Designer
              </Badge>
            )}
          </MyDiv>
        </Col>
      </MyDiv>
        {showDrawingTab ? (
            <DrawingDetailsTab
                orderId={CoreOrderDetails.quote_unique_id}
                mongoId={CoreOrderDetails._id}
                showEditDelete={CoreOrderDetails.quote_designed_person_id === USER_ID}
                onDesignDelete={() => {
                  // setRefreshFlashing(prev => !prev)
                  loadSubItems()
                  fetchColorCount();
                }}
                currentPage={"quotation/designers"}
                type={"quote"}
            />
        ) : (
      <MyDiv className="GeneralTable">
        {loading ? (
          <HeadingFour className="text-center">Loading...</HeadingFour>
        ) : (
          <TableContainer>
            <Table className="bgGrey stripedTable" aria-label="Quote table">
              <TableHead>
                <TableRow>
                  <TableCell align="left">SI NO</TableCell>
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
                {quotes?.length ? (
                  quotes.map((item, index) => (
                    <React.Fragment key={item._id}>
                      <TableRow className={item.quote_item_exact_fold > 10 || item.quote_item_exact_grith >= (item.product_Color?.startsWith("GALVANISED") ? 1220 : 1203) ? "OrderGFExceed" : null}>
                        <TableCell align="left">{index + 1}</TableCell>
                        <TableCell align="left">
                          <StrongTag>
                            SID - {item.quote_item_shape_id} / {item.quote_item_code}
                          </StrongTag>
                          <br />
                          {item.quote_item_description}
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
                        <TableCell align="center">{item.quote_item_exact_grith}</TableCell>
                        <TableCell align="center">{item.product_Girth}</TableCell>
                        <TableCell align="center">
                          {item.product_Fold}
                          {item.quote_item_exact_fold > 10 ? <>({item.quote_item_exact_fold})</> : null}
                        </TableCell>
                        <TableCell align="center">{item.quote_item_length}</TableCell>
                        <TableCell align="center">{item.quote_item_pieces}</TableCell>
                        <TableCell align="center">{parseFloat(item.quote_item_quantity).toFixed(2)}</TableCell>
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
      {/* Scroll Toggle Button */}
      <div
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
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

export default DesignToolQuotes;

DesignToolQuotes.propTypes = {
  CoreOrderDetails: PropTypes.any,
  orderUpdates: PropTypes.any,
};
