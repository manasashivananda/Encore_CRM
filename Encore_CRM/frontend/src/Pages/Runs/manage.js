import React, { useState, useEffect, useCallback } from 'react';
import { Row, Col, Spinner, Button } from "react-bootstrap";
import { getDayOfWeek, getFormattedDeliveryTime, getRowColor, HeadingTwo, LabelTag, MyDiv, SpanTag } from "../Common/Components";
import { MdAdd, MdKeyboardArrowLeft, MdOutlineModeEditOutline, MdRemoveRedEye, MdRestore } from "react-icons/md";
import { CiViewTable } from "react-icons/ci";
import { Link, useNavigate } from "react-router-dom";
import { Box, Drawer, IconButton, MenuItem, Switch, Tab, Tabs, TextareaAutosize, TextField, Typography } from '@mui/material';
import FormRuns from './form';
import { PiMicrosoftExcelLogoFill } from 'react-icons/pi';
import CustomDataGrid from '../Common/customDataGrid';
import Swal from 'sweetalert2';
import { DateTime } from 'luxon';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterLuxon } from '@mui/x-date-pickers/AdapterLuxon';
import axios from 'axios';
import { exportContent, runs_type } from '../Common/staticjson';
import { RiMailSendFill } from "react-icons/ri";
import { MdLocalPrintshop } from "react-icons/md";
import CustomSwal from '../Common/customSwal';
import FloatingActionButtons from '../Common/fab';
import { FaMapMarkedAlt } from "react-icons/fa";
import { TbMapOff } from "react-icons/tb";
import RouteMap from './routeMap';
import { FiLoader } from 'react-icons/fi';


const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


const initialData = {
    order_nums: [],
    truck_id: null,
    driver_id: "",
    start_time: "",
    delivery_date: null,
    run_type: "",
    truck_length: "",
    driver_name: "",
    truck_name: ""
}

function ManageRuns() {
    const [driversInfo, setDriversInfo] = useState({})
    const [data, setData] = useState(initialData);
    const [rackingDrawerState, setRackingDrawerState] = React.useState(false);
    const [driverTab, setDriverTab] = useState('');
    const [loading, setLoading] = useState(false);
    const [orderInfo, setOrderInfo] = useState([]);
    const [selectedDate, setSelectedDate] = useState(DateTime.now().plus({ days: 1 }));
    const [hideForm, setHideForm] = useState(false)
    const [activeTrucks, setActiveTrucks] = useState([])
    const [pageLimit, setPageLimit] = useState(50);
    const [page, setPage] = useState(0);
    const [runType, setRunType] = useState(1)
    const [exportContents, setExportContents] = useState({
        content: [],
        driver_ids: [],
        run_type: []
    })
    const [printOrEmail, setPrintOrEmail] = useState(false)
    const [driverMaster, setDriverMaster] = useState([]);
    const [printBtnLoading, setPrintBtnLoading] = useState(false);

    const handleDateChange = (newDate) => {
        if (newDate) {
            setSelectedDate(newDate);
            getRunsDrivers(newDate)
            setOrderInfo([])
            setData(initialData)
        }
    };

    let navigate = useNavigate();


    const handleRackingDrawerToggle = () => {
        rackingDrawerState === false ? setRackingDrawerState(true) : setRackingDrawerState(false)
    }

    const [activeTab, setActiveTab] = useState('loading');

    const handleTabChange = (event, newTab) => {
        setActiveTab(newTab);
        checkOrdersAssignedToDriver(driverTab, selectedDate)
    };

    const handleDriverTabChange = (event, newTab) => {
        data.order_nums = []
        data.run_type = ""
        data.start_time = ""
        data.truck_id = null
        data.truck_length = ""
        setOrderNo("")
        setDriverTab(newTab);
        setToggleMap(false)
        checkOrdersAssignedToDriver(newTab, selectedDate)
    };

    const checkOrdersAssignedToDriver = useCallback(async (id = driverTab || null, date, form = "add") => {
        setLoading(true);
        const formattedDate = new Date(date).toISOString();
        try {
            const response = await fetch(`${API_BASE_URL}check-orders-assigned?id=${id}&delivery_date=${formattedDate}&run_type=${runType}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    "x-access-token": localStorage.getItem("token"),
                    'Accept': 'application/json',
                },
            });
            const result = await response.json();
            form === "add" && setHideForm(result?.status)
            setData({
                ...data,
                truck_id: result?.driversData?.truckInfo[0]?._id || null,
                driver_id: result?.driversData?.driver_id || null,
                truck_length: result?.driversData?.truckInfo[0]?.dimensions?.max_length,
                order_nums: result?.driversData?.order_nums.join('\n') || [],
                start_time: result?.driversData?.start_time || "",
                run_type: result?.driversData?.run_type || "",
                driver_name: result?.driversData?.driver_name || "",
                truck_name: result?.driversData?.truckInfo[0]?.name || null,
            })
            result?.driversData?.order_nums.length ? await fetchRunsOrderDetails(result?.driversData?.order_nums, result?.truck?._id) : setOrderInfo([])
        } catch (error) {
            const errorMessages = error?.response?.data?.errors?.join('\n');
            Swal.fire({
                text: errorMessages || error.message,
                icon: "error",
                type: "error"
            });
        } finally {
            setLoading(false);
        }
    }, [data, driverTab, runType])

    const fetchTruckByDriverId = async (id = "") => {
        setLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}get/truck/${id}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    "x-access-token": localStorage.getItem("token"),
                    'Accept': 'application/json',
                },
            });
            const result = await response.json();
            if(result.status){
                setData({
                    ...data,
                    driver_id: result?.truckInfo?.default_driver_id,
                    truck_id: result?.truckInfo?._id || null,
                    truck_length: result?.truckInfo?.dimensions?.max_length,
                    // truck_name: result?.truckInfo?.name
                })
            }else{
                setData({
                    ...data,
                    truck_id: "",
                    truck_length: "",
                    truck_name:""
                })
            }
        } catch (error) {
            const errorMessages = error?.response?.data?.errors?.join('\n');
            Swal.fire({
                text: errorMessages || error.message,
                icon: "error",
                type: "error"
            });
        } finally {
            setLoading(false);
        }
    }

    const verifyAllOrdersAssigned = async () => {
        setLoading(true);
        const formattedDate = new Date(selectedDate).toISOString();
        try {
            const response = await fetch(`${API_BASE_URL}verify-all-orders-assigned?delivery_date=${formattedDate}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    "x-access-token": localStorage.getItem("token"),
                    'Accept': 'application/json',
                },
            });
            const result = await response.json();
            Swal.fire({
                title: result?.message,
                text: result?.missingOrders?.toString(),
                icon: result?.status !== "ok" ?"error" : "success",
                type: result?.status !== "ok" ?"error" : "success"
            });
        } catch (error) {
            const errorMessages = error?.response?.data?.errors?.join('\n');
            Swal.fire({
                text: errorMessages || error.message,
                icon: "error",
                type: "error"
            });
        } finally {
            setLoading(false);
        }
    }

    const [mergedTabs, setMergedtabs] = useState([])

    const getRunsDrivers = useCallback(async (date, type = "add") => {
        setLoading(true);
        const formattedDate = new Date(date).toISOString();
        try {
            const response = await fetch(`${API_BASE_URL}fetch-runs-drivers?delivery_date=${formattedDate}&run_type=${runType}`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    "x-access-token": localStorage.getItem("token"),
                    'Accept': 'application/json',
                },
            });
            const result = await response.json();
            if (result.data?.length) {
                setDriversInfo(result?.data[0])
                setMergedtabs(result?.data);
                type === "add" && setDriverTab(result.data[0]?._id)
                type === "add" && checkOrdersAssignedToDriver(result.data[0]?._id, date)
            } else {
                setDriversInfo({})
                setData(initialData)
                setMergedtabs([]);
                setDriverTab("")
            }
        } catch (error) {
            const errorMessages = error?.result?.data?.errors?.join('\n');
            Swal.fire({
                text: errorMessages || error.message,
                icon: "error",
                type: "error"
            });
        } finally {
            setLoading(false);
        }
    }, [runType])

    useEffect(() => {
        getRunsDrivers(selectedDate)
        getActiveTrucks()
    }, [getRunsDrivers])

    const getRunsDriversForExport = useCallback(async (date) => {
        setLoading(true);
        const formattedDate = new Date(date).toISOString();

        const req = {
            delivery_date: formattedDate,
            run_type: exportContents.run_type.map(String)
        }
        const method = "POST"
        const url = `${API_BASE_URL}fetch-runs-drivers-export`;
        try {
            const response = await axios({
                method,
                url,
                data: req,
                headers: {
                    "x-access-token": localStorage.getItem("token"),
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });
            setDriverList(response?.data?.drivers || [])

        } catch (error) {
            const errorMessages = error?.response?.data?.errors?.join('\n');
            Swal.fire({
                text: errorMessages || error.message,
                icon: "error",
                type: "error"
            });
        } finally {
            setLoading(false);
        }
    }, [exportContents.run_type])

    useEffect(() => {
        getRunsDriversForExport(selectedDate)
    }, [getRunsDriversForExport])

    const getActiveTrucks = async () => {
        setLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}fetch-active-trucks`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    "x-access-token": localStorage.getItem("token"),
                    'Accept': 'application/json',
                },
            });
            const result = await response.json();
            if (result.status) {
                setActiveTrucks(result.data);
            } else {
                const errorMessages = result?.errors?.join('\n');
                Swal.fire({
                    text: errorMessages,
                    icon: "error",
                    type: "error"
                });
            }
        } catch (error) {
            const errorMessages = error?.response?.data?.errors?.join('\n');
            Swal.fire({
                text: errorMessages || error.message,
                icon: "error",
                type: "error"
            });
        } finally {
            setLoading(false);
        }
    }

    useEffect(() =>{
        getActiveDriver()
    },[])

    const getActiveDriver = async () => {
        setLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}fetch-active-drivers`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    "x-access-token": localStorage.getItem("token"),
                    'Accept': 'application/json',
                },
            });
            const result = await response.json();
            if (result.status) {
                setDriverMaster(result.data);
            } else {
                const errorMessages = result?.errors?.join('\n');
                Swal.fire({
                    text: errorMessages,
                    icon: "error",
                    type: "error"
                });
            }
        } catch (error) {
            const errorMessages = error?.response?.data?.errors?.join('\n');
            Swal.fire({
                text: errorMessages || error.message,
                icon: "error",
                type: "error"
            });
        } finally {
            setLoading(false);
        }
    }

    const handleDelete = async () => {
        const url = `${API_BASE_URL}delete/driver/${driverTab}`;

        const result = await Swal.fire({
            title: "Are you sure?",
            text: "This will permanently deleted from here.",
            icon: "warning",
            showCancelButton: true,
            confirmButtonText: "Yes",
            cancelButtonText: "Cancel",
            reverseButtons: true,
            customClass: {
            confirmButton: "primary-btn",
            cancelButton: "secondary-btn",
            },
        });

        if (result.isConfirmed) {
            try {
                const response = await axios.delete(
                    url,
                    {
                        headers: {
                            "x-access-token": localStorage.getItem("token"),
                            Accept: "application/json",
                            "Content-Type": "application/json",
                        },
                    }
                );
                if(response.data.status){
                    Swal.fire({
                        text: response.data.message,
                        icon: "success",
                    });
                    getRunsDrivers(selectedDate);
                }
            } catch (error) {
                Swal.fire({
                    text: error.response.data,
                    icon: "error",
                });
            }
        }
    };

    const submit = async (e, del_date_proceed = false, max_length_proceed = false) => {
        e.preventDefault();
        setLoading(true);
        const formatted_order_nums = data.order_nums?.length > 0 ? data.order_nums?.split("\n").map((num) => num.trim()).filter((num) => num !== "") : []
        data.delivery_date = driversInfo?.delivery_date || null
        data.run_id = driverTab
        // data.driver_id = driverTab.includes("D") ? null : driverTab || ""
        // data.draft_driver = driverTab.includes("D") ? driverTab : null
        data.run_type = runType
        try {
            const method = "POST"
            const url = `${API_BASE_URL}add-orders-to-driver`;
            const response = await axios({
                method,
                url,
                data: {
                    ...data,
                    order_nums: formatted_order_nums,
                    del_date_proceed,
                    max_length_proceed
                },
                headers: {
                    "x-access-token": localStorage.getItem("token"),
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });

            if (response?.data.requiresDateConfirmation && !del_date_proceed) {
                const unMatchedOrders = response.data?.unmatchedOrderNums?.map(item => item).join(", ")
                const result = await Swal.fire({
                    text: `${response.data.message}\n\n${unMatchedOrders}`,
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonText: 'Proceed',
                    cancelButtonText: 'Cancel',
                    confirmButtonColor: '#d22530',
                    cancelButtonColor: '#6c757d'
                });

                if (result.isConfirmed) {
                    return submit(e, true, max_length_proceed);
                }
                return;
            }

            if (response?.data.requiresLengthConfirmation && !max_length_proceed) {
                const lengthExceededOrders = response.data?.unmatchedOrderNums?.map(item => item).join(", ")
                const result = await Swal.fire({
                    title: 'Maximum Length Exceeded',
                    text: `${response.data.message}\n\n${lengthExceededOrders}`,
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonText: 'Proceed',
                    cancelButtonText: 'Cancel',
                    confirmButtonColor: '#d22530',
                    cancelButtonColor: '#6c757d'
                });

                if (result.isConfirmed) {
                    return submit(e, del_date_proceed, true);
                }
                return;
            }
            if (response?.data.status) {
                Swal.fire({
                    text: response.data.message,
                    icon: "success",
                    type: "success"
                });
                setDriverTab(response.data?.updatedDriverOrders?._id)
                await checkOrdersAssignedToDriver(response.data?.updatedDriverOrders?._id, selectedDate)
                await getRunsDrivers(selectedDate, "edit")
            } else {
                const unMatchedOrders = response.data?.unmatchedOrderNums?.map(item => item).join(", ")
                Swal.fire({
                    title: response.data.message,
                    text: unMatchedOrders,
                    icon: "warning",
                    type: "warning"
                });
            }
        }
        catch (error) {
            const errorMessages = error.response.data.errors?.join('\n') || error.response?.data?.message
            Swal.fire({
                text: error.response?.data?.conflictingOrders?.map((item) => item),
                title: errorMessages || error.message,
                icon: "error",
                type: "error"
            });
        } finally {
            setLoading(false);
        }
    }

    const handleFieldChange = async (event, max_length) => {
        const { name, type, checked, value } = event.target;
        setData((prevData) => ({
            ...prevData,
            [name]: type === "checkbox" ? checked : value,
        }));
        if (name === "truck_id" && max_length) {
            setData((prevData) => ({
                ...prevData,
                truck_length: max_length,
            }));
        }
        if (name === "driver_id") {
            data.driver_id = value
            await fetchTruckByDriverId(value)
        }
    }

    let searchText = false
    const [addressForMap, setAddressForMap] = useState([])
    const fetchRunsOrderDetails = async (order_nums, truck_id = data.truck_id || null, search=searchText) => {
        try {
            const req = {
                order_nums,
                truck_id
            }
            const method = "POST"
            const url = `${API_BASE_URL}fetch-runs-order-details`;
            const response = await axios({
                method,
                url,
                data: req,
                headers: {
                    "x-access-token": localStorage.getItem("token"),
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
            });
            if (response?.status) {
                setOrderInfo(response.data.data);
                const cities = response.data.data?.map((item) => {
                    const city = item.order_delivery_address_mode === "0"
                        ? item.order_store_delivery_city
                        : item.order_site_delivery_city;
                    return {
                        city: city || item.order_delivery_city,
                        order_unique_id: item.order_unique_id,
                        delivery_time: item.order_delivery_session === "A/T" ? item.order_delivery_session : item.order_delivery_session + " " + item.order_delivery_time,
                        delivery_date: item.order_delivery_date_str
                    };
                });
                setAddressForMap(cities);
            } else {
                Swal.fire({
                    text: response.data.message,
                    icon: "warning",
                    type: "warning"
                });
            }
        }
        catch (error) {
            const errorMessages = error?.response?.data?.errors?.join('\n');
            Swal.fire({
                text: errorMessages || error.message,
                icon: "error",
                type: "error"
            });
        } finally {
            setLoading(false);
        }
    }

    const columns = [
        { field: 'index', headerName: 'SI No', minWidth: 40, maxWidth: 60, flex: 0},
        { field: 'check', headerName: 'Check', minWidth: 90, maxWidth: 70, flex: 1, hideable: true },
        { field: 'account_Name', headerName: 'Customer Name', minWidth: activeTab === "runs" ? 500 : 250, flex: 1 },
        {
            field: 'account_Address_City', headerName: 'City', minWidth: 170, flex: 1,
            renderCell: (params) => {
                const mode = params.row.order_delivery_address_mode
                params.row.account_Address_City = mode === "0" ? params.row.order_store_delivery_city?.toUpperCase() : params.row.order_site_delivery_city?.toUpperCase()
                return <MyDiv>{params.row.account_Address_City || params.row.order_delivery_city?.toUpperCase()}</MyDiv>
            }
        },
        { field: 'order_customer_PO_number', headerName: 'PO Number', minWidth: 130, flex: 1 },
        {
            field: 'time', headerName: 'Time', minWidth: 90, maxWidth: 120, flex: 1, renderCell: (params) => {
                const req_time = getFormattedDeliveryTime(params.row.order_delivery_time, params.row.order_delivery_session, "runs")
                params.row.time = req_time
                return <MyDiv>{params.row.time}</MyDiv>
            }
        },
        { field: 'order_unique_id', headerName: 'Order No', minWidth: 80, maxWidth: 120, flex: 1 },
        {
            field: 'largest_length', headerName: 'Length', minWidth: 70, maxWidth: 80, flex: 1, hideable: activeTab === "runs" ? true : false, renderCell: (params) => {
                return <MyDiv className={params.row.large_length ? 'highlight-cell' : ''}>{params.value}</MyDiv>
            }
        },
        { field: 'products', headerName: 'Products', minWidth: 150, flex: 1 },
        { field: 'sub_racks', headerName: 'Rack', minWidth: 140, maxWidth: 90, flex: 1, hideable: activeTab === "runs" ? true : false },
        { field: 'order_custom_note', headerName: 'Driver Info', minWidth: 150, flex: 1, hideable: activeTab !== "runs" },
        { field: 'order_loaders_info', headerName: 'Loader Info', minWidth: 150, flex: 1, hideable: activeTab === "runs" }
    ]

    const handleOrdersChange = (e) => {
        e.stopPropagation()
        setHideForm(!hideForm)
        setToggleMap(false)
        setOrderNo("") 
        checkOrdersAssignedToDriver(driverTab, selectedDate, "edit")
    }

    // add single driver to run
    async function handleAddSingleDriver() {
        setLoading(true);
        const payload = {
            delivery_date: DateTime.fromISO(selectedDate),
            run_type: data.run_type
        }
        try {
            const method = "POST";
            const url = `${API_BASE_URL}add/single/driver`;
            const response = await axios({
                method,
                url,
                data : payload,
                headers: {
                    "x-access-token": localStorage.getItem("token"),
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                }
                });

            if (response.data?.status) {
                Swal.fire({
                    text: response.data.message,
                    icon: "success",
                    type: "success"
                });
                await getRunsDrivers(selectedDate)
            } else {
                Swal.fire({
                    text: response.data.message,
                    icon: "warning",
                    type: "warning"
                });
            }
        }
        catch (error) {
            console.log(error)
            const errorMessages = error?.response?.data?.errors?.join('\n');
            Swal.fire({
                text: errorMessages || error.message,
                icon: "error",
                type: "error"
            });
        } finally {
            setLoading(false);
        }
    }

    const [toggleMap, setToggleMap] = useState(false)

    const handleMapView = () =>{
        setToggleMap(!toggleMap)
    }

    const tabs = [
        {
            key: 'loading',
            title: 'Loading',
            content: (
                <Box sx={{ width: '100%', padding: 1 }}>
                    <Tabs value={driverTab} onChange={handleDriverTabChange} variant="scrollable" scrollButtons="auto" TabIndicatorProps={{ sx: { backgroundColor: '#d22530' } }}
                        sx={{
                            '& .MuiTab-root': {
                                color: '#000',
                                position: 'relative',
                                '&:hover .edit-icon': {
                                    opacity: 1
                                }
                            },
                            '& .Mui-selected': { color: '#d22530' }
                        }} >
                        {mergedTabs?.map((tab) => (
                            <Tab
                                value={tab?._id}
                                key={tab?._id}
                                label={tab.driver_id?.length > 0 ? (tab.driver_id[0]?.name + ` (${tab?.run_type})`) : tab.draft_driver}
                                sx={{ minHeight: 0 }}
                                icon={driverTab === (tab?._id) && (
                                    !hideForm ? <CiViewTable title='Table View' size={20} onClick={() => {
                                        setOrderNo("") 
                                        setHideForm(true)
                                        setToggleMap(false)
                                    }} /> : <MdOutlineModeEditOutline title='Edit' size={20} onClick={(e) => handleOrdersChange(e)} />)}
                                iconPosition="end"
                            />
                        ))}
                        <MyDiv style={{ display: 'flex', justifyContent: "flex-start", alignItems: "center", padding: "0px 5px", borderRadius: "50%", border: '1px dotted #d22530' }}>
                            <MdAdd title='Add Driver' style={{ cursor: 'pointer' }} color='#d22530' onClick={() => handleAddSingleDriver()} size={30} />
                        </MyDiv>
                        {data.order_nums.length ? 
                            <MyDiv style={{ display: 'flex', justifyContent: "flex-end", alignItems: "center", padding: "0px 5px", width: '100%' }}>
                                {!toggleMap ? 
                                    <FaMapMarkedAlt title='Map View' style={{ cursor: 'pointer' }} color='#d22530' onClick={() => handleMapView()} size={30} />
                                    : 
                                    <TbMapOff title='Map View' style={{ cursor: 'pointer' }} color='#d22530' onClick={() => handleMapView()} size={30} />
                                }
                            </MyDiv>
                        : null }
                    </Tabs>
                    {((driversInfo?._id) &&
                        !hideForm && !toggleMap) ? (
                        <form onSubmit={(e) => submit(e)}>
                            <Row className="GeneralHeading withBackArrow" style={{ display: 'flex', alignItems: 'flex-start' }}>
                                <Col md={3} style={{ height: '60vh', overflowY: 'scroll' }}>
                                    <TextareaAutosize
                                        title='Order Number'
                                        name='order_nums'
                                        style={{ width: "100%" }}
                                        value={data.order_nums}
                                        onChange={(e) => handleFieldChange(e)}
                                        // fullWidth
                                        // required 
                                        minRows={23} 
                                        // maxRows={20}
                                        placeholder="Enter multiple order numbers (one per line)"
                                    />
                                </Col>
                                <Col md={7}>
                                    <Row>
                                        <Col md={6}>
                                            <TextField
                                                select
                                                name="driver_id"
                                                id="driver_id"
                                                variant="standard"
                                                label="Drivers"
                                                fullWidth
                                                value={data.driver_id}
                                                onChange = {handleFieldChange}
                                            >
                                                {driverMaster.map((driver) => (
                                                    <MenuItem key={driver._id} value={driver._id}>
                                                    {driver.name} {driver?.truck_name && `(${driver.truck_name})`}
                                                    </MenuItem>
                                                ))}
                                            </TextField>
                                        </Col>
                                        <Col md={4}>
                                            <TextField name='truck_id' label="Truck Name" variant='standard' value={data.truck_id || ""} onChange={(e) => {
                                                const selectedTruck = activeTrucks.find(truck => truck._id === e.target.value);
                                                handleFieldChange(e, selectedTruck?.dimensions?.max_length);
                                            }} fullWidth select
                                                required={runType === 1} >
                                                {activeTrucks && activeTrucks.map((truck) => (
                                                    <MenuItem key={truck._id} value={truck._id} content={truck}>{truck.name + `(${truck.reg_no})`}</MenuItem>
                                                ))}
                                            </TextField>
                                        </Col>
                                        <Col md={2}>
                                            <TextField name='truck_length' className="mb-3" InputProps={{ disabled: true }} label="Max Length" variant='standard' value={data.truck_length} onChange={(e) => handleFieldChange(e)} fullWidth
                                                required={runType === 1} />
                                            
                                        </Col>
                                        <Col md={6} >
                                            <TextField label="Run" className="mb-3" name='run_type' variant='standard' value={runType} onChange={(e) => handleFieldChange(e)} fullWidth select disabled
                                                required >
                                                {runs_type.map((run_type) => (
                                                    <MenuItem key={run_type.value} value={run_type.value}>{run_type.label}</MenuItem>
                                                ))}
                                            </TextField>
                                        </Col>
                                        <Col md={6} >
                                            <TextField name='start_time' label="Start Time" variant='standard' value={data.start_time} onChange={(e) => handleFieldChange(e)} fullWidth
                                                required={runType === 1} />
                                        </Col>
                                    </Row>
                                </Col>
                                {/* <Col md={10}></Col> */}
                                <Col md={2} className="text-end">
                                    <Button type='submit' variant="success" className='FormBtn mt-4 w-100'>
                                        {loading ? <Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" className='mx-2' />
                                            : "SUBMIT"}
                                    </Button>
                                    <Button variant="danger" className='FormBtn mt-4 w-100' onClick={() => handleDelete()}>
                                        {loading ? <Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" className='mx-2' />
                                            : "DELETE"}
                                    </Button>
                                </Col>
                            </Row>
                        </form>
                    ) : null
                    }

                    {(driversInfo?._id &&
                        hideForm && !toggleMap ) &&
                        <CustomDataGrid
                            rows={orderInfo.length > 0 ? orderInfo.map((row, idx) => ({ ...row, index: idx + 1 })) : []} // Add SI No
                            columns={columns}
                            loading={loading} // Set loading state here
                            disableSelectionOnClick={true} // Disable row selection on click
                            autoHeight={true} // Set to true if you want the grid to adjust its height automatically
                            getRowId={(row) => row.order_unique_id} // Unique ID for each row
                            rowHeight={30}
                            total={orderInfo?.length}
                            paginationMode='client'
                            onPageChange={(newPage) => setPage(newPage)} // Handle page change
                            onPageSizeChange={(newPageLimit) => setPageLimit(newPageLimit)} // Handle page size change
                            page={page} // Current page
                            pageLimit={pageLimit} // Current page size
                            showColumnVerticalBorder={true}
                            getRowClassName={(params) => getRowColor(params.row, 'runs').classname}
                        />
                    }

                    {toggleMap && <RouteMap addresses={addressForMap}/>}
                </Box>
            )
        },
        {
            key: 'runs',
            title: 'Runs',
            content: (
                <Box sx={{ width: '100%', padding: 1 }}>
                    <Tabs value={driverTab} onChange={handleDriverTabChange} variant="scrollable" scrollButtons="auto" TabIndicatorProps={{ sx: { backgroundColor: '#d22530' } }}
                        sx={{
                            '& .MuiTab-root': {
                                color: '#000',
                                position: 'relative',
                                '&:hover .edit-icon': {
                                    opacity: 1
                                }
                            },
                            '& .Mui-selected': { color: '#d22530' },
                        }} >
                        {mergedTabs?.map((tab) => (
                            <Tab
                                value={tab?._id}
                                key={tab?._id}
                                label={tab.driver_id?.length > 0 ? (tab.driver_id[0]?.name + ` (${tab?.run_type})`) : tab.draft_driver}
                                sx={{ minHeight: 0 }}
                                icon={driverTab === tab?._id && (
                                    !hideForm ? <CiViewTable title='Table View' size={20} onClick={() => {
                                        setOrderNo("") 
                                        setHideForm(true)
                                    }} /> : <MdOutlineModeEditOutline title='Edit' size={20} onClick={(e) => handleOrdersChange(e)} />)}
                                iconPosition="end"
                            />
                        ))}
                        <MyDiv style={{ display: 'flex', justifyContent: "flex-start", alignItems: "center", padding: "0px 5px", borderRadius: "50%", border: '1px dotted #d22530' }}>
                            <MdAdd title='Add Driver' style={{ cursor: 'pointer' }} color='#d22530' onClick={() => handleAddSingleDriver()} size={30} />
                        </MyDiv>
                        {hideForm ? 
                            <MyDiv style={{ display: 'flex', justifyContent: "flex-end", alignItems: "center", padding: "0px 5px", width: '100%' }}>
                                {!toggleMap ? 
                                    <FaMapMarkedAlt title='Map View' style={{ cursor: 'pointer' }} color='#d22530' onClick={() => handleMapView()} size={30} />
                                    : 
                                    <TbMapOff title='Map View' style={{ cursor: 'pointer' }} color='#d22530' onClick={() => handleMapView()} size={30} />
                                }
                            </MyDiv>
                        : null }
                    </Tabs>
                    {((driversInfo?._id) &&
                        !hideForm && !toggleMap) ? (
                        <form onSubmit={(e) => submit(e)}>
                            <Row className="GeneralHeading withBackArrow" style={{ display: 'flex', alignItems: 'flex-start' }}>
                                <Col md={3} style={{ height: '60vh', overflowY: 'scroll' }}>
                                    <TextareaAutosize
                                        title='Order Number'
                                        name='order_nums'
                                        style={{ width: "100%" }}
                                        value={data.order_nums}
                                        onChange={(e) => handleFieldChange(e)}
                                        // fullWidth
                                        // required 
                                        minRows={23} 
                                        // maxRows={20}
                                        placeholder="Enter multiple order numbers (one per line)"
                                    />
                                </Col>
                                <Col md={7}>
                                    <Row>
                                        <Col md={6}>
                                            <TextField
                                                select
                                                name="driver_id"
                                                id="driver_id"
                                                variant="standard"
                                                label="Drivers"
                                                fullWidth
                                                value={data.driver_id}
                                                onChange = {handleFieldChange}
                                            >
                                                {driverMaster.map((driver) => (
                                                    <MenuItem key={driver._id} value={driver._id}>
                                                    {driver.name} {driver?.truck_name && `(${driver.truck_name})`}
                                                    </MenuItem>
                                                ))}
                                            </TextField>
                                        </Col>
                                        <Col md={4}>
                                            <TextField name='truck_id' label="Truck Name" variant='standard' value={data.truck_id || ""} onChange={(e) => {
                                                const selectedTruck = activeTrucks.find(truck => truck._id === e.target.value);
                                                handleFieldChange(e, selectedTruck?.dimensions?.max_length);
                                            }} fullWidth select
                                                required={runType === 1} >
                                                {activeTrucks && activeTrucks.map((truck) => (
                                                    <MenuItem key={truck._id} value={truck._id} content={truck}>{truck.name + `(${truck.reg_no})`}</MenuItem>
                                                ))}
                                            </TextField>
                                        </Col>
                                        <Col md={2}>
                                            <TextField name='truck_length' className="mb-3" focused InputProps={{ readOnly: true }} label="Max Length of Truck" variant='standard' value={data.truck_length} onChange={(e) => handleFieldChange(e)} fullWidth
                                                required={runType === 1} />
                                            
                                        </Col>
                                        <Col md={6} >
                                            <TextField label="Run" className="mb-3" name='run_type' variant='standard' value={runType} onChange={(e) => handleFieldChange(e)} fullWidth select disabled
                                                required >
                                                {runs_type.map((run_type) => (
                                                    <MenuItem key={run_type.value} value={run_type.value}>{run_type.label}</MenuItem>
                                                ))}
                                            </TextField>
                                        </Col>
                                        <Col md={6} >
                                            <TextField name='start_time' label="Start Time" variant='standard' value={data.start_time} onChange={(e) => handleFieldChange(e)} fullWidth
                                                required={runType === 1} />
                                        </Col>
                                    </Row>
                                </Col>
                                {/* <Col md={10}></Col> */}
                                <Col md={2} className="text-end">
                                    <Button type='submit' variant="success" className='FormBtn mt-4 w-100'>
                                        {loading ? <Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" className='mx-2' />
                                            : "SUBMIT"}
                                    </Button>
                                    <Button variant="danger" className='FormBtn mt-4 w-100' onClick={() => handleDelete()}>
                                        {loading ? <Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" className='mx-2' />
                                            : "DELETE"}
                                    </Button>
                                </Col>
                            </Row>
                        </form>
                    ) : null
                    }

                    {(driversInfo?._id &&
                        hideForm && !toggleMap ) &&
                        <CustomDataGrid
                            rows={orderInfo.length > 0 ? orderInfo.map((row, idx) => ({ ...row, index: idx + 1 })) : []} // Add SI No
                            columns={columns}
                            loading={loading} // Set loading state here
                            disableSelectionOnClick={true} // Disable row selection on click
                            autoHeight={true} // Set to true if you want the grid to adjust its height automatically
                            getRowId={(row) => row.order_unique_id} // Unique ID for each row
                            rowHeight={30}
                            total={orderInfo?.length}
                            paginationMode='client'
                            onPageChange={(newPage) => setPage(newPage)} // Handle page change
                            onPageSizeChange={(newPageLimit) => setPageLimit(newPageLimit)} // Handle page size change
                            page={page} // Current page
                            pageLimit={pageLimit} // Current page size
                            showColumnVerticalBorder={true}
                            getRowClassName={(params) => getRowColor(params.row, 'runs').classname}
                        />
                    }

                    {toggleMap && <RouteMap addresses={addressForMap}/>}
                </Box>
            )
        },
    ];

    const sendValueToParent = (date) => {
        if (date) {
            setSelectedDate(DateTime.fromISO(date));
            getRunsDrivers(date)
        }
    }

    const handleAllDriverOrdersExport = async (driversIds = [], export_type = 'xlsx') => {

        // if (exportContents.driver_ids.length === 0) {
        //     Swal.fire({
        //         text: "Select Drivers",
        //         icon: "info",
        //     });
        //     return
        // }
        setPrintBtnLoading(true);
        if (exportContents.content.length === 0) {
            Swal.fire({
                text: "Select Content",
                icon: "info",
            });
            setPrintBtnLoading(false);
            return
        }

        const formattedDate = new Date(selectedDate).toISOString();
        const req = {
            driver_ids: driversIds,
            delivery_date: formattedDate,
            doMail: printOrEmail,
            report_type: exportContents.content,
            export_type: export_type, // set 'pdf' or 'xlsx' based on your UI
            run_type: exportContents.run_type.map(String)
        };
        if (driversIds[0] === "") {
            Swal.fire({
                text: "No Data to export.",
                icon: "info",
            });
            setPrintBtnLoading(false);
            return
        }

        try {
            const url = `${API_BASE_URL}export-runs-order-details`;

            const response = await axios.post(url, req, {
                responseType: 'arraybuffer', // important for binary data :contentReference[oaicite:1]{index=1}
                headers: {
                    "x-access-token": localStorage.getItem("token"),
                    Accept: req.export_type === 'pdf'
                        ? 'application/pdf'
                        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                },
            });

            const contentType = response.headers['content-type'] || '';
            const blob = new Blob([response.data], { type: contentType });

            // If sending via mail, just notify
            if (printOrEmail) {
                Swal.fire({
                    text: "Report sent in mail successfully.",
                    icon: "success",
                });
                setPrintBtnLoading(false);
                return;
            }

            // If JSON or text, show "No data"
            if (contentType.includes('application/json') || contentType.includes('text/')) {
                const text = new TextDecoder().decode(response.data);
                if (text) {
                    Swal.fire({
                        text: text || "No Data to export.",
                        icon: "info",
                    });
                }
                setPrintBtnLoading(false);
                return;
            }

            // Otherwise, create download link
            const resUrl = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = resUrl;

            // Derive file name from headers or fallback
            const contentDisposition = response.headers['content-disposition'] || '';

            const selectedLabels = exportContents.content
                .map(val => exportContent.find(item => item.value === val)?.label)
                .filter(Boolean); // Remove any undefined if match not found

            // Join labels with underscore if multiple selected
            const labelPart = selectedLabels.join("_").toUpperCase();

            let filename = req.export_type === 'pdf'
                ? `${labelPart}_REPORT_${formattedDate.split('T')[0]}.pdf`
                : `${labelPart}_REPORT_${formattedDate.split('T')[0]}.xlsx`;

            const match = contentDisposition.match(/filename="?(.+?)"?(;|$)/);
            if (match) filename = match[1];

            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();

            link.remove();
            window.URL.revokeObjectURL(resUrl);

        } catch (error) {
            const errMsg = error?.response?.data
                ? new TextDecoder().decode(error.response.data)
                : error.message;
            Swal.fire({
                text: errMsg,
                icon: "error",
            });
            setPrintBtnLoading(false);
        } finally {
            setPrintBtnLoading(false);
        }
    };

    const [driverList, setDriverList] = useState([]);
    const [preview, setPreview] = useState(false)
    const [orderNo, setOrderNo] = useState("")

    const searchByOrderNumber = async (e) =>{
        const orderNos = [orderNo]
        if(e.key === "Enter"){
            if(e.target.value.length === 0){
                CustomSwal.toast.info("Order Number is required.")
                return
            }
            if(e.target.value.length < 5){
                CustomSwal.toast.info("Invalid order number.")
                return
            }
            searchText = true
            await fetchRunsOrderDetails(orderNos)
        }
    }

    const onChangeOrderNumSearch = async (e) => {
        setOrderNo(e.target.value)
        if(e.target.value.length === 0){
            searchText = false
            await getRunsDrivers(selectedDate)
        }
    }

    return (
        <React.Fragment>
            {printBtnLoading ? (
            <MyDiv className="BulkUploadLoader">
                <SpanTag>
                <IconButton aria-label="fingerprint" color="info" className="IconBtnLoader">
                    <FiLoader />
                </IconButton>
                <br />
                PDF Generation in progress <br /> Please Wait. Don't Press Back or Refresh. <br /> This Process May Take Some Time to Complete
                </SpanTag>
            </MyDiv>
            ) : (
            ""
            )}
            <MyDiv style={{ display: 'none' }}>
                <FloatingActionButtons />
            </MyDiv>
            <Row className="GeneralHeading withBackArrow">
                <Col md={8} xs={12} >
                    <HeadingTwo><Link className="arrow-btn" onClick={() => navigate(-1)}><MdKeyboardArrowLeft /></Link>
                        <Box sx={{ maxWidth: { xs: 320, md: 1400 }, backgroundColor: 'background.paper' }}>
                            <Tabs value={activeTab} onChange={handleTabChange} variant="scrollable" scrollButtons="auto" TabIndicatorProps={{ sx: { backgroundColor: '#d22530' } }}
                                sx={{ '& .MuiTab-root': { color: '#000' }, '& .Mui-selected': { color: '#d22530' } }} >
                                {tabs.map((tab) => (
                                    <Tab value={tab.key} label={tab.title} key={tab.key} />
                                ))}
                            </Tabs>
                        </Box>
                    </HeadingTwo>
                </Col>
                
                <Col md={2} xs={12} >
                    <TextField 
                        label="Order Number (Press enter to search)"
                        value={orderNo}
                        onChange={(e) => onChangeOrderNumSearch(e)}
                        onKeyDown={(e) => searchByOrderNumber(e)}
                        size='small'
                        fullWidth
                        variant='standard'
                        focused
                    />
                </Col>
                <Col md={2} xs={12} className="text-end" style={{ justifyContent: 'space-between', display: 'flex', alignItems: 'center' }}>
                    <MdRemoveRedEye size={25} title='Preview' color='#d22530' onClick={() => setPreview(!preview)} style={{ cursor: "pointer", opacity: preview ? 1 : 0.5}}/>
                    <MdRestore size={25} title='Verify All Orders Assigned' color='#009a33ff' onClick={() => verifyAllOrdersAssigned()} style={{ cursor: "pointer" }}/>
                    <Button
                        disabled={mergedTabs.length}
                        variant="danger"
                        sx={{
                            backgroundColor: '#d22530',
                            '&:hover': { backgroundColor: '#b31f29' }
                        }}
                        onClick={() => handleRackingDrawerToggle()}
                    >
                        Add Run
                    </Button>
                </Col>
            </Row>
            {!preview && 
                <>
                    <Row className="GeneralHeading mt-1">
                        <Col md={2} xs={12}>
                            <LocalizationProvider dateAdapter={AdapterLuxon}>
                                <DatePicker
                                    label="Delivery Date"
                                    value={selectedDate}
                                    onChange={handleDateChange}
                                    format="yyyy-MM-dd"
                                    slotProps={{ textField: { size: 'small', variant: 'outlined', fullWidth: true } }}
                                />
                            </LocalizationProvider>
                        </Col>
                        <Col md={1} xs={12}>
                            <TextField label="Run Type" size='small' name='runType' variant='outlined' value={runType} onChange={(e) => setRunType(e.target.value)} fullWidth select
                                required >
                                {runs_type.map((run_type) => (
                                    <MenuItem key={run_type.value} value={run_type.value}>{run_type.label}</MenuItem>
                                ))}
                            </TextField>
                        </Col>
                        <Col md={2} xs={12}>
                            <LabelTag>Print <Switch checked={printOrEmail} onChange={(e) => setPrintOrEmail(e.target.checked)} /> Send Email</LabelTag>
                        </Col>
                        <Col md={1} xs={12}>
                            <TextField
                                size="small"
                                fullWidth
                                select
                                required
                                name="run_type"
                                id="run_type"
                                variant="standard"
                                label="Run Type"
                                SelectProps={{
                                    multiple: true,
                                    value: exportContents.run_type,
                                    renderValue: (selected) =>
                                        selected
                                            .map((id) => {
                                                const run = runs_type.find((d) => d.value === id);
                                                return run ? run.label : '';
                                            })
                                            .join(', '),
                                    onChange: (e) => {
                                        const value = e.target.value;
                                        if (value.includes('all')) {
                                            // If 'all' is selected, select all or deselect all based on current selection
                                            const isAllSelected = exportContents.run_type.length === runs_type.length;
                                            setExportContents({
                                                ...exportContents,
                                                run_type: isAllSelected ? [] : runs_type.map(run => run.value),
                                            });
                                        } else {
                                            setExportContents({
                                                ...exportContents,
                                                run_type: value,
                                            });
                                        }
                                    },
                                }}
                            >
                                <MenuItem value="all">
                                    <em>{exportContents.run_type.length === runs_type.length ? 'Deselect All' : 'Select All'}</em>
                                </MenuItem>
                                {runs_type.map((run, index) => (
                                    <MenuItem key={index} value={run.value}>
                                        {run.label}
                                    </MenuItem>
                                ))}
                            </TextField>
                        </Col>
                        <Col md={2} xs={12}>
                            <Col md={12}>
                                <TextField
                                    size="small"
                                    fullWidth
                                    select
                                    // required
                                    name="drivers_id"
                                    id="drivers_id"
                                    variant="standard"
                                    label="Drivers"
                                    SelectProps={{
                                        multiple: true,
                                        value: exportContents.driver_ids,
                                        renderValue: (selected) =>
                                            selected
                                                .map((id) => {
                                                    const driver = driverList.find((d) => d._id === id);
                                                    return driver ? driver.name : '';
                                                })
                                                .join(', '),
                                        onChange: (e) => {
                                            const value = e.target.value;
                                            if (value.includes('all')) {
                                                // If 'all' is selected, select all or deselect all based on current selection
                                                const isAllSelected = exportContents.driver_ids?.length === driverList?.length;
                                                setExportContents({
                                                    ...exportContents,
                                                    driver_ids: isAllSelected ? [] : driverList?.map(driver => driver._id),
                                                });
                                            } else {
                                                setExportContents({
                                                    ...exportContents,
                                                    driver_ids: value,
                                                });
                                            }
                                        },
                                    }}
                                >
                                    <MenuItem value="all">
                                        <em>{exportContents.driver_ids?.length === driverList?.length ? 'Deselect All' : 'Select All'}</em>
                                    </MenuItem>
                                    {driverList?.map((driver) => (
                                        <MenuItem key={driver._id} value={driver._id}>
                                            {driver.name}
                                        </MenuItem>
                                    ))}
                                </TextField>
                            </Col>
                        </Col>
                        <Col md={2} xs={12}>
                            <TextField select required size='small' fullWidth name="export-content" id="export-content" variant="standard" label="Content"
                                SelectProps={{
                                    multiple: true, value: exportContents.content,
                                    renderValue: (selected) =>
                                        selected
                                            .map((id) => {
                                                const content = exportContent.find((d) => d.value === id);
                                                return content ? content.label : '';
                                            })
                                            .join(', '),
                                    onChange: (e) => setExportContents({
                                        ...exportContents,
                                        content: e.target.value
                                    })
                                }} >
                                {exportContent.map((content, index) => (
                                    <MenuItem key={index} value={content.value}>{content.label}</MenuItem>
                                ))}
                            </TextField>
                        </Col>
                        <Col md={2} xs={12} className="text-end gap-2">
                            <PiMicrosoftExcelLogoFill size={35} color={printBtnLoading ? '#ccc' : '#d22530'}
                                onClick={printBtnLoading ? undefined : () => handleAllDriverOrdersExport(exportContents.driver_ids)}
                                style={{ cursor: printBtnLoading ? 'not-allowed' : 'pointer', opacity: printBtnLoading ? 0.5 : 1 }}
                                title={printBtnLoading ? "unavailable" : "Export as Excel"} 
                            />
                            {!printOrEmail ?
                                <MdLocalPrintshop 
                                    size={30} 
                                    color={printBtnLoading ? '#ccc' : '#d22530'}
                                    onClick={printBtnLoading ? undefined : () => handleAllDriverOrdersExport(exportContents.driver_ids, 'pdf')}
                                    style={{ cursor: printBtnLoading ? 'not-allowed' : 'pointer', opacity: printBtnLoading ? 0.5 : 1 }}
                                    title={printBtnLoading ? "Print unavailable" : "Print"} 
                                    /> :
                                <RiMailSendFill size={30} color={printBtnLoading ? '#ccc' : '#d22530'}
                                    onClick={printBtnLoading ? undefined : () => handleAllDriverOrdersExport(exportContents.driver_ids, 'pdf')}
                                    style={{ cursor: printBtnLoading ? 'not-allowed' : 'pointer', opacity: printBtnLoading ? 0.5 : 1 }}
                                    title={printBtnLoading ? "Send mail unavailable" : "Send Mail"}
                                />
                            }
                        </Col>
                    </Row>
                    <Row className="GeneralHeading mt-1">
                        <Col>
                            <Typography variant='h4'>{getDayOfWeek(new Date(selectedDate).toISOString().split("T")[0]).toUpperCase()} {new Date(selectedDate).toISOString().split("T")[0].split("-").reverse().join("-")}</Typography>
                        </Col>
                        {data.start_time &&
                            <Col>
                                <Typography variant='h4'>Start Time: {data.start_time} </Typography>
                            </Col>
                        }
                        {data.driver_name && data.truck_name &&
                            <Col>
                                <Typography variant='h4'>{data.driver_name} - {data.truck_name} </Typography>
                            </Col>
                        }
                    </Row>
                </>
            }
            {mergedTabs.length ? 
                <MyDiv className="GeneralTable mt-1">
                    {tabs.map((tab) => (
                        <Box key={tab.key} style={{ display: activeTab === tab.key ? 'block' : 'none' }}>
                            <Col>
                                {tab.content}
                            </Col>

                        </Box>
                    ))}
                </MyDiv>
            : null}
            <Drawer anchor="right" open={rackingDrawerState} onClose={() => handleRackingDrawerToggle()} >
                <FormRuns handleClose={handleRackingDrawerToggle} sendValueToParent={sendValueToParent} selectedDate={selectedDate} />
            </Drawer>

            <style jsx="true">{`
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(-10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </React.Fragment>
    );
}

export default ManageRuns;