import React, { useState, useEffect, useCallback, startTransition, useRef } from "react";
import { Row, Col, Badge, Card, Spinner } from "react-bootstrap";
import { HeadingTwo, HeadingFour, MyDiv, StrongTag, SpanTag, CurrencyDisplay, HeadingFive } from "../Common/Components";
import { useNavigate, useParams } from "react-router-dom";
import { TableBody, Table, TableContainer, TableHead, TableRow, TableCell, IconButton, Tooltip, Drawer, Button, Box, Switch } from "@mui/material";
import { MdOutlineModeEditOutline, MdDelete } from "react-icons/md";
import axios from "axios";
import FormQuoteItem from "./formQuoteItem";
import FormCustomQuoteItem from "./formCustomQuote";
import swal from "sweetalert2";
import { Tabs, Tab } from "@mui/material";
import { FiLoader } from "react-icons/fi";
import { VscGitFetch } from "react-icons/vsc";
import { FaArrowUp, FaArrowDown } from "react-icons/fa";
import { DragDropContext, Draggable, Droppable } from "@hello-pangea/dnd";
import DrawingDetailsTab from "../Drawings/DrawingDetailsTab";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

const API_TOKEN = localStorage.getItem("token");
const RolePermission = JSON.parse(localStorage.getItem("role"));

function OrderItemManage({ quoteUpdates, CoreQuotationDetails }) {
  let { id } = useParams();
  const [customOrders, setCustomOrders] = useState("");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState("");
  const [activeTab, setActiveTab] = useState("All");
  const [selectedRows, setSelectedRows] = useState([]);

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

  const loadCustomItems = useCallback(async () => {
    setLoading(true);
    const url = API_BASE_URL + `fetch-quotation-lineitems-details/` + id;
    axios
      .get(url, { headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" } })
      .then(res => {
        setCustomOrders(res.data);
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
    loadCustomItems();
  }, [loadCustomItems, CoreQuotationDetails]);

  // const OrderDeleteId = async item => {
  //   const url = API_BASE_URL + `delete-specific-manual-entry-quotation-item/${item._id}/${item.quote_item_me_department}`;
  //   swal
  //     .fire({
  //       title: "Are you sure?",
  //       text: "You won't be able to revert this!",
  //       icon: "warning",
  //       showCancelButton: true,
  //       customClass: {
  //         confirmButton: "primary-btn",
  //         cancelButton: "secondary-btn",
  //       },
  //       confirmButtonText: "Yes, delete it!",
  //     })
  //     .then(result => {
  //       if (result.isConfirmed) {
  //         axios.get(url, { headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" } }).then(
  //           res => {
  //             setCustomOrders(res.data);
  //             //loadSubItems();
  //             loadCustomItems();
  //             quoteUpdates();
  //             if (res.status === 200) {
  //               swal.fire("Deleted!", "Your file has been deleted.", "success");
  //             } else {
  //               swal.fire("Sorry :(", "Your file has been deleted.", "error");
  //             }
  //           },
  //           error => {
  //             //alert('Order fetching failed: ' + error)
  //           }
  //         );
  //       }
  //     });
  // };

  const OrderDeleteId = async item => {
    const url = API_BASE_URL + `delete-specific-manual-entry-quotation-item/${item._id}/${item.quote_item_me_department}`;
    swal
      .fire({
        title: "Are you sure?",
        text: "You won't be able to revert this!",
        icon: "warning",
        showCancelButton: true,
        customClass: {
          confirmButton: "primary-btn",
          cancelButton: "secondary-btn",
        },
        confirmButtonText: "Yes, delete it!",
      })
      .then(async result => {
        if (result.isConfirmed) {
          try {
            const res = await axios.get(url, {
              headers: {
                "x-access-token": localStorage.getItem("token"),
                Accept: "application/json",
                "Content-Type": "application/json",
              },
            });

            if (res.status === 200) {
              swal.fire("Deleted!", "Your file has been deleted.", "success");
              const loadUrl = API_BASE_URL + `fetch-quotation-lineitems-details/` + id;
              const loadRes = await axios.get(loadUrl, {
                headers: {
                  "x-access-token": localStorage.getItem("token"),
                  Accept: "application/json",
                  "Content-Type": "application/json",
                },
              });
              const updatedOrders = Array.isArray(loadRes.data) ? loadRes.data : [];
              setCustomOrders(updatedOrders);
              quoteUpdates();
              // Use departments field to match JSX filtering
              const departmentToCheck = item.departments?.trim().toLowerCase();
              // Check remaining items in the department
              const remainingItemsInDepartment = updatedOrders.filter(dataItem => dataItem.departments?.trim().toLowerCase() === departmentToCheck);
              // Get available tabs
              const availableTabs = tabs.map(tab => tab.props.value.toLowerCase());
              if (remainingItemsInDepartment.length === 0) {
                setActiveTab("All");
              } else if (!availableTabs.includes(activeTab.toLowerCase())) {
                setActiveTab("All");
              } else {
                console.log("Items remain in department, staying on current tab:", activeTab);
              }
            } else {
              swal.fire("Sorry :(", "Your file has not been deleted.", "error");
            }
          } catch (error) {
            swal.fire("Error", "Deletion failed. Please try again.", "error");
          }
        }
      });
  };

  /* Search Module */

  const [userDrawerState, setOrderDrawerState] = React.useState(false);
  const [flashingOrderDrawerState, setFlashingOrderDrawerState] = React.useState(false);
  const handleOrderDrawerToggle = () => {
    setData();
    userDrawerState === false ? setOrderDrawerState(true) : setOrderDrawerState(false);
  };
  const handleFlashingOrderDrawerToggle = () => {
    setData();
    flashingOrderDrawerState === false ? setFlashingOrderDrawerState(true) : setFlashingOrderDrawerState(false);
  };
  const OrderEditId = _id => {
    userDrawerState === false ? setOrderDrawerState(true) : setOrderDrawerState(false);
    setData(_id);
  };
  const FlashingOrderEditId = _id => {
    flashingOrderDrawerState === false ? setFlashingOrderDrawerState(true) : setFlashingOrderDrawerState(false);
    setData(_id);
  };

  const updateFlashingDrawer = () => {
    flashingOrderDrawerState === false ? setFlashingOrderDrawerState(true) : setFlashingOrderDrawerState(false);
    loadCustomItems();
    quoteUpdates();
  };

  const updateDrawer = () => {
    userDrawerState === false ? setOrderDrawerState(true) : setOrderDrawerState(false);
    loadCustomItems();
    quoteUpdates();
  };
  const updatedLineItem = () => {
    loadCustomItems();
    quoteUpdates();
  };
  // eslint-disable-next-line
  const [tabData, setTabData] = useState({
    approxCount: "",
    department: "",
  });

  const handleTabChange = (event, newTab) => {
    setActiveTab(newTab);

    if (newTab === "Flashing") {
      setIsEditing(false);
      setTabData({
        approxCount: CoreQuotationDetails.f_quote_dept_approx_count,
        department: "F",
      });
    } else if (newTab === "Jobbing") {
      setIsEditing(false);
      setTabData({
        approxCount: CoreQuotationDetails.j_quote_dept_approx_count,
        department: "J",
      });
    } else if (newTab === "Fascia Gutter") {
      setIsEditing(false);
      setTabData({
        approxCount: CoreQuotationDetails.fg_quote_dept_approx_count,
        department: "FG",
      });
    } else if (newTab === "Cladding") {
      setIsEditing(false);
      setTabData({
        approxCount: CoreQuotationDetails.cl_quote_dept_approx_count,
        department: "CL",
      });
    } else if (newTab === "Roofing") {
      setIsEditing(false);
      setTabData({
        approxCount: CoreQuotationDetails.cl_quote_dept_approx_count,
        department: "Roof",
      });
    }
  };
  // eslint-disable-next-line
  const [isEditing, setIsEditing] = useState(false);
  // eslint-disable-next-line
  const [mailBtnLoadingMap, setMailBtnLoadingMap] = useState(false);

  const quoteFetchFromDesignTool = useCallback(async () => {
    setLoading(true);
    const url = API_BASE_URL + `fetch-quotation-flashings-from-designtool-manually/` + id;
    axios
      .post(url, {}, { headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" } })
      .then(res => {
        //setOrders(res.data)
        loadCustomItems();
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
  }, [id, loadCustomItems]);

  // Drag Table Row Code
  const toggleRowSelection = (rowId, event) => {
    if (event.target.closest(".TableEditDel")) {
      return;
    }
    if (selectedRows.includes(rowId)) {
      setSelectedRows(selectedRows.filter(id => id !== rowId));
    } else {
      setSelectedRows([...selectedRows, rowId]);
    }
  };

  const onDragEnd = async result => {
    const { destination, source } = result;
    if (!destination) return;
    const draggedItems = selectedRows.length > 0 ? selectedRows : [customOrders[source.index]._id];
    const newCustomOrders = Array.from(customOrders);
    const itemsToMove = newCustomOrders.filter(item => draggedItems.includes(item._id));
    const remainingItems = newCustomOrders.filter(item => !draggedItems.includes(item._id));
    remainingItems.splice(destination.index, 0, ...itemsToMove);
    setCustomOrders(remainingItems);
    setSelectedRows([]);
    const reorderedData = remainingItems.map(item => ({
      _id: item._id,
      quote_item_flag: item.quote_item_flag || item.quote_item_me_flag,
    }));
    await updateOrderLineItems(reorderedData);
  };

  const updateOrderLineItems = async quoteItems => {
    try {
      await axios.post(
        `${API_BASE_URL}update-quote-dragged-lineitems/${id}`,
        {
          lineItems: quoteItems,
        },
        {
          headers: {
            "x-access-token": localStorage.getItem("token"),
            Accept: "application/json",
            "Content-Type": "application/json",
          },
        }
      );
    } catch (error) {
      swal.fire({
        text: "Failed to save reordered items. Please try again.",
        icon: "error",
        type: "error",
      });
    }
  };

  const moveToProduction = department => {
    const url = `${API_BASE_URL}assign-quotation-ready-to-myob/${id}/${department}`;
    axios
      .patch(
        url,
        {},
        {
          headers: {
            "x-access-token": localStorage.getItem("token"),
            Accept: "application/json",
            "Content-Type": "multipart/form-data",
          },
        }
      )
      .then(res => {
        if (res.status === 200) {
          loadCustomItems();
          swal.fire("Success", "An Order Successfully Moved to Production", "success");
          if (quoteUpdates && typeof quoteUpdates.loadSpecificOrder === "function") {
            quoteUpdates.loadSpecificOrder(res.data);
          }
          quoteUpdates();
        }
      })
      .catch(error => {
        swal.fire({
          text: error.response.data,
          icon: "error",
        });
      });
  };

  const tabs = [<Tab key="all" label="All" value="All" />];

  if (CoreQuotationDetails && CoreQuotationDetails.quote_status !== "Order Cancelled") {
    if (CoreQuotationDetails.quote_flashing_checker === true) {
      tabs.push(<Tab key="flashing" label="Flashing" value="Flashing" />);
    }
    if (CoreQuotationDetails.j_quote_prod_push_status && CoreQuotationDetails.j_quote_prod_push_status !== 0) {
      tabs.push(<Tab key="jobbing" label="Jobbing" value="Jobbing" />);
    }
    if (CoreQuotationDetails.fg_quote_prod_push_status && CoreQuotationDetails.fg_quote_prod_push_status !== 0) {
      tabs.push(<Tab key="fascia-gutter" label="Fascia Gutter" value="Fascia Gutter" />);
    }
    if (CoreQuotationDetails.cl_quote_prod_push_status && CoreQuotationDetails.cl_quote_prod_push_status !== 0) {
      tabs.push(<Tab key="cladding" label="Cladding" value="Cladding" />);
    }
    if (CoreQuotationDetails.gbi_quote_prod_push_status && CoreQuotationDetails.gbi_quote_prod_push_status !== 0) {
      tabs.push(<Tab key="gbi" label="GBI" value="GBI" />);
    }
    if (CoreQuotationDetails.roof_quote_prod_push_status && CoreQuotationDetails.roof_quote_prod_push_status !== 0) {
      tabs.push(<Tab key="roofing" label="Roofing" value="Roofing" />);
    }
    if (CoreQuotationDetails.gbil_quote_prod_push_status && CoreQuotationDetails.gbil_quote_prod_push_status !== 0) {
      tabs.push(<Tab key="gbil" label="GBIL" value="GBIL" />);
    }
  }

  // Add this state at the top with other states
    const [loadingDrawingCounts, setLoadingDrawingCounts] = useState(false);
    const [drawingCounts, setDrawingCounts] = useState({ colorCount: 0, totalDrawings: 0, totalPieces: 0 });
  // Code Ended By Rahul 
  const navigate = useNavigate();

  //code change by rahul
  // Add this function to fetch color count
  const fetchColorCount = useCallback(async () => {
    if (!CoreQuotationDetails?.quote_unique_id) return;
    
    setLoadingDrawingCounts(true);
    try {
      const response = await axios.get(
        `${API_BASE_URL}api/templates/get-drawing-counts/${CoreQuotationDetails.quote_unique_id}`,
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
  }, [CoreQuotationDetails?.quote_unique_id]);

  // Add useEffect to fetch color count when order details change
  useEffect(() => {
    if (activeTab === 'Flashing' && CoreQuotationDetails?.quote_unique_id) {
      fetchColorCount();
    }
  }, [activeTab, CoreQuotationDetails?.quote_unique_id, fetchColorCount]);
  return (
    <React.Fragment>
      <div ref={topRef}></div>
      <MyDiv>
        <Row className="GeneralHeading pb-0 flex-wrap pb-2">
          <Col md={8} xs={6} className="d-flex flex-wrap">
            <HeadingTwo className="me-5">Order Item</HeadingTwo>
          </Col>
          <Col md={4} xs={6} className="text-end">
            {CoreQuotationDetails.quote_status !== "Quote Converted To SO" ? (
              <MyDiv>
                <Button onClick={e => handleOrderDrawerToggle()} className="btn primary-btn">
                  Add Custom Item
                </Button>
              </MyDiv>
            ) : (
              <Badge className="orderMovedToMyobBadge">Quote Converted to Order</Badge>
            )}
          </Col>
        </Row>
      </MyDiv>
      <MyDiv className="GeneralHeading pb-0 flex-wrap mt-2">
        <Row>
          <Col md={12}>
            <Box sx={{ maxWidth: { xs: 320, md: 1400 }, bgcolor: "background.paper" }}>
              <Tabs value={activeTab} onChange={handleTabChange} variant="scrollable" scrollButtons="auto" TabIndicatorProps={{ sx: { backgroundColor: "#d22530" } }} sx={{ "& .MuiTab-root": { color: "#000" }, "& .Mui-selected": { color: "#d22530" } }}>
                {tabs}
              </Tabs>
            </Box>
          </Col>
        </Row>
      </MyDiv>
      {activeTab === "All" && (
        <MyDiv className="GeneralTable">
          {loading ? (
            <MyDiv className="BulkUploadLoader">
              <SpanTag>
                <MyDiv className="lds-ring">
                  <MyDiv></MyDiv>
                  <MyDiv></MyDiv>
                  <MyDiv></MyDiv>
                  <MyDiv></MyDiv>
                </MyDiv>
                <br />
                Page Loading. Please Wait...
              </SpanTag>
            </MyDiv>
          ) : (
            <>
              <DragDropContext onDragEnd={onDragEnd}>
                <Droppable droppableId="droppable" direction="vertical">
                  {provided => (
                    <TableContainer ref={provided.innerRef} {...provided.droppableProps}>
                      <Table className="bgGrey stripedTable" aria-label="Order table">
                        <TableHead>
                          <TableRow>
                            <TableCell align="left" width="70px">
                              S No
                            </TableCell>
                            <TableCell align="left">Shape ID / Item Code / Desc</TableCell>
                            <TableCell align="left">Material Name</TableCell>
                            <TableCell align="left">Color</TableCell>
                            <TableCell align="center" title="Color Spl Price %">
                              CSP %
                            </TableCell>
                            <TableCell align="center">Exact Girth</TableCell>
                            <TableCell align="center" title="Rounded Off Girth">
                              ROG
                            </TableCell>
                            <TableCell align="center">Folds</TableCell>
                            <TableCell align="center">Pieces</TableCell>
                            <TableCell align="center">Length </TableCell>
                            <TableCell align="center">UOM</TableCell>
                            <TableCell align="center" title="Quantity">
                              QTY
                            </TableCell>
                            <TableCell align="center">Unit Price</TableCell>
                            <TableCell align="center">Ext. Price</TableCell>
                            <TableCell align="center" title="Discount Percentage">
                              Dis %
                            </TableCell>
                            <TableCell align="center" title="Discount Amount">
                              Dis. Amt
                            </TableCell>
                            <TableCell align="center" title="Discount Unit Price">
                              DUP
                            </TableCell>
                            <TableCell align="center">Amt</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {customOrders?.length ? (
                            customOrders.map((item, index) => (
                              <React.Fragment key={item._id}>
                                <Draggable key={item._id} draggableId={item._id} index={index} isDragDisabled={true}>
                                  {provided => (
                                    <TableRow ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps} onClick={event => toggleRowSelection(item._id, event)} className={` ${item.departments ? `Department-${item.departments.trim().replace(/[.\s-]/g, "")}` : ""} }`}>
                                      <TableCell align="center">{index + 1}</TableCell>
                                      {item.quote_item_me_flag === "ME" ? (
                                        <>
                                          <TableCell align="left">
                                            <StrongTag>
                                              {item.quote_item_me_code} - ({item.departments})
                                            </StrongTag>
                                            <br />
                                            {item.quote_item_me_description}
                                          </TableCell>
                                          <TableCell align="center">-</TableCell>
                                          <TableCell align="center">-</TableCell>
                                          <TableCell align="center">-</TableCell>
                                          <TableCell align="center">-</TableCell>
                                          <TableCell align="center">-</TableCell>
                                          <TableCell align="center">-</TableCell>
                                          <TableCell align="center">{item.departments === "Delivery Charges" ? " " : item.quote_item_me_uom_value}</TableCell>
                                          <TableCell align="center">{item.departments === "Delivery Charges" ? " " : item.quote_item_me_length}</TableCell>
                                          <TableCell align="center">{item.departments === "Delivery Charges" ? " " : item.quote_item_me_uom}</TableCell>
                                          <TableCell align="center">
                                            {/* {item.departments === 'Delivery Charges' ? " " : (isNaN(item.quote_item_me_quantity) ? "" : parseFloat(item.quote_item_me_quantity).toFixed(2))} */}

                                            {item.departments === "Delivery Charges" ? " " : item.departments === "Roofing" ? (isNaN(item.quote_item_me_quantity) ? "" : parseFloat(item.quote_item_me_quantity).toFixed(2)) : isNaN(item.quote_item_me_quantity) ? "" : parseFloat(item.quote_item_me_quantity).toFixed(2)}
                                          </TableCell>
                                          <TableCell align="right">
                                            <CurrencyDisplay value={item.quote_item_qty_me_price} currency="AUD" locale="en-US" />
                                          </TableCell>
                                          <TableCell align="right">
                                            <CurrencyDisplay value={item.quote_item_special_me_price_original ? item.quote_item_special_me_price_original : "0"} currency="AUD" locale="en-US" />
                                          </TableCell>
                                          <TableCell align="right">{item.quote_item_me_discount ? item.quote_item_me_discount : "0"}%</TableCell>
                                          <TableCell align="right">
                                            <CurrencyDisplay value={item.quote_item_me_discounted_amount ? item.quote_item_me_discounted_amount : "0"} currency="AUD" locale="en-US" />
                                          </TableCell>
                                          <TableCell align="right">
                                            <CurrencyDisplay value={item.quote_item_qty_me_discounted_price ? item.quote_item_qty_me_discounted_price : "0"} currency="AUD" locale="en-US" />
                                          </TableCell>
                                          <TableCell align="right" className="TableEditDelTd">
                                            <StrongTag>
                                              <CurrencyDisplay value={item.quote_item_special_me_price ? item.quote_item_special_me_price : "0"} currency="AUD" locale="en-US" />
                                            </StrongTag>
                                            {CoreQuotationDetails.quote_status !== "Quote Converted To SO" ? (
                                              <MyDiv className="TableEditDel">
                                                <Tooltip title="Edit">
                                                  <IconButton aria-label="fingerprint" color="success" onClick={e => OrderEditId(item)}>
                                                    <MdOutlineModeEditOutline />
                                                  </IconButton>
                                                </Tooltip>
                                                <Tooltip title="Delete">
                                                  <IconButton aria-label="fingerprint" color="secondary" onClick={e => OrderDeleteId(item)}>
                                                    <MdDelete />
                                                  </IconButton>
                                                </Tooltip>
                                              </MyDiv>
                                            ) : (
                                              ""
                                            )}
                                          </TableCell>
                                        </>
                                      ) : (
                                        <>
                                          <TableCell align="left">
                                            <StrongTag>
                                              SID - {item.quote_item_shape_id} / {item.quote_item_code}
                                            </StrongTag>
                                            <br />
                                            {item.quote_item_description}
                                          </TableCell>
                                          <TableCell align="left">{item.core_Product_Thickness + " - " + item.core_Product_Name}</TableCell>
                                          <TableCell align="left">{item.product_Color}</TableCell>
                                          <TableCell align="center">{item.product_Color_Special_Price} %</TableCell>
                                          <TableCell align="center">{item.quote_item_exact_grith}</TableCell>
                                          <TableCell align="center">{item.product_Girth}</TableCell>
                                          <TableCell align="center">
                                            {item.product_Fold}
                                            {item.quote_item_exact_fold > 10 ? <>({item.quote_item_exact_fold})</> : null}
                                          </TableCell>
                                          <TableCell align="center">{item.quote_item_pieces}</TableCell>
                                          <TableCell align="center">{item.quote_item_length}</TableCell>
                                          <TableCell align="center">LN MTR</TableCell>
                                          <TableCell align="center">{parseFloat(item.quote_item_quantity).toFixed(2)}</TableCell>
                                          <TableCell align="right">
                                            <CurrencyDisplay value={item.quote_item_price} currency="AUD" locale="en-US" />
                                          </TableCell>
                                          <TableCell align="right">
                                            <CurrencyDisplay value={item.quote_item_special_price_original ? item.quote_item_special_price_original : "0"} currency="AUD" locale="en-US" />
                                          </TableCell>
                                          <TableCell align="right">{item.quote_item_discount ? item.quote_item_discount : "0"}%</TableCell>
                                          <TableCell align="right">
                                            <CurrencyDisplay value={item.quote_item_discounted_amount ? item.quote_item_discounted_amount : "0"} currency="AUD" locale="en-US" />
                                          </TableCell>
                                          <TableCell align="right">
                                            <CurrencyDisplay value={item.quote_item_qty_discounted_price ? item.quote_item_qty_discounted_price : "0"} currency="AUD" locale="en-US" />
                                          </TableCell>
                                          <TableCell align="right" className="TableEditDelTd">
                                            <StrongTag>
                                              <CurrencyDisplay value={item.quote_item_special_price ? item.quote_item_special_price : "0"} currency="AUD" locale="en-US" />
                                            </StrongTag>
                                            {CoreQuotationDetails?.f_quote_prod_push_status === 2 && CoreQuotationDetails.quote_status !== "Quote Converted To SO" ? (
                                              <MyDiv className="TableEditDel">
                                                <Tooltip title="Edit">
                                                  <IconButton aria-label="fingerprint" color="success" onClick={e => FlashingOrderEditId(item)}>
                                                    <MdOutlineModeEditOutline />
                                                  </IconButton>
                                                </Tooltip>
                                              </MyDiv>
                                            ) : (
                                              ""
                                            )}
                                          </TableCell>
                                        </>
                                      )}
                                    </TableRow>
                                  )}
                                </Draggable>
                              </React.Fragment>
                            ))
                          ) : (
                            <></>
                          )}
                        </TableBody>
                      </Table>
                      {provided.placeholder}
                    </TableContainer>
                  )}
                </Droppable>
              </DragDropContext>
              {/* Right-click context menu */}
            </>
          )}
        </MyDiv>
      )}
      {activeTab === "Flashing" && (
        <React.Fragment>
          <MyDiv className="orderTabSummery ProfileBasicDetail order-profile mt-2">
            <Card className="ProfileBasicDetailLeftHeader">
              <Row>
                {/* <Col md={3}>
                  {CoreQuotationDetails.f_quote_prod_push_status === 2 && CoreQuotationDetails.quote_status !== "Quote Converted To SO" ? (
                    <Tooltip title="Fetch From Design Tool" className="me-2 ms-2">
                      <IconButton aria-label="fingerprint" sx={{ color: "#fff", backgroundColor: "#229b2c ", "&:hover": { backgroundColor: "#135c19" } }} onClick={e => quoteFetchFromDesignTool()}>
                        <VscGitFetch />
                      </IconButton>
                    </Tooltip>
                  ) : (
                    ""
                  )}
                </Col> */}
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
                <Col md={8}>
                  <MyDiv className="d-flex justify-content-end align-items-center">
                    {CoreQuotationDetails.f_quote_prod_push_status === "4" ? (
                      <Badge className="orderMovedToMyobBadge">Quote Converted to Order</Badge>
                    ) : (
                      <>

                        {/* Code By Rahul */}
                        <HeadingFive>Table</HeadingFive>
                        <Tooltip title="Toggle Drawing/Order View" className='me-2'>
                            <Switch
                                checked={showDrawingTab}
                                onChange={() => setShowDrawingTab(prev => {
                                  if (prev) {
                                    loadCustomItems();
                                  }
                                  return !prev;
                                })}
                                color="primary"
                            />
                        </Tooltip>
                        <HeadingFive>Drawings</HeadingFive>
                        {RolePermission?.DrawingAccess?.add === "1" && CoreQuotationDetails.quote_status !== "Quote Converted To SO" && CoreQuotationDetails.quote_design_stage === '5' && (
                          <Button
                            disabled={!CoreQuotationDetails?._id}
                            onClick={() => {
                            startTransition(() => {
                            navigate(`/quotes/${CoreQuotationDetails?.quote_unique_id}/drawings/templates`, {
                            state: {
                                orderNumber: CoreQuotationDetails?.quote_unique_id,
                                customerName: CoreQuotationDetails?.account_Name,
                                customerId: CoreQuotationDetails?.account_ID,
                                orderId: CoreQuotationDetails?._id,
                                orderDeliveryDate: CoreQuotationDetails?.quote_delivery_date_str,
                                customerPoNumber: CoreQuotationDetails?.quote_customer_PO_number,
                                enteredDate: CoreQuotationDetails?.created_str,
                                currentPage: "quotation/master",
                                partClass: "My Library",
                                    }
                                });
                            });
                            }}
                            className="btn primary-btn"
                            style={{ whiteSpace: 'nowrap', marginLeft: '10px' }}>
  
                            Add a Design
                          </Button>)}
                        {/* code by Rahul end */}
                        {CoreQuotationDetails.f_quote_prod_push_status === 2 ? (
                          <>
                            <Badge className="orderMovedToMyobBadge">Marked Completed</Badge>
                            {mailBtnLoadingMap ? (
                              <IconButton aria-label="fingerprint" color="info" className="IconBtnLoader">
                                <FiLoader />
                              </IconButton>
                            ) : (
                              <></>
                            )}
                          </>
                        ) : (
                          ""
                        )}
                      </>
                    )}
                  </MyDiv>
                </Col>
              </Row>
            </Card>
          </MyDiv>
          {showDrawingTab ? (
                <DrawingDetailsTab
                    orderId={CoreQuotationDetails.quote_unique_id} 
                    mongoId={CoreQuotationDetails._id}
                    showEditDelete={RolePermission.DrawingAccess?.edit === "1" && CoreQuotationDetails.quote_status !== "Quote Converted To SO"}
                    onDesignDelete={() => {
                      // setRefreshFlashing(prev => !prev)
                      loadCustomItems();
                      fetchColorCount();
                      quoteUpdates();
                    }}
                    currentPage={"quotation/master"}
                    type={"quote"}
                />
            ) : (
          <MyDiv className="GeneralTable mt-2">
            {loading ? (
              <HeadingFour className="text-center">Loading...</HeadingFour>
            ) : (
              <TableContainer>
                <Table className="bgGrey stripedTable" aria-label="Order table">
                  <TableHead>
                    <TableRow>
                      <TableCell align="left" width="70px">
                        S No
                      </TableCell>
                      <TableCell align="left">Shape ID / Item Code / Desc</TableCell>
                      <TableCell align="left">Material Name</TableCell>
                      <TableCell align="left">Color</TableCell>
                      <TableCell align="center">Color Spl Price %</TableCell>
                      <TableCell align="center">Exact Girth</TableCell>
                      <TableCell align="center">Rounded Off Girth</TableCell>
                      <TableCell align="center">Folds</TableCell>
                      <TableCell align="center">Pieces</TableCell>
                      <TableCell align="center">Length </TableCell>
                      <TableCell align="center">UOM </TableCell>
                      <TableCell align="center">Quantity</TableCell>
                      <TableCell align="center">Unit Price</TableCell>
                      <TableCell align="center">Ext. Price</TableCell>
                      <TableCell align="center" title="Discount Percentage">
                        Dis %
                      </TableCell>
                      <TableCell align="center" title="Discount Amount">
                        Dis. Amt
                      </TableCell>
                      <TableCell align="center" title="Discount Unit Price">
                        DUP
                      </TableCell>
                      <TableCell align="center">Amt</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {customOrders?.length ? (
                      customOrders
                        .filter(item => item.departments === "Flashing" || !item.departments)
                        .map((item, index) => (
                          <React.Fragment key={item._id}>
                            <TableRow className={`${item.quote_item_exact_fold > 10 || item.quote_item_exact_grith >= (item.product_Color?.startsWith("GALVANISED") ? 1220 : 1203) ? "OrderGFExceed" : null}`}>
                              <TableCell>{index + 1}</TableCell>
                              <TableCell align="left">
                                <StrongTag>
                                  SID - {item.quote_item_shape_id} / {item.quote_item_code}
                                </StrongTag>
                                <br />
                                {item.quote_item_description}
                              </TableCell>
                              <TableCell align="left">{item.core_Product_Thickness + " - " + item.core_Product_Name}</TableCell>
                              <TableCell align="left">{item.product_Color}</TableCell>
                              <TableCell align="center">{item.product_Color_Special_Price} %</TableCell>
                              <TableCell align="center">{item.quote_item_exact_grith}</TableCell>
                              <TableCell align="center">{item.product_Girth}</TableCell>
                              <TableCell align="center">
                                {item.product_Fold}
                                {item.quote_item_exact_fold > 10 ? <>({item.quote_item_exact_fold})</> : null}
                              </TableCell>
                              <TableCell align="center">{item.quote_item_pieces}</TableCell>
                              <TableCell align="center">{item.quote_item_length}</TableCell>
                              <TableCell align="center">LN MTR</TableCell>
                              <TableCell align="center">{parseFloat(item.quote_item_quantity).toFixed(2)}</TableCell>
                              <TableCell align="right">
                                <CurrencyDisplay value={item.quote_item_price} currency="AUD" locale="en-US" />
                              </TableCell>
                              <TableCell align="right">
                                <CurrencyDisplay value={item.quote_item_special_price_original ? item.quote_item_special_price_original : "0"} currency="AUD" locale="en-US" />
                              </TableCell>
                              <TableCell align="right">{item.quote_item_discount ? item.quote_item_discount : "0"}%</TableCell>
                              <TableCell align="right">
                                <CurrencyDisplay value={item.quote_item_discounted_amount ? item.quote_item_discounted_amount : "0"} currency="AUD" locale="en-US" />
                              </TableCell>
                              <TableCell align="right">
                                <CurrencyDisplay value={item.quote_item_qty_discounted_price ? item.quote_item_qty_discounted_price : "0"} currency="AUD" locale="en-US" />
                              </TableCell>
                              <TableCell align="right" className="TableEditDelTd">
                                <StrongTag>
                                  <CurrencyDisplay value={item.quote_item_special_price ? item.quote_item_special_price : "0"} currency="AUD" locale="en-US" />
                                </StrongTag>
                                {CoreQuotationDetails?.f_quote_prod_push_status === 2 && CoreQuotationDetails.quote_status !== "Quote Converted To SO" ? (
                                  <MyDiv className="TableEditDel">
                                    <Tooltip title="Edit">
                                      <IconButton aria-label="fingerprint" color="success" onClick={e => FlashingOrderEditId(item)}>
                                        <MdOutlineModeEditOutline />
                                      </IconButton>
                                    </Tooltip>
                                  </MyDiv>
                                ) : (
                                  ""
                                )}
                              </TableCell>
                            </TableRow>
                          </React.Fragment>
                        ))
                    ) : (
                      <TableRow>
                        <TableCell align="center" colSpan={12}>
                          <HeadingFour className="mt-4">No Item Found / Yet to Assign Designer</HeadingFour>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </MyDiv>
          )}
        </React.Fragment>
      )}
      {activeTab === "Jobbing" && (
        <React.Fragment>
          <MyDiv className="orderTabSummery ProfileBasicDetail order-profile mt-2">
            <Card className="ProfileBasicDetailLeftHeader">
              <Row>
                <Col md={12}>
                  <MyDiv className="d-flex justify-content-end align-items-center">
                    {CoreQuotationDetails.j_quote_prod_push_status === "4" ? (
                      <Badge className="orderMovedToMyobBadge">Order Data's sent to MYOB</Badge>
                    ) : (
                      <>
                        {CoreQuotationDetails.j_quote_prod_push_status === 2 ? (
                          <>
                            {/* <Button className='primary-btn' onClick={() => moveToProduction('CL')}>Update Items to Production</Button> */}
                            <Badge className="orderMovedToMyobBadge">Marked Completed</Badge>
                            {mailBtnLoadingMap ? (
                              <IconButton aria-label="fingerprint" color="info" className="IconBtnLoader">
                                <FiLoader />
                              </IconButton>
                            ) : (
                              <></>
                            )}
                          </>
                        ) : (
                          <Button className="success-btn" onClick={() => moveToProduction("J")}>
                            Mark As Complete
                          </Button>
                        )}
                      </>
                    )}
                  </MyDiv>
                </Col>
              </Row>
            </Card>
          </MyDiv>
          <MyDiv className="GeneralTable mt-2">
            {loading ? (
              <HeadingFour className="text-center">Loading...</HeadingFour>
            ) : (
              <TableContainer>
                <Table className="bgGrey stripedTable" aria-label="Order table">
                  <TableHead>
                    <TableRow>
                      <TableCell align="left" width="70px">
                        S No
                      </TableCell>
                      <TableCell align="left">Inventory ID</TableCell>
                      <TableCell align="left">Description</TableCell>
                      <TableCell align="center">Pieces</TableCell>
                      <TableCell align="center">Length </TableCell>
                      <TableCell align="center">UOM</TableCell>
                      <TableCell align="center">Quantity</TableCell>
                      <TableCell align="center">Unit Price</TableCell>
                      <TableCell align="center">Ext. Price</TableCell>
                      <TableCell align="center" title="Discount Percentage">
                        Dis %
                      </TableCell>
                      <TableCell align="center" title="Discount Amount">
                        Dis. Amt
                      </TableCell>
                      <TableCell align="center" title="Discount Unit Price">
                        DUP
                      </TableCell>
                      <TableCell align="center">Amt</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {customOrders?.length ? (
                      customOrders
                        .filter(item => item.departments === "Jobbing")
                        .map((item, index) => (
                          <React.Fragment key={item._id}>
                            <TableRow className={`Department-${item.departments.trim().replace(/\s+/g, "-")} `}>
                              <TableCell>{index + 1}</TableCell>
                              <TableCell align="left">
                                <StrongTag>
                                  {item.quote_item_me_code} - ({item.departments})
                                </StrongTag>
                              </TableCell>
                              <TableCell align="left">{item.quote_item_me_description}</TableCell>
                              <TableCell align="center">{item.quote_item_me_uom_value}</TableCell>
                              <TableCell align="center">{item.quote_item_me_length}</TableCell>
                              <TableCell align="center">{item.quote_item_me_uom}</TableCell>
                              <TableCell align="center">{parseFloat(item.quote_item_me_quantity).toFixed(2)}</TableCell>

                              <TableCell align="right">
                                <CurrencyDisplay value={item.quote_item_qty_me_price} currency="AUD" locale="en-US" />
                              </TableCell>
                              <TableCell align="right">
                                <CurrencyDisplay value={item.quote_item_special_me_price_original ? item.quote_item_special_me_price_original : "0"} currency="AUD" locale="en-US" />
                              </TableCell>
                              <TableCell align="right">{item.quote_item_me_discount ? item.quote_item_me_discount : "0"}%</TableCell>
                              <TableCell align="right">
                                <CurrencyDisplay value={item.quote_item_me_discounted_amount ? item.quote_item_me_discounted_amount : "0"} currency="AUD" locale="en-US" />
                              </TableCell>
                              <TableCell align="right">
                                <CurrencyDisplay value={item.quote_item_qty_me_discounted_price ? item.quote_item_qty_me_discounted_price : "0"} currency="AUD" locale="en-US" />
                              </TableCell>
                              <TableCell align="right" className="TableEditDelTd">
                                <StrongTag>
                                  <CurrencyDisplay value={item.quote_item_special_me_price ? item.quote_item_special_me_price : "0"} currency="AUD" locale="en-US" />
                                </StrongTag>
                                {CoreQuotationDetails.quote_status !== "Quote Converted To SO" ? (
                                  <MyDiv className="TableEditDel">
                                    <Tooltip title="Edit">
                                      <IconButton aria-label="fingerprint" color="success" onClick={e => OrderEditId(item)}>
                                        <MdOutlineModeEditOutline />
                                      </IconButton>
                                    </Tooltip>
                                    <Tooltip title="Delete">
                                      <IconButton aria-label="fingerprint" color="secondary" onClick={e => OrderDeleteId(item)}>
                                        <MdDelete />
                                      </IconButton>
                                    </Tooltip>
                                  </MyDiv>
                                ) : (
                                  ""
                                )}
                              </TableCell>
                            </TableRow>
                          </React.Fragment>
                        ))
                    ) : (
                      <TableRow>
                        <TableCell align="center" colSpan={12}>
                          <HeadingFour className="mt-4">No Orders Found</HeadingFour>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </MyDiv>
        </React.Fragment>
      )}
      {activeTab === "Fascia Gutter" && (
        <React.Fragment>
          <MyDiv className="orderTabSummery ProfileBasicDetail order-profile mt-2">
            <Card className="ProfileBasicDetailLeftHeader">
              <Row>
                <Col md={12}>
                  <MyDiv className="d-flex justify-content-end align-items-center">
                    {CoreQuotationDetails.fg_quote_prod_push_status === "4" ? (
                      <Badge className="orderMovedToMyobBadge">Order Data's sent to MYOB</Badge>
                    ) : (
                      <>
                        {CoreQuotationDetails.fg_quote_prod_push_status === 2 ? (
                          <>
                            {/* <Button className='primary-btn' onClick={() => moveToProduction('CL')}>Update Items to Production</Button> */}
                            <Badge className="orderMovedToMyobBadge">Marked Completed</Badge>
                            {mailBtnLoadingMap ? (
                              <IconButton aria-label="fingerprint" color="info" className="IconBtnLoader">
                                <FiLoader />
                              </IconButton>
                            ) : (
                              <></>
                            )}
                          </>
                        ) : (
                          <Button className="success-btn" onClick={() => moveToProduction("FG")}>
                            Mark As Complete
                          </Button>
                        )}
                      </>
                    )}
                  </MyDiv>
                </Col>
              </Row>
            </Card>
          </MyDiv>
          <MyDiv className="GeneralTable mt-2">
            {loading ? (
              <HeadingFour className="text-center">Loading...</HeadingFour>
            ) : (
              <TableContainer>
                <Table className="bgGrey stripedTable" aria-label="Order table">
                  <TableHead>
                    <TableRow>
                      <TableCell align="left" width="70px">
                        S No
                      </TableCell>
                      <TableCell align="left">Inventory ID</TableCell>
                      <TableCell align="left">Description</TableCell>
                      <TableCell align="center">Pieces</TableCell>
                      <TableCell align="center">Length </TableCell>
                      <TableCell align="center">UOM</TableCell>
                      <TableCell align="center">Quantity</TableCell>
                      <TableCell align="center">Unit Price</TableCell>
                      <TableCell align="center">Ext. Price</TableCell>
                      <TableCell align="center" title="Discount Percentage">
                        Dis %
                      </TableCell>
                      <TableCell align="center" title="Discount Amount">
                        Dis. Amt
                      </TableCell>
                      <TableCell align="center" title="Discount Unit Price">
                        DUP
                      </TableCell>
                      <TableCell align="center">Amt</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {customOrders?.length ? (
                      customOrders
                        .filter(item => item.departments === "Fascia Gutter")
                        .map((item, index) => (
                          <React.Fragment key={item._id}>
                            <TableRow className={`Department-${item.departments.trim().replace(/[.\s-]/g, "")} `}>
                              <TableCell align="left">{index + 1}</TableCell>
                              <TableCell align="left">
                                <StrongTag>
                                  {item.quote_item_me_code} - ({item.departments})
                                </StrongTag>
                              </TableCell>
                              <TableCell align="left">{item.quote_item_me_description}</TableCell>
                              <TableCell align="center">{item.quote_item_me_uom_value}</TableCell>
                              <TableCell align="center">{item.quote_item_me_length}</TableCell>
                              <TableCell align="center">{item.quote_item_me_uom}</TableCell>
                              <TableCell align="center">{parseFloat(item.quote_item_me_quantity).toFixed(2)}</TableCell>
                              <TableCell align="right">
                                <CurrencyDisplay value={item.quote_item_qty_me_price} currency="AUD" locale="en-US" />
                              </TableCell>
                              <TableCell align="right">
                                <CurrencyDisplay value={item.quote_item_special_me_price_original ? item.quote_item_special_me_price_original : "0"} currency="AUD" locale="en-US" />
                              </TableCell>
                              <TableCell align="right">{item.quote_item_me_discount ? item.quote_item_me_discount : "0"}%</TableCell>
                              <TableCell align="right">
                                <CurrencyDisplay value={item.quote_item_me_discounted_amount ? item.quote_item_me_discounted_amount : "0"} currency="AUD" locale="en-US" />
                              </TableCell>
                              <TableCell align="right">
                                <CurrencyDisplay value={item.quote_item_qty_me_discounted_price ? item.quote_item_qty_me_discounted_price : "0"} currency="AUD" locale="en-US" />
                              </TableCell>
                              <TableCell align="right" className="TableEditDelTd">
                                <StrongTag>
                                  <CurrencyDisplay value={item.quote_item_special_me_price ? item.quote_item_special_me_price : "0"} currency="AUD" locale="en-US" />
                                </StrongTag>
                                {CoreQuotationDetails.quote_status !== "Quote Converted To SO" ? (
                                  <MyDiv className="TableEditDel">
                                    <Tooltip title="Edit">
                                      <IconButton aria-label="fingerprint" color="success" onClick={e => OrderEditId(item)}>
                                        <MdOutlineModeEditOutline />
                                      </IconButton>
                                    </Tooltip>
                                    <Tooltip title="Delete">
                                      <IconButton aria-label="fingerprint" color="secondary" onClick={e => OrderDeleteId(item)}>
                                        <MdDelete />
                                      </IconButton>
                                    </Tooltip>
                                  </MyDiv>
                                ) : (
                                  ""
                                )}
                              </TableCell>
                            </TableRow>
                          </React.Fragment>
                        ))
                    ) : (
                      <TableRow>
                        <TableCell align="center" colSpan={12}>
                          <HeadingFour className="mt-4">No Orders Found</HeadingFour>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </MyDiv>
        </React.Fragment>
      )}
      {activeTab === "Cladding" && (
        <React.Fragment>
          <MyDiv className="orderTabSummery ProfileBasicDetail order-profile mt-2">
            <Card className="ProfileBasicDetailLeftHeader">
              <Row>
                <Col md={12}>
                  <MyDiv className="d-flex justify-content-end align-items-center">
                    {CoreQuotationDetails.cl_quote_prod_push_status === "4" ? (
                      <Badge className="orderMovedToMyobBadge">Order Data's sent to MYOB</Badge>
                    ) : (
                      <>
                        {CoreQuotationDetails.cl_quote_prod_push_status === 2 ? (
                          <>
                            {/* <Button className='primary-btn' onClick={() => moveToProduction('CL')}>Update Items to Production</Button> */}
                            <Badge className="orderMovedToMyobBadge">Marked Completed</Badge>
                            {mailBtnLoadingMap ? (
                              <IconButton aria-label="fingerprint" color="info" className="IconBtnLoader">
                                <FiLoader />
                              </IconButton>
                            ) : (
                              <></>
                            )}
                          </>
                        ) : (
                          <Button className="success-btn" onClick={() => moveToProduction("CL")}>
                            Mark As Complete
                          </Button>
                        )}
                      </>
                    )}
                  </MyDiv>
                </Col>
              </Row>
            </Card>
          </MyDiv>
          <MyDiv className="GeneralTable mt-2">
            {loading ? (
              <HeadingFour className="text-center">Loading...</HeadingFour>
            ) : (
              <TableContainer>
                <Table className="bgGrey stripedTable" aria-label="Order table">
                  <TableHead>
                    <TableRow>
                      <TableCell align="left" width="70px">
                        S No
                      </TableCell>
                      <TableCell align="left">Inventory ID</TableCell>
                      <TableCell align="left">Description</TableCell>
                      <TableCell align="center">Pieces</TableCell>
                      <TableCell align="center">Length </TableCell>
                      <TableCell align="center">UOM</TableCell>
                      <TableCell align="center">Quantity</TableCell>
                      <TableCell align="center">Unit Price</TableCell>
                      <TableCell align="center">Ext. Price</TableCell>
                      <TableCell align="center" title="Discount Percentage">
                        Dis %
                      </TableCell>
                      <TableCell align="center" title="Discount Amount">
                        Dis. Amt
                      </TableCell>
                      <TableCell align="center" title="Discount Unit Price">
                        DUP
                      </TableCell>
                      <TableCell align="center">Amt</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {customOrders?.length ? (
                      customOrders
                        .filter(item => item.departments === "Cladding")
                        .map((item, index) => (
                          <React.Fragment key={item._id}>
                            <TableRow className={`Department-${item.departments.trim().replace(/[.\s-]/g, "")}`}>
                              <TableCell align="left">{index + 1}</TableCell>
                              <TableCell align="left">
                                <StrongTag>
                                  {item.quote_item_me_code} - ({item.departments})
                                </StrongTag>
                              </TableCell>
                              <TableCell align="left">{item.quote_item_me_description}</TableCell>
                              <TableCell align="center">{item.quote_item_me_uom_value}</TableCell>
                              <TableCell align="center">{item.quote_item_me_length}</TableCell>
                              <TableCell align="center">{item.quote_item_me_uom}</TableCell>
                              <TableCell align="center">{parseFloat(item.quote_item_me_quantity).toFixed(2)}</TableCell>
                              <TableCell align="right">
                                <CurrencyDisplay value={item.quote_item_qty_me_price} currency="AUD" locale="en-US" />
                              </TableCell>
                              <TableCell align="right">
                                <CurrencyDisplay value={item.quote_item_special_me_price_original ? item.quote_item_special_me_price_original : "0"} currency="AUD" locale="en-US" />
                              </TableCell>
                              <TableCell align="right">{item.quote_item_me_discount ? item.quote_item_me_discount : "0"}%</TableCell>
                              <TableCell align="right">
                                <CurrencyDisplay value={item.quote_item_me_discounted_amount ? item.quote_item_me_discounted_amount : "0"} currency="AUD" locale="en-US" />
                              </TableCell>
                              <TableCell align="right">
                                <CurrencyDisplay value={item.quote_item_qty_me_discounted_price ? item.quote_item_qty_me_discounted_price : "0"} currency="AUD" locale="en-US" />
                              </TableCell>
                              <TableCell align="right" className="TableEditDelTd">
                                <StrongTag>
                                  <CurrencyDisplay value={item.quote_item_special_me_price ? item.quote_item_special_me_price : "0"} currency="AUD" locale="en-US" />
                                </StrongTag>
                                {CoreQuotationDetails.quote_status !== "Quote Converted To SO" ? (
                                  <MyDiv className="TableEditDel">
                                    <Tooltip title="Edit">
                                      <IconButton aria-label="fingerprint" color="success" onClick={e => OrderEditId(item)}>
                                        <MdOutlineModeEditOutline />
                                      </IconButton>
                                    </Tooltip>
                                    <Tooltip title="Delete">
                                      <IconButton aria-label="fingerprint" color="secondary" onClick={e => OrderDeleteId(item)}>
                                        <MdDelete />
                                      </IconButton>
                                    </Tooltip>
                                  </MyDiv>
                                ) : (
                                  ""
                                )}
                              </TableCell>
                            </TableRow>
                          </React.Fragment>
                        ))
                    ) : (
                      <TableRow>
                        <TableCell align="center" colSpan={12}>
                          <HeadingFour className="mt-4">No Orders Found</HeadingFour>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </MyDiv>
        </React.Fragment>
      )}
      {activeTab === "GBI" && (
        <React.Fragment>
          <MyDiv className="orderTabSummery ProfileBasicDetail order-profile mt-2">
            <Card className="ProfileBasicDetailLeftHeader">
              <Row>
                <Col md={12}>
                  <MyDiv className="d-flex justify-content-end align-items-center">
                    {CoreQuotationDetails.gbi_quote_prod_push_status === "4" ? (
                      <Badge className="orderMovedToMyobBadge">Order Data's sent to MYOB</Badge>
                    ) : (
                      <>
                        {CoreQuotationDetails.gbi_quote_prod_push_status === 2 ? (
                          <>
                            {/* <Button className='primary-btn' onClick={() => moveToProduction('CL')}>Update Items to Production</Button> */}
                            <Badge className="orderMovedToMyobBadge">Marked Completed</Badge>
                            {mailBtnLoadingMap ? (
                              <IconButton aria-label="fingerprint" color="info" className="IconBtnLoader">
                                <FiLoader />
                              </IconButton>
                            ) : (
                              <></>
                            )}
                          </>
                        ) : (
                          <Button className="success-btn" onClick={() => moveToProduction("GBI")}>
                            Mark As Complete
                          </Button>
                        )}
                      </>
                    )}
                  </MyDiv>
                </Col>
              </Row>
            </Card>
          </MyDiv>
          <MyDiv className="GeneralTable mt-2">
            {loading ? (
              <HeadingFour className="text-center">Loading...</HeadingFour>
            ) : (
              <TableContainer>
                <Table className="bgGrey stripedTable" aria-label="Order table">
                  <TableHead>
                    <TableRow>
                      <TableCell align="left" width="70px">
                        S No
                      </TableCell>
                      <TableCell align="left">Inventory ID</TableCell>
                      <TableCell align="left">Description</TableCell>
                      <TableCell align="center">Pieces</TableCell>
                      <TableCell align="center">Length </TableCell>
                      <TableCell align="center">UOM</TableCell>
                      <TableCell align="center">Quantity</TableCell>
                      <TableCell align="center">Unit Price</TableCell>
                      <TableCell align="center">Ext. Price</TableCell>
                      <TableCell align="center" title="Discount Percentage">
                        Dis %
                      </TableCell>
                      <TableCell align="center" title="Discount Amount">
                        Dis. Amt
                      </TableCell>
                      <TableCell align="center" title="Discount Unit Price">
                        DUP
                      </TableCell>
                      <TableCell align="center">Amt</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {customOrders?.length ? (
                      customOrders
                        .filter(item => item.departments === "GBI Orders")
                        .map((item, index) => (
                          <React.Fragment key={item._id}>
                            <TableRow className={`Department-${item.departments.trim().replace(/[.\s-]/g, "")}`}>
                              <TableCell align="left">{index + 1}</TableCell>
                              <TableCell align="left">
                                <StrongTag>
                                  {item.quote_item_me_code} - ({item.departments})
                                </StrongTag>
                              </TableCell>
                              <TableCell align="left">{item.quote_item_me_description}</TableCell>
                              <TableCell align="center">{item.quote_item_me_uom_value}</TableCell>
                              <TableCell align="center">{item.quote_item_me_length}</TableCell>
                              <TableCell align="center">{item.quote_item_me_uom}</TableCell>
                              <TableCell align="center">{parseFloat(item.quote_item_me_quantity).toFixed(2)}</TableCell>
                              <TableCell align="right">
                                <CurrencyDisplay value={item.quote_item_qty_me_price ? item.quote_item_qty_me_price : "0"} currency="AUD" locale="en-US" />
                              </TableCell>
                              <TableCell align="right">
                                <CurrencyDisplay value={item.quote_item_special_me_price_original ? item.quote_item_special_me_price_original : "0"} currency="AUD" locale="en-US" />
                              </TableCell>
                              <TableCell align="right">{item.quote_item_me_discount ? item.quote_item_me_discount : "0"}%</TableCell>
                              <TableCell align="right">
                                <CurrencyDisplay value={item.quote_item_me_discounted_amount ? item.quote_item_me_discounted_amount : "0"} currency="AUD" locale="en-US" />
                              </TableCell>
                              <TableCell align="right">
                                <CurrencyDisplay value={item.quote_item_qty_me_discounted_price ? item.quote_item_qty_me_discounted_price : "0"} currency="AUD" locale="en-US" />
                              </TableCell>
                              <TableCell align="right" className="TableEditDelTd">
                                <StrongTag>
                                  <CurrencyDisplay value={item.quote_item_special_me_price ? item.quote_item_special_me_price : "0"} currency="AUD" locale="en-US" />
                                </StrongTag>
                                {CoreQuotationDetails.quote_status !== "Quote Converted To SO" ? (
                                  <MyDiv className="TableEditDel">
                                    <Tooltip title="Edit">
                                      <IconButton aria-label="fingerprint" color="success" onClick={e => OrderEditId(item)}>
                                        <MdOutlineModeEditOutline />
                                      </IconButton>
                                    </Tooltip>
                                    <Tooltip title="Delete">
                                      <IconButton aria-label="fingerprint" color="secondary" onClick={e => OrderDeleteId(item)}>
                                        <MdDelete />
                                      </IconButton>
                                    </Tooltip>
                                  </MyDiv>
                                ) : (
                                  ""
                                )}
                              </TableCell>
                            </TableRow>
                          </React.Fragment>
                        ))
                    ) : (
                      <TableRow>
                        <TableCell align="center" colSpan={12}>
                          <HeadingFour className="mt-4">No Orders Found</HeadingFour>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </MyDiv>
        </React.Fragment>
      )}
      {activeTab === "Roofing" && (
        <React.Fragment>
          <MyDiv className="orderTabSummery ProfileBasicDetail order-profile mt-2">
            <Card className="ProfileBasicDetailLeftHeader">
              <Row>
                <Col md={12}>
                  <MyDiv className="d-flex justify-content-end align-items-center">
                    {CoreQuotationDetails.roof_quote_prod_push_status === "4" ? (
                      <Badge className="orderMovedToMyobBadge">Order Data's sent to MYOB</Badge>
                    ) : (
                      <>
                        {CoreQuotationDetails.roof_quote_prod_push_status === 2 ? (
                          <>
                            {/* <Button className='primary-btn' onClick={() => moveToProduction('CL')}>Update Items to Production</Button> */}
                            <Badge className="orderMovedToMyobBadge">Marked Completed</Badge>
                            {mailBtnLoadingMap ? (
                              <IconButton aria-label="fingerprint" color="info" className="IconBtnLoader">
                                <FiLoader />
                              </IconButton>
                            ) : (
                              <></>
                            )}
                          </>
                        ) : (
                          <Button className="success-btn" onClick={() => moveToProduction("ROOF")}>
                            Mark As Complete
                          </Button>
                        )}
                      </>
                    )}
                  </MyDiv>
                </Col>
              </Row>
            </Card>
          </MyDiv>
          <MyDiv className="GeneralTable mt-2">
            {loading ? (
              <HeadingFour className="text-center">Loading...</HeadingFour>
            ) : (
              <>
                <TableContainer>
                  <Table className="bgGrey stripedTable" aria-label="Order table">
                    <TableHead>
                      <TableRow>
                        <TableCell align="left" width="70px">
                          S No
                        </TableCell>
                        <TableCell align="left">Inventory ID</TableCell>
                        <TableCell align="left">Description</TableCell>
                        <TableCell align="center">Pieces</TableCell>
                        <TableCell align="center">Length </TableCell>
                        <TableCell align="center">UOM</TableCell>
                        <TableCell align="center">Quantity</TableCell>
                        <TableCell align="center">Unit Price</TableCell>
                        <TableCell align="center">Ext. Price</TableCell>
                        <TableCell align="center" title="Discount Percentage">
                          Dis %
                        </TableCell>
                        <TableCell align="center" title="Discount Amount">
                          Dis. Amt
                        </TableCell>
                        <TableCell align="center" title="Discount Unit Price">
                          DUP
                        </TableCell>
                        <TableCell align="center">Amt</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {customOrders?.length ? (
                        customOrders
                          .filter(item => item.departments === "Roofing")
                          .map((item, index) => (
                            <React.Fragment key={item._id}>
                              <TableRow className={`Department-${item.departments.trim().replace(/\s+/g, "-")}`}>
                                <TableCell align="left">{index + 1}</TableCell>
                                <TableCell align="left">
                                  <StrongTag>
                                    {item.quote_item_me_code} - ({item.departments})
                                  </StrongTag>
                                </TableCell>
                                <TableCell align="left">{item.quote_item_me_description}</TableCell>
                                <TableCell align="center">{item.quote_item_me_uom_value}</TableCell>
                                <TableCell align="center">{item.quote_item_me_length}</TableCell>
                                <TableCell align="center">{item.quote_item_me_uom}</TableCell>
                                <TableCell align="center">{parseFloat(item.quote_item_me_quantity).toFixed(2)}</TableCell>
                                <TableCell align="right">
                                  <CurrencyDisplay value={item.quote_item_qty_me_price ? item.quote_item_qty_me_price : "0"} currency="AUD" locale="en-US" />
                                </TableCell>
                                <TableCell align="right">
                                  <CurrencyDisplay value={item.quote_item_special_me_price_original ? item.quote_item_special_me_price_original : "0"} currency="AUD" locale="en-US" />
                                </TableCell>
                                <TableCell align="right">{item.quote_item_me_discount ? item.quote_item_me_discount : "0"}%</TableCell>
                                <TableCell align="right">
                                  <CurrencyDisplay value={item.quote_item_me_discounted_amount ? item.quote_item_me_discounted_amount : "0"} currency="AUD" locale="en-US" />
                                </TableCell>
                                <TableCell align="right">
                                  <CurrencyDisplay value={item.quote_item_qty_me_discounted_price ? item.quote_item_qty_me_discounted_price : "0"} currency="AUD" locale="en-US" />
                                </TableCell>
                                <TableCell align="right" className="TableEditDelTd">
                                  <StrongTag>
                                    <CurrencyDisplay value={item.quote_item_special_me_price} currency="AUD" locale="en-US" />
                                  </StrongTag>
                                  {CoreQuotationDetails.quote_status !== "Quote Converted To SO" ? (
                                    <MyDiv className="TableEditDel">
                                      <Tooltip title="Edit">
                                        <IconButton aria-label="fingerprint" color="success" onClick={e => OrderEditId(item)}>
                                          <MdOutlineModeEditOutline />
                                        </IconButton>
                                      </Tooltip>
                                      <Tooltip title="Delete">
                                        <IconButton aria-label="fingerprint" color="secondary" onClick={e => OrderDeleteId(item)}>
                                          <MdDelete />
                                        </IconButton>
                                      </Tooltip>
                                    </MyDiv>
                                  ) : (
                                    ""
                                  )}
                                </TableCell>
                              </TableRow>
                            </React.Fragment>
                          ))
                      ) : (
                        <TableRow>
                          <TableCell align="center" colSpan={12}>
                            <HeadingFour className="mt-4">No Orders Found</HeadingFour>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </>
            )}
          </MyDiv>
        </React.Fragment>
      )}
      {activeTab === "GBIL" && (
        <React.Fragment>
          <MyDiv className="orderTabSummery ProfileBasicDetail order-profile mt-2 hide">
            <Card className="ProfileBasicDetailLeftHeader">
              <Row>
                <Col md={12}>
                  <MyDiv className="d-flex justify-content-end align-items-center"></MyDiv>
                </Col>
              </Row>
            </Card>
          </MyDiv>
          <MyDiv className="GeneralTable mt-2">
            {loading ? (
              <HeadingFour className="text-center">Loading...</HeadingFour>
            ) : (
              <TableContainer>
                <Table className="bgGrey stripedTable" aria-label="Order table">
                  <TableHead>
                    <TableRow>
                      <TableCell align="left" width="70px">
                        S No
                      </TableCell>
                      <TableCell align="left">Inventory ID</TableCell>
                      <TableCell align="left">Description</TableCell>
                      <TableCell align="center">Pieces</TableCell>
                      <TableCell align="center">Length </TableCell>
                      <TableCell align="center">UOM</TableCell>
                      <TableCell align="center">Quantity</TableCell>
                      <TableCell align="center">Unit Price</TableCell>
                      <TableCell align="center">Ext. Price</TableCell>
                      <TableCell align="center" title="Discount Percentage">
                        Dis %
                      </TableCell>
                      <TableCell align="center" title="Discount Amount">
                        Dis. Amt
                      </TableCell>
                      <TableCell align="center" title="Discount Unit Price">
                        DUP
                      </TableCell>
                      <TableCell align="center">Amt</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {customOrders?.length ? (
                      customOrders
                        .filter(item => item.departments === "GBI.L")
                        .map((item, index) => (
                          <React.Fragment key={item._id}>
                            <TableRow className={`Department-${item.departments.trim().replace(/[.\s-]/g, "")}`}>
                              <TableCell align="left">{index + 1}</TableCell>
                              <TableCell align="left">
                                <StrongTag>
                                  {item.quote_item_me_code} - ({item.departments})
                                </StrongTag>
                              </TableCell>
                              <TableCell align="left">{item.quote_item_me_description}</TableCell>
                              <TableCell align="center">{item.quote_item_me_uom_value}</TableCell>
                              <TableCell align="center">{item.quote_item_me_length}</TableCell>
                              <TableCell align="center">{item.quote_item_me_uom}</TableCell>
                              <TableCell align="center">{parseFloat(item.quote_item_me_quantity).toFixed(2)}</TableCell>
                              <TableCell align="right">
                                <CurrencyDisplay value={item.quote_item_qty_me_price ? item.quote_item_qty_me_price : "0"} currency="AUD" locale="en-US" />
                              </TableCell>
                              <TableCell align="right">
                                <CurrencyDisplay value={item.quote_item_special_me_price_original} currency="AUD" locale="en-US" />
                              </TableCell>
                              <TableCell align="right">{item.quote_item_me_discount ? item.quote_item_me_discount : "0"}%</TableCell>
                              <TableCell align="right">
                                <CurrencyDisplay value={item.quote_item_me_discounted_amount ? item.quote_item_me_discounted_amount : "0"} currency="AUD" locale="en-US" />
                              </TableCell>
                              <TableCell align="right">
                                <CurrencyDisplay value={item.quote_item_qty_me_discounted_price ? item.quote_item_qty_me_discounted_price : "0"} currency="AUD" locale="en-US" />
                              </TableCell>
                              <TableCell align="right" className="TableEditDelTd">
                                <StrongTag>
                                  <CurrencyDisplay value={item.quote_item_special_me_price} currency="AUD" locale="en-US" />
                                </StrongTag>
                                {CoreQuotationDetails.quote_status !== "Quote Converted To SO" ? (
                                  <MyDiv className="TableEditDel">
                                    <Tooltip title="Edit">
                                      <IconButton aria-label="fingerprint" color="success" onClick={e => OrderEditId(item)}>
                                        <MdOutlineModeEditOutline />
                                      </IconButton>
                                    </Tooltip>
                                    <Tooltip title="Delete">
                                      <IconButton aria-label="fingerprint" color="secondary" onClick={e => OrderDeleteId(item)}>
                                        <MdDelete />
                                      </IconButton>
                                    </Tooltip>
                                  </MyDiv>
                                ) : (
                                  ""
                                )}
                              </TableCell>
                            </TableRow>
                          </React.Fragment>
                        ))
                    ) : (
                      <TableRow>
                        <TableCell align="center" colSpan={12}>
                          <HeadingFour className="mt-4">No Orders Found</HeadingFour>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </MyDiv>
        </React.Fragment>
      )}

      <Drawer anchor="right" open={flashingOrderDrawerState} onClose={handleFlashingOrderDrawerToggle}>
        <FormQuoteItem handleClose={updateFlashingDrawer} userInfo={data} CoreQuotationDetails={CoreQuotationDetails} />
      </Drawer>
      <Drawer anchor="right" open={userDrawerState} onClose={handleOrderDrawerToggle}>
        <FormCustomQuoteItem handleClose={updateDrawer} userInfo={data} customerId={CoreQuotationDetails.account_ID} handleOrderItemsUpdated={updatedLineItem} />
      </Drawer>
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

export default OrderItemManage;
