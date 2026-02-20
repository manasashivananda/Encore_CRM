import React, { useState, useEffect, useCallback, useRef } from "react";
import { useSelector, useDispatch } from "react-redux";
import { setFilters, resetFiltersAndSorting } from "../../store/masterOrderSlice";
import { Row, Col, Badge } from "react-bootstrap";
import {
  HeadingTwo,
  MyDiv,
  StrongTag,
  LabelTag,
  PTag,
  Avatar,
  getFormattedDeliveryTime,
  hasAnyProductionInProgress,
  getProductionStatusBadge,
} from "../Common/Components";
import { Link, useNavigate, useLocation } from "react-router-dom";
import {
  IconButton,
  Tooltip,
  Drawer,
  MenuItem,
  Button,
  TextField,
  Tabs,
  Tab,
  Box,
} from "@mui/material";
import { MdOutlineModeEditOutline } from "react-icons/md";
import { FiLoader } from "react-icons/fi";
import { SiMyob } from "react-icons/si";
import axios from "axios";
import swal from "sweetalert2";
import FormOrder from "./form";
import moment from "moment";
import { pink } from "@mui/material/colors";
import DateRangePicker from "react-bootstrap-daterangepicker";
import "bootstrap-daterangepicker/daterangepicker.css";
import { orderStatus } from "../Common/staticjson";
import { DateTime } from "luxon";
import CommonDataGrid from "../Common/commonDataGrid";
import debounce from 'lodash/debounce'; 
import { getGridStringOperators } from "@mui/x-data-grid";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

const USER_ID = localStorage.getItem("userId");
const RolePermission = JSON.parse(localStorage.getItem("role"));

function OrderManage() {
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useDispatch();
  
  const [orders, setOrders] = useState([]);
  const [allOrders, setAllOrders] = useState([]); // Store all orders from API
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [totalItems, setTotalItems] = useState(0);
  const [sortModel, setSortModel] = useState([]);
  const [filterModel, setFilterModel] = useState({ items: [] });
  const [paginationModel, setPaginationModel] = useState({
    page: parseInt(new URLSearchParams(location.search).get("page")) - 1 || 0,
    pageSize: 20,
  });
  const [activeTab, setActiveTab] = useState(0); // 0 for All Orders, 1 for My Orders
  
  const { filters } = useSelector(state => state.orders);
  const [searchData, setSearchData] = useState({ search_text: filters.global_search_text || filters.local_search_text || "" });
  const [orderDrawerState, setOrderDrawerState] = useState(false);
  const [myobBtnLoadingMap, setMyobBtnLoadingMap] = useState({});
  const abortControllerRef = useRef(null);
  // Control column visibility for responsive behavior
  const [columnVisibilityModel, setColumnVisibilityModel] = useState({});

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

  // Convert MUI DataGrid filter model to backend filter params
  const convertFilterModelToParams = (filterModel) => {    
    if (!filterModel || !filterModel.items || filterModel.items.length === 0) {
      return {};
    }

    const filterParams = {};
    let validFilterCount = 0;
    
    filterModel.items.forEach((filter) => {
      
      // Check if filter has a value (it might be undefined when just opened)
      if (filter.field && filter.value !== undefined && filter.value !== null && filter.value !== '') {
        // Create filter params with field, operator, and value
        filterParams[`filter[${validFilterCount}][field]`] = filter.field;
        filterParams[`filter[${validFilterCount}][operator]`] = filter.operator || 'contains';
        filterParams[`filter[${validFilterCount}][value]`] = filter.value;
        validFilterCount++;
      }
    });

    // Add logic operator if multiple filters
    if (validFilterCount > 1) {
      filterParams['filterLogic'] = filterModel.logicOperator || 'and';
    }

    return filterParams;
  };

  // Filter orders based on active tab
  const filterOrdersByTab = useCallback((ordersData) => {
    if (activeTab === 0) {
      // All Orders - return all data
      return ordersData;
    } else {
      // My Orders - filter by order_created_person matching USER_ID
      return ordersData.filter(order => order.order_created_person === USER_ID);
    }
  }, [activeTab]);

  const requestIdRef = useRef(0);

  // Memoized function to fetch orders with sorting, pagination, filtering and search
  const loadOrders = useCallback(async (skipFilterCheck = false) => {
    // Don't fetch if filter model has items but no values (filter panel just opened)
    if (!skipFilterCheck) {
      const hasIncompleteFilters = filterModel.items?.some(
        item => item.field && (item.value === undefined || item.value === null || item.value === '')
      );
      
      if (hasIncompleteFilters) {
        console.log('Skipping API call - filter has no value yet');
        return;
      }
    }

    if(searchData.search_text && searchData.search_text?.length < 3) return;

    const currentRequestId = ++requestIdRef.current;
    setLoading(true);
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    
    const sortField = sortModel[0]?.field || "order_unique_id";
    const sortOrder = sortModel[0]?.sort === "asc" ? "1" : "-1";
    
    // Date handling
    const startDate = DateTime.fromISO(filters.startDate || moment().startOf("day").format("YYYY-MM-DD"))
      .set({ hour: 0, minute: 0, second: 0, millisecond: 0 });
    const endDate = DateTime.fromISO(filters.endDate || moment().endOf("day").format("YYYY-MM-DD"))
      .set({ hour: 23, minute: 59, second: 59, millisecond: 999 });
    const toAEST = date => date.setZone("Australia/Sydney", { keepLocalTime: true }).toUTC();
    const fromTimeUTC = toAEST(startDate).toISO();
    const toTimeUTC = toAEST(endDate).toISO();

    // Convert filter model to query params
    const filterParams = convertFilterModelToParams(filterModel);
    
    // Build base URL
    let url = `${API_BASE_URL}fetch-order-details?page=${paginationModel.page}&pageSize=${
      paginationModel.pageSize
    }&query=${encodeURIComponent(searchData.search_text)}&myob=${
      filters.myobStatus || ""
    }&sortField=${sortField}&sortDirection=${sortOrder}&startDate=${fromTimeUTC}&endDate=${toTimeUTC}&cusId=${
      filters.customerId || ""
    }&global=${filters.global || false}`;
    
    // Add filter parameters to URL
    Object.keys(filterParams).forEach(key => {
      url += `&${key}=${encodeURIComponent(filterParams[key])}`;
    });

    try {
      const response = await axios.get(url, {
        headers: {
          "x-access-token": localStorage.getItem("token"),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        signal: abortControllerRef.current.signal,
      });

      if (currentRequestId !== requestIdRef.current) {
        // ⛔ A newer request started. Ignore this response completely.
        return;
      }
      
      const fetchedOrders = response.data.fetchedItems || [];
      setAllOrders(fetchedOrders); // Store all orders
      
      // Filter orders based on active tab
      const filteredOrders = filterOrdersByTab(fetchedOrders);
      setOrders(filteredOrders);
      
      // Update total items based on filtered data
      if (activeTab === 1) {
        setTotalItems(filteredOrders.length);
      } else {
        setTotalItems(response.data.totalItems || 0);
      }
      
      if (response.data.rowsPerPage && response.data.rowsPerPage !== paginationModel.pageSize) {
        setPaginationModel(prev => ({ ...prev, pageSize: response.data.rowsPerPage }));
      }
    } catch (error) {
      if (axios.isCancel(error)) {
        console.log("Request canceled:", error.message);
        return;
      } else {
        swal.fire({
          text: error.response?.data?.message || "Failed to fetch orders",
          icon: "error",
        });
      }
    } finally {
      if (currentRequestId === requestIdRef.current) {
        setLoading(false);  // Only end loading for the latest request
      }
    }
  }, [searchData.search_text, paginationModel, sortModel, filterModel, filters, activeTab, filterOrdersByTab]);

  const debouncedLoadOrders = useRef(
    debounce((callback) => callback(), 500)

  ).current;

  // Handle tab change
  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
    setPaginationModel(prev => ({ ...prev, page: 0 }));
  };

  // Re-filter orders when tab changes
  useEffect(() => {
    const filteredOrders = filterOrdersByTab(allOrders);
    setOrders(filteredOrders);
    
    // Update total items for My Orders tab
    if (activeTab === 1) {
      setTotalItems(filteredOrders.length);
    }
  }, [activeTab, allOrders, filterOrdersByTab]);

  // Adjust column visibility based on window width to improve layout at smaller sizes
  useEffect(() => {
    const updateVisibility = () => {
      const w = window.innerWidth || document.documentElement.clientWidth;
      
      if (w < 1200) {
        setColumnVisibilityModel({
          order_customer_PO_number: false,
          order_Overall_Price: false,
          created: false,
        });
      } else if (w < 1400) {
        setColumnVisibilityModel({
          order_customer_PO_number: false,
          created: false,
        });
      } else if (w < 1600) {
        setColumnVisibilityModel({
          order_customer_PO_number: false,
        });
      } else {
        setColumnVisibilityModel({});
      }
    };

    const debouncedUpdate = debounce(updateVisibility, 120);
    window.addEventListener("resize", debouncedUpdate);
    // Run once on mount
    updateVisibility();
    return () => {
      debouncedUpdate.cancel && debouncedUpdate.cancel();
      window.removeEventListener("resize", debouncedUpdate);
    };
  }, []);

  useEffect(() => {
    setLoading(true)
    return () => {
      debouncedLoadOrders.cancel();
      setLoading(false)
    };
  }, [debouncedLoadOrders]);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    params.set("page", paginationModel.page + 1);
    navigate(`${location.pathname}?${params.toString()}`, { replace: true });
  }, [paginationModel.page, navigate, location.pathname, location.search]);

  useEffect(() => {
    loadOrders();
  }, [searchData.search_text, paginationModel, sortModel, filterModel, filters, loadOrders]);


  const handleSearchSubmit = e => {
    e.preventDefault();
    loadOrders();
  };

  const handleReset = () => {
    dispatch(resetFiltersAndSorting());
    dispatch(setFilters())
    dispatch(setFilters({ 
      global: false,
      global_search_text: "",
      local_search_text: "",
      search_text: ""
    }));
    setSearchData({ search_text: "" });
    setFilterModel({ items: [] });
    setPaginationModel(prev => ({ ...prev, page: 0 }));
  };

  const handleFieldChange = event => {
    const { name, value } = event.target;
    dispatch(setFilters({ [name]: value }));
    setPaginationModel(prev => ({ ...prev, page: 0 }));
  };

  const toggleDrawer = useCallback(() => {
    setData();
    setOrderDrawerState(prev => !prev);
  }, []);

  const handleOrderEdit = useCallback(id => {
    setData(id);
    setOrderDrawerState(true);
  }, []);

  const updateDrawer = useCallback(() => {
    setOrderDrawerState(false);
    loadOrders();
  }, [loadOrders]);

  const handleSortModelChange = useCallback(model => {
    setSortModel(model);
    setPaginationModel(prev => ({ ...prev, page: 0 }));
  }, []);

  const handleFilterModelChange = useCallback((model) => {
    setFilterModel(model);
  }, []);

  const orderValuesSendMyob = async (id, password) => {
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
    setMyobBtnLoadingMap(prevMap => ({ ...prevMap, [id]: true }));
    const requestBody = { password_myob: password };
    try {
      const url = `${API_BASE_URL}sent-ordermaster-item-details-to-myob/${id}?userid=${USER_ID}`;
      await axios.post(url, requestBody, {
        headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" },
      });
      swal.fire({ text: "Order Items sent to MYOB", icon: "success", type: "success" });
      loadOrders();
    } catch (error) {
      swal.fire({ text: error.response?.data || "An error occurred", icon: "error", type: "error" });
    } finally {
      setMyobBtnLoadingMap(prevMap => ({ ...prevMap, [id]: false }));
    }
  };

  const ranges = {
    Today: [moment(), moment()],
    Yesterday: [moment().subtract(1, "days"), moment().subtract(1, "days")],
    "Last 7 Days": [moment().subtract(6, "days"), moment()],
    "Last 30 Days": [moment().subtract(29, "days"), moment()],
    "This Month": [moment().startOf("month"), moment().endOf("month")],
    "Last Month": [moment().subtract(1, "month").startOf("month"), moment().subtract(1, "month").endOf("month")],
  };

  const columns = [
    {
      field: "order_unique_id",
      headerName: "Order ID",
      flex: 0.7,
      minWidth: 90,
      sortable: true,
      filterable: true,
      filterOperators: getGridStringOperators().filter(
        (operator) =>
          ["contains", "equals", "startsWith", "endsWith"].includes(operator.value)
      ),
      renderCell: ({ row }) => (
        <div style={{ padding: "15px 0px" }}>
          <Link to={`${row._id}`}>
            <StrongTag style={{ color: "var(--primary)" }}>{row.order_unique_id}</StrongTag>
            {row.order_quote_id !== "Nil" && (
              <PTag style={{ color: "var(--primary)" }} className="m-0">{row.order_quote_id}</PTag>
            )}
          </Link>
        </div>
      )
    },
    {
      field: "order_customer_name",
      headerName: "Customer Name / ID",
      flex: 1.6,
      minWidth: 180,
      sortable: true,
      filterable: true,
      filterOperators: getGridStringOperators().filter(
        (operator) =>
          ["contains", "equals", "startsWith", "endsWith"].includes(operator.value)
      ),
      renderCell: ({ row }) => (
        <MyDiv className="tableAvatar" style={{ display: "flex", gap: "8px", padding: "5px 0px 5px 0px"}}>
          <Avatar 
            name={row.order_customer_name} 
            src="" 
            sx={{ fontSize: '12px', marginTop: '4px' }}
          />
          <Link style={{marginTop:"3px", fontSize: "14px"}} to={`${row._id}`}>
            {row.order_customer_name}
            <br />
            <small>{row.account_UID}</small>
          </Link>
        </MyDiv>
      ),
    },
    {
      field: "order_customer_PO_number",
      headerName: "PO Number",
      flex: 1.0,
      minWidth: 110,
      sortable: true,
      filterable: true,
      filterOperators: getGridStringOperators().filter(
        (operator) =>
          ["contains", "equals", "startsWith", "endsWith"].includes(operator.value)
      ),
      renderCell: ({ row }) => (
        <div style={{ padding: "15px 0px" }}>
          #{row.order_customer_PO_number}
        </div>
      ),
    },
    {
      field: "order_site_delivery_attention_person",
      headerName: "Contact",
      flex: 1.0,
      minWidth: 100,
      sortable: true,
      filterable: true,
      filterOperators: getGridStringOperators().filter(
        (operator) =>
          ["contains", "equals", "startsWith", "endsWith"].includes(operator.value)
      ),
      renderCell: ({ row }) => (
        <div style={{ padding: "10px 0px" }}>
          {row.order_delivery_address_mode === "1" && (
            <>
              {row.order_site_delivery_attention_person}, <br />
              {row.order_site_delivery_attention_contact}
            </>
          )}
          {row.order_delivery_address_mode === "0" && (
            <> {row.order_customer_contact_phone} </>
          )}
          {row.order_delivery_address_mode === "2" && <> - </>}
        </div>
      ),
    },
    {
      field: "order_site_delivery_address1",
      headerName: "Street",
      flex: 1.5,
      minWidth: 130,
      sortable: true,
      filterable: true,
      filterOperators: getGridStringOperators().filter(
        (operator) =>
          ["contains", "equals", "startsWith", "endsWith"].includes(operator.value)
      ),
      renderCell: ({ row }) => (
        <div style={{ padding: "10px" }}>
          {row.order_delivery_address_mode === "0" && (
            <MyDiv className="storeDelivery" >
              {row.order_store_delivery_address1}
            </MyDiv>
          )}
          {row.order_delivery_address_mode === "1" && (
            <MyDiv className="siteDelivery">
              {row.order_site_delivery_address1}
            </MyDiv>
          )}
          {row.order_delivery_address_mode === "2" && (
            <MyDiv className="pickupOrder">PickUp Order</MyDiv>
          )}
        </div>
      ),
    },
    {
      field: "order_site_delivery_city",
      headerName: "City",
      flex: 1.5,
      minWidth: 120,
      sortable: true,
      filterable: true,
      filterOperators: getGridStringOperators().filter(
        (operator) =>
          ["contains", "equals", "startsWith", "endsWith"].includes(operator.value)
      ),
      renderCell: ({ row }) => (
        <div style={{ padding: "10px" }}>
          {row.order_delivery_address_mode === "0" && (
            <MyDiv className="storeDelivery" >
              {row.order_store_delivery_city}
            </MyDiv>
          )}
          {row.order_delivery_address_mode === "1" && (
            <MyDiv className="siteDelivery">
              {row.order_site_delivery_city}
            </MyDiv>
          )}
          {row.order_delivery_address_mode === "2" && (
            <MyDiv className="pickupOrder">PickUp Order</MyDiv>
          )}
        </div>
      ),
    },
    {
      field: "created",
      headerName: "Created Date",
      flex: 0.9,
      minWidth: 120,
      sortable: true,
      filterable: true,
      filterOperators: getGridStringOperators().filter(
        (operator) =>
          ["contains", "equals", "startsWith", "endsWith"].includes(operator.value)
      ),
      type: 'Date',
      renderCell: ({ row }) => (
        <div style={{ padding: "10px" }}>
          {moment(row.created).format("DD-MMM-YYYY hh:mm a")}
        </div>
      ),
    },
    {
      field: "order_delivery_date",
      headerName: "Delivery Date",
      flex: 0.8,
      minWidth: 110,
      sortable: true,
      filterable: true,
      filterOperators: getGridStringOperators().filter(
        (operator) =>
          ["contains", "equals", "startsWith", "endsWith"].includes(operator.value)
      ),
      type: 'Date',
      renderCell: ({ row }) => (
        <div style={{ padding: "10px" }}>
          {row.order_delivery_date_str}
          <br />
          <small>{getFormattedDeliveryTime(row.order_delivery_time, row.order_delivery_session)}</small>
        </div>
      ),
    },
    {
      field: "order_Overall_Price",
      headerName: "Total Price (A$)",
      flex: 0.6,
      minWidth: 100,
      sortable: true,
      filterable: true,
      type: 'number',
      headerAlign: 'left',
      filterOperators: getGridStringOperators().filter(
        (operator) =>
          ["contains", "equals", "startsWith", "endsWith"].includes(operator.value)
      ),
      align: 'left',
      renderCell: ({ row }) => (
        <MyDiv className="text-start" style={{ padding: "10px" }}>
          {row.order_Overall_Price != null 
            ? `${parseFloat(row.order_Overall_Price).toFixed(2)}` 
            : '-'}
        </MyDiv>
      ),
    },
    {
      field: "order_status",
      headerName: "Status",
      flex: 0.9,
      minWidth: 100,
      sortable: true,
      filterable: true,
      type: 'singleSelect',
      filterOperators: getGridStringOperators().filter(
        (operator) =>
          ["contains", "equals", "startsWith", "endsWith"].includes(operator.value)
      ),
      valueOptions: orderStatus.map(s => s.label),
      renderCell: ({ row }) => 
      <div style={{ padding: "10px" }}>
        {row.order_hold ? getStatusBadge("Order Hold", row) : getStatusBadge(row.order_status, row)}
      </div>
    },
    {
      field: "action",
      headerName: "",
      flex: 0.5,
      minWidth: 90,
      sortable: false,
      filterable: false,
      filterOperators: getGridStringOperators().filter(
        (operator) =>
          ["contains", "equals", "startsWith", "endsWith"].includes(operator.value)
      ),
      renderCell: ({ row }) => (
        <div className="custom-flex" style={{ display: "flex", gap: "4px", padding: "10px" }}>
          {myobBtnLoadingMap[row._id] ? (
            <IconButton
              aria-label="fingerprint"
              sx={{ color: pink[500], padding: "4px" }}
              className="IconBtnLoader"
              size="small">
              <FiLoader style={{ fontSize: "24px" }} />
            </IconButton>
          ) : (
            <>
              {row.order_qc_status === "4" &&
              row.order_myob_push_status === false &&
              row.order_status !== "Order Cancelled" && !row.order_hold && (
                <Tooltip title="Send Order Items to MYOB">
                  <IconButton
                    aria-label="fingerprint"
                    sx={{ color: pink[500], padding: "4px" }}
                    onClick={() => orderValuesSendMyob(row._id)}
                    size="small">
                    <SiMyob style={{ fontSize: "24px" }} />
                  </IconButton>
                </Tooltip>
              )}
            </>
          )}
          {(row.order_myob_push_status !== true || RolePermission?.MYOBResend?.view === "1") &&
          row.order_status !== "Order Cancelled" && !row.order_hold && (
            <Tooltip title="Edit">
              <IconButton
                color="success"
                onClick={() => handleOrderEdit(row._id)}
                sx={{ padding: "4px" }}
                size="small">
                <MdOutlineModeEditOutline style={{ fontSize: "24px" }} />
              </IconButton>
            </Tooltip>
          )}
        </div>
      ),
    },
  ];

  const handleGlobalSearchChange = event => {
    const val = event.target.value;
    if(event.target.value.length === 0) {
      dispatch(
        setFilters({
          search_text: val,
          global: false,
          global_search_text: val,
          local_search_text: "",
        })
      );
      setSearchData({ search_text: val });
      setPaginationModel(prev => ({ ...prev, page: 0 }));
      return
    }
    dispatch(
      setFilters({
        search_text: val,
        global: true,
        global_search_text: val,
        local_search_text: "",
      })
    );
    setSearchData({ search_text: val });
    setPaginationModel(prev => ({ ...prev, page: 0 }));
    // debouncedLoadOrders(() => loadOrders());
  };

  const handleLocalSearchChange = event => {
    const val = event.target.value;
    dispatch(
      setFilters({
        search_text: val,
        global: false,
        local_search_text: val,
        global_search_text: "",
      })
    );
    setSearchData({ search_text: val });
    setPaginationModel(prev => ({ ...prev, page: 0 }));
  };

  return (
    <>
      <Row className="GeneralHeading">
        <Col md={3}>
          <HeadingTwo>Manage Orders</HeadingTwo>
        </Col>
        <Col md={5} className="SearchTextBox">
          <TextField
            onChange={handleGlobalSearchChange}
            label="Global Search"
            className="textarea w-100"
            id="global_search_text"
            placeholder="Please enter more than 3 letters to search"
            value={filters.global_search_text || ""}
            variant="outlined"
            focused
            size="small"
          />
        </Col>
        <Col md={4} className="text-end">
          <Button onClick={toggleDrawer} className="btn primary-btn">
            Add Order
          </Button>
        </Col>
      </Row>
      
      <Row className="SearchBar GeneralHeading mt-1">
        <Col md={12}>
          <form onSubmit={handleSearchSubmit}>
            <Row>
              <Col md={2} xs={9} className="SearchTextBox">
                <TextField
                  onChange={handleLocalSearchChange}
                  className="textarea"
                  id="search_text"
                  placeholder="Search Here..."
                  value={filters.local_search_text || ""}
                  variant="standard"
                />
              </Col>
              <Col md={2} xs={9} className="SearchTextBox dateRangePicker">
                <LabelTag>Created Date</LabelTag>
                <DateRangePicker
                  key={`${filters.startDate || moment().format("YYYY-MM-DD")} to ${filters.endDate || moment().format("YYYY-MM-DD")}`}
                  onApply={(e, { startDate, endDate }) => {
                    dispatch(
                      setFilters({ 
                        startDate: startDate.format("YYYY-MM-DD"), 
                        endDate: endDate.format("YYYY-MM-DD") 
                      })
                    );
                  }}
                  initialSettings={{
                    ranges,
                    startDate: filters.startDate ? moment(filters.startDate, "YYYY-MM-DD") : moment(),
                    endDate: filters.endDate ? moment(filters.endDate, "YYYY-MM-DD") : moment()
                  }}
                  label="Created Date"
                  placeholdertext="Created Date">
                  <input
                    type="text"
                    value={`${moment(filters.startDate).format("YYYY-MM-DD") || moment().format("DD-MM-YYYY")} to ${moment(filters.endDate).format("YYYY-MM-DD") || moment().format("DD-MM-YYYY")}`}
                    className="form-control data-range-picker"
                    placeholder="Created Date"
                    readOnly
                  />
                </DateRangePicker>
              </Col>
              <Col md={2} xs={9}>
                <TextField
                  select
                  variant="outlined"
                  size="small"
                  label="Order Status"
                  name="myobStatus"
                  value={filters.myobStatus || ""}
                  SelectProps={{ onChange: handleFieldChange }}
                  className="form-control">
                  {orderStatus.map(orderStatusList => (
                    <MenuItem key={orderStatusList.value} value={orderStatusList.value}>
                      {orderStatusList.label}
                    </MenuItem>
                  ))}
                </TextField>
              </Col>
              <Col md={2} xs={9} className="d-flex align-items-center">
                <Button
                  className="btn secondary-btn add-cta search mx-1"
                  onClick={() => {
                    handleReset();
                    // Ensure the date range is set to Today after reset
                    dispatch(setFilters({
                      startDate: moment().format("YYYY-MM-DD"),
                      endDate: moment().format("YYYY-MM-DD")
                    }));
                    // reset pagination to first page as well
                    setPaginationModel(prev => ({ ...prev, page: 0 }));
                  }}
                >
                  Reset
                </Button>
              </Col>
            </Row>
          </form>
        </Col>
      </Row>

      {/* Tabs Section */}
      <Row className="GeneralHeading mt-1">
        <Col md={12}>
          <Box>
            <Tabs 
              value={activeTab} 
              onChange={handleTabChange}
              aria-label="order tabs"
              sx={{
                '& .MuiTab-root': {
                  textTransform: 'none',
                  fontSize: '16px',
                  fontWeight: 'bold',
                },
                '& .Mui-selected': {
                  color: 'var(--primary)',
                },
                '& .MuiTabs-indicator': {
                  backgroundColor: 'var(--primary)',
                },
              }}
            >
              <Tab label="All Orders" />
              <Tab label="My Orders" />
            </Tabs>
          </Box>
        </Col>
      </Row>

      
      <Row>
        <Col md={12}>
            <MyDiv className="GeneralTable">
              <CommonDataGrid
                rows={orders}
                columns={columns}
                rowCount={totalItems}
                loading={loading}
                paginationModel={paginationModel}
                onPaginationModelChange={setPaginationModel}
                sortModel={sortModel}
                onSortModelChange={handleSortModelChange}
                filterModel={filterModel}
                onFilterModelChange={handleFilterModelChange}
                getRowId={row => row._id}
                paginationMode="server"
                sortingMode="server"
                getRowClassName={(params) => {
                  const classes = ["masterOrderList"];
                  if (params.row.order_flashing_checker === true) classes.push("HaveFlashing");
                  if (params.row.order_crane_lift_checker === true) classes.push("HaveCraneLift");
                  if (params.row.order_delivery_address_mode === "2") classes.push("HavingPickupOrder");
                  if (params.row.order_status === "Order Cancelled") classes.push("CancelledOrder");
                  return classes.join(" ");
                }}
                // height="77vh"
                // width="100%"
                sx={{
                  // Make the grid fill the container and allow horizontal scrolling when needed
                  width: '100%',
                  overflow: 'auto',
                  '& .MuiDataGrid-row': {
                    borderBottom: '1px solid rgba(224, 224, 224, 1)'
                  },
                  '--DataGrid-rowBorderColor': 'transparent',
                  '& .MuiDataGrid-cell': {
                    padding: '0 8px', // Reduce cell padding for better space usage
                  },
                  '& .MuiTablePagination-displayedRows': {
                    marginBottom: 0
                  },
                  '& .MuiDataGrid-columnHeaderTitle':{
                    whiteSpace: 'normal'
                  },
                  '& .MuiDataGrid-columnHeaderTitleContainerContent':{
                    overflow: 'unset'
                  }
                }}
                rowHeight="auto"
                columnVisibilityModel={columnVisibilityModel}
                onColumnVisibilityModelChange={setColumnVisibilityModel}
              />
            </MyDiv>
        </Col>
      </Row>
      
      <Drawer 
        PaperProps={{
        sx:{
            width:"80%"
          }
        }} 
        hideBackdrop={true}
        anchor="right" open={orderDrawerState} onClose={toggleDrawer}>
        <FormOrder handleClose={updateDrawer} orderInfo={data} />
      </Drawer>
    </>
  );
}

export default OrderManage;