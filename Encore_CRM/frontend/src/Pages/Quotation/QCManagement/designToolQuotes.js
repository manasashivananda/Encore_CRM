import React, { useState, useEffect, useCallback, startTransition, useRef } from "react";
import { Badge, Col, Spinner } from "react-bootstrap";
import { HeadingTwo, HeadingFour, MyDiv, StrongTag, HeadingFive } from "../../Common/Components";
import { useParams, useNavigate } from "react-router-dom";
import { TableBody, Table, TableContainer, TableHead, TableRow, TableCell, Tooltip, IconButton, FormControlLabel, Switch, Button } from "@mui/material";
import axios from "axios";
import NoDataFound from "../../Common/noDataFound";
import swal from "sweetalert2";
import { MdAssignmentInd } from "react-icons/md";
import { LuRefreshCw } from "react-icons/lu";
import { FaArrowUp, FaArrowDown } from "react-icons/fa";
import DrawingDetailsTab from "../../Drawings/DrawingDetailsTab";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function DesignToolQuotes({ CoreQuoteDetails, notification }) {
  let { id } = useParams();
  const [loading, setLoading] = useState(false);
  const [quotes, setQuotes] = useState([]);
  let navigate = useNavigate();

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
    if (!CoreQuoteDetails?.quote_unique_id) return;
    
    setLoadingDrawingCounts(true);
    try {
      const response = await axios.get(
        `${API_BASE_URL}api/templates/get-drawing-counts/${CoreQuoteDetails.quote_unique_id}`,
        {
          headers: {
            "x-access-token": `${localStorage.getItem("token")}`,
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
  }, [CoreQuoteDetails?.quote_unique_id]);

  // Add useEffect to fetch color count when order details change
  useEffect(() => {
      fetchColorCount();
  }, [CoreQuoteDetails?.quote_unique_id, fetchColorCount]);

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
    if (notification || CoreQuoteDetails.quote_designed_person_fullName) {
      loadSubItems();
    }
  }, [CoreQuoteDetails.quote_designed_person_fullName, loadSubItems, notification]);

  const orderFetchFromDesignTool = async () => {
    loadSubItems();
  };

  // Switch QC fails data functions
  const setAllSwitchesForShape = (quote_item_shape_id, isChecked) => {
    setQuotes(prevQuotes => prevQuotes.map(item => (item.quote_item_shape_id === quote_item_shape_id ? { ...item, isChecked } : item)));
  };
  const [selectedShapeIds, setSelectedShapeIds] = useState(new Set());

  const handleToggleSwitch = (quote_item_shape_id, isChecked) => {
    const updatedShapeIds = new Set(selectedShapeIds);
    if (isChecked) {
      updatedShapeIds.add(quote_item_shape_id);
      setAllSwitchesForShape(quote_item_shape_id, true);
    } else {
      updatedShapeIds.delete(quote_item_shape_id);
      setAllSwitchesForShape(quote_item_shape_id, false);
    }
    setSelectedShapeIds(updatedShapeIds);
  };

  function markAsQCFail() {
    const uniqueShapeIds = Array.from(selectedShapeIds);
    const quoteID = id;
    const payload = {
      quoteID: quoteID,
      shapeIDs: uniqueShapeIds,
    };
    axios
      .post(API_BASE_URL + "qc-failed-quotation-list-mark", payload, {
        headers: {
          "x-access-token": localStorage.getItem("token"),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      })
      .then(response => {
        swal.fire("Success", "Selected shapes marked as QC Fail.", "success");
        navigate("/quotation/quality-checking");
      })
      .catch(error => {
        swal.fire("Error", "Failed to mark shapes as QC Fail.", "error");
      });
  }
  // Switch QC fails data functions End

  const markAsQCPass = () => {
    const quoteID = id;
    axios
      .patch(API_BASE_URL + `assign-quotation-ready-to-myob/${quoteID}/F`, {}, { headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" } })
      .then(response => {
        swal.fire({ text: response.data || "Success", icon: "success", type: "success" });
        loadSubItems();
        navigate("/quotation/quality-checking");
      })
      .catch(error => {
        swal.fire({ text: error.response.data, icon: "error", type: "error" });
      });
  };
  return (
    <React.Fragment>
      <div ref={topRef}></div>
      <MyDiv className="GeneralHeading">
        <Col md={1} sm={12}>
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
        <Col md={7} sm={12} className="d-flex justify-content-end">
          {/* <Tooltip title="Fetch From Design Tool" className="me-2 ms-2">
            <IconButton
              aria-label="fingerprint"
              sx={{ color: "#fff", width: "40px", height: "40px", backgroundColor: "#229b2c ", "&:hover": { backgroundColor: "#135c19" } }}
              onClick={e => orderFetchFromDesignTool()}
            >
              <LuRefreshCw />
            </IconButton>
          </Tooltip> */}
          {/* Code By Rahul */}
          <MyDiv className="d-flex align-items-center">
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
          </MyDiv>
            {/* code by Rahul end */}
          {CoreQuoteDetails?.quote_design_stage === "3" ? (
            <MyDiv>
              <Button
                disabled={!CoreQuoteDetails?._id}
                onClick={() => {
                startTransition(() => {
                navigate(`/quotes/${CoreQuoteDetails?.quote_unique_id}/drawings/templates`, {
                state: {
                    orderNumber: CoreQuoteDetails?.quote_unique_id,
                    customerName: CoreQuoteDetails?.account_Name,
                    customerId: CoreQuoteDetails?.account_ID,
                    orderId: CoreQuoteDetails?._id,
                    orderDeliveryDate: CoreQuoteDetails?.quote_delivery_date_str,
                    customerPoNumber: CoreQuoteDetails?.quote_customer_PO_number,
                    enteredDate: CoreQuoteDetails?.created_str,
                    currentPage: "quotation/quality-checking",
                    partClass: "My Library",
                        }
                    });
                });
                }}
                className="btn primary-btn"
                style={{ whiteSpace: 'nowrap', marginRight: '10px' }}>

                Add a Design
              </Button>
              <Button onClick={e => markAsQCFail()} className="btn primary-btn " startIcon={<MdAssignmentInd />}>
                Mark As QC Fail
              </Button>
              <Button onClick={e => markAsQCPass()} className="btn success-btn mx-2" startIcon={<MdAssignmentInd />}>
                Mark as Completed
              </Button>
            </MyDiv>
            ): (
            ""
          )}
        </Col>
      </MyDiv>
      {showDrawingTab ? (
                  <DrawingDetailsTab
                      orderId={CoreQuoteDetails.quote_unique_id} 
                      mongoId={CoreQuoteDetails._id}
                      showEditDelete={CoreQuoteDetails?.quote_design_stage === "3"}
                      onDesignDelete={() => {
                        // setRefreshFlashing(prev => !prev)
                        loadSubItems()
                        fetchColorCount();
                      }}
                      currentPage={"quotation/quality-checking"}
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
                  <TableCell align="center">QC Result</TableCell>
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
                        <TableCell>
                          {CoreQuoteDetails?.CoreQuoteDetails?.quote_design_stage === "3" ? (
                            <FormControlLabel
                              control={
                                <Switch
                                  color="warning"
                                  checked={Boolean(item.isChecked ? item.isChecked : "")} // Use the isChecked state here
                                  onChange={e => handleToggleSwitch(item.quote_item_shape_id, e.target.checked)}
                                />
                              }
                              label="Fail"
                              labelPlacement="end"
                            />
                          ) : (
                            ""
                          )}
                        </TableCell>
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
