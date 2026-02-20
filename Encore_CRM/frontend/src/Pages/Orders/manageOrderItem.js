import React, { useState, useEffect, useCallback, useRef, startTransition } from "react";
import { Row, Col, Badge, Card, Spinner } from "react-bootstrap";
import { HeadingTwo, HeadingFour, MyDiv, StrongTag, LabelTag, SpanTag, CurrencyDisplay, HeadingFive, HeadingThree, HeadingSix } from "../Common/Components";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import { TableBody, Table, TableContainer, TableHead, TableRow,Switch, TableCell, IconButton, Tooltip, Drawer, Button, TextField, Box } from "@mui/material";
import { MdOutlineModeEditOutline, MdDelete } from "react-icons/md";
import { FaMailBulk, FaRegSave, FaArrowUp, FaArrowDown } from "react-icons/fa";
import { FiLoader } from "react-icons/fi";
import { VscGitFetch } from "react-icons/vsc";
import axios from "axios";
import swal from "sweetalert2";
import { DragDropContext, Draggable, Droppable } from "@hello-pangea/dnd";
import { Tabs, Tab } from "@mui/material";
import FormOrderItem from "./formOrderItem";
import FormCustomOrderItem from "./formCustomOrder";
import BarCodeList from "./barcodeList";
import OrderDocuments from "./documents";
import FileUpload from "./fileUpload";
import DrawingDetailsTab from '../Drawings/DrawingDetailsTab';
// import DoubtTabData from "./doubtTab";
// import SupplierTabData from "./supplierItem";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;
const API_TOKEN = localStorage.getItem("token");

const RolePermission = JSON.parse(localStorage.getItem("role"));
const AWF_CUST_ID = localStorage.getItem("awfCustId");

function OrderItemManage({ orderUpdates, CoreOrderDetails }) {
  const location = useLocation();

  let { id } = useParams();
  const [customOrders, setCustomOrders] = useState("");
  const [loading, setLoading] = useState(false);
  const [barcodeSetLoading, setBarcodeSetLoading] = useState(false);
  const [data, setData] = useState("");
  const [selectedRows, setSelectedRows] = useState([]);
  //Code Added By Rahul
  const [refreshFlashing, setRefreshFlashing] = useState(false);
  // Add toggle state
  const [showDrawingToggle, setShowDrawingToggle] = useState(true);
  //Code Ended By Rahul

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

  const handleOrderDocumentsChange = () => {
    loadCustomItems();
    orderUpdates();
  };

  const loadCustomItems = useCallback(async () => {
    setLoading(true);
    const url = API_BASE_URL + `fetch-order-lineitems-details/` + id;
    axios
      .get(url, {
        headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" },
      })
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

  const navigate = useNavigate();

  useEffect(() => {
        if (location.state?.activeTab) {
            setActiveTab(location.state.activeTab);
            // If we're navigating to Drawing Details, remember to show the tab
            if (location.state.activeTab === 'Drawing Details') {
                setShowDrawingTab(true);
            }
        }
    }, []);

    // Code Added By Rahul
    useEffect(() => {
        loadCustomItems();
    }, [refreshFlashing, loadCustomItems]);

    // Add this state at the top with other states
    const [loadingDrawingCounts, setLoadingDrawingCounts] = useState(false);
    const [drawingCounts, setDrawingCounts] = useState({ colorCount: 0, totalDrawings: 0, totalPieces: 0 });
    // Code Ended By Rahul  
    
    // Set showDrawingTab when order_has_drawing flag is present or when we have drawings
    useEffect(() => {
        if (CoreOrderDetails?.order_has_drawing) {
            setShowDrawingTab(true);
        }
        // Also check if we have an _id which indicates drawings might exist
        if (CoreOrderDetails?._id) {
            // The presence of MongoDB _id suggests this order might have drawings
            setShowDrawingTab(true);
        }
    }, [CoreOrderDetails]);

  useEffect(() => {
    loadCustomItems();
  }, [loadCustomItems, CoreOrderDetails]);

  useEffect(() => {
    if (orderUpdates && orderUpdates.productionMoved !== undefined) {
      setProductionMoved(true);
    }
  }, [orderUpdates]);
  useEffect(() => {
    if (location.state?.openTab) {
      setActiveTab(location.state.openTab);
    }
  }, [location.state]);

  // const OrderDeleteId = async item => {
  //   const url = API_BASE_URL + `delete-specific-manual-entry-order-item/${item._id}/${item.order_item_me_department}`;
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
  //         axios
  //           .get(url, {
  //             headers: {
  //               "x-access-token": localStorage.getItem("token"),
  //               Accept: "application/json",
  //               "Content-Type": "application/json",
  //             },
  //           })
  //           .then(
  //             res => {
  //               setCustomOrders(res.data);
  //               //loadSubItems();
  //               loadCustomItems();
  //               orderUpdates();
  //               if (res.status === 200) {
  //                 swal.fire("Deleted!", "Your file has been deleted.", "success");
  //                 setActiveTab("All");
  //                 orderUpdates();
  //               } else {
  //                 swal.fire("Sorry :(", "Your file has been deleted.", "error");
  //               }
  //             },
  //             error => {
  //               //alert('Order fetching failed: ' + error)
  //             }
  //           );
  //       }
  //     });
  // };

  const OrderDeleteId = async item => {
    const url = API_BASE_URL + `delete-specific-manual-entry-order-item/${item._id}/${item.order_item_me_department}`;
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
      .then(result => {
        if (result.isConfirmed) {
          axios
            .get(url, {
              headers: {
                "x-access-token": localStorage.getItem("token"),
                Accept: "application/json",
                "Content-Type": "application/json",
              },
            })
            .then(
              res => {
                setCustomOrders(res.data);
                loadCustomItems();
                orderUpdates();
                if (res.status === 200) {
                  swal.fire("Deleted!", "Your file has been deleted.", "success");
                  const departmentToCheck = item.departments?.trim().toLowerCase();

                  if (Array.isArray(res.data)) {
                    const remainingItemsInDepartment = res.data.filter(dataItem => dataItem.departments?.trim().toLowerCase() === departmentToCheck);
                    if (remainingItemsInDepartment.length === 0) {
                      setActiveTab("All");
                    }
                  } else {
                    const currentOrders = Array.isArray(customOrders) ? customOrders : [];
                    const remainingItemsInDepartment = currentOrders.filter(dataItem => dataItem.departments?.trim().toLowerCase() === departmentToCheck);
                    if (remainingItemsInDepartment.length === 0) {
                      console.log("No items left in department (fallback), switching to All tab");
                      setActiveTab("All");
                    }
                  }
                  orderUpdates();
                } else {
                  swal.fire("Sorry :(", "Your file has not been deleted.", "error");
                }
              },
              error => {
                console.error("Deletion error:", error);
              }
            );
        }
      });
  };
  /* Search Module */
  const [searchData, setSearchData] = useState({
    search_text: "",
  });
  function searchHandle(e) {
    const searchNewData = { ...searchData };
    searchNewData[e.target.id] = e.target.value;
    setSearchData(searchNewData);
  }
  function searchSubmit(e) {
    e.preventDefault();
  }
  const [userDrawerState, setOrderDrawerState] = React.useState(false);
  const [flashingOrderDrawerState, setFlashingOrderDrawerState] = React.useState(false);
  const [showDrawingTab, setShowDrawingTab] = React.useState(false);
  const [lastEditedItemId, setLastEditedItemId] = useState(null);
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
    setLastEditedItemId(_id._id);
  };

  const FlashingOrderEditId = _id => {
    flashingOrderDrawerState === false ? setFlashingOrderDrawerState(true) : setFlashingOrderDrawerState(false);
    setData(_id);
    setLastEditedItemId(_id._id);
  };

  const updateFlashingDrawer = () => {
    flashingOrderDrawerState === false ? setFlashingOrderDrawerState(true) : setFlashingOrderDrawerState(false);
    loadCustomItems();
    orderUpdates();
  };

  const updateDrawer = () => {
    userDrawerState === false ? setOrderDrawerState(true) : setOrderDrawerState(false);
    loadCustomItems();
    orderUpdates();
  };
  const updatedLineItem = () => {
    loadCustomItems();
    orderUpdates();
  };

  const [setProductionMoved] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const handleEditClick = () => {
    setIsEditing(true);
  };

  const handleChangeWhiteSpace = e => {
    const newData = { ...tabData };
    newData[e.target.id] = e.target.value;
    setTabData(newData);
  };

  const handleSaveClick = e => {
    e.preventDefault();
    const departmentValue = document.querySelector('input[name="department"]').value;
    const updatedTabData = { ...tabData, department: departmentValue };
    const url = API_BASE_URL + "update-order-departmental-instruction/" + id;
    const method = "patch";
    axios({
      method,
      url,
      data: updatedTabData,
      headers: {
        "x-access-token": localStorage.getItem("token"),
        Accept: "application/json",
        "Content-Type": "application/json",
      },
    })
      .then(res => {
        if (res.status === 200) {
          swal.fire({
            text: "Successfully Saved",
            icon: "success",
            type: "success",
          });
          setIsEditing(false);
          orderUpdates();
        }
      })
      .catch(error => {
        swal.fire({
          // text: error.response.data,
          text: "fail",
          icon: "error",
          type: "error",
        });
      });
  };

  const [barCodeListId, setBarCodeListId] = useState({ id: null, department: null });
  const [ProductionBtnLoading, setProductionBtnLoading] = useState(false);
  const [mailBtnLoadingMap, setMailBtnLoadingMap] = useState(false);

  const moveToProduction = async department => {
    const order_quote_checker_status = CoreOrderDetails.order_quote_checker_status;

    if( CoreOrderDetails?.account_UID === AWF_CUST_ID && CoreOrderDetails?.order_delivery_address_mode === "1" && !CoreOrderDetails?.docket?.length){
      swal.fire({
        text: "Upload AWF docket to proceed",
        icon: "warning",
        type: "warning",
      });
      return;
    }



    // First confirmation
    const result = await swal.fire({
      title: "Confirmation",
      text: "Are you sure you want to move the order to Production?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Move",
      cancelButtonText: "No, Cancel",
    });

    if (!result.isConfirmed) {
      return;
    }

    // Second confirmation if the order was converted from a quote
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

    // Proceed to move order to production
    const url = `${API_BASE_URL}assign-order-to-production/${id}/${department}`;
    try {
      setProductionBtnLoading(true);
      setBarcodeSetLoading(true);
      const res = await axios.patch(
        url,
        {},
        {
          headers: {
            "x-access-token": localStorage.getItem("token"),
            Accept: "application/json",
            "Content-Type": "multipart/form-data",
          },
        }
      );

      if (res.status === 200) {
        loadCustomItems();
        if (orderUpdates && typeof orderUpdates.loadSpecificOrder === "function") {
          orderUpdates.loadSpecificOrder(res.data);
        }
        //setProductionMoved(true);
        setBarCodeListId({ id, department, updatedAt: new Date().getTime() });
        // orderUpdates();
      }
    } catch (error) {
      swal.fire({
        text: error.response?.data || "An error occurred",
        icon: "error",
      });
      setProductionBtnLoading(false);
      setBarcodeSetLoading(false);
    }
  };

  const orderDocsSendMail = async (id, department) => {
    const result = await swal.fire({
      title: "Confirmation",
      text: "Are you sure you want to Resend the Barcode and order documents?",
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
    setMailBtnLoadingMap(true);

    setBarCodeListId({ id, department, updatedAt: new Date().getTime() });
  };

  const BarcodeSuccessInfo = e => {
    orderUpdates();
    setProductionBtnLoading(false);
    setBarcodeSetLoading(false);
    setMailBtnLoadingMap(false);
    setBarCodeListId();
  };

  const orderFetchFromDesignTool = useCallback(async () => {
    const confirmation = await swal.fire({
      title: "Are you sure?",
      text: "Do you want to fetch flashing from the design tool manually? CRM Flashing data will be Restored.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Fetch it!",
      cancelButtonText: "No, Cancel",
      reverseButtons: true,
      customClass: {
        confirmButton: "primary-btn",
        cancelButton: "secondary-btn",
      },
    });

    if (confirmation.isConfirmed) {
      // Proceed only if user confirms
      setLoading(true);
      const url = API_BASE_URL + `fetch-ordersubitems-from-designtool-manually/` + id;

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
          loadCustomItems();
        })
        .catch(error => {
          swal.fire({
            text: error.response?.data || "An error occurred. Please try again.",
            icon: "error",
          });
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      swal.fire({
        text: "Fetching Cancelled",
        icon: "info",
        timer: 1000,
      });
    }
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
      order_item_flag: item.order_item_flag || item.order_item_me_flag,
    }));
    await updateOrderLineItems(reorderedData); // Save reordered list
  };

  const updateOrderLineItems = async orderItems => {
    try {
      await axios.post(
        `${API_BASE_URL}update-order-dragged-lineitems/${id}`,
        {
          lineItems: orderItems,
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

  const [contextMenuTarget, setContextMenuTarget] = useState(null);
  const [anchorPoint, setAnchorPoint] = useState({ x: 0, y: 0 });
  const [showContextMenu, setShowContextMenu] = useState(false);
  // Move selected rows to the top
  const moveToTop = async () => {
    const draggedItems = selectedRows.length > 0 ? selectedRows : [contextMenuTarget._id];
    const itemsToMove = customOrders.filter(item => draggedItems.includes(item._id));
    const remainingItems = customOrders.filter(item => !draggedItems.includes(item._id));
    const updatedOrders = [...itemsToMove, ...remainingItems];
    setCustomOrders(updatedOrders);
    setSelectedRows([]);
    const updatedOrder = updatedOrders.map(item => ({
      _id: item._id,
      order_item_flag: item.order_item_flag || item.order_item_me_flag,
    }));
    setShowContextMenu(false);
    await updateOrderLineItems(updatedOrder);
  };

  // Move selected rows to the bottom
  const moveToBottom = async () => {
    const draggedItems = selectedRows.length > 0 ? selectedRows : [contextMenuTarget._id];
    const itemsToMove = customOrders.filter(item => draggedItems.includes(item._id));
    const remainingItems = customOrders.filter(item => !draggedItems.includes(item._id));
    const updatedOrders = [...remainingItems, ...itemsToMove];
    setCustomOrders(updatedOrders);
    setSelectedRows([]);
    const updatedOrder = updatedOrders.map(item => ({
      _id: item._id,
      order_item_flag: item.order_item_flag || item.order_item_me_flag,
    }));
    setShowContextMenu(false);
    await updateOrderLineItems(updatedOrder);
  };

  // Handle right-click to show context menu
  const handleContextMenu = (event, item) => {
    event.preventDefault();
    setContextMenuTarget(item);
    setAnchorPoint({ x: event.clientX, y: event.clientY });
    setShowContextMenu(true);
  };

  /*tab Code*/
  const [activeTab, setActiveTab] = useState("All");

  useEffect(() => {
    if (CoreOrderDetails?.order_status === "Order Cancelled") {
      setActiveTab("All");
    }
  }, [CoreOrderDetails]);

  useEffect(() => {
    if (!CoreOrderDetails || activeTab === "All") return;

    const tabStatusMap = {
      Flashing: CoreOrderDetails?.f_order_prod_push_status,
      Jobbing: CoreOrderDetails?.j_order_prod_push_status,
      "Fascia Gutter": CoreOrderDetails?.fg_order_prod_push_status,
      Cladding: CoreOrderDetails?.cl_order_prod_push_status,
      GBI: CoreOrderDetails?.gbi_order_prod_push_status,
      Roofing: CoreOrderDetails?.roof_order_prod_push_status,
      GBIL: CoreOrderDetails?.gbil_order_prod_push_status,
    };

    if (!(activeTab in tabStatusMap)) return;

    const currentStatus = tabStatusMap[activeTab];

    if (!currentStatus || currentStatus === 0) {
      setActiveTab("All");
    }
  }, [CoreOrderDetails, activeTab]);

  const [tabData, setTabData] = useState({
    approxCount: "",
    department: "",
  });

  // const handleTabChange = (event, newTab) => {
  //     setActiveTab(newTab);
  //     if (newTab === 'Flashing') {
  //         setIsEditing(false);
  //         setTabData({
  //             approxCount: CoreOrderDetails.f_order_dept_approx_count,
  //             department: "F",
  //         });
  //     } else if (newTab === 'Jobbing') {
  //         setIsEditing(false);
  //         setTabData({
  //             approxCount: CoreOrderDetails.j_order_dept_approx_count,
  //             department: "J",
  //         });
  //     } else if (newTab === 'Fascia Gutter') {
  //         setIsEditing(false);
  //         setTabData({
  //             approxCount: CoreOrderDetails.fg_order_dept_approx_count,
  //             department: "FG",
  //         });
  //     }
  //     else if (newTab === 'Cladding') {
  //         setIsEditing(false);
  //         setTabData({
  //             approxCount: CoreOrderDetails.cl_order_dept_approx_count,
  //             department: "CL",
  //         });
  //     }
  //     else if (newTab === 'Roofing') {
  //         setIsEditing(false);
  //         setTabData({
  //             approxCount: CoreOrderDetails.roof_order_dept_approx_count,
  //             department: "Roof",
  //         });
  //     }
  // };

  const tabs = [<Tab key="all" label="All" value="All" />];
  if (CoreOrderDetails && CoreOrderDetails.order_status !== "Order Cancelled") {
    if (CoreOrderDetails.order_flashing_checker === true) {
      tabs.push(<Tab key="flashing" label="Flashing" value="Flashing" />);
    }
    if (CoreOrderDetails.j_order_prod_push_status && CoreOrderDetails.j_order_prod_push_status !== 0) {
      tabs.push(<Tab key="jobbing" label="Jobbing" value="Jobbing" />);
    }
    if (CoreOrderDetails.fg_order_prod_push_status && CoreOrderDetails.fg_order_prod_push_status !== 0) {
      tabs.push(<Tab key="fascia-gutter" label="Fascia Gutter" value="Fascia Gutter" />);
    }
    if (CoreOrderDetails.cl_order_prod_push_status && CoreOrderDetails.cl_order_prod_push_status !== 0) {
      tabs.push(<Tab key="cladding" label="Cladding" value="Cladding" />);
    }
    if (CoreOrderDetails.gbi_order_prod_push_status && CoreOrderDetails.gbi_order_prod_push_status !== 0) {
      tabs.push(<Tab key="gbi" label="GBI" value="GBI" />);
    }
    if (CoreOrderDetails.roof_order_prod_push_status && CoreOrderDetails.roof_order_prod_push_status !== 0) {
      tabs.push(<Tab key="roofing" label="Roofing" value="Roofing" />);
    }
    if (CoreOrderDetails.gbil_order_prod_push_status && CoreOrderDetails.gbil_order_prod_push_status !== 0) {
      tabs.push(<Tab key="gbil" label="GBIL" value="GBIL" />);
    }
    
    // let doubtBgColor = "";
    // let supplierBgColor = "";
    // switch (CoreOrderDetails.order_doubt_status) {
    //   case "1":
    //     doubtBgColor = "#f8d7da";
    //     break;
    //   case "2":
    //     doubtBgColor = "#d1ecf1";
    //     break;
    //   case "3":
    //     doubtBgColor = "#d4edda"; // light green
    //     break;
    //   default:
    //     doubtBgColor = "";
    // }
    // switch (CoreOrderDetails.order_supplier_status) {
    //   case "1":
    //     supplierBgColor = "#f8d7da";
    //     break;
    //   case "2":
    //     supplierBgColor = "#d4edda";
    //     break;
    //   default:
    //     supplierBgColor = "";
    // }

    // tabs.push(
    //     <Tab
    //         key="doubt"
    //         label="Doubt"
    //         value="doubt"
    //         sx={{
    //             backgroundColor: doubtBgColor,
    //             borderRadius: "4px",
    //         }}
    //     />
    // );
    // tabs.push(<Tab key="supplier-item" label="Supplier Item" value="supplier-item" sx={{
    //     backgroundColor: supplierBgColor,
    //     borderRadius: "4px",
    // }} />);
  }

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
      if (activeTab === 'Flashing' && CoreOrderDetails?.order_unique_id) {
        fetchColorCount();
      }
    }, [activeTab, CoreOrderDetails?.order_unique_id, fetchColorCount]);

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
      {/* Code commented - Old heading section 
      <MyDiv>
        <Row className="GeneralHeading pb-0 flex-wrap pb-2">
          <Col md={8} xs={6} className="d-flex flex-wrap">
            <HeadingTwo className="me-5">Order Item</HeadingTwo>
          </Col>
          <Col md={4} xs={6} className="text-end">
            Add Custom Item / Add a Design buttons were here
          </Col>
        </Row>
      </MyDiv>
      End of commented section */}
      <MyDiv className="GeneralHeading pb-0 flex-wrap mt-1">
        <Row style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
          <Col xs={12} sm={12} md={7} lg={9}>
            <Box sx={{ 
              maxWidth: { xs: 320, sm: 640, md: 900, lg: 1400 }, 
              bgcolor: "background.paper",
              '& .MuiTabs-scrollButtons': {
                '&.Mui-disabled': {
                  opacity: 0.3
                }
              }
            }}>
              <Tabs 
                value={activeTab} 
                onChange={(e, newValue) => setActiveTab(newValue)} 
                variant="scrollable" 
                scrollButtons="auto" 
                TabIndicatorProps={{ 
                  sx: { backgroundColor: "#d22530" } 
                }} 
                sx={{ 
                  "& .MuiTab-root": { 
                    color: "#000",
                    fontSize: { xs: '0.75rem', md: '0.875rem' },
                    // minWidth: { xs: '80px', md: '120px' },
                    padding: { xs: '8px 12px', md: '12px 16px' }
                  }, 
                  "& .Mui-selected": { 
                    color: "#d22530",
                    fontWeight: 600
                  }
                }}>
                {tabs}
              </Tabs>
            </Box>
          </Col>
          
          <Col xs={12} sm={12} md={5} lg={3} className="mt-1 mt-md-0 text-end">
            <MyDiv style={{display:"flex", justifyContent:"flex-end", alignItems:"center", gap:"10px", flexWrap: "wrap"}}>
              {/* File Upload Component for AWF Customer */}
              {(CoreOrderDetails?.order_delivery_address_mode === "1" && 
                CoreOrderDetails?.account_UID === AWF_CUST_ID) && (
                <MyDiv sx={{ flexShrink: 0 }}>
                  <FileUpload orderUpdates={handleOrderDocumentsChange} />
                </MyDiv>
              )}
              
              {/* Add Custom Item Button */}
              {CoreOrderDetails.order_status !== "Order Cancelled" && !CoreOrderDetails.order_hold && (
                <>
                  {(CoreOrderDetails?.order_myob_push_status !== true || 
                    RolePermission?.MYOBResend?.view === "1") && (
                    <MyDiv sx={{ flexShrink: 0 }}>
                      <Button 
                        onClick={e => handleOrderDrawerToggle()} 
                        className="btn primary-btn"
                        sx={{
                          fontSize: { xs: '0.8rem', md: '0.875rem' },
                          padding: { xs: '6px 12px', md: '8px 16px' },
                          whiteSpace: 'nowrap',
                          minWidth: { xs: 'auto', md: '140px' }
                        }}>
                        Add Custom Item
                      </Button>
                    </MyDiv>
                  )}
                </>
              )}
            </MyDiv>
          </Col>
        </Row>
      </MyDiv>
      <MyDiv className="barcodeHideSection">
        <BarCodeList orderId={barCodeListId} BarcodeSuccessInfo={BarcodeSuccessInfo} />
      </MyDiv>
      <Row className="SearchBar GeneralHeading mt-3 hide">
        <Col md={12}>
          <form onSubmit={e => searchSubmit(e)}>
            <Row>
              <Col md={6} className="SearchTextBox">
                <TextField onChange={e => searchHandle(e)} className="textarea" id="search_text" placeholder="Enter Search Text Here...." value={searchData.search_text} variant="standard" />
              </Col>
              <Col md={6} className="text-start">
                <button className="btn primary-btn add-cta search mx-1">Search</button>
              </Col>
            </Row>
          </form>
        </Col>
      </Row>
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
                        <TableHead sx={{ position: 'sticky', top: 0, zIndex: 20 }}>
                          <TableRow>
                            <TableCell align="left" width="70px">
                              S No
                            </TableCell>
                            <TableCell align="left">Shape ID / Item Code</TableCell>
                            <TableCell align="center">Description</TableCell>
                            {/* <TableCell align="left">Material Name</TableCell> */}
                            <TableCell align="left">Color</TableCell>
                            {/* <TableCell align="center" title="Color Spl Price %">
                              CSP %
                            </TableCell> */}
                            <TableCell align="center">Exact Girth</TableCell>
                            {/* <TableCell align="center" title="Rounded Off Girth">
                              ROG
                            </TableCell> */}
                            {/* <TableCell align="center">Folds</TableCell> */}
                            <TableCell align="center">Pieces</TableCell>
                            <TableCell align="center">Length </TableCell>
                            <TableCell align="center">UOM</TableCell>
                            <TableCell align="center" title="Quantity">
                              QTY
                            </TableCell>
                            {RolePermission?.PriceManagement?.view === "1" && (
                              <>
                                <TableCell align="center">Unit Price (A$)</TableCell>
                                {/* <TableCell align="center">Ext. Price</TableCell> */}
                                <TableCell align="center" title="Discount Percentage">
                                  Discount (A$)
                                </TableCell>
                                {/* <TableCell align="center" title="Discount Amount">
                                  Dis. Amt
                                </TableCell> */}
                                <TableCell align="center" title="Discount Unit Price">
                                  DUP (A$)
                                </TableCell>
                                <TableCell align="center">Amt (A$)</TableCell>
                              </>
                            )}
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {customOrders?.length ? (
                            customOrders.map((item, index) => (
                              <React.Fragment key={item._id}>
                                <Draggable key={item._id} draggableId={item._id} index={index} isDragDisabled={CoreOrderDetails?.order_myob_push_status === true ? !(RolePermission?.MYOBResend?.view === "1") : false}>
                                  {provided => (
                                    <TableRow
                                      ref={provided.innerRef}
                                      {...provided.draggableProps}
                                      {...provided.dragHandleProps}
                                      onClick={event => toggleRowSelection(item._id, event)}
                                      onContextMenu={event => handleContextMenu(event, item)}
                                      className={`${selectedRows.includes(item._id) ? "selected" : ""} ${item.order_item_exact_fold > 10 || item.order_item_exact_grith >= (item.product_Color?.startsWith("GALVANISED") ? 1220 : 1203) ? "OrderGFExceed" : null}
                                                                        ${item.departments ? `Department-${item.departments.trim().replace(/[.\s-]/g, "")}` : ""}
                                                                        ${lastEditedItemId === item._id ? "highlight-edited-row" : ""}`}>
                                      <TableCell align="center">{index + 1}</TableCell>
                                      {item.order_item_me_flag === "ME" ? (
                                        <>
                                          <TableCell align="left" sx={{width:"9vw"}}>
                                            <StrongTag>
                                              {item.order_item_me_code}
                                            </StrongTag>
                                          </TableCell>
                                          <TableCell align="left">{item.order_item_me_description}</TableCell>
                                          {/* <TableCell align="center">-</TableCell> */}
                                          {/* <TableCell align="center">-</TableCell> */}
                                          <TableCell align="center">-</TableCell>
                                          {/* <TableCell align="center">-</TableCell> */}
                                          {/* <TableCell align="center">-</TableCell> */}
                                          <TableCell align="center">-</TableCell>
                                          <TableCell align="center">{item.departments === "Delivery Charges" ? " " : item.order_item_me_uom_value}</TableCell>
                                          <TableCell align="center">{item.departments === "Delivery Charges" ? " " : item.order_item_me_length}</TableCell>
                                          <TableCell align="center">{item.departments === "Delivery Charges" ? " " : item.order_item_me_uom}</TableCell>
                                          {RolePermission?.PriceManagement?.view === "1" ? (
                                            <>
                                              <TableCell align="center">
                                                {/* {item.departments === 'Delivery Charges' ? " " : (isNaN(item.order_item_me_quantity) ? "" : parseFloat(item.order_item_me_quantity).toFixed(2))} */}

                                                {item.departments === "Delivery Charges" ? " " : item.departments === "Roofing" ? (isNaN(item.order_item_me_quantity) ? "" : parseFloat(item.order_item_me_quantity).toFixed(2)) : isNaN(item.order_item_me_quantity) ? "" : parseFloat(item.order_item_me_quantity).toFixed(2)}
                                              </TableCell>
                                              <TableCell align="right">
                                                {item.order_item_qty_me_price ? item.order_item_qty_me_price : "0"}
                                              </TableCell>
                                              <TableCell align="right">
                                                {item.order_item_me_discounted_amount ? item.order_item_me_discounted_amount : "0"} {' ('}{item.order_item_me_discount ? item.order_item_me_discount : "0"}%{')'}
                                              </TableCell>
                                              <TableCell align="right">
                                                {item.order_item_qty_me_discounted_price ? item.order_item_qty_me_discounted_price : "0"} 
                                              </TableCell>
                                              <TableCell align="right" className="TableEditDelTd">
                                                <StrongTag>
                                                  {Number(item.order_item_special_me_price || 0).toFixed(2)}
                                                </StrongTag>
                                                {!item.order_item_me_remake && CoreOrderDetails.order_status !== "Order Cancelled" && !CoreOrderDetails.order_hold && (!CoreOrderDetails.order_myob_push_status || RolePermission?.MYOBResend?.view === "1") && (
                                                  <MyDiv className="TableEditDel">
                                                    <Tooltip title="Edit">
                                                      <IconButton aria-label="fingerprint" color="success" onClick={() => OrderEditId(item)}>
                                                        <MdOutlineModeEditOutline />
                                                      </IconButton>
                                                    </Tooltip>
                                                    <Tooltip title="Delete">
                                                      <IconButton aria-label="fingerprint" color="secondary" onClick={() => OrderDeleteId(item)}>
                                                        <MdDelete />
                                                      </IconButton>
                                                    </Tooltip>
                                                  </MyDiv>
                                                )}
                                              </TableCell>
                                            </>
                                          ) : (
                                            <TableCell align="center" className="TableEditDelTd">
                                              {/* {item.departments === 'Delivery Charges' ? " " : (isNaN(item.order_item_me_quantity) ? "" : parseFloat(item.order_item_me_quantity).toFixed(2))} */}

                                              {item.departments === "Delivery Charges" ? " " : item.departments === "Roofing" ? (isNaN(item.order_item_me_quantity) ? "" : parseFloat(item.order_item_me_quantity).toFixed(2)) : isNaN(item.order_item_me_quantity) ? "" : parseFloat(item.order_item_me_quantity).toFixed(2)}
                                              {!item.order_item_me_remake && CoreOrderDetails.order_status !== "Order Cancelled" && !CoreOrderDetails.order_hold && (!CoreOrderDetails.order_myob_push_status || RolePermission?.MYOBResend?.view === "1") && (
                                                <MyDiv className="TableEditDel">
                                                  <Tooltip title="Edit">
                                                    <IconButton aria-label="fingerprint" color="success" onClick={() => OrderEditId(item)}>
                                                      <MdOutlineModeEditOutline />
                                                    </IconButton>
                                                  </Tooltip>
                                                  <Tooltip title="Delete">
                                                    <IconButton aria-label="fingerprint" color="secondary" onClick={() => OrderDeleteId(item)}>
                                                      <MdDelete />
                                                    </IconButton>
                                                  </Tooltip>
                                                </MyDiv>
                                              )}
                                            </TableCell>
                                          )}
                                        </>
                                      ) : (
                                        <>
                                          <TableCell align="left">
                                            <StrongTag>
                                              SID - {item.order_item_shape_id} / {item.order_item_code}
                                            </StrongTag>
                                          </TableCell>
                                          <TableCell align="left">{item.order_item_description}</TableCell>
                                          {/* <TableCell align="left">{item.core_Product_Thickness + " - " + item.core_Product_Name}</TableCell> */}
                                          <TableCell align="left">{item.product_Color}</TableCell>
                                          {/* <TableCell align="center">{item.product_Color_Special_Price} %</TableCell> */}
                                          <TableCell align="center">{item.order_item_exact_grith}</TableCell>
                                          {/* <TableCell align="center">{item.product_Girth}</TableCell> */}
                                          {/* <TableCell align="center">
                                            {item.product_Fold}
                                            {item.order_item_exact_fold > 10 ? <>({item.order_item_exact_fold})</> : null}
                                          </TableCell> */}
                                          <TableCell align="center">{item.order_item_pieces}</TableCell>
                                          <TableCell align="center">{item.order_item_length}</TableCell>
                                          <TableCell align="center">LN MTR</TableCell>
                                          {RolePermission?.PriceManagement?.view === "1" ? (
                                            <>
                                              <TableCell align="center">{parseFloat(item.order_item_quantity).toFixed(2)}</TableCell>
                                              <TableCell align="right">
                                                {item.order_item_price ? parseFloat(item.order_item_price).toFixed(2) : "0"}
                                              </TableCell>
                                              {/* <TableCell align="right">
                                                <CurrencyDisplay value={item.order_item_special_price_original ? item.order_item_special_price_original : "0"} currency="AUD" locale="en-US" />
                                              </TableCell> */}
                                              <TableCell align="right">
                                                {item.order_item_discounted_amount ? item.order_item_discounted_amount : "0"}{' ('} {item.order_item_discount ? item.order_item_discount : "0"}%{')'}
                                              </TableCell>                                              {/* <TableCell align="right">
                                                <CurrencyDisplay value={item.order_item_discounted_amount ? item.order_item_discounted_amount : "0"} currency="AUD" locale="en-US" />
                                              </TableCell> */}
                                              <TableCell align="right">
                                                {item.order_item_qty_discounted_price ? item.order_item_qty_discounted_price : "0"}
                                              </TableCell>
                                              <TableCell align="right" className="TableEditDelTd">
                                                <StrongTag>
                                                  {Number(item.order_item_special_price || 0).toFixed(2)}
                                                </StrongTag>
                                                {!item.order_item_remake && CoreOrderDetails.order_status !== "Order Cancelled" && !CoreOrderDetails.order_hold && (!CoreOrderDetails?.order_myob_push_status || RolePermission?.MYOBResend?.view === "1") && (
                                                  <MyDiv className="TableEditDel">
                                                    <Tooltip title="Edit">
                                                      <IconButton aria-label="fingerprint" color="success" onClick={() => FlashingOrderEditId(item)}>
                                                        <MdOutlineModeEditOutline />
                                                      </IconButton>
                                                    </Tooltip>

                                                    {/* Uncomment if delete is needed later
                                                                                                <Tooltip title="Delete">
                                                                                                    <IconButton
                                                                                                    aria-label="fingerprint"
                                                                                                    color="secondary"
                                                                                                    onClick={() => FlashingOrderDeleteId(item)}
                                                                                                    >
                                                                                                    <MdDelete />
                                                                                                    </IconButton>
                                                                                                </Tooltip>
                                                                                                */}
                                                  </MyDiv>
                                                )}
                                              </TableCell>
                                            </>
                                          ) : (
                                            <TableCell align="center" className="TableEditDelTd">
                                              {parseFloat(item.order_item_quantity).toFixed(2)}
                                              {!item.order_item_remake && CoreOrderDetails.order_status !== "Order Cancelled" && !CoreOrderDetails.order_hold && (!CoreOrderDetails?.order_myob_push_status || RolePermission?.MYOBResend?.view === "1") && (
                                                <MyDiv className="TableEditDel">
                                                  <Tooltip title="Edit">
                                                    <IconButton aria-label="fingerprint" color="success" onClick={() => FlashingOrderEditId(item)}>
                                                      <MdOutlineModeEditOutline />
                                                    </IconButton>
                                                  </Tooltip>
                                                </MyDiv>
                                              )}
                                            </TableCell>
                                          )}
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
              {showContextMenu && (
                <div
                  className="custom-context-menu"
                  style={{
                    position: "fixed",
                    top: `${anchorPoint.y}px`,
                    left: `${anchorPoint.x}px`,
                    backgroundColor: "white",
                    border: "1px solid #ccc",
                    zIndex: 1000,
                    boxShadow: "0px 2px 10px rgba(0, 0, 0, 0.2)",
                  }}>
                  <div style={{ padding: "8px 16px", cursor: "pointer" }} onClick={moveToTop}>
                    Move to Top
                  </div>
                  <div style={{ padding: "8px 16px", cursor: "pointer" }} onClick={moveToBottom}>
                    Move to Bottom
                  </div>
                </div>
              )}
            </>
          )}
        </MyDiv>
      )}
      {activeTab === "Flashing" && CoreOrderDetails?.f_order_prod_push_status !== 0 && (
        <React.Fragment>
          <MyDiv className="orderTabSummery ProfileBasicDetail order-profile mt-2">
            <Card className="ProfileBasicDetailLeftHeader" style={{ padding: ".5rem 18px"}}>
              <Row>
                <Col md={2} className="hide">
                  <form>
                    {/* <Col md={4} className="p-0">
                                        <Row className='m-0'>
                                            <Col md={5} className="ps-0"><LabelTag>Departmental Instructions</LabelTag></Col>
                                            <Col md={6} className="deptInstruction">
                                                {isEditing ? (
                                                    <TextField value={tabData.departmentInstructions} onChange={handleChangeWhiteSpace} id="departmentInstructions" name="departmentInstructions" multiline maxRows={4} ></TextField>
                                                ) : (CoreOrderDetails.f_order_dept_instruction)}
                                            </Col>
                                        </Row>
                                    </Col> */}
                    <Row className="m-0 w-100 p-0 d-flex ProfileCard p-0">
                      <Col md={5} className="p-0 d-flex align-items-center">
                        <LabelTag>Approx Count</LabelTag>
                        {isEditing ? (
                          <Tooltip title="Save">
                            <IconButton aria-label="fingerprint" color="success" onClick={handleSaveClick}>
                              <FaRegSave />
                            </IconButton>
                          </Tooltip>
                        ) : (
                          <Tooltip title="Edit">
                            <IconButton aria-label="fingerprint" color="info" onClick={handleEditClick}>
                              <MdOutlineModeEditOutline />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Col>
                      <Col md={5} className="deptInstruction">
                        {isEditing ? (
                          <>
                            <input type="hidden" name="department" value="F" />
                            <TextField value={tabData.approxCount} onChange={handleChangeWhiteSpace} id="approxCount" name="approxCount"></TextField>
                          </>
                        ) : (
                          <SpanTag className="deptInstructionSpan">{CoreOrderDetails.f_order_dept_approx_count}</SpanTag>
                        )}
                      </Col>
                    </Row>
                  </form>
                </Col>
                <Col md={1}>
                  <OrderDocuments CoreOrder={CoreOrderDetails} department="F" orderUpdates={handleOrderDocumentsChange} />
                  {/* {CoreOrderDetails.f_order_prod_push_status === 2 && RolePermission?.MYOBResend?.view === "1" ? (
                    <Tooltip title="Fetch From Design Tool" className="me-2 ms-2">
                      <IconButton aria-label="fingerprint" disabled={CoreOrderDetails.order_hold} sx={{ color: "#fff", backgroundColor: "#229b2c ", height: "35px", width: "35px", "&:hover": { backgroundColor: "#135c19" } }} onClick={e => orderFetchFromDesignTool()}>
                        <VscGitFetch />
                      </IconButton>
                    </Tooltip>
                  ) : (
                    ""
                  )} */}
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
                  <Col md={7}>
                    <MyDiv className="d-flex justify-content-end align-items-center">
                     {/* Code By Rahul */}
                      <HeadingFive>Table</HeadingFive>
                      <Tooltip title="Toggle Drawing/Order View" className='me-2'>
                          <Switch
                              checked={showDrawingToggle}
                              onChange={() => {
                                setShowDrawingToggle(prev => {
                                  if (prev) {
                                    loadCustomItems();
                                  }
                                  return !prev;
                                });
                              }}
                              color="primary"
                          />
                      </Tooltip>
                      <HeadingFive>Drawings</HeadingFive>
                      {RolePermission?.DrawingAccess?.add === "1" && CoreOrderDetails.order_status !== "Order Cancelled" && CoreOrderDetails.order_design_stage === '5' && (
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
                              currentPage: "orders",
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
                    {CoreOrderDetails.order_images_f.length ? (
                      <>
                        {CoreOrderDetails.order_myob_push_status === true ? (
                          <Badge className="orderMovedToMyobBadge ms-2">Order Data's sent to MYOB</Badge>
                        ) : (
                          <>
                            {CoreOrderDetails.f_order_prod_push_status === 2 ? (
                              <>
                                {/* <Button className='primary-btn' onClick={() => moveToProduction('CL')}>Update Items to Production</Button> */}
                                <Badge className="orderMovedToMyobBadge ms-2">Moved To Production</Badge>
                              </>
                            ) : null}
                          </>
                        )}
                        {CoreOrderDetails.order_myob_push_status === true || CoreOrderDetails.f_order_prod_push_status === 2 ? (
                          <>
                            {mailBtnLoadingMap ? (
                              <IconButton aria-label="fingerprint" color="info" className="IconBtnLoader">
                                <FiLoader />
                              </IconButton>
                            ) : (
                              <>
                                {RolePermission?.PrintResend?.view === "1" ? (
                                  <Tooltip title="Send Barcode Images and Documents to Mail">
                                    <IconButton aria-label="fingerprint" color="info" onClick={() => orderDocsSendMail(id, "F")}>
                                      <FaMailBulk />
                                    </IconButton>
                                  </Tooltip>
                                ) : (
                                  ""
                                )}
                              </>
                            )}
                          </>
                        ) : null}
                      </>
                    ) : (
                      <Badge bg="warning" className="me-2">
                        Document Yet to Add
                      </Badge>
                    )}
                    {/* {mailBtnLoadingMap ? (
                                            <IconButton aria-label="fingerprint" color="info" className='IconBtnLoader'  >
                                                <FiLoader />
                                            </IconButton>
                                        ) : (
                                            <>
                                                {CoreOrderDetails.order_myob_push_status === true ? (
                                                    <Tooltip title="Send Barcode Images and Documents to Mail">
                                                        <IconButton aria-label="fingerprint" color="info" onClick={() => orderDocsSendMail(id, "F")} >
                                                            <FaMailBulk />
                                                        </IconButton>
                                                    </Tooltip>
                                                ) : null}
                                            </>
                                        )} */}
                  </MyDiv>
                </Col>
              </Row>
            </Card>
          </MyDiv>
          {/* code by Rahul */}
              {showDrawingToggle ? (
              <DrawingDetailsTab 
                  orderId={CoreOrderDetails.d_order_unique_id} 
                  mongoId={CoreOrderDetails._id}
                  onDesignDelete={() => {
                    loadCustomItems();
                    // setRefreshFlashing(prev => !prev)
                    fetchColorCount();
                    // Refresh parent component data after deleting drawing
                    orderUpdates();
                  }
                  }
                  currentPage={"orders"}
                  // Quotation check handled
                  type={"order"}
                  showEditDelete={RolePermission.DrawingAccess?.edit === "1" && CoreOrderDetails.order_status !== "Order Cancelled"}
              />
          ) : (
          <MyDiv className="GeneralTable mt-2">
            {loading ? (
              <HeadingFour className="text-center">Loading...</HeadingFour>
            ) : (
              <TableContainer>
                <Table className="bgGrey stripedTable" aria-label="Order table">
                  <TableHead sx={{ position: 'sticky', top: 0, zIndex: 20 }}>
                    <TableRow>
                      <TableCell align="left" width="70px">
                        S No
                      </TableCell>
                      <TableCell align="left">Shape ID / Item Code</TableCell>
                      <TableCell align="center">Description</TableCell>
                      {/* <TableCell align="left">Material Name</TableCell> */}
                      <TableCell align="left">Color</TableCell>
                      {/* <TableCell align="center">Color Spl Price %</TableCell> */}
                      <TableCell align="center">Exact Girth</TableCell>
                      {/* <TableCell align="center">Rounded Off Girth</TableCell> */}
                      {/* <TableCell align="center">Folds</TableCell> */}
                      <TableCell align="center">Pieces</TableCell>
                      <TableCell align="center">Length </TableCell>
                      <TableCell align="center">UOM </TableCell>
                      <TableCell align="center">Quantity</TableCell>
                      {RolePermission?.PriceManagement?.view === "1" && (
                        <>
                          <TableCell align="center">Unit Price (A$)</TableCell>
                          {/* <TableCell align="center">Ext. Price</TableCell> */}
                          <TableCell align="center" title="Discount Percentage">
                            Discount (A$)
                          </TableCell>
                          {/* <TableCell align="center" title="Discount Amount">
                            Dis. Amt
                          </TableCell> */}
                          <TableCell align="center" title="Discount Unit Price">
                            DUP (A$)
                          </TableCell>
                          <TableCell align="center">Amt (A$)</TableCell>
                        </>
                      )}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {customOrders?.length ? (
                      customOrders
                        .filter(item => item.departments === "Flashing" || !item.departments)
                        .map((item, index) => (
                          <React.Fragment key={item._id}>
                            <TableRow
                              className={`${item.order_item_exact_fold > 10 || item.order_item_exact_grith >= (item.product_Color.toUpperCase().startsWith("GALVANISED") ? 1220 : 1203) ? "OrderGFExceed" : null}                                                   
                                                    ${lastEditedItemId === item._id ? "highlight-edited-row" : ""}`}>
                              <TableCell>{index + 1}</TableCell>
                              <TableCell align="left">
                                <StrongTag>
                                  SID - {item.order_item_shape_id} / {item.order_item_code}
                                </StrongTag>
                              </TableCell>
                              <TableCell align="left">{item.order_item_description}</TableCell>
                              {/* <TableCell align="left">{item.core_Product_Thickness + " - " + item.core_Product_Name}</TableCell> */}
                              <TableCell align="left">{item.product_Color}</TableCell>
                              {/* <TableCell align="center">{item.product_Color_Special_Price} %</TableCell> */}
                              <TableCell align="center">{item.order_item_exact_grith}</TableCell>
                              {/* <TableCell align="center">{item.product_Girth}</TableCell> */}
                              {/* <TableCell align="center">
                                {item.product_Fold}
                                {item.order_item_exact_fold > 10 ? <>({item.order_item_exact_fold})</> : null}
                              </TableCell> */}
                              <TableCell align="center">{item.order_item_pieces}</TableCell>
                              <TableCell align="center">{item.order_item_length}</TableCell>
                              <TableCell align="center">LN MTR</TableCell>
                              {RolePermission?.PriceManagement?.view === "1" ? (
                                <>
                                  <TableCell align="center">{parseFloat(item.order_item_quantity).toFixed(2)}</TableCell>
                                  <TableCell align="right">
                                    {item.order_item_price ? parseFloat(item.order_item_price).toFixed(2) : "0"} 
                                  </TableCell>
                                  {/* <TableCell align="right">
                                    <CurrencyDisplay value={item.order_item_special_price_original ? item.order_item_special_price_original : "0"} currency="AUD" locale="en-US" />
                                  </TableCell> */}
                                  <TableCell align="right">{item.order_item_discounted_amount ? item.order_item_discounted_amount : "0"}{' ('} {item.order_item_discount ? item.order_item_discount : "0"}%{')'}</TableCell>
                                  {/* <TableCell align="right">
                                    <CurrencyDisplay value={item.order_item_discounted_amount ? item.order_item_discounted_amount : "0"} currency="AUD" locale="en-US" />
                                  </TableCell> */}
                                  <TableCell align="right">
                                    {item.order_item_qty_discounted_price ? item.order_item_qty_discounted_price : "0"}
                                  </TableCell>
                                  <TableCell align="right" className="TableEditDelTd">
                                    <StrongTag>
                                      {item.order_item_special_price ? item.order_item_special_price : "0"}
                                    </StrongTag>
                                    {!item.order_item_remake && CoreOrderDetails.order_status !== "Order Cancelled" && !CoreOrderDetails.order_hold ? (
                                      <>
                                        {CoreOrderDetails?.order_myob_push_status === false || RolePermission?.MYOBResend?.view === "1" ? (
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
                                      </>
                                    ) : (
                                      ""
                                    )}
                                  </TableCell>
                                </>
                              ) : (
                                <TableCell align="center" className="TableEditDelTd">
                                  {parseFloat(item.order_item_quantity).toFixed(2)}
                                  {!item.order_item_remake && CoreOrderDetails.order_status !== "Order Cancelled" && !CoreOrderDetails.order_hold ? (
                                    <>
                                      {(CoreOrderDetails && CoreOrderDetails.order_myob_push_status === false) || RolePermission?.MYOBResend?.view === "1" ? (
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
                                    </>
                                  ) : (
                                    ""
                                  )}
                                </TableCell>
                              )}
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
          </MyDiv>)}
        </React.Fragment>
      )}
      {activeTab === "Jobbing" && CoreOrderDetails?.j_order_prod_push_status !== 0 && (
        <React.Fragment>
          <MyDiv className="orderTabSummery ProfileBasicDetail order-profile mt-2">
            <Card className="ProfileBasicDetailLeftHeader" style={{ padding: ".5rem 18px"}}>
              <Row>
                <Col md={3} className="hide">
                  <form>
                    {/* <Col md={4} className="p-0">Order Data's sent to MYOB
                                        <Row className='m-0'>
                                            <Col md={5} className="ps-0"><LabelTag>Departmental Instructions</LabelTag></Col>
                                            <Col md={6} className="deptInstruction">
                                                {isEditing ? (
                                                    <TextField value={tabData.departmentInstructions} onChange={handleChangeWhiteSpace} id="departmentInstructions" name="departmentInstructions" multiline maxRows={4} ></TextField>
                                                ) : (CoreOrderDetails.f_order_dept_instruction)}
                                            </Col>
                                        </Row>
                                    </Col> */}
                    <Row className="m-0 w-100 p-0 d-flex ProfileCard p-0">
                      <Col md={5} className="p-0 d-flex align-items-center">
                        <LabelTag>Approx Count</LabelTag>
                        {isEditing ? (
                          <Tooltip title="Save">
                            <IconButton aria-label="fingerprint" color="success" onClick={handleSaveClick}>
                              <FaRegSave />
                            </IconButton>
                          </Tooltip>
                        ) : (
                          <Tooltip title="Edit">
                            <IconButton aria-label="fingerprint" color="info" onClick={handleEditClick}>
                              <MdOutlineModeEditOutline />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Col>
                      <Col md={5} className="deptInstruction">
                        {isEditing ? (
                          <>
                            <input type="hidden" name="department" value="J" />
                            <TextField value={tabData.approxCount} onChange={handleChangeWhiteSpace} id="approxCount" name="approxCount"></TextField>
                          </>
                        ) : (
                          <SpanTag className="deptInstructionSpan">{CoreOrderDetails.j_order_dept_approx_count}</SpanTag>
                        )}
                      </Col>
                    </Row>
                  </form>
                </Col>
                <Col md={3}>
                  <OrderDocuments CoreOrder={CoreOrderDetails} department="J" orderUpdates={handleOrderDocumentsChange} />
                </Col>
                <Col md={9}>
                  <MyDiv className="d-flex justify-content-end align-items-center">
                    {CoreOrderDetails.order_images_j.length ? (
                      <>
                        {CoreOrderDetails.order_myob_push_status === true ? (
                          <Badge className="orderMovedToMyobBadge ms-2">Order Data's sent to MYOB</Badge>
                        ) : (
                          <>
                            {CoreOrderDetails.j_order_prod_push_status === 2 ? (
                              <Badge className="orderMovedToMyobBadge ms-2">Moved To Production</Badge>
                            ) : (
                              <Button className="btn success-btn" type="submit" onClick={() => moveToProduction("J")} disabled={ProductionBtnLoading || CoreOrderDetails.order_hold}>
                                {ProductionBtnLoading ? <Spinner animation="border" size="sm" /> : "Move to Production"}
                              </Button>
                            )}
                          </>
                        )}
                        {CoreOrderDetails.order_myob_push_status === true || CoreOrderDetails.j_order_prod_push_status === 2 ? (
                          <>
                            {mailBtnLoadingMap ? (
                              <IconButton aria-label="fingerprint" color="info" className="IconBtnLoader">
                                <FiLoader />
                              </IconButton>
                            ) : (
                              <>
                                {RolePermission?.PrintResend?.view === "1" ? (
                                  <Tooltip title="Send Barcode Images and Documents to Mail">
                                    <IconButton aria-label="fingerprint" color="info" onClick={() => orderDocsSendMail(id, "J")}>
                                      <FaMailBulk />
                                    </IconButton>
                                  </Tooltip>
                                ) : (
                                  ""
                                )}
                              </>
                            )}
                          </>
                        ) : null}
                      </>
                    ) : (
                      <Badge bg="warning" className="me-2">
                        Document Yet to Add
                      </Badge>
                    )}
                    {/* {CoreOrderDetails.order_myob_push_status === true ? <Badge className='orderMovedToMyobBadge'>Order Data's sent to MYOB</Badge> :
                                            <Button className='success-btn' onClick={() => moveToProduction('J')}>Move to Production</Button>}
                                        {CoreOrderDetails.j_order_prod_push_status === 2 ? <>
                                            {mailBtnLoadingMap ? (
                                                <IconButton aria-label="fingerprint" color="info" className='IconBtnLoader'  >
                                                    <FiLoader />
                                                </IconButton>
                                            ) : (
                                                <>
                                                    <Tooltip title="Send Barcode Images and Documents to Mail">
                                                        <IconButton aria-label="fingerprint" color="info" onClick={() => orderDocsSendMail(id, "J")} >
                                                            <FaMailBulk />
                                                        </IconButton>
                                                    </Tooltip>
                                                </>
                                            )} </> : null
                                        } */}
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
                  <TableHead sx={{ position: 'sticky', top: 0, zIndex: 20 }}>
                    <TableRow>
                      <TableCell align="left" width="70px">
                        S No
                      </TableCell>
                      <TableCell align="left">Inventory ID</TableCell>
                      <TableCell align="left">Description</TableCell>
                      <TableCell align="center">Pieces</TableCell>
                      <TableCell align="center">Length </TableCell>
                      <TableCell align="center">UOM</TableCell>
                      <TableCell align="center" title="Quantity">
                        QTY
                      </TableCell>
                      {RolePermission?.PriceManagement?.view === "1" && (
                        <>
                          <TableCell align="center">Unit Price (A$)</TableCell>
                          {/* <TableCell align="center">Ext. Price</TableCell> */}
                          <TableCell align="center" title="Discount Percentage">
                            Discount (A$)
                          </TableCell>
                          {/* <TableCell align="center" title="Discount Amount">
                            Dis. Amt
                          </TableCell> */}
                          <TableCell align="center" title="Discount Unit Price">
                            DUP (A$)
                          </TableCell>
                          <TableCell align="center">Amt (A$)</TableCell>
                        </>
                      )}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {customOrders?.length ? (
                      customOrders
                        .filter(item => item.departments === "Jobbing")
                        .map((item, index) => (
                          <React.Fragment key={item._id}>
                            <TableRow
                              className={`Department-${item.departments.trim().replace(/\s+/g, "-")}                                                    
                                                        ${lastEditedItemId === item._id ? "highlight-edited-row" : ""}`}>
                              <TableCell>{index + 1}</TableCell>
                              <TableCell align="left" sx={{width:"9vw"}}>
                                <StrongTag>
                                  {item.order_item_me_code}
                                </StrongTag>
                              </TableCell>
                              <TableCell align="left">{item.order_item_me_description}</TableCell>
                              <TableCell align="center">{item.order_item_me_uom_value}</TableCell>
                              <TableCell align="center">{item.order_item_me_length}</TableCell>
                              <TableCell align="center">{item.order_item_me_uom}</TableCell>
                              {RolePermission?.PriceManagement?.view === "1" ? (
                                <>
                                  <TableCell align="center">{parseFloat(item.order_item_me_quantity).toFixed(2)}</TableCell>
                                  <TableCell align="right">
                                    {item.order_item_qty_me_price ? item.order_item_qty_me_price : "0"}
                                  </TableCell>
                                  {/* <TableCell align="right">
                                    {item.order_item_special_me_price_original ? item.order_item_special_me_price_original : "0"}
                                  </TableCell> */}
                                  <TableCell align="right">{item.order_item_me_discounted_amount ? item.order_item_me_discounted_amount : "0"}{' ('}{item.order_item_me_discount ? item.order_item_me_discount : "0"}%{')'}</TableCell>
                                  {/* <TableCell align="right">
                                    <CurrencyDisplay value={item.order_item_me_discounted_amount ? item.order_item_me_discounted_amount : "0"} currency="AUD" locale="en-US" />
                                  </TableCell> */}
                                  <TableCell align="right">
                                    {item.order_item_qty_me_discounted_price ? item.order_item_qty_me_discounted_price : "0"}
                                  </TableCell>
                                  <TableCell align="right" className="TableEditDelTd">
                                    <StrongTag>
                                      {item.order_item_special_me_price ? item.order_item_special_me_price : "0"}
                                    </StrongTag>
                                    {!item.order_item_me_remake && CoreOrderDetails.order_status !== "Order Cancelled" && !CoreOrderDetails.order_hold && (!CoreOrderDetails.order_myob_push_status || RolePermission?.MYOBResend?.view === "1") && (
                                      <MyDiv className="TableEditDel">
                                        <Tooltip title="Edit">
                                          <IconButton aria-label="fingerprint" color="success" onClick={() => OrderEditId(item)}>
                                            <MdOutlineModeEditOutline />
                                          </IconButton>
                                        </Tooltip>
                                        <Tooltip title="Delete">
                                          <IconButton aria-label="fingerprint" color="secondary" onClick={() => OrderDeleteId(item)}>
                                            <MdDelete />
                                          </IconButton>
                                        </Tooltip>
                                      </MyDiv>
                                    )}
                                  </TableCell>
                                </>
                              ) : (
                                <TableCell align="center" className="TableEditDelTd">
                                  {parseFloat(item.order_item_me_quantity).toFixed(2)}
                                  {!item.order_item_me_remake && CoreOrderDetails.order_status !== "Order Cancelled"  && !CoreOrderDetails.order_hold && (!CoreOrderDetails.order_myob_push_status || RolePermission?.MYOBResend?.view === "1") && (
                                    <MyDiv className="TableEditDel">
                                      <Tooltip title="Edit">
                                        <IconButton aria-label="fingerprint" color="success" onClick={() => OrderEditId(item)}>
                                          <MdOutlineModeEditOutline />
                                        </IconButton>
                                      </Tooltip>
                                      <Tooltip title="Delete">
                                        <IconButton aria-label="fingerprint" color="secondary" onClick={() => OrderDeleteId(item)}>
                                          <MdDelete />
                                        </IconButton>
                                      </Tooltip>
                                    </MyDiv>
                                  )}
                                </TableCell>
                              )}
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
      {activeTab === "Fascia Gutter" && CoreOrderDetails?.fg_order_prod_push_status !== 0 && (
        <React.Fragment>
          <MyDiv className="orderTabSummery ProfileBasicDetail order-profile mt-2">
            <Card className="ProfileBasicDetailLeftHeader" style={{ padding: ".5rem 18px"}}>
              <Row>
                <Col md={3} className="hide">
                  <form>
                    {/* <Col md={4} className="p-0">
                                        <Row className='m-0'>
                                            <Col md={5} className="ps-0"><LabelTag>Departmental Instructions</LabelTag></Col>
                                            <Col md={6} className="deptInstruction">
                                                {isEditing ? (
                                                    <TextField value={tabData.departmentInstructions} onChange={handleChangeWhiteSpace} id="departmentInstructions" name="departmentInstructions" multiline maxRows={4} ></TextField>
                                                ) : (CoreOrderDetails.f_order_dept_instruction)}
                                            </Col>
                                        </Row>
                                    </Col> */}
                    <Row className="m-0 w-100 p-0 d-flex ProfileCard p-0">
                      <Col md={5} className="p-0 d-flex align-items-center">
                        <LabelTag>Approx Count</LabelTag>
                        {isEditing ? (
                          <Tooltip title="Save">
                            <IconButton aria-label="fingerprint" color="success" onClick={handleSaveClick}>
                              <FaRegSave />
                            </IconButton>
                          </Tooltip>
                        ) : (
                          <Tooltip title="Edit">
                            <IconButton aria-label="fingerprint" color="info" onClick={handleEditClick}>
                              <MdOutlineModeEditOutline />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Col>
                      <Col md={5} className="deptInstruction">
                        {isEditing ? (
                          <>
                            <input type="hidden" name="department" value="FG" />
                            <TextField value={tabData.approxCount} onChange={handleChangeWhiteSpace} id="approxCount" name="approxCount"></TextField>
                          </>
                        ) : (
                          <SpanTag className="deptInstructionSpan">{CoreOrderDetails.fg_order_dept_approx_count}</SpanTag>
                        )}
                      </Col>
                    </Row>
                  </form>
                </Col>
                <Col md={3}>
                  <OrderDocuments CoreOrder={CoreOrderDetails} department="FG" orderUpdates={handleOrderDocumentsChange} />
                </Col>
                <Col md={9}>
                  <MyDiv className="d-flex justify-content-end align-items-center">
                    {CoreOrderDetails.order_images_fg.length ? (
                      <>
                        {CoreOrderDetails.order_myob_push_status === true ? (
                          <Badge className="orderMovedToMyobBadge ms-2">Order Data's sent to MYOB</Badge>
                        ) : (
                          <>
                            {CoreOrderDetails.fg_order_prod_push_status === 2 ? (
                              <Badge className="orderMovedToMyobBadge ms-2">Moved To Production</Badge>
                            ) : (
                              <Button className="btn success-btn" type="submit" onClick={() => moveToProduction("FG")} disabled={ProductionBtnLoading || CoreOrderDetails.order_hold}>
                                {ProductionBtnLoading ? <Spinner animation="border" size="sm" /> : "Move to Production"}
                              </Button>
                            )}
                          </>
                        )}
                        {CoreOrderDetails.order_myob_push_status === true || CoreOrderDetails.fg_order_prod_push_status === 2 ? (
                          <>
                            {mailBtnLoadingMap ? (
                              <IconButton aria-label="fingerprint" color="info" className="IconBtnLoader">
                                <FiLoader />
                              </IconButton>
                            ) : (
                              <>
                                {RolePermission?.PrintResend?.view === "1" ? (
                                  <Tooltip title="Send Barcode Images and Documents to Mail">
                                    <IconButton aria-label="fingerprint" color="info" onClick={() => orderDocsSendMail(id, "FG")}>
                                      <FaMailBulk />
                                    </IconButton>
                                  </Tooltip>
                                ) : (
                                  ""
                                )}
                              </>
                            )}
                          </>
                        ) : null}
                      </>
                    ) : (
                      <Badge bg="warning" className="me-2">
                        Document Yet to Add
                      </Badge>
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
                  <TableHead sx={{ position: 'sticky', top: 0, zIndex: 20 }}>
                    <TableRow>
                      <TableCell align="left" width="70px">
                        S No
                      </TableCell>
                      <TableCell align="left">Inventory ID</TableCell>
                      <TableCell align="left">Description</TableCell>
                      <TableCell align="center">Pieces</TableCell>
                      <TableCell align="center">Length </TableCell>
                      <TableCell align="center">UOM</TableCell>
                      <TableCell align="center" title="Quantity">
                        QTY
                      </TableCell>
                      {RolePermission?.PriceManagement?.view === "1" && (
                        <>
                          <TableCell align="center">Unit Price (A$)</TableCell>
                          {/* <TableCell align="center">Ext. Price</TableCell> */}
                          <TableCell align="center" title="Discount Percentage">
                            Discount (A$)
                          </TableCell>
                          {/* <TableCell align="center" title="Discount Amount">
                            Dis. Amt
                          </TableCell> */}
                          <TableCell align="center" title="Discount Unit Price">
                            DUP (A$)
                          </TableCell>
                          <TableCell align="center">Amt (A$)</TableCell>
                        </>
                      )}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {customOrders?.length ? (
                      customOrders
                        .filter(item => item.departments === "Fascia Gutter")
                        .map((item, index) => (
                          <React.Fragment key={item._id}>
                            <TableRow
                              className={`Department-${item.departments.trim().replace(/[.\s-]/g, "")}                                                    
                                                        ${lastEditedItemId === item._id ? "highlight-edited-row" : ""}`}>
                              <TableCell align="left">{index + 1}</TableCell>
                              <TableCell align="left" sx={{width:"9vw"}}>
                                <StrongTag>
                                  {item.order_item_me_code}
                                </StrongTag>
                              </TableCell>
                              <TableCell align="left">{item.order_item_me_description}</TableCell>
                              <TableCell align="center">{item.order_item_me_uom_value}</TableCell>
                              <TableCell align="center">{item.order_item_me_length}</TableCell>
                              <TableCell align="center">{item.order_item_me_uom}</TableCell>
                              {RolePermission?.PriceManagement?.view === "1" ? (
                                <>
                                  <TableCell align="center">{parseFloat(item.order_item_me_quantity).toFixed(2)}</TableCell>
                                  <TableCell align="right">
                                    {item.order_item_qty_me_price ? item.order_item_qty_me_price : "0"} 
                                  </TableCell>
                                  {/* <TableCell align="right">
                                    <CurrencyDisplay value={item.order_item_special_me_price_original ? item.order_item_special_me_price_original : "0"} currency="AUD" locale="en-US" />
                                  </TableCell> */}
                                  <TableCell align="right">{item.order_item_me_discounted_amount ? item.order_item_me_discounted_amount : "0"}{' ('}{item.order_item_me_discount ? item.order_item_me_discount : "0"}%{')'}</TableCell>
                                  {/* <TableCell align="right">
                                    <CurrencyDisplay value={item.order_item_me_discounted_amount ? item.order_item_me_discounted_amount : "0"} currency="AUD" locale="en-US" />
                                  </TableCell> */}
                                  <TableCell align="right">
                                    {item.order_item_qty_me_discounted_price ? item.order_item_qty_me_discounted_price : "0"}
                                  </TableCell>
                                  <TableCell align="right" className="TableEditDelTd">
                                    <StrongTag>
                                      {item.order_item_special_me_price ? item.order_item_special_me_price : "0"}
                                    </StrongTag>
                                    {!item.order_item_me_remake && CoreOrderDetails.order_status !== "Order Cancelled" && !CoreOrderDetails.order_hold && (!CoreOrderDetails.order_myob_push_status || RolePermission?.MYOBResend?.view === "1") && (
                                      <MyDiv className="TableEditDel">
                                        <Tooltip title="Edit">
                                          <IconButton aria-label="fingerprint" color="success" onClick={() => OrderEditId(item)}>
                                            <MdOutlineModeEditOutline />
                                          </IconButton>
                                        </Tooltip>
                                        <Tooltip title="Delete">
                                          <IconButton aria-label="fingerprint" color="secondary" onClick={() => OrderDeleteId(item)}>
                                            <MdDelete />
                                          </IconButton>
                                        </Tooltip>
                                      </MyDiv>
                                    )}
                                  </TableCell>
                                </>
                              ) : (
                                <TableCell align="center" className="TableEditDelTd">
                                  {parseFloat(item.order_item_me_quantity).toFixed(2)}
                                  {!item.order_item_me_remake && CoreOrderDetails.order_status !== "Order Cancelled" && !CoreOrderDetails.order_hold && (!CoreOrderDetails.order_myob_push_status || RolePermission?.MYOBResend?.view === "1") && (
                                    <MyDiv className="TableEditDel">
                                      <Tooltip title="Edit">
                                        <IconButton aria-label="fingerprint" color="success" onClick={() => OrderEditId(item)}>
                                          <MdOutlineModeEditOutline />
                                        </IconButton>
                                      </Tooltip>
                                      <Tooltip title="Delete">
                                        <IconButton aria-label="fingerprint" color="secondary" onClick={() => OrderDeleteId(item)}>
                                          <MdDelete />
                                        </IconButton>
                                      </Tooltip>
                                    </MyDiv>
                                  )}
                                </TableCell>
                              )}
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
      {activeTab === "Cladding" && CoreOrderDetails?.cl_order_prod_push_status !== 0 && (
        <React.Fragment>
          <MyDiv className="orderTabSummery ProfileBasicDetail order-profile mt-2">
            <Card className="ProfileBasicDetailLeftHeader" style={{ padding: ".5rem 18px"}}>
              <Row>
                <Col md={3} className="hide">
                  <form>
                    {/* <Col md={4} className="p-0">
                                        <Row className='m-0'>
                                            <Col md={5} className="ps-0"><LabelTag>Departmental Instructions</LabelTag></Col>
                                            <Col md={6} className="deptInstruction">
                                                {isEditing ? (
                                                    <TextField value={tabData.departmentInstructions} onChange={handleChangeWhiteSpace} id="departmentInstructions" name="departmentInstructions" multiline maxRows={4} ></TextField>
                                                ) : (CoreOrderDetails.f_order_dept_instruction)}
                                            </Col>
                                        </Row>
                                    </Col> */}

                    <Row className="m-0 w-100 p-0 d-flex ProfileCard p-0">
                      <Col md={5} className="p-0 d-flex align-items-center">
                        <LabelTag>Approx Count</LabelTag>
                        {isEditing ? (
                          <Tooltip title="Save">
                            <IconButton aria-label="fingerprint" color="success" onClick={handleSaveClick}>
                              <FaRegSave />
                            </IconButton>
                          </Tooltip>
                        ) : (
                          <Tooltip title="Edit">
                            <IconButton aria-label="fingerprint" color="info" onClick={handleEditClick}>
                              <MdOutlineModeEditOutline />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Col>
                      <Col md={5} className="deptInstruction">
                        {isEditing ? (
                          <>
                            <input type="hidden" name="department" value="CL" />
                            <TextField value={tabData.approxCount} onChange={handleChangeWhiteSpace} id="approxCount" name="approxCount"></TextField>
                          </>
                        ) : (
                          <SpanTag className="deptInstructionSpan">{CoreOrderDetails.cl_order_dept_approx_count}</SpanTag>
                        )}
                      </Col>
                    </Row>
                  </form>
                </Col>
                <Col md={3}>
                  <OrderDocuments CoreOrder={CoreOrderDetails} department="CL" orderUpdates={handleOrderDocumentsChange} />
                </Col>
                <Col md={9}>
                  <MyDiv className="d-flex justify-content-end align-items-center">
                    {CoreOrderDetails.order_images_cl.length ? (
                      <>
                        {CoreOrderDetails.order_myob_push_status === true ? (
                          <Badge className="orderMovedToMyobBadge ms-2">Order Data's sent to MYOB</Badge>
                        ) : (
                          <>
                            {CoreOrderDetails.cl_order_prod_push_status === 2 ? (
                              <Badge className="orderMovedToMyobBadge ms-2">Moved To Production</Badge>
                            ) : (
                              <Button className="btn success-btn" type="submit" onClick={() => moveToProduction("CL")} disabled={ProductionBtnLoading || CoreOrderDetails.order_hold}>
                                {ProductionBtnLoading ? <Spinner animation="border" size="sm" /> : "Move to Production"}
                              </Button>
                            )}
                          </>
                        )}
                        {CoreOrderDetails.order_myob_push_status === true || CoreOrderDetails.cl_order_prod_push_status === 2 ? (
                          <>
                            {mailBtnLoadingMap ? (
                              <IconButton aria-label="fingerprint" color="info" className="IconBtnLoader">
                                <FiLoader />
                              </IconButton>
                            ) : (
                              <>
                                {RolePermission?.PrintResend?.view === "1" ? (
                                  <Tooltip title="Send Barcode Images and Documents to Mail">
                                    <IconButton aria-label="fingerprint" color="info" onClick={() => orderDocsSendMail(id, "CL")}>
                                      <FaMailBulk />
                                    </IconButton>
                                  </Tooltip>
                                ) : (
                                  ""
                                )}
                              </>
                            )}
                          </>
                        ) : null}
                      </>
                    ) : (
                      <Badge bg="warning" className="me-2">
                        Document Yet to Add
                      </Badge>
                    )}
                    {/* {CoreOrderDetails.cl_order_prod_push_status === 2 ? <>
                                            {mailBtnLoadingMap ? (
                                                <IconButton aria-label="fingerprint" color="info" className='IconBtnLoader'  >
                                                    <FiLoader />
                                                </IconButton>
                                            ) : (
                                                <>
                                                    <Tooltip title="Send Barcode Images and Documents to Mail">
                                                        <IconButton aria-label="fingerprint" color="info" onClick={() => orderDocsSendMail(id, "CL")} >
                                                            <FaMailBulk />
                                                        </IconButton>
                                                    </Tooltip>
                                                </>
                                            )} </> : null
                                        } */}

                    {/* {CoreOrderDetails.order_myob_push_status === true ? <MyDiv>
                                            <Badge className='orderMovedToMyobBadge'>Order Data's sent to MYOB</Badge></MyDiv> : 
                                            <>{CoreOrderDetails.cl_order_prod_push_status === 2 ? 
                                            <Badge className='orderMovedToProdBtn'>Moved to Production</Badge>: 
                                            <Button className='success-btn' onClick={() => moveToProduction('CL')}>Move to Production</Button>   }</>
                                        }                                       
                                        
                                        {mailBtnLoadingMap ? (
                                            <IconButton aria-label="fingerprint" color="info" className='IconBtnLoader'  >
                                                <FiLoader />
                                            </IconButton>
                                        ) : (
                                            <>
                                                {CoreOrderDetails.order_myob_push_status === true ? (
                                                    <Tooltip title="Send Barcode Images and Documents to Mail">
                                                        <IconButton aria-label="fingerprint" color="info" onClick={() => orderDocsSendMail(id, "CL")} >
                                                            <FaMailBulk />
                                                        </IconButton>
                                                    </Tooltip>
                                                ) : null}
                                            </>
                                        )} */}
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
                  <TableHead sx={{ position: 'sticky', top: 0, zIndex: 20 }}>
                    <TableRow>
                      <TableCell align="left" width="70px">
                        S No
                      </TableCell>
                      <TableCell align="left">Inventory ID</TableCell>
                      <TableCell align="left">Description</TableCell>
                      <TableCell align="center">Pieces</TableCell>
                      <TableCell align="center">Length </TableCell>
                      <TableCell align="center">UOM</TableCell>
                      <TableCell align="center" title="Quantity">
                        QTY
                      </TableCell>
                      {RolePermission?.PriceManagement?.view === "1" && (
                        <>
                          <TableCell align="center">Unit Price (A$)</TableCell>
                          {/* <TableCell align="center">Ext. Price</TableCell> */}
                          <TableCell align="center" title="Discount Percentage">
                            Discount (A$) 
                          </TableCell>
                          {/* <TableCell align="center" title="Discount Amount">
                            Dis. Amt
                          </TableCell> */}
                          <TableCell align="center" title="Discount Unit Price">
                            DUP (A$)
                          </TableCell>
                          <TableCell align="center">Amt (A$)</TableCell>
                        </>
                      )}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {customOrders?.length ? (
                      customOrders
                        .filter(item => item.departments === "Cladding")
                        .map((item, index) => (
                          <React.Fragment key={item._id}>
                            <TableRow
                              className={`Department-${item.departments.trim().replace(/[.\s-]/g, "")}                                                    
                                                        ${lastEditedItemId === item._id ? "highlight-edited-row" : ""}`}>
                              <TableCell align="left">{index + 1}</TableCell>
                              <TableCell align="left" sx={{width:"9vw"}}>
                                <StrongTag>
                                  {item.order_item_me_code}
                                </StrongTag>
                              </TableCell>
                              <TableCell align="left">{item.order_item_me_description}</TableCell>
                              <TableCell align="center">{item.order_item_me_uom_value}</TableCell>
                              <TableCell align="center">{item.order_item_me_length}</TableCell>
                              <TableCell align="center">{item.order_item_me_uom}</TableCell>
                              {RolePermission?.PriceManagement?.view === "1" ? (
                                <>
                                  <TableCell align="center">{parseFloat(item.order_item_me_quantity).toFixed(2)}</TableCell>
                                  <TableCell align="right">
                                    {item.order_item_qty_me_price ? item.order_item_qty_me_price : "0"}
                                  </TableCell>
                                  {/* <TableCell align="right">
                                    <CurrencyDisplay value={item.order_item_special_me_price_original ? item.order_item_special_me_price_original : "0"} currency="AUD" locale="en-US" />
                                  </TableCell> */}
                                  <TableCell align="right">{item.order_item_me_discounted_amount ? item.order_item_me_discounted_amount : "0"}{' ('}{item.order_item_me_discount ? item.order_item_me_discount : "0"}%{')'}</TableCell>
                                  {/* <TableCell align="right">
                                    <CurrencyDisplay value={item.order_item_me_discounted_amount ? item.order_item_me_discounted_amount : "0"} currency="AUD" locale="en-US" />
                                  </TableCell> */}
                                  <TableCell align="right">
                                    {item.order_item_qty_me_discounted_price ? item.order_item_qty_me_discounted_price : "0"} 
                                  </TableCell>
                                  <TableCell align="right" className="TableEditDelTd">
                                    <StrongTag>
                                      {item.order_item_special_me_price ? item.order_item_special_me_price : "0"} 
                                    </StrongTag>
                                    {!item.order_item_me_remake && CoreOrderDetails.order_status !== "Order Cancelled" && !CoreOrderDetails.order_hold && (!CoreOrderDetails.order_myob_push_status || RolePermission?.MYOBResend?.view === "1") && (
                                      <MyDiv className="TableEditDel">
                                        <Tooltip title="Edit">
                                          <IconButton aria-label="fingerprint" color="success" onClick={() => OrderEditId(item)}>
                                            <MdOutlineModeEditOutline />
                                          </IconButton>
                                        </Tooltip>
                                        <Tooltip title="Delete">
                                          <IconButton aria-label="fingerprint" color="secondary" onClick={() => OrderDeleteId(item)}>
                                            <MdDelete />
                                          </IconButton>
                                        </Tooltip>
                                      </MyDiv>
                                    )}
                                  </TableCell>
                                </>
                              ) : (
                                <TableCell align="center" className="TableEditDelTd">
                                  {parseFloat(item.order_item_me_quantity).toFixed(2)}
                                  {!item.order_item_me_remake && CoreOrderDetails.order_status !== "Order Cancelled" && !CoreOrderDetails.order_hold && (!CoreOrderDetails.order_myob_push_status || RolePermission?.MYOBResend?.view === "1") && (
                                    <MyDiv className="TableEditDel">
                                      <Tooltip title="Edit">
                                        <IconButton aria-label="fingerprint" color="success" onClick={() => OrderEditId(item)}>
                                          <MdOutlineModeEditOutline />
                                        </IconButton>
                                      </Tooltip>
                                      <Tooltip title="Delete">
                                        <IconButton aria-label="fingerprint" color="secondary" onClick={() => OrderDeleteId(item)}>
                                          <MdDelete />
                                        </IconButton>
                                      </Tooltip>
                                    </MyDiv>
                                  )}
                                </TableCell>
                              )}
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
      {activeTab === "GBI" && CoreOrderDetails?.gbi_order_prod_push_status !== 0 && (
        <React.Fragment>
          <MyDiv className="orderTabSummery ProfileBasicDetail order-profile mt-2">
            <Card className="ProfileBasicDetailLeftHeader" style={{ padding: ".5rem 18px"}}>
              <Row>
                <Col md={3} className="hide">
                  <form>
                    {/* <Col md={4} className="p-0">
                                        <Row className='m-0'>
                                            <Col md={5} className="ps-0"><LabelTag>Departmental Instructions</LabelTag></Col>
                                            <Col md={6} className="deptInstruction">
                                                {isEditing ? (
                                                    <TextField value={tabData.departmentInstructions} onChange={handleChangeWhiteSpace} id="departmentInstructions" name="departmentInstructions" multiline maxRows={4} ></TextField>
                                                ) : (CoreOrderDetails.f_order_dept_instruction)}
                                            </Col>
                                        </Row>
                                    </Col> */}

                    <Row className="m-0 w-100 p-0 d-flex ProfileCard p-0">
                      <Col md={5} className="p-0 d-flex align-items-center">
                        <LabelTag>Approx Count</LabelTag>
                        {isEditing ? (
                          <Tooltip title="Save">
                            <IconButton aria-label="fingerprint" color="success" onClick={handleSaveClick}>
                              <FaRegSave />
                            </IconButton>
                          </Tooltip>
                        ) : (
                          <Tooltip title="Edit">
                            <IconButton aria-label="fingerprint" color="info" onClick={handleEditClick}>
                              <MdOutlineModeEditOutline />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Col>
                      <Col md={5} className="deptInstruction">
                        {isEditing ? (
                          <>
                            <input type="hidden" name="department" value="GBI" />
                            <TextField value={tabData.approxCount} onChange={handleChangeWhiteSpace} id="approxCount" name="approxCount"></TextField>
                          </>
                        ) : (
                          <SpanTag className="deptInstructionSpan">{CoreOrderDetails.gbi_order_dept_approx_count}</SpanTag>
                        )}
                      </Col>
                    </Row>
                  </form>
                </Col>

                <Col md={3}>
                  <OrderDocuments CoreOrder={CoreOrderDetails} department="GBI" orderUpdates={handleOrderDocumentsChange} />
                </Col>
                <Col md={9}>
                  <MyDiv className="d-flex justify-content-end align-items-center">
                    {CoreOrderDetails?.order_images_gbi?.length ? (
                      <>
                        {CoreOrderDetails.order_myob_push_status === true ? (
                          <Badge className="orderMovedToMyobBadge ms-2">Order Data's sent to MYOB</Badge>
                        ) : (
                          <>
                            {CoreOrderDetails.gbi_order_prod_push_status === 2 ? (
                              <Badge className="orderMovedToMyobBadge ms-2">Moved To Production</Badge>
                            ) : (
                              <Button className="btn success-btn" type="submit" onClick={() => moveToProduction("GBI")} disabled={ProductionBtnLoading || CoreOrderDetails.order_hold}>
                                {ProductionBtnLoading ? <Spinner animation="border" size="sm" /> : "Move to Production"}
                              </Button>
                            )}
                          </>
                        )}
                        {CoreOrderDetails.order_myob_push_status === true || CoreOrderDetails.gbi_order_prod_push_status === 2 ? (
                          <>
                            {mailBtnLoadingMap ? (
                              <IconButton aria-label="fingerprint" color="info" className="IconBtnLoader">
                                <FiLoader />
                              </IconButton>
                            ) : (
                              <>
                                {RolePermission?.PrintResend?.view === "1" ? (
                                  <Tooltip title="Send Barcode Images and Documents to Mail">
                                    <IconButton aria-label="fingerprint" color="info" onClick={() => orderDocsSendMail(id, "GBI")}>
                                      <FaMailBulk />
                                    </IconButton>
                                  </Tooltip>
                                ) : (
                                  ""
                                )}
                              </>
                            )}
                          </>
                        ) : null}
                      </>
                    ) : (
                      <Badge bg="warning" className="me-2">
                        Document Yet to Add
                      </Badge>
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
                  <TableHead sx={{ position: 'sticky', top: 0, zIndex: 20 }}>
                    <TableRow>
                      <TableCell align="left" width="70px">
                        S No
                      </TableCell>
                      <TableCell align="left">Inventory ID</TableCell>
                      <TableCell align="left">Description</TableCell>
                      <TableCell align="center">Pieces</TableCell>
                      <TableCell align="center">Length </TableCell>
                      <TableCell align="center">UOM</TableCell>
                      <TableCell align="center" title="Quantity">
                        QTY
                      </TableCell>
                      {RolePermission?.PriceManagement?.view === "1" && (
                        <>
                          <TableCell align="center">Unit Price (A$)</TableCell>
                          {/* <TableCell align="center">Ext. Price</TableCell> */}
                          <TableCell align="center" title="Discount Percentage">
                            Discount (A$)
                          </TableCell>
                          {/* <TableCell align="center" title="Discount Amount">
                            Dis. Amt
                          </TableCell> */}
                          <TableCell align="center" title="Discount Unit Price">
                            DUP (A$)
                          </TableCell>
                          <TableCell align="center">Amt (A$)</TableCell>
                        </>
                      )}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {customOrders?.length ? (
                      customOrders
                        .filter(item => item.departments === "GBI Orders")
                        .map((item, index) => (
                          <React.Fragment key={item._id}>
                            <TableRow
                              className={`Department-${item.departments.trim().replace(/[.\s-]/g, "")}                                                    
                                                        ${lastEditedItemId === item._id ? "highlight-edited-row" : ""}`}>
                              <TableCell align="left">{index + 1}</TableCell>
                              <TableCell align="left" sx={{width:"9vw"}}>
                                  <StrongTag>
                                    {item.order_item_me_code}
                                  </StrongTag>
                              </TableCell>
                              <TableCell align="left">{item.order_item_me_description}</TableCell>
                              <TableCell align="center">{item.order_item_me_uom_value}</TableCell>
                              <TableCell align="center">{item.order_item_me_length}</TableCell>
                              <TableCell align="center">{item.order_item_me_uom}</TableCell>
                              {RolePermission?.PriceManagement?.view === "1" ? (
                                <>
                                  <TableCell align="center">{parseFloat(item.order_item_me_quantity).toFixed(2)}</TableCell>
                                  <TableCell align="right">
                                    {item.order_item_qty_me_price ? item.order_item_qty_me_price : "0"} 
                                  </TableCell>
                                  {/* <TableCell align="right">
                                    <CurrencyDisplay value={item.order_item_special_me_price_original ? item.order_item_special_me_price_original : "0"} currency="AUD" locale="en-US" />
                                  </TableCell> */}
                                  <TableCell align="right">{item.order_item_me_discounted_amount ? item.order_item_me_discounted_amount : "0"}{' ('}{item.order_item_me_discount ? item.order_item_me_discount : "0"}%{')'}</TableCell>
                                  {/* <TableCell align="right">
                                    <CurrencyDisplay value={item.order_item_me_discounted_amount ? item.order_item_me_discounted_amount : "0"} currency="AUD" locale="en-US" />
                                  </TableCell> */}
                                  <TableCell align="right">
                                    {item.order_item_qty_me_discounted_price ? item.order_item_qty_me_discounted_price : "0"}
                                  </TableCell>
                                  <TableCell align="right" className="TableEditDelTd">
                                    <StrongTag>
                                      {item.order_item_special_me_price ? item.order_item_special_me_price : "0"}
                                    </StrongTag>
                                    {!item.order_item_me_remake && CoreOrderDetails.order_status !== "Order Cancelled" && !CoreOrderDetails.order_hold && (!CoreOrderDetails.order_myob_push_status || RolePermission?.MYOBResend?.view === "1") && (
                                      <MyDiv className="TableEditDel">
                                        <Tooltip title="Edit">
                                          <IconButton aria-label="fingerprint" color="success" onClick={() => OrderEditId(item)}>
                                            <MdOutlineModeEditOutline />
                                          </IconButton>
                                        </Tooltip>
                                        <Tooltip title="Delete">
                                          <IconButton aria-label="fingerprint" color="secondary" onClick={() => OrderDeleteId(item)}>
                                            <MdDelete />
                                          </IconButton>
                                        </Tooltip>
                                      </MyDiv>
                                    )}
                                  </TableCell>
                                </>
                              ) : (
                                <TableCell align="center" className="TableEditDelTd">
                                  {parseFloat(item.order_item_me_quantity).toFixed(2)}
                                  {!item.order_item_me_remake && CoreOrderDetails.order_status !== "Order Cancelled" && !CoreOrderDetails.order_hold && (!CoreOrderDetails.order_myob_push_status || RolePermission?.MYOBResend?.view === "1") && (
                                    <MyDiv className="TableEditDel">
                                      <Tooltip title="Edit">
                                        <IconButton aria-label="fingerprint" color="success" onClick={() => OrderEditId(item)}>
                                          <MdOutlineModeEditOutline />
                                        </IconButton>
                                      </Tooltip>
                                      <Tooltip title="Delete">
                                        <IconButton aria-label="fingerprint" color="secondary" onClick={() => OrderDeleteId(item)}>
                                          <MdDelete />
                                        </IconButton>
                                      </Tooltip>
                                    </MyDiv>
                                  )}
                                </TableCell>
                              )}
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
      {activeTab === "Roofing" && CoreOrderDetails?.roof_order_prod_push_status !== 0 && (
        <React.Fragment>
          <MyDiv className="orderTabSummery ProfileBasicDetail order-profile mt-2">
            <Card className="ProfileBasicDetailLeftHeader" style={{ padding: ".5rem 18px"}}>
              <Row>
                <Col md={3} className="hide">
                  <form>
                    {/* <Col md={4} className="p-0">
                                        <Row className='m-0'>
                                            <Col md={5} className="ps-0"><LabelTag>Departmental Instructions</LabelTag></Col>
                                            <Col md={6} className="deptInstruction">
                                                {isEditing ? (
                                                    <TextField value={tabData.departmentInstructions} onChange={handleChangeWhiteSpace} id="departmentInstructions" name="departmentInstructions" multiline maxRows={4} ></TextField>
                                                ) : (CoreOrderDetails.f_order_dept_instruction)}
                                            </Col>
                                        </Row>
                                    </Col> */}
                    <Row className="m-0 w-100 p-0 d-flex ProfileCard p-0">
                      <Col md={5} className="p-0 d-flex align-items-center">
                        <LabelTag>Approx Count</LabelTag>
                        {isEditing ? (
                          <Tooltip title="Save">
                            <IconButton aria-label="fingerprint" color="success" onClick={handleSaveClick}>
                              <FaRegSave />
                            </IconButton>
                          </Tooltip>
                        ) : (
                          <Tooltip title="Edit">
                            <IconButton aria-label="fingerprint" color="info" onClick={handleEditClick}>
                              <MdOutlineModeEditOutline />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Col>
                      <Col md={5} className="deptInstruction">
                        {isEditing ? (
                          <>
                            <input type="hidden" name="department" value="ROOF" />
                            <TextField value={tabData.approxCount} onChange={handleChangeWhiteSpace} id="approxCount" name="approxCount"></TextField>
                          </>
                        ) : (
                          <SpanTag className="deptInstructionSpan">{CoreOrderDetails.roof_order_dept_approx_count}</SpanTag>
                        )}
                      </Col>
                    </Row>
                  </form>
                </Col>
                <Col md={3}>
                  <OrderDocuments CoreOrder={CoreOrderDetails} department="ROOF" orderUpdates={handleOrderDocumentsChange} />
                </Col>
                <Col md={9}>
                  <MyDiv className="d-flex justify-content-end align-items-center">
                    {CoreOrderDetails.order_images_roof.length ? (
                      <>
                        {CoreOrderDetails.order_myob_push_status === true ? (
                          <Badge className="orderMovedToMyobBadge ms-2">Order Data's sent to MYOB</Badge>
                        ) : (
                          <>
                            {CoreOrderDetails.roof_order_prod_push_status === 2 ? (
                              <>
                                {/* <Button className='primary-btn' onClick={() => moveToProduction('CL')}>Update Items to Production</Button> */}
                                <Badge className="orderMovedToMyobBadge ms-2">Moved To Production</Badge>
                              </>
                            ) : (
                              <Button className="btn success-btn" type="submit" onClick={() => moveToProduction("ROOF")} disabled={ProductionBtnLoading || CoreOrderDetails.order_hold}>
                                {ProductionBtnLoading ? <Spinner animation="border" size="sm" /> : "Move to Production"}
                              </Button>
                            )}
                          </>
                        )}
                        {CoreOrderDetails.order_myob_push_status === true || CoreOrderDetails.roof_order_prod_push_status === 2 ? (
                          <>
                            {mailBtnLoadingMap ? (
                              <IconButton aria-label="fingerprint" color="info" className="IconBtnLoader">
                                <FiLoader />
                              </IconButton>
                            ) : (
                              <>
                                {RolePermission?.PrintResend?.view === "1" ? (
                                  <Tooltip title="Send Barcode Images and Documents to Mail">
                                    <IconButton aria-label="fingerprint" color="info" onClick={() => orderDocsSendMail(id, "ROOF")}>
                                      <FaMailBulk />
                                    </IconButton>
                                  </Tooltip>
                                ) : (
                                  ""
                                )}
                              </>
                            )}
                          </>
                        ) : null}
                      </>
                    ) : (
                      <Badge bg="warning" className="me-2">
                        Document Yet to Add
                      </Badge>
                    )}
                    {/* {CoreOrderDetails.order_myob_push_status === true ? <Badge className='orderMovedToMyobBadge'>Order Data's sent to MYOB</Badge> :
                                            <Button className='success-btn' onClick={() => moveToProduction('ROOF')}>Move to Production</Button>}
                                        {CoreOrderDetails.roof_order_prod_push_status === 2 ? <>
                                            {mailBtnLoadingMap ? (
                                                <IconButton aria-label="fingerprint" color="info" className='IconBtnLoader'  >
                                                    <FiLoader />
                                                </IconButton>
                                            ) : (
                                                <>
                                                    <Tooltip title="Send Barcode Images and Documents to Mail">
                                                        <IconButton aria-label="fingerprint" color="info" onClick={() => orderDocsSendMail(id, "ROOF")} >
                                                            <FaMailBulk />
                                                        </IconButton>
                                                    </Tooltip>
                                                </>
                                            )} </> : null
                                        } */}
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
                  <TableHead sx={{ position: 'sticky', top: 0, zIndex: 20 }}>
                    <TableRow>
                      <TableCell align="left" width="70px">
                        S No
                      </TableCell>
                      <TableCell align="left">Inventory ID</TableCell>
                      <TableCell align="left">Description</TableCell>
                      <TableCell align="center">Pieces</TableCell>
                      <TableCell align="center">Length </TableCell>
                      <TableCell align="center">UOM</TableCell>
                      <TableCell align="center" title="Quantity">
                        QTY
                      </TableCell>
                      {RolePermission?.PriceManagement?.view === "1" && (
                        <>
                          <TableCell align="center">Unit Price (A$)</TableCell>
                          {/* <TableCell align="center">Ext. Price</TableCell> */}
                          <TableCell align="center" title="Discount Percentage">
                            Discount (A$)
                          </TableCell>
                          {/* <TableCell align="center" title="Discount Amount">
                            Dis. Amt
                          </TableCell> */}
                          <TableCell align="center" title="Discount Unit Price">
                            DUP (A$)
                          </TableCell>
                          <TableCell align="center">Amt (A$)</TableCell>
                        </>
                      )}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {customOrders?.length ? (
                      customOrders
                        .filter(item => item.departments === "Roofing")
                        .map((item, index) => (
                          <React.Fragment key={item._id}>
                            <TableRow
                              className={`Department-${item.departments.trim().replace(/\s+/g, "-")}                                                    
                                                        ${lastEditedItemId === item._id ? "highlight-edited-row" : ""}`}>
                              <TableCell align="left">{index + 1}</TableCell>
                             <TableCell align="left" sx={{width:"9vw"}}>
                                <StrongTag>
                                  {item.order_item_me_code}
                                </StrongTag>
                              </TableCell>
                              <TableCell align="left">{item.order_item_me_description}</TableCell>
                              <TableCell align="center">{item.order_item_me_uom_value}</TableCell>
                              <TableCell align="center">{item.order_item_me_length}</TableCell>
                              <TableCell align="center">{item.order_item_me_uom}</TableCell>

                              {RolePermission?.PriceManagement?.view === "1" ? (
                                <>
                                  <TableCell align="center">{parseFloat(item.order_item_me_quantity).toFixed(2)}</TableCell>
                                  <TableCell align="right">
                                    {item.order_item_qty_me_price ? item.order_item_qty_me_price : "0"}
                                  </TableCell>
                                  {/* <TableCell align="right">
                                    <CurrencyDisplay value={item.order_item_special_me_price_original ? item.order_item_special_me_price_original : "0"} currency="AUD" locale="en-US" />
                                  </TableCell> */}
                                  <TableCell align="right">{item.order_item_me_discounted_amount ? item.order_item_me_discounted_amount : "0"}{' ('}{item.order_item_me_discount ? item.order_item_me_discount : "0"}%{')'}</TableCell>
                                  {/* <TableCell align="right">
                                    <CurrencyDisplay value={item.order_item_me_discounted_amount ? item.order_item_me_discounted_amount : "0"} currency="AUD" locale="en-US" />
                                  </TableCell> */}
                                  <TableCell align="right">
                                    {item.order_item_qty_me_discounted_price ? item.order_item_qty_me_discounted_price : "0"} 
                                  </TableCell>
                                  <TableCell align="right" className="TableEditDelTd">
                                    <StrongTag>
                                      {Number(item.order_item_special_me_price || 0).toFixed(2)}
                                    </StrongTag>
                                    {!item.order_item_me_remake && CoreOrderDetails.order_status !== "Order Cancelled" && !CoreOrderDetails.order_hold && (!CoreOrderDetails.order_myob_push_status || RolePermission?.MYOBResend?.view === "1") && (
                                      <MyDiv className="TableEditDel">
                                        <Tooltip title="Edit">
                                          <IconButton aria-label="fingerprint" color="success" onClick={() => OrderEditId(item)}>
                                            <MdOutlineModeEditOutline />
                                          </IconButton>
                                        </Tooltip>
                                        <Tooltip title="Delete">
                                          <IconButton aria-label="fingerprint" color="secondary" onClick={() => OrderDeleteId(item)}>
                                            <MdDelete />
                                          </IconButton>
                                        </Tooltip>
                                      </MyDiv>
                                    )}
                                  </TableCell>
                                </>
                              ) : (
                                <TableCell align="center" className="TableEditDelTd">
                                  {parseFloat(item.order_item_me_quantity).toFixed(2)}
                                  {!item.order_item_me_remake && CoreOrderDetails.order_status !== "Order Cancelled" && !CoreOrderDetails.order_hold && (!CoreOrderDetails.order_myob_push_status || RolePermission?.MYOBResend?.view === "1") && (
                                    <MyDiv className="TableEditDel">
                                      <Tooltip title="Edit">
                                        <IconButton aria-label="fingerprint" color="success" onClick={() => OrderEditId(item)}>
                                          <MdOutlineModeEditOutline />
                                        </IconButton>
                                      </Tooltip>
                                      <Tooltip title="Delete">
                                        <IconButton aria-label="fingerprint" color="secondary" onClick={() => OrderDeleteId(item)}>
                                          <MdDelete />
                                        </IconButton>
                                      </Tooltip>
                                    </MyDiv>
                                  )}
                                </TableCell>
                              )}
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
      {activeTab === "GBIL" && CoreOrderDetails?.gbil_order_prod_push_status !== 0 && (
        <React.Fragment>
          <MyDiv className="orderTabSummery ProfileBasicDetail order-profile mt-2 hide">
            <Card className="ProfileBasicDetailLeftHeader" style={{ padding: ".5rem 18px"}}>
              <Row>
                <Col md={3}>
                  <form>
                    {/* <Col md={4} className="p-0">
                                        <Row className='m-0'>
                                            <Col md={5} className="ps-0"><LabelTag>Departmental Instructions</LabelTag></Col>
                                            <Col md={6} className="deptInstruction">
                                                {isEditing ? (
                                                    <TextField value={tabData.departmentInstructions} onChange={handleChangeWhiteSpace} id="departmentInstructions" name="departmentInstructions" multiline maxRows={4} ></TextField>
                                                ) : (CoreOrderDetails.f_order_dept_instruction)}
                                            </Col>
                                        </Row>
                                    </Col> */}
                    <Row className="m-0 w-100 p-0 d-flex ProfileCard p-0">
                      <Col md={5} className="p-0 d-flex align-items-center">
                        <LabelTag>Approx Count</LabelTag>
                        {isEditing ? (
                          <Tooltip title="Save">
                            <IconButton aria-label="fingerprint" color="success" onClick={handleSaveClick}>
                              <FaRegSave />
                            </IconButton>
                          </Tooltip>
                        ) : (
                          <Tooltip title="Edit">
                            <IconButton aria-label="fingerprint" color="info" onClick={handleEditClick}>
                              <MdOutlineModeEditOutline />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Col>
                      <Col md={5} className="deptInstruction">
                        {isEditing ? (
                          <>
                            <input type="hidden" name="department" value="GBIL" />
                            <TextField value={tabData.approxCount} onChange={handleChangeWhiteSpace} id="approxCount" name="approxCount"></TextField>
                          </>
                        ) : (
                          <SpanTag className="deptInstructionSpan">{CoreOrderDetails.gbil_order_dept_approx_count}</SpanTag>
                        )}
                      </Col>
                    </Row>
                  </form>
                </Col>
                <Col md={9}>
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
                  <TableHead sx={{ position: 'sticky', top: 0, zIndex: 20 }}>
                    <TableRow>
                      <TableCell align="left" width="70px">
                        S No
                      </TableCell>
                      <TableCell align="left">Inventory ID</TableCell>
                      <TableCell align="left">Description</TableCell>
                      <TableCell align="center">Pieces</TableCell>
                      <TableCell align="center">Length </TableCell>
                      <TableCell align="center">UOM</TableCell>
                      <TableCell align="center" title="Quantity">
                        QTY
                      </TableCell>
                      {RolePermission?.PriceManagement?.view === "1" && (
                        <>
                          <TableCell align="center">Unit Price (A$)</TableCell>
                          {/* <TableCell align="center">Ext. Price</TableCell> */}
                          <TableCell align="center" title="Discount Percentage">
                            Discount (A$)
                          </TableCell>
                          {/* <TableCell align="center" title="Discount Amount">
                            Dis. Amt
                          </TableCell> */}
                          <TableCell align="center" title="Discount Unit Price">
                            DUP (A$)
                          </TableCell>
                          <TableCell align="center">Amt (A$)</TableCell>
                        </>
                      )}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {customOrders?.length ? (
                      customOrders
                        .filter(item => item.departments === "GBI.L")
                        .map((item, index) => (
                          <React.Fragment key={item._id}>
                            <TableRow className={`Department-${item.departments.trim().replace(/[.\s-]/g, "")} ${lastEditedItemId === item._id ? "highlight-edited-row" : ""}`}>
                              <TableCell align="left">{index + 1}</TableCell>
                             <TableCell align="left" sx={{width:"9vw"}}>
                                <StrongTag>
                                  {item.order_item_me_code}
                                </StrongTag>
                              </TableCell>
                              <TableCell align="left">{item.order_item_me_description}</TableCell>
                              <TableCell align="center">{item.order_item_me_uom_value}</TableCell>
                              <TableCell align="center">{item.order_item_me_length}</TableCell>
                              <TableCell align="center">{item.order_item_me_uom}</TableCell>
                              {RolePermission?.PriceManagement?.view === "1" ? (
                                <>
                                  <TableCell align="center">{parseFloat(item.order_item_me_quantity).toFixed(2)}</TableCell>
                                  <TableCell align="right">
                                    {item.order_item_qty_me_price ? item.order_item_qty_me_price : "0"}
                                  </TableCell>
                                  {/* <TableCell align="right">
                                    <CurrencyDisplay value={item.order_item_special_me_price_original ? item.order_item_special_me_price_original : "0"} currency="AUD" locale="en-US" />
                                  </TableCell> */}
                                  <TableCell align="right">{item.order_item_me_discounted_amount ? item.order_item_me_discounted_amount : "0"}{' ('}{item.order_item_me_discount ? item.order_item_me_discount : "0"}%{')'}</TableCell>
                                  {/* <TableCell align="right">
                                    <CurrencyDisplay value={item.order_item_me_discounted_amount ? item.order_item_me_discounted_amount : "0"} currency="AUD" locale="en-US" />
                                  </TableCell> */}
                                  <TableCell align="right">
                                    {item.order_item_qty_me_discounted_price ? item.order_item_qty_me_discounted_price : "0"} 
                                  </TableCell>
                                  <TableCell align="right" className="TableEditDelTd">
                                    <StrongTag>
                                      {item.order_item_special_me_price ? parseFloat(item.order_item_special_me_price).toFixed(2) : "0"} 
                                    </StrongTag>
                                    {!item.order_item_me_remake && CoreOrderDetails.order_status !== "Order Cancelled" && !CoreOrderDetails.order_hold && (!CoreOrderDetails.order_myob_push_status || RolePermission?.MYOBResend?.view === "1") && (
                                      <MyDiv className="TableEditDel">
                                        <Tooltip title="Edit">
                                          <IconButton aria-label="fingerprint" color="success" onClick={() => OrderEditId(item)}>
                                            <MdOutlineModeEditOutline />
                                          </IconButton>
                                        </Tooltip>
                                        <Tooltip title="Delete">
                                          <IconButton aria-label="fingerprint" color="secondary" onClick={() => OrderDeleteId(item)}>
                                            <MdDelete />
                                          </IconButton>
                                        </Tooltip>
                                      </MyDiv>
                                    )}
                                  </TableCell>
                                </>
                              ) : (
                                <TableCell align="center" className="TableEditDelTd">
                                  {parseFloat(item.order_item_me_quantity).toFixed(2)}
                                  {!item.order_item_me_remake && CoreOrderDetails.order_status !== "Order Cancelled" && !CoreOrderDetails.order_hold && (!CoreOrderDetails.order_myob_push_status || RolePermission?.MYOBResend?.view === "1") && (
                                    <MyDiv className="TableEditDel">
                                      <Tooltip title="Edit">
                                        <IconButton aria-label="fingerprint" color="success" onClick={() => OrderEditId(item)}>
                                          <MdOutlineModeEditOutline />
                                        </IconButton>
                                      </Tooltip>
                                      <Tooltip title="Delete">
                                        <IconButton aria-label="fingerprint" color="secondary" onClick={() => OrderDeleteId(item)}>
                                          <MdDelete />
                                        </IconButton>
                                      </Tooltip>
                                    </MyDiv>
                                  )}
                                </TableCell>
                              )}
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
      {/* {activeTab === "doubt" && (
        <React.Fragment>
          <MyDiv className="orderTabSummery ProfileBasicDetail order-profile mt-2 ">
            <Card className="ProfileBasicDetailLeftHeader">
              <DoubtTabData OrderInfo={CoreOrderDetails} orderUpdates={handleOrderDocumentsChange} />
            </Card>
          </MyDiv>
        </React.Fragment>
      )}
      {activeTab === "supplier-item" && (
        <React.Fragment>
          <MyDiv className="orderTabSummery ProfileBasicDetail order-profile mt-2 ">
            <Card className="ProfileBasicDetailLeftHeader">
              <SupplierTabData OrderInfo={CoreOrderDetails} orderUpdates={handleOrderDocumentsChange} />
            </Card>
          </MyDiv>
        </React.Fragment>
      )} */}
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
      <Drawer anchor="right" open={flashingOrderDrawerState} onClose={handleFlashingOrderDrawerToggle}>
        <FormOrderItem handleClose={updateFlashingDrawer} userInfo={data} CoreOrderDetails={CoreOrderDetails} />
      </Drawer>
      <Drawer anchor="right" open={userDrawerState} onClose={handleOrderDrawerToggle}>
        <FormCustomOrderItem handleClose={updateDrawer} userInfo={data} customerId={CoreOrderDetails.account_ID} handleOrderItemsUpdated={updatedLineItem} />
      </Drawer>
    </React.Fragment>
  );
}

export default OrderItemManage;