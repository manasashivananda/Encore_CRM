import React, { useState, useEffect, useCallback } from 'react';
import { Row, Col, Spinner } from 'react-bootstrap';
import { Link, useNavigate } from "react-router-dom";
import { HeadingTwo, HeadingFour, MyDiv, SpanTag, CurrencyDisplay, getFormattedDeliveryTime, LabelTag, getRowColor } from "../Common/Components";
import { TableBody, Table, TableContainer, TableHead, TableRow, TableCell, Button, TextField, IconButton, Pagination, MenuItem, Badge, FormControlLabel, Checkbox, Box, Typography, Modal, Backdrop, Fade, TextareaAutosize, Switch, Tooltip, Tabs, Tab, Drawer } from "@mui/material";
import { PiMicrosoftExcelLogoFill } from 'react-icons/pi';
import 'bootstrap-daterangepicker/daterangepicker.css';
import moment from "moment";
import axios from 'axios';
import NoDataFound from '../Common/noDataFound';
import swal from "sweetalert2";
import { green } from '@mui/material/colors';
import { FiLoader } from "react-icons/fi";
import { DateTime } from 'luxon';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterLuxon } from '@mui/x-date-pickers/AdapterLuxon';
import { Workbook } from 'exceljs';
import { MdClose, MdEdit, MdKeyboardArrowDown, MdKeyboardArrowLeft, MdKeyboardArrowUp } from 'react-icons/md';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { MdInfo } from "react-icons/md";
import { AiOutlineSplitCells } from "react-icons/ai";
import CustomDataGrid from '../Common/customDataGrid';
import FormSplitOrder from './form';
import { BiSortAlt2 } from 'react-icons/bi';
import { useDispatch, useSelector } from 'react-redux';
import { setSorting } from '../../store/deliveryDashboardSlice';
import { getNextBusinessDay } from '../Common/methods';

dayjs.extend(utc);
dayjs.extend(timezone);

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

const Permissions = JSON.parse(localStorage.getItem("role"))

function DeliveryPlanning() {
    const navigate = useNavigate();
    const dispatch = useDispatch();
    const [filteredReportExport, setFilteredReportExport] = useState([]);
    const [exportBtnDelivery, setExportBtnDelivery] = useState(false);
    const [filteredOrders, setFilteredOrders] = useState([]);
    const [delivery, setDelivery] = useState(false);
    const [pageCount, setPageCount] = useState(1);
    const [currentPage, setCurrentPage] = useState(1);
    const [searchData, setSearchData] = useState({ search_text: "", earlies: false });
    const [dateFilter, setDateFilter] = useState({
        startDate: moment().add(1, 'days').format('YYYY-MM-DD'),
        endDate: moment().add(1, 'days').format('YYYY-MM-DD')
    });
    const [anchorPoint, setAnchorPoint] = useState({ x: 0, y: 0 });
    const [showContextMenu, setShowContextMenu] = useState(false);
    const [comment, setComment] = useState("")
    const [priority, setPriority] = useState(0)

    const [cancelToken, setCancelToken] = useState(null);
    const [rowStatuses, setRowStatuses] = useState({});
    const [data, setData] = useState({
        order_delivery_date: "",
        order_delivery_time: "",
        order_delivery_session: "",
        order_custom_note: "",
        order_loaders_info: '',
    })
    const [cmtBtnLoading, setCmtBtnLoading] = useState(false)

    const { filters, sorting } = useSelector(state => state.deliveryDashboard);

    const [selectedDate, setSelectedDate] = useState(getNextBusinessDay());
    const handleDateChange = (newDate) => {
        if (newDate) {
            setSelectedDate(newDate);  // Keep as Luxon DateTime object
        }
    };

    const loadSpecificOrder = async (id) => {
        const url = API_BASE_URL + `fetch-specific-order-details/` + id;
        try {
            const res = await axios.get(url, {
                headers: {
                    "x-access-token": localStorage.getItem("token"),
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                },
            });

            const specificOrder = res.data[0];
            specificOrder.order_delivery_date = dayjs.utc(specificOrder.order_delivery_date).toDate();
            setData(specificOrder);
            setComment(specificOrder.order_sales_comment || "")
            if (specificOrder.order_delivery_time) {
                const [timePart, meridian] = specificOrder.order_delivery_time.split(" ");
                const [hour, minute] = timePart.split(".");
                setCustomTime({
                    hour: hour?.padStart(2, "0") || "12",
                    minute: minute?.padStart(2, "0") || "00",
                    meridian: meridian || "AM",
                    timeSession: specificOrder.order_delivery_session || ""
                });
            } else {
                setCustomTime({
                    hour: "12",
                    minute: "00",
                    meridian: "AM",
                    timeSession: specificOrder.order_delivery_session || ""
                });
            }

        } catch (error) {
            swal.fire({
                text: error?.response?.data || "Failed to load order details",
                icon: 'error',
                type: 'error',
            });
        }
    };

    const loadSpecificExtOrder = async (id) => {
        const url = API_BASE_URL + `fetch-specific-ext-order/` + id;
        try {
            const res = await axios.get(url, {
                headers: {
                    "x-access-token": localStorage.getItem("token"),
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                },
            });

            const specificOrder = res.data;
            specificOrder.order_delivery_date = dayjs.utc(specificOrder.order_delivery_date).toDate();
            setData(specificOrder);
            setComment(specificOrder.order_sales_comment || "")
            if (specificOrder.order_delivery_time) {
                const [timePart, meridian] = specificOrder.order_delivery_time.split(" ");
                const [hour, minute] = timePart.split(".");
                setCustomTime({
                    hour: hour?.padStart(2, "0") || "12",
                    minute: minute?.padStart(2, "0") || "00",
                    meridian: meridian || "AM",
                    timeSession: specificOrder.order_delivery_session || ""
                });
            } else {
                setCustomTime({
                    hour: "12",
                    minute: "00",
                    meridian: "AM",
                    timeSession: specificOrder.order_delivery_session || ""
                });
            }

        } catch (error) {
            swal.fire({
                text: error?.response?.data || "Failed to load order details",
                icon: 'error',
                type: 'error',
            });
        }
    };

    const handleDelDateChange = (newDate) => {
        if (!newDate) return;

        setData((prevData) => {
            const existingDateTime = prevData.order_delivery_date
                ? dayjs(prevData.order_delivery_date).tz("Australia/Sydney")
                : dayjs().tz("Australia/Sydney").hour(0).minute(0).second(0); // Default time if empty

            // Set new date, keeping the original or default time
            const updatedDate = dayjs(newDate).tz("Australia/Sydney")
                .hour(existingDateTime.hour())
                .minute(existingDateTime.minute())
                .second(existingDateTime.second());

            return {
                ...prevData,
                order_delivery_date: updatedDate.toDate().toUTCString()
            };
        });
    };
    // const [rowData, setRowData] = useState({})
    const [open, setOpen] = useState(false);
    const [openSplitDetails, setOpenSplitDetails] = useState(false);
    const handleOpen = async (rowData) => {
        setOpen(true)
        if (rowData.source !== "ExternalOrders")
            await loadSpecificOrder(rowData._id)
        else
            await loadSpecificExtOrder(rowData._id)
    };
    const handleClose = () => setOpen(false);

    const handleCloseSplit = () => setOpenSplitDetails(false);


    // Update fetchDeliveryPlanDetails function to use selectedDate
    const fetchDeliveryPlanDetails = useCallback(async () => {
        if (cancelToken) {
            cancelToken.cancel('Operation canceled due to new request.');
        }
        const source = axios.CancelToken.source();
        setCancelToken(source);

        // Convert selectedDate to start and end of the day in UTC
        const fromTime = selectedDate.setZone('Australia/Sydney').startOf('day').toUTC().toISO();
        const toTime = selectedDate.setZone('Australia/Sydney').endOf('day').toUTC().toISO();
        setDelivery(true);

        const url = `${API_BASE_URL}get-del-planning?page=${currentPage - 1}&orderUID=${searchData.search_text}&sortField=${sorting.sortField}&sortDirection=${
      sorting.sortDirection
    }&fromTime=${fromTime}&toTime=${toTime}&earlies=${searchData.earlies}`;

        try {
            const response = await axios.get(url, {
                headers: {
                    "x-access-token": localStorage.getItem("token"),
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                cancelToken: source.token
            });
            setFilteredOrders(response.data);
            setPageCount(response.data.totalPages);
            // Filter orders whose order_docket is empty or not present

        } catch (error) {
            if (!axios.isCancel(error)) {
                console.error('Data fetching failed:', error);
            }
        } finally {
            if (!source.token.reason) {
                setDelivery(false);
            }
        }
    }, [currentPage, searchData.search_text, selectedDate, searchData.earlies, sorting]);

    const exportDeliveryPlanDetails = async () => {
        if (cancelToken) {
            cancelToken.cancel('Operation canceled due to new request.');
        }
        const source = axios.CancelToken.source();
        setCancelToken(source);

        // Convert selectedDate to start and end of the day in UTC
        const fromTime = selectedDate.setZone('Australia/Sydney').startOf('day').toUTC().toISO();
        const toTime = selectedDate.setZone('Australia/Sydney').endOf('day').toUTC().toISO();
        setDelivery(true);

        const url = `${API_BASE_URL}export-del-planning?orderUID=${searchData.search_text}&fromTime=${fromTime}&toTime=${toTime}&earlies=${searchData.earlies}`;

        try {
            const response = await axios.get(url, {
                headers: {
                    "x-access-token": localStorage.getItem("token"),
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                cancelToken: source.token
            });
            return response.data?.loaderReportItems

        } catch (error) {
            if (!axios.isCancel(error)) {
                console.error('Data fetching failed:', error);
            }
        } finally {
            if (!source.token.reason) {
                setDelivery(false);
            }
        }
    }

    useEffect(() => {
        fetchDeliveryPlanDetails();
    }, [currentPage, fetchDeliveryPlanDetails]);

    const searchHandle = (e) => {
        const searchNewData = { ...searchData, [e.target.id]: e.target.value };
        setSearchData(searchNewData);
        setCurrentPage(1);
    };

    const handlePageChange = (event, value) => {
        setCurrentPage(value);
        navigate(`?page=${value}`);
    };


    const handleReset = () => {
        if (cancelToken) {
            cancelToken.cancel('Operation canceled due to reset.');
        }
        const resetDate = DateTime.now().plus({ days: 1 });
        setSearchData({ search_text: '' });
        setDateFilter({
            startDate: resetDate.toFormat('yyyy-MM-dd'),
            endDate: resetDate.toFormat('yyyy-MM-dd')
        });
        setSelectedDate(resetDate);
        setCurrentPage(1);
        setFilteredOrders([]);
        fetchDeliveryPlanDetails();
    };


    //Export Functionality
    const handleExport = async () => {
        const data = await exportDeliveryPlanDetails()
        const preparedData = prepareDataForExport(data);
        exportToExcel(preparedData);
    };

    const prepareDataForExport = (data) => {
        return data.map((item) => {
            let address = "";
            switch (item.order_delivery_address_mode) {
                case "0":
                    address = item.order_store_delivery_address1;
                    break;
                case "1":
                    address = item.order_site_delivery_address1;
                    break;
                case "2":
                    address = "Pickup Order";
                    break;
                default:
                    address = "";
            }

            return {
                rowData: {
                    'Customer': item.account_Name,
                    'Address': address || item.order_delivery_address,
                    'City': (item.order_delivery_address_mode === "0" ? item.order_store_delivery_city : item.order_site_delivery_city)?.toUpperCase() || item.order_city,
                    'Cust P.O Number': item.order_customer_PO_number,
                    'Time': getFormattedDeliveryTime(item.order_delivery_time, item.order_delivery_session, "runs"),
                    'Order Number': item.order_unique_id,
                    'Order Value(AUD)': Number(item.order_Overall_Price).toFixed(2),
                    'Length': item.largest_length,
                    'Item Count': [
                        item.Order_Flashing_Count && `F:${item.Order_Flashing_Count}, `,
                        item.Order_Cladding_Count && `CL:${item.Order_Cladding_Count}, `,
                        item.Order_Faciagutter_Count && `FG:${item.Order_Faciagutter_Count}, `,
                        item.Order_Jobbing_Count && `J:${item.Order_Jobbing_Count}, `,
                        item.Order_GBI_Count && `G:${item.Order_GBI_Count}, `,
                        item.Order_GBIL_Count && `G.L:${item.Order_GBIL_Count}, `,
                        item.Order_Roofing_Count && `R:${item.Order_Roofing_Count}`
                    ].filter(Boolean).join(' '),
                    'Rack': [
                        item.f_order_racking_table && `F:${item.f_order_racking_table}, `,
                        item.cl_order_racking_table && `CL:${item.cl_order_racking_table}, `,
                        item.fg_order_racking_table && `FG:${item.fg_order_racking_table}, `,
                        item.j_order_racking_table && `J:${item.j_order_racking_table}, `,
                        item.gbi_order_racking_table && `G:${item.gbi_order_racking_table}, `,
                        item.roof_order_racking_table && `R:${item.roof_order_racking_table}`
                    ].filter(Boolean).join(' '),
                    'Drivers Info': item.order_custom_note,
                    'Loaders Info	': item.order_loaders_info,
                    'Crane Lift': item.order_crane_lift_checker === true ? "Yes" : "No",
                    'Master Rack': item.order_master_rack,
                    // 'Created Date': item.created_str || item.created?.split('T')[0].split('-').reverse().join('-'),
                },
                color: getRowColor(item).rowColor
            };
        });
    };



    const exportToExcel = async (dataForExport) => {
        const workbook = new Workbook();
        const worksheet = workbook.addWorksheet('Delivery Report');

        const headers = Object.keys(dataForExport[0].rowData);
        worksheet.addRow(headers);

        const headerRow = worksheet.getRow(1);
        headerRow.eachCell(cell => {
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'E8F0F8' }
            };
            cell.font = { bold: true, color: { argb: '000000' } };
            cell.border = {
                top: { style: 'thin' },
                left: { style: 'thin' },
                bottom: { style: 'thin' },
                right: { style: 'thin' }
            };
            cell.alignment = { wrapText: true };

        });

        dataForExport.forEach((item) => {
            const rowValues = Object.values(item.rowData);
            const row = worksheet.addRow(rowValues);

            row.eachCell((cell, colNumber) => {
                const header = headers[colNumber - 1];

                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: item.color || 'FFFFFF' }
                };
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' }
                };

                // Alignment logic based on header
                if (header === 'Order Value(AUD)') {
                    cell.alignment = { horizontal: 'right', wrapText: true };
                } else if (header === 'Length') {
                    cell.alignment = { horizontal: 'left', wrapText: true };
                } else {
                    cell.alignment = { wrapText: true }; // default
                }
            });
        });

        // Auto-width logic
        worksheet.columns.forEach(column => {
            let maxLength = 10;
            column.eachCell({ includeEmpty: true }, (cell) => {
                const columnLength = cell.value ? cell.value.toString().length : 0;
                if (columnLength > maxLength) {
                    maxLength = columnLength;
                }
            });
            column.width = maxLength + 2;
        });

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "delivery_report.xlsx";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };


    const [statuses, setStatuses] = useState([
        { label: 'None', value: 0, color: "" },
        { label: 'Priority', value: 1, color: "primary" },
        { label: 'Crane truck drop', value: 2, color: "success" },
        // Show Split Order only if item.source !== "ExternalOrders" && item?.split !== 2
        // This will be filtered when rendering the context menu
    ])

    // Update handleRowStatusChange to handle Split Order option
    const handleRowStatusChange = (e, rowId, value) => {
        setRowStatuses(prev => ({
            ...prev,
            [rowId]: value
        }));
        setPriority(e.target.value);
        setShowContextMenu(false); // Close context menu after selection

        if (value === 3) {
            // Open the split order dialog
            handleSplitOrder(data);
        } else {
            handleCommentSubmit(e, value);
        }
    };


    // Handler for row status change
    // const handleRowStatusChange = (e, rowId, value, item) => {
    //     // console.log(item)
    //     setRowStatuses(prev => ({
    //         ...prev,
    //         [rowId]: value
    //     }));
    //     setPriority(e.target.value)
    //     setShowContextMenu(false); // Close context menu after selection
    //     handleCommentSubmit(e, value)
    // };

    const [btnLoading, setBtnLoading] = useState(false);
    const [customTime, setCustomTime] = useState({ hour: "", minute: "00", meridian: "AM", timeSession: "" });
    const hours = ["12", "06", "07", "08", "09", "10", "11", "01", "02", "03", "04", "05",];
    const minutes = ["00", "15", "30", "45"];
    const meridians = ["AM", "PM"];
    const session = ["B4", "Aft"];

    const style = {
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: "40%",
        bgcolor: 'background.paper',
        // border: '2px solid #000',
        boxShadow: 24,
        p: 4,
    };
    const getSplitStyle = (fullWidth = false) => {
        return {
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: fullWidth ? "98%" : "20%",       // full width
            bgcolor: "background.paper",
            boxShadow: 24,
            p: 4,
            outline: "none",
        }
    }

    const submit = (e) => {
        e.preventDefault();
        setBtnLoading(true);

        // 🔒 Validate delivery date
        if (!data.order_delivery_date) {
            swal.fire({
                title: "Validation Error",
                text: "Please select a delivery date.",
                icon: "warning",
            });
            return;
        }

        // 🔒 Validate time: hour + minute + meridian
        if (!customTime.hour || !customTime.minute || !customTime.meridian) {
            swal.fire({
                title: "Validation Error",
                text: "Please select delivery time (hour, minute, and AM/PM).",
                icon: "warning",
            });
            return;
        }

        const deliveryDateSydney = dayjs(data.order_delivery_date).tz("Australia/Sydney").format('YYYY-MM-DD');
        const todayDateSydney = dayjs().tz("Australia/Sydney").format('YYYY-MM-DD');

        if (deliveryDateSydney === todayDateSydney) {
            swal.fire({
                title: "Confirmation",
                text: "Created date and Delivery date are the same. Do you want to proceed?",
                icon: "warning",
                showCancelButton: true,
                confirmButtonText: "Yes, Proceed",
                cancelButtonText: "No, Cancel",
                customClass: {
                    confirmButton: 'primary-btn',
                    cancelButton: 'secondary-btn'
                },
            }).then((result) => {
                if (result.isConfirmed) {
                    if (data.source !== "ExternalOrders") {
                        proceedWithSubmission();
                    } else {
                        proceedExtOrdersWithSubmission();
                    }
                } else {
                    setBtnLoading(false);
                }
            });
        } else {
            if (data.source !== "ExternalOrders") {
                proceedWithSubmission();
            } else {
                proceedExtOrdersWithSubmission();
            }
        }
    };

    const proceedWithSubmission = () => {
        const formData = new FormData();

        // Sanitize/trim fields
        const processedData = {
            ...data,
            comment_attended: data.comment_attended
        };

        // Get the base delivery date in Australia/Sydney timezone
        let deliveryDate = dayjs(data.order_delivery_date).tz("Australia/Sydney");

        // Extract and convert custom time
        let hour = parseInt(customTime.hour || "0");
        const minute = parseInt(customTime.minute || "0");
        const isPM = customTime.meridian === "PM";

        if (isPM && hour !== 12) hour += 12;
        if (!isPM && hour === 12) hour = 0;

        // Merge date and time
        const mergedDateTime = deliveryDate.set("hour", hour).set("minute", minute).set("second", 0).set("millisecond", 0);
        processedData.order_delivery_date = mergedDateTime.toDate().toUTCString();
        processedData.order_delivery_time = `${customTime.hour}.${customTime.minute} ${customTime.meridian}`;
        processedData.order_delivery_session = customTime.timeSession || "";

        // Append all fields to FormData
        for (const key in processedData) { formData.append(key, processedData[key]); }
        // API call setup
        const url = `${API_BASE_URL}update-specific-order-details/${processedData._id}`;
        const method = 'patch'
        axios({
            method, url, data: formData,
            headers: { "x-access-token": localStorage.getItem("token"), 'Accept': 'application/json', 'Content-Type': 'application/json' }
        })
            .then((res) => {
                if (res.status === 200) {
                    swal.fire({ text: "Successfully Saved", icon: "success", type: "success" });
                    handleClose()
                    fetchDeliveryPlanDetails();
                }
                setBtnLoading(false);
            })
            .catch((error) => {
                swal.fire({ text: error.response.data, icon: "error", type: "error" });
                setBtnLoading(false);
            });
    };

    const proceedExtOrdersWithSubmission = () => {
        const formData = new FormData();

        // Sanitize/trim fields
        const processedData = {
            ...data,
            comment_attended: data.comment_attended
        };

        // Get the base delivery date in Australia/Sydney timezone
        let deliveryDate = dayjs(data.order_delivery_date).tz("Australia/Sydney");

        // Extract and convert custom time
        let hour = parseInt(customTime.hour || "0");
        const minute = parseInt(customTime.minute || "0");
        const isPM = customTime.meridian === "PM";

        if (isPM && hour !== 12) hour += 12;
        if (!isPM && hour === 12) hour = 0;

        // Merge date and time
        const mergedDateTime = deliveryDate.set("hour", hour).set("minute", minute).set("second", 0).set("millisecond", 0);
        processedData.order_delivery_date = mergedDateTime.toDate().toUTCString();
        processedData.order_delivery_time = `${customTime.hour}.${customTime.minute} ${customTime.meridian}`;
        processedData.order_delivery_session = customTime.timeSession || "";

        // Append all fields to FormData
        for (const key in processedData) { formData.append(key, processedData[key]); }
        // API call setup
        const url = `${API_BASE_URL}update-ext-order/${processedData._id}`;
        const method = 'patch'
        axios({
            method, url, data: formData,
            headers: { "x-access-token": localStorage.getItem("token"), 'Accept': 'application/json', 'Content-Type': 'application/json' }
        })
            .then((res) => {
                if (res.status === 200) {
                    swal.fire({ text: "Successfully Saved", icon: "success", type: "success" });
                    handleClose()
                    fetchDeliveryPlanDetails();
                }
                setBtnLoading(false);
            })
            .catch((error) => {
                swal.fire({ text: error.response.data, icon: "error", type: "error" });
                setBtnLoading(false);
            });
    };

    const [selectedRowId, setSelectedRowId] = useState(null);

    const handleContextMenu = async (event, row) => {
        event.preventDefault();
        if (row.source !== "ExternalOrders" && row.source !== "SplitOrders") {
            await loadSpecificOrder(row._id);
        }
        if (row.source !== "ExternalOrders" && row?.split !== 2) {
            setStatuses(prev =>
                prev.some(s => s.value === 3)
                    ? prev
                    : [...prev, { label: 'Split Order', value: 3, color: "warning" }]
            );
        } else {
            // Remove Split Order option if not allowed
            setStatuses(prev => prev.filter(s => s.value !== 3));
            if (row.source === "SplitOrders") return;
            await loadSpecificExtOrder(row._id);
        }

        setSelectedRowId(row._id);
        setAnchorPoint({ x: event.clientX, y: event.clientY });
        setShowContextMenu(true);
    };

    //  on press escape key close context menu
    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.key === "Escape") {
                setShowContextMenu(false);
            }
        };

        document.addEventListener("keydown", handleKeyDown);
        return () => {
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, []);

    function handle(e) {
        const newData = { ...data };
        newData[e.target.id] = e.target.value;
        setData(newData);
    }

    const handleCommentSubmit = (e, value = 0) => {
        e.preventDefault()
        const req = {
            comment: comment,
            priority_status: value,
            loader_info: value === 1 ? "Priority" : "",
            source: data?.source
        }
        const url = `${API_BASE_URL}update-order-comment/${data._id}`;
        const method = 'patch'
        axios({
            method, url, data: req,
            headers: { "x-access-token": localStorage.getItem("token"), 'Accept': 'application/json', 'Content-Type': 'application/json' }
        })
            .then((res) => {
                if (res.status === 200) {
                    swal.fire({ text: "Successfully Saved", icon: "success", type: "success" });
                    handleClose();
                    fetchDeliveryPlanDetails();
                }
                setBtnLoading(false);
            })
            .catch((error) => {
                swal.fire({ text: error.response.data, icon: "error", type: "error" });
                setBtnLoading(false);
            });
    }

    const onChangeEarlies = (e) => {
        setSearchData({
            ...searchData,
            earlies: e.target.checked
        })
    }

    const [noOfSplit, setNoOfSplit] = useState(2)

    const splitOrders = (e, row) => {
        e.preventDefault()
        const formData = {
            order_id: row._id,
            order_unique_id: row.order_unique_id,
            no_of_split: noOfSplit
        }
        // API call setup
        const url = `${API_BASE_URL}split-order`;
        const method = 'post';
        axios({
            method, url, data: formData,
            headers: { "x-access-token": localStorage.getItem("token"), 'Accept': 'application/json', 'Content-Type': 'application/json' }
        })
            .then((res) => {
                if (res.data.status) {
                    swal.fire({ text: res.data.message, icon: "success", type: "success" });
                    getSplitOrderDetails(res.data?.data[0]?.order_master_id)
                    // fetchDeliveryPlanDetails()
                } else {
                    swal.fire({ text: res.data.message, icon: "warning", type: "warning" });
                }
                setBtnLoading(false);
            })
            .catch((error) => {
                const errorMessages = error?.response?.data?.errors?.join('\n') || error?.response?.data;
                swal.fire({ text: errorMessages, icon: "error", type: "error" });
                setBtnLoading(false);
            });
    };

    const [splitOrderDetails, setSplitOrderDetails] = useState([])

    const getSplitOrderDetails = async (id) => {
        setBtnLoading(true)
        try {
            const response = await fetch(`${API_BASE_URL}fetch-split-order/${id}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    "x-access-token": localStorage.getItem("token"),
                    'Accept': 'application/json',
                },
            });
            const result = await response.json();
            if (result?.status) {
                setSplitOrderDetails(result.data)
                // setOpenSplitDetails(true)
            }else{
                setSplitOrderDetails([])
            }
        } catch (error) {
            const errorMessages = error?.response?.data?.errors?.join('\n');
            swal.fire({
                text: errorMessages || error.message,
                icon: "error",
                type: "error"
            });
        } finally {
            setBtnLoading(false);
        }
    }

    const columns = [
        {
            field: 'order_item_code', headerName: 'Shape ID / Item Code', width: 60, flex: 1, minWidth: 180, renderCell: (params, index) => {
                let value = params.row.order_item_shape_id + " / " + params.row.order_item_code
                return <MyDiv>{value}</MyDiv>
            }
        },
        { field: 'order_item_description', headerName: 'Description', width: 150, flex: 1, minWidth: 180 },
        { field: 'order_item_pieces', headerName: 'Pieces', width: 40, flex: 1, minWidth: 40 },
        { field: 'order_item_length', headerName: 'Length', width: 40, flex: 1, minWidth: 40 },
        {
            field: 'order_item_special_price', headerName: "Amt", width: 80, flex: 1, minWidth: 80,
            renderCell: (params) => {
                return <CurrencyDisplay value={params.row.order_item_special_price ? params.row.order_item_special_price : "0"} currency="AUD" locale="en-US" />
            }
        }
    ];

    const departmentMap = {
        J: 'Jobbing',
        CL: 'Cladding',
        FG: 'Fascia Gutter',
        GBI: 'GBI',
        GBIL: 'GBIL',
        ROOF: 'Roofing',
        DC: 'DC'
    };

    // Iterate over all split orders
    const processedSplitOrders = splitOrderDetails.map(splitOrderDetail => {
        // Helper to group manual items by department code
        const manualItemsByDept = {};
        splitOrderDetail?.orderItemManuals?.forEach(item => {
            const deptCode = item.order_item_me_department_code;
            if (!manualItemsByDept[deptCode]) manualItemsByDept[deptCode] = [];
            manualItemsByDept[deptCode].push(item);
        });

        // Prepare department tabs (excluding Flashing)
        const departmentTabs = Object.keys(manualItemsByDept).map(deptCode => ({
            code: deptCode,
            label: departmentMap[deptCode] || deptCode,
            items: manualItemsByDept[deptCode]
        }));

        // Flashing tab always present if orderItems.length > 0
        const showFlashingTab = splitOrderDetail?.orderItems?.length > 0;

        return {
            splitOrder: splitOrderDetail.splitOrder,
            orderItems: splitOrderDetail.orderItems,
            orderItemManuals: splitOrderDetail.orderItemManuals,   // ✅ add this line
            departmentTabs,
            showFlashingTab
        };
    });

    // DataGrid columns for manual items (can be customized per department if needed)
    const manualColumns = [
        { field: 'order_item_me_code', headerName: 'Inventory ID', width: 60, flex: 1, minWidth: 120 },
        { field: 'order_item_me_description', headerName: 'Description', width: 150, flex: 1, minWidth: 300 },
        { field: 'order_item_me_uom_value', headerName: 'Pieces', width: 20, flex: 1, minWidth: 20 },
        { field: 'order_item_me_length', headerName: 'Length', width: 20, flex: 1, minWidth: 20 },
        {
            field: 'order_item_special_me_price', headerName: "Amt", width: 80, flex: 1, minWidth: 80, renderCell: (params) => {
                return <CurrencyDisplay value={params.row.order_item_special_me_price ? params.row.order_item_special_me_price : "0"} currency="AUD" locale="en-US" />
            }
        }
    ];

    const [activeTab, setActiveTab] = useState(0);
    const [selectedLines, setSelectedLines] = useState({});

    // Initialize with all items checked
    useEffect(() => {
        if (processedSplitOrders?.length) {
            setSelectedLines((prev) => {
                const updated = { ...prev };
                splitOrderDetails.forEach((detail) => {
                    if (!updated[detail.splitOrder._id]) {
                        // group manual items by department
                        const manualByDept = {};
                        detail.orderItemManuals?.forEach((row) => {
                            const dept = row.order_item_me_department_code;
                            if (!manualByDept[dept]) manualByDept[dept] = [];
                            manualByDept[dept].push(row._id);
                        });

                        updated[detail.splitOrder._id] = {
                            order_item_ids: detail.orderItems.map((row) => row._id),
                            order_item_manual_ids: manualByDept,   // ✅ per department
                        };
                    }
                });
                return updated;
            });
        }
    }, [processedSplitOrders, splitOrderDetails]);


    const handleRowSelectionChange = (split_order_id, newSelection, type, deptCode = null) => {
        setSelectedLines((prev) => {
            const current = prev[split_order_id] || {
                order_item_ids: [],
                order_item_manual_ids: {},
            };

            if (type === "order_item") {
                // Count how many splits still hold this id
                const stillSelectedCount = (id) =>
                    Object.values(prev).filter((split) =>
                        split.order_item_ids.includes(id)
                    ).length;

                // Ensure at least one split keeps each id
                const validNewSelection = [
                    ...new Set([
                        ...newSelection,
                        ...current.order_item_ids.filter((id) => stillSelectedCount(id) === 1),
                    ]),
                ];

                return {
                    ...prev,
                    [split_order_id]: {
                        ...current,
                        order_item_ids: validNewSelection,
                    },
                };
            }

            if (type === "order_item_manual") {
                const stillSelectedCount = (id) =>
                    Object.values(prev).filter((split) =>
                        (split.order_item_manual_ids[deptCode] || []).includes(id)
                    ).length;

                const validNewSelection = [
                    ...new Set([
                        ...newSelection,
                        ...(current.order_item_manual_ids[deptCode] || []).filter(
                            (id) => stillSelectedCount(id) === 1
                        ),
                    ]),
                ];

                return {
                    ...prev,
                    [split_order_id]: {
                        ...current,
                        order_item_manual_ids: {
                            ...current.order_item_manual_ids,
                            [deptCode]: validNewSelection,
                        },
                    },
                };
            }

            return prev;
        });
    };

    const updateSplitOrderLineItems = (order_master_id) => {
        const updates = Object.entries(selectedLines).map(([split_order_id, lines]) => ({
            split_order_id,
            order_item_ids: lines.order_item_ids,
            order_item_manual_ids: Object.values(lines.order_item_manual_ids || {}).flat() // ✅ flatten dept groups
        }));

        const formData = { order_master_id, updates };

        axios.post(`${API_BASE_URL}update-split-order-line-item`, formData, {
            headers: {
                "x-access-token": localStorage.getItem("token"),
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        })
        .then((res) => {
            if (res.data.status) {
                swal.fire({ text: res.data.message, icon: "success" });
                getSplitOrderDetails(order_master_id);
                fetchDeliveryPlanDetails();
                handleCloseSplit();
            } else {
                swal.fire({ text: res.data.message, icon: "warning" });
            }
        })
        .catch((error) => {
            const errorMessages = error?.response?.data?.errors?.join('\n') || error?.response?.data;
            swal.fire({ text: errorMessages, icon: "error" });
        });
    };

    const [rowData, setRowData] = useState({})

    const handleSplitOrder = async (row) => {
        setOpenSplitDetails(true)
        setRowData(row)
        // if (row?.split === 1) {
            await getSplitOrderDetails(row?._id)
        // }
    }

    const [orderDrawerState, setOrderDrawerState] = React.useState(false);
    const [splitRowData, setSplitRowData] = useState({})
    const handleOrderDrawerToggle = (item) => {
        setSplitRowData(item)
        orderDrawerState === false ? setOrderDrawerState(true) : setOrderDrawerState(false)
    }

    const updateDrawer = () => {
        orderDrawerState === false ? setOrderDrawerState(true) : setOrderDrawerState(false)
        fetchDeliveryPlanDetails()
    };

    const getAddressandCity = (mode) =>{
        let address = "order_delivery_address";
        let city = "order_city"
        switch(mode){
            case "0":
                address = "order_store_delivery_address1"
                city = "account_Address_City"
                break;
            case "1":
                address = "order_site_delivery_address1"
                city = "order_site_delivery_city"
                break;
            default:
                return "Invalid mode"
        }
        return {address, city};
    }

    const handleSortChange = field => {
    dispatch(
        setSorting({
        sortField: field,
        sortDirection: sorting.sortField === field ? (sorting.sortDirection === "-1" ? "1" : "-1") : "-1",
        })
    );
    // setCurrentPage(1);
    };

    return (
        <React.Fragment>
            <Row className="GeneralHeading withBackArrow">
                <Col md={6}>
                    <HeadingTwo>
                        <Link className="arrow-btn" onClick={() => navigate(-1)}><MdKeyboardArrowLeft /></Link>
                        Delivery Planning Dashboard
                    </HeadingTwo>
                </Col>
            </Row>
            <Row>
                <Col md={12}>
                    <MyDiv className="searchBar GeneralHeading mt-2 d-block">
                        <Row>
                            <Col md={2} xs={9} className="SearchTextBox">
                                <TextField id="search_text" placeholder="Order id" variant="outlined" size="small" onChange={searchHandle} value={searchData.search_text} />
                            </Col>
                            <Col md={2} className="SearchTextBox dateRangePicker">
                                <LocalizationProvider dateAdapter={AdapterLuxon}>
                                    <DatePicker
                                        label="Delivery Date"
                                        value={selectedDate}
                                        onChange={handleDateChange}
                                        format="yyyy-MM-dd"
                                        slotProps={{ textField: { size: 'small', variant: 'outlined' } }}
                                    />
                                </LocalizationProvider>
                            </Col>
                            <Col md={2}>
                                <FormControlLabel control={<Checkbox checked={searchData.earlies} onChange={(e) => onChangeEarlies(e)} />} label="Earlies" />
                            </Col>
                            <Col md={3} className="d-flex">
                                <Button className="btn secondary-btn add-cta search mx-1" onClick={handleReset}>Reset</Button>
                                {exportBtnDelivery ?
                                    <IconButton aria-label="fingerprint" sx={{ color: green[500] }} className='IconBtnLoader'  >
                                        <FiLoader />
                                    </IconButton> :
                                    <Button className="btn success-btn withIcon" onClick={handleExport} startIcon={<PiMicrosoftExcelLogoFill />} > Export </Button>}
                            </Col>
                        </Row>
                    </MyDiv>
                </Col>
            </Row>
            <Row>
                <Col md={12}>
                    {delivery ? (
                        <HeadingFour className="text-center">Delivery Report Loading...</HeadingFour>) :
                        <MyDiv className="GeneralTable reportTable">
                            <TableContainer>
                                <Table className='bgGrey' aria-label="Order table">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell align="left">Action</TableCell>
                                            <TableCell className="cursor-pointer"
                                                align="left"
                                                onClick={() => handleSortChange("order_customer_name")}>
                                                <BiSortAlt2 /> Customer
                                                {sorting.sortField === "order_customer_name" &&
                                                    (sorting.sortDirection === "1" ? <MdKeyboardArrowDown /> : <MdKeyboardArrowUp />)}
                                            </TableCell>
                                            <TableCell align="left">Contact</TableCell>
                                            <TableCell align="left">Address</TableCell>
                                            <TableCell className="cursor-pointer"
                                                align="left"
                                                onClick={() => handleSortChange("order_site_delivery_city")}>
                                                <BiSortAlt2 /> City
                                                {sorting.sortField === "order_site_delivery_city" &&
                                                    (sorting.sortDirection === "1" ? <MdKeyboardArrowDown /> : <MdKeyboardArrowUp />)}
                                            </TableCell>
                                            <TableCell align="left">Cust P.O Number</TableCell>
                                            <TableCell align="left">Time</TableCell>
                                            <TableCell className="cursor-pointer"
                                                align="left"
                                                sx={{ minWidth: '140px' }}
                                                onClick={() => handleSortChange("order_unique_id")}>
                                                <BiSortAlt2 /> Order Number
                                                {sorting.sortField === "order_unique_id" &&
                                                    (sorting.sortDirection === "1" ? <MdKeyboardArrowDown /> : <MdKeyboardArrowUp />)}
                                            </TableCell>
                                            <TableCell align="left">Order Value</TableCell>
                                            <TableCell align="left">Length</TableCell>
                                            <TableCell align="left">Item Count</TableCell>
                                            <TableCell align="left">Rack</TableCell>
                                            <TableCell align="left">Driver's Info</TableCell>
                                            <TableCell align="left">Loader's Info</TableCell>
                                            <TableCell align="left">Crane Lift</TableCell>
                                            <TableCell align="left">Master Rack</TableCell>
                                            {/* <TableCell align="left">Created Date</TableCell> */}
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {filteredOrders.loaderReportItems?.length ? filteredOrders.loaderReportItems.map((item) => (
                                            <React.Fragment key={item._id}>
                                                <TableRow key={item._id} className={getRowColor(item).classname}
                                                    onContextMenu={(event) => handleContextMenu(event, item)}
                                                >
                                                    <TableCell align="center">
                                                        <MyDiv className="action-block">
                                                            <MdEdit title='Comment' size={20} color='red' style={{ cursor: 'pointer' }} onClick={item.source === "SplitOrders" ? () => handleOrderDrawerToggle(item) : () => handleOpen(item)} />
                                                            {item?.order_sales_comment && !item?.order_comment_attended_user &&
                                                                <MdInfo title={item.order_sales_comment} size={20} style={{ cursor: 'pointer' }} />
                                                            }
                                                            {/* {item.source !== "ExternalOrders" && (
                                                                item?.split !== 2 && <AiOutlineSplitCells title='Split Order' size={20} color='red' style={{ cursor: 'pointer' }} onClick={() => handleSplitOrder(item)} />
                                                            )
                                                            } */}
                                                        </MyDiv>
                                                    </TableCell>
                                                    <TableCell align="left" component="th" scope="row">
                                                        {item.account_Name}
                                                    </TableCell>
                                                    <TableCell>
                                                        {item.order_delivery_address_mode === "0" ? <MyDiv className=""> {item.account_Address_Phone} </MyDiv> : ""}
                                                        {item.order_delivery_address_mode === "1" ? <MyDiv className=""> {item.order_site_delivery_attention_person} - {item.order_site_delivery_attention_contact}</MyDiv> : ""}
                                                        
                                                    </TableCell>
                                                    <TableCell>
                                                        {item.order_delivery_address_mode === "0" ? <MyDiv className=""> {item.order_store_delivery_address1} </MyDiv> : ""}
                                                        {item.order_delivery_address_mode === "1" ? <MyDiv className=""> {item.order_site_delivery_address1}</MyDiv> : ""}
                                                        {item.order_delivery_address}
                                                    </TableCell>
                                                    <TableCell>
                                                        {item.order_delivery_address_mode === "0" && item.account_Address_City
                                                            ? item.account_Address_City.toUpperCase()
                                                            : ""}
                                                        {item.order_delivery_address_mode === "1" && item.order_site_delivery_city
                                                            ? item.order_site_delivery_city.toUpperCase()
                                                            : ""}
                                                        {item.order_city}
                                                    </TableCell>
                                                    <TableCell>{item.order_customer_PO_number}</TableCell>
                                                    <TableCell>
                                                        {getFormattedDeliveryTime(item.order_delivery_time, item.order_delivery_session, "runs")}
                                                    </TableCell>

                                                    <TableCell>{item.order_unique_id}</TableCell>
                                                    <TableCell align='right'>{parseFloat(item.order_Overall_Price).toFixed(2)}</TableCell>
                                                    <TableCell>{item.largest_length}</TableCell>
                                                    <TableCell>
                                                        <MyDiv className="BadgeBlock3">
                                                            {item.Order_Flashing_Count ? <><Badge className='flashingBg'>F<SpanTag> {item.Order_Flashing_Count}</SpanTag></Badge></> : null}
                                                            {item.Order_Cladding_Count ? <><Badge className='claddingBg'>CL <SpanTag>{item.Order_Cladding_Count}</SpanTag></Badge></> : null}
                                                            {item.Order_Faciagutter_Count ? <><Badge className='faciaBg'>FG<SpanTag>{item.Order_Faciagutter_Count}</SpanTag></Badge></> : null}
                                                            {item.Order_Jobbing_Count ? <><Badge className='jobbingBg'>J<SpanTag>{item.Order_Jobbing_Count}</SpanTag></Badge> </> : null}
                                                            {item.Order_GBI_Count ? <><Badge className='gbiBg'>G<SpanTag>{item.Order_GBI_Count}</SpanTag></Badge> </> : null}
                                                            {item.Order_Roofing_Count ? <><Badge className='roofingBg'>R<SpanTag>{item.Order_Roofing_Count}</SpanTag></Badge>  </> : null}
                                                            {item.Order_GBIL_Count ? <><Badge className='gbilBg'>G.L<SpanTag>{item.Order_GBIL_Count}</SpanTag></Badge>  </> : null}
                                                        </MyDiv>
                                                    </TableCell>
                                                    <TableCell>
                                                        <MyDiv className="BadgeBlock3">
                                                            {item.f_order_racking_table ? <><Badge className='flashingBg'>F<SpanTag> {item.f_order_racking_table}</SpanTag></Badge></> : null}
                                                            {item.cl_order_racking_table ? <><Badge className='claddingBg'>CL <SpanTag>{item.cl_order_racking_table}</SpanTag></Badge></> : null}
                                                            {item.fg_order_racking_table ? <><Badge className='faciaBg'>FG<SpanTag>{item.fg_order_racking_table}</SpanTag></Badge></> : null}
                                                            {item.j_order_racking_table ? <><Badge className='jobbingBg'>J<SpanTag>{item.j_order_racking_table}</SpanTag></Badge> </> : null}
                                                            {item.gbi_order_racking_table ? <><Badge className='gbiBg'>G<SpanTag>{item.gbi_order_racking_table}</SpanTag></Badge> </> : null}
                                                            {item.roof_order_racking_table ? <><Badge className='roofingBg'>R<SpanTag>{item.roof_order_racking_table}</SpanTag></Badge>  </> : null}

                                                        </MyDiv>
                                                    </TableCell>
                                                    <TableCell>{item.order_custom_note}</TableCell>
                                                    <TableCell>{item.order_loaders_info}</TableCell>
                                                    <TableCell>{item.order_crane_lift_checker === true ? "Yes" : "No"}</TableCell>
                                                    <TableCell>{item.order_master_rack}</TableCell>
                                                    {/* <TableCell>{item.created_str && item.created_str}{!item.created_str && (item.created?.split("T")[0].split('-').reverse().join('-') + " " + (getFormattedDeliveryTime(item.order_delivery_time, item.order_delivery_session, "runs")))}</TableCell> */}
                                                    {showContextMenu && selectedRowId && (
                                                        <Box
                                                            className="custom-context-menu"
                                                            style={{
                                                                position: 'fixed',
                                                                top: `${anchorPoint.y}px`,
                                                                left: `${anchorPoint.x}px`,
                                                                backgroundColor: 'white',
                                                                border: '1px solid #ccc',
                                                                zIndex: 1000,
                                                                boxShadow: '0px 2px 10px rgba(0, 0, 0, 0.2)'
                                                            }}
                                                        >
                                                            {statuses.map((status) => (
                                                                <MenuItem key={status.value} value={status.value} style={{ padding: '8px 16px', cursor: 'pointer' }} onClick={(e) => handleRowStatusChange(e, selectedRowId, Number(status.value), item)}>{status.label}</MenuItem>
                                                            ))}
                                                        </Box>
                                                    )}
                                                </TableRow>
                                            </React.Fragment>
                                        )) : <TableRow><TableCell colSpan={15}><NoDataFound /></TableCell></TableRow>}
                                    </TableBody>
                                </Table>
                            </TableContainer>

                            <MyDiv className="reactPaginate d-flex justify-content-center mt-4">
                                <Pagination count={pageCount} page={currentPage} onChange={handlePageChange} />
                            </MyDiv>
                        </MyDiv>
                    }
                </Col>
            </Row>
            <Drawer anchor="right" open={orderDrawerState} onClose={handleOrderDrawerToggle} >
                <FormSplitOrder handleClose={updateDrawer} orderInfo={splitRowData} />
            </Drawer>
            <Modal
                aria-labelledby="transition-modal-title"
                aria-describedby="transition-modal-description"
                open={open}
                onClose={handleClose}
                closeAfterTransition
                slots={{ backdrop: Backdrop }}
                slotProps={{
                    backdrop: {
                        timeout: 500,
                    },
                }}
            >
                <Fade in={open}>
                    <Box sx={style}>
                        <Row>
                            <Col md={(Permissions?.SalesComment?.add === "1" && Permissions?.SalesComment?.view !== "1") ? 12 : 6}>
                                <form onSubmit={(e) => handleCommentSubmit(e, data.order_priority_status)} style={{ display: 'flex', flexDirection: 'column', rowGap: 7 }}>
                                    <MyDiv className="action-block">
                                        <Typography variant='h5' fontWeight={'bold'} color={'red'}>Comment</Typography>
                                        <Typography variant='h5' fontWeight={'bold'}>{data.order_unique_id}</Typography>
                                    </MyDiv>
                                    <TextareaAutosize disabled={Permissions?.SalesComment?.view === "1"} required value={comment} onChange={(e) => setComment(e.target.value)} placeholder='Enter your comments here..' minRows={10} maxRows={10} />
                                    <LabelTag><Switch title='Mark as attended' disabled={Permissions?.SalesComment?.edit !== "1"} checked={data.comment_attended || (data.order_comment_attended_user ? true : false)} onChange={(e) => {
                                        setData({
                                            ...data,
                                            comment_attended: e.target.checked
                                        })
                                    }} />Mark as Attended</LabelTag>
                                    <Button disabled={Permissions?.SalesComment?.add !== "1"} type='submit' variant='contained'>{cmtBtnLoading ? <Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" className='mx-2' /> : 'Add Comments'}</Button>
                                </form>
                            </Col>
                            {Permissions?.SalesComment?.edit === "1" &&
                                <Col md={6} style={{ display: 'flex', flexDirection: 'column', rowGap: 10 }}>
                                    <Typography variant='h5' fontWeight={'bold'} color={'red'}>Edit</Typography>
                                    <form style={{ display: 'flex', flexDirection: 'column', rowGap: 10 }} onSubmit={submit}>
                                        <LocalizationProvider dateAdapter={AdapterDayjs}>
                                            <DatePicker label="Delivery Date" format="DD-MM-YYYY" required disablePast value={dayjs(data.order_delivery_date).tz("Australia/Sydney")} onChange={handleDelDateChange} slotProps={{ textField: { variant: "outlined", fullWidth: true, required: true } }} />
                                        </LocalizationProvider>
                                        <LabelTag>Time Required</LabelTag>
                                        <Col md={12} className="d-flex align-items-end gap-2">
                                            <TextField fullWidth required select label="Hour" value={customTime.hour} onChange={(e) => setCustomTime(prev => ({ ...prev, hour: e.target.value }))} variant="standard" >
                                                {hours.map(h => (
                                                    <MenuItem key={h} value={h}>{h}</MenuItem>
                                                ))}
                                            </TextField>
                                            <TextField fullWidth required select label="Minute" value={customTime.minute} onChange={(e) => setCustomTime(prev => ({ ...prev, minute: e.target.value }))} variant="standard" >
                                                {minutes.map(m => (
                                                    <MenuItem key={m} value={m}>{m}</MenuItem>
                                                ))}
                                            </TextField>
                                            <TextField fullWidth required select label="AM/PM" value={customTime.meridian} onChange={(e) => setCustomTime(prev => ({ ...prev, meridian: e.target.value }))} variant="standard"   >
                                                {meridians.map(m => (
                                                    <MenuItem key={m} value={m}>{m}</MenuItem>
                                                ))}
                                            </TextField>
                                            <TextField fullWidth select label="Before/After" value={customTime?.timeSession}
                                                onChange={(e) => setCustomTime(prev => ({ ...prev, timeSession: e.target.value || "" }))} variant="standard" >
                                                <MenuItem value="">Select</MenuItem>
                                                {session.map(m => (<MenuItem key={m} value={m}>{m}</MenuItem>))}
                                            </TextField>
                                        </Col>

                                        <TextField fullWidth id="order_loaders_info" label="Loaders Info" value={data.order_loaders_info} variant="outlined" onChange={(e) => handle(e)} />

                                        <TextField fullWidth id="order_custom_note" label="Drivers Info" value={data.order_custom_note} variant="outlined" onChange={(e) => handle(e)} />
                                        <Button type="submit" className='primary-btn btn' variant='contained'>{btnLoading ? <Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" className='mx-2' /> : 'Submit'}</Button>
                                    </form>
                                </Col>
                            }
                        </Row>
                    </Box>
                </Fade>
            </Modal>

            <Modal
                aria-labelledby="transition-modal-title"
                aria-describedby="transition-modal-description"
                open={openSplitDetails}
                onClose={handleCloseSplit}
                closeAfterTransition
                slots={{ backdrop: Backdrop }}
                slotProps={{
                    backdrop: {
                        timeout: 500,
                    },
                }}
            >
                <Fade in={openSplitDetails}>
                    <Box sx={getSplitStyle(splitOrderDetails.length)}>
                        <MdClose size={30} color='red' onClick={handleCloseSplit} cursor={"pointer"} style={{ float: "right", position: "absolute", top: 5, right: 5, border: '2px solid black' }} />
                        {!splitOrderDetails.length &&
                            <form onSubmit={(e) => splitOrders(e, rowData)}>
                                <TextField
                                    name='no_of_splits'
                                    label='No of Splits'
                                    onChange={(e) => setNoOfSplit(e.target.value)}
                                    type='number'
                                    size='small'
                                    variant='standard'
                                />
                                <Button type='submit' className='btn primary-btn' variant='contained'>Submit</Button>
                            </form>
                        }
                        <Row>
                            {processedSplitOrders.map((item, splitIdx) => {
                                const { splitOrder, departmentTabs, showFlashingTab } = item;
                                return (
                                    <Col md={6} key={splitOrder._id}>
                                        <HeadingFour style={{ float: 'right' }}>
                                            ORDER NO: {splitOrder?.order_unique_id}
                                        </HeadingFour>


                                        <Tabs
                                            value={activeTab}
                                            onChange={(e, v) => setActiveTab(v)}   // ✅ single global state
                                            variant="scrollable"
                                            scrollButtons="auto"
                                            sx={{ mb: 2 }}
                                        >
                                            {showFlashingTab && (
                                                <Tab label={`Flashing (${item?.splitOrder?.order_item_id?.length || 0})`} />
                                            )}
                                            {departmentTabs.map((dept) => (
                                                <Tab key={dept.code} label={`${dept.label} (${dept.items.length})`} />
                                            ))}
                                        </Tabs>


                                        {activeTab === 0 && showFlashingTab && (
                                            <CustomDataGrid
                                                rows={item?.orderItems || []}
                                                columns={columns}
                                                loading={btnLoading}
                                                disableSelectionOnClick
                                                gridHeight="100vh"
                                                getRowId={(row) => row._id}
                                                hideFooterPagination
                                                hideFooter
                                                checkboxSelection
                                                rowSelectionModel={selectedLines[splitOrder._id]?.order_item_ids || []}
                                                onRowSelectionModelChange={(newSelection) =>
                                                    handleRowSelectionChange(splitOrder._id, newSelection, "order_item")
                                                }
                                                isRowSelectable={(params) => {
                                                    const id = params.row._id;

                                                    // Count how many splits still hold this id
                                                    const stillSelectedCount = Object.values(selectedLines).filter((split) =>
                                                        split.order_item_ids.includes(id)
                                                    ).length;

                                                    // ❌ Disable if this is the last remaining owner
                                                    if (stillSelectedCount === 1 && selectedLines[splitOrder._id]?.order_item_ids.includes(id)) {
                                                        return false;
                                                    }

                                                    return true;
                                                }}

                                            />

                                        )}

                                        {departmentTabs.map((dept, idx) =>
                                            activeTab === (showFlashingTab ? idx + 1 : idx) ? (
                                                <CustomDataGrid
                                                    rows={dept.items}
                                                    columns={manualColumns}
                                                    loading={btnLoading}
                                                    disableSelectionOnClick
                                                    gridHeight="70vh"
                                                    getRowId={(row) => row._id}
                                                    hideFooterPagination
                                                    hideFooter
                                                    checkboxSelection
                                                    // ✅ Filter selections only for this department
                                                    rowSelectionModel={
                                                        selectedLines[splitOrder._id]?.order_item_manual_ids?.[dept.code] || []
                                                    }
                                                    onRowSelectionModelChange={(newSelection) =>
                                                        handleRowSelectionChange(
                                                            splitOrder._id,
                                                            newSelection,
                                                            "order_item_manual",
                                                            dept.code // ✅ pass dept
                                                        )
                                                    }
                                                    isRowSelectable={(params) => {
                                                        const id = params.row._id;

                                                        const stillSelectedCount = Object.values(selectedLines).filter((split) =>
                                                            (split.order_item_manual_ids[dept.code] || []).includes(id)
                                                        ).length;

                                                        if (
                                                            stillSelectedCount === 1 &&
                                                            (selectedLines[splitOrder._id]?.order_item_manual_ids?.[dept.code] || []).includes(id)
                                                        ) {
                                                            return false;
                                                        }

                                                        return true;
                                                    }}

                                                />
                                            ) : null
                                        )}

                                    </Col>
                                );
                            })}
                        </Row>

                        {splitOrderDetails.length ?
                            <Button
                                variant="contained"
                                className="btn success-btn mt-3"
                                onClick={() => updateSplitOrderLineItems(processedSplitOrders[0]?.splitOrder?.order_master_id)}
                                disabled={Object.keys(selectedLines).length === 0}
                            >
                                Update Split Order Lines
                            </Button> : null
                        }
                    </Box>
                </Fade>
            </Modal>
        </React.Fragment>
    );
}

export default DeliveryPlanning;
