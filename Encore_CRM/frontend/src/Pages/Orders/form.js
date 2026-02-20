import React, { useState, useEffect, useCallback } from "react";
import { HeadingFour, LabelTag, MyDiv } from "../Common/Components";
import { Card, Spinner } from "react-bootstrap";
import { TextField, MenuItem, Autocomplete, Switch, Tooltip, IconButton, Grid, Box, Button } from "@mui/material";
import { MdClose, MdFilePresent, MdVerified } from "react-icons/md";
import axios from "axios";
import swal from "sweetalert2";
import { rackList, deliveryAddress } from "../Common/staticjson";
import FormControlLabel from "@mui/material/FormControlLabel";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { DatePicker } from "@mui/x-date-pickers";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import PropTypes from "prop-types";
//Code added by Rahul
import { useNavigate } from 'react-router-dom';
dayjs.extend(utc);
dayjs.extend(timezone);

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;

const AWF_CUST_ID = localStorage.getItem("awfCustId");
const AWF_ORDER_SERIES = localStorage.getItem("awfOrderSeries");

function validatePONumber(poNumber, prefix, shouldValidate) {
  // If validation is not required, just return true
  if (!shouldValidate) return true;

  // Construct regex: prefix + 6 digits + optional separator (/ or -) only if 7th character exists
  const regex = new RegExp(`^${prefix}\\d{5}([/-].*)?$`);

  // Test the PO number against the regex
  return regex.test(poNumber);
}


function FormOrder({ handleClose, orderInfo }) {
  //Code added by Rahul
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState({ name: "", id: "", PoNumber: "", account_UID: "" });
  const [btnLoading, setBtnLoading] = useState(false);

  const [mudMapPreview, setMudMapPreview] = useState(null);


  let orderInfoId = orderInfo;
  const [data, setData] = useState({
    order_customer_id: "",
    order_customer_contact_id: "",
    order_customer_PO_number: "",
    order_delivery_date: "",
    order_delivery_time: "",
    order_delivery_session: "",
    order_delivery_address_mode: "",
    order_site_delivery_attention_person: "",
    order_site_delivery_attention_contact: "",
    order_site_delivery_address1: "",
    order_site_delivery_city: "",
    order_site_delivery_country: "AU",
    order_site_delivery_postalcode: "",
    order_site_delivery_state: "VIC",
    order_store_delivery_address1: "",
    order_store_delivery_city: "",
    order_store_delivery_country: "AU",
    order_store_delivery_postalcode: "",
    order_store_delivery_state: "VIC",
    order_department: "",
    order_custom_note: "",
    order_inter_department_instruction: "",
    order_unique_id: "",
    order_flashing_checker: false,
    order_myob_row_id: "",
    order_crane_lift_checker: false,
    order_loaders_info: "",
    order_master_rack: "",
    order_far_suburb: false,
    order_site_delivery_details: "",
    order_site_delivery_mud_map: "", // New field for Mud Map
    order_customer_contact_verified: false
  });

  const attentionValueRef = React.useRef(null);

  const loadSpecificOrder = useCallback(async () => {
    const url = API_BASE_URL + `fetch-specific-order-details/` + orderInfoId;
    try {
      const res = await axios.get(url, {
        headers: {
          "x-access-token": localStorage.getItem("token"),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });

      const specificOrder = res.data[0];
      specificOrder.order_delivery_date = dayjs.utc(specificOrder.order_delivery_date).toDate();
      attentionValueRef.current = specificOrder?.order_site_delivery_attention_person
      setData(specificOrder);
      if (specificOrder.order_site_delivery_mud_map) {
        handleFetchMudMap(specificOrder.order_site_delivery_mud_map).then(url => {
          setMudMapPreview(url);
        });
      }
      setSelectedCustomer({
        ...selectedCustomer,
        account_UID: specificOrder?.account_UID
      })
      if (specificOrder.order_delivery_time) {
        const [timePart, meridian] = specificOrder.order_delivery_time.split(" ");
        const [hour, minute] = timePart.split(".");
        setCustomTime({
          hour: hour?.padStart(2, "0") || "12",
          minute: minute?.padStart(2, "0") || "00",
          meridian: meridian || "AM",
          timeSession: specificOrder.order_delivery_session || "",
        });
      } else {
        setCustomTime({
          hour: "12",
          minute: "00",
          meridian: "AM",
          timeSession: specificOrder.order_delivery_session || "",
        });
      }
    } catch (error) {
      swal.fire({
        text: error?.response?.data || "Failed to load order details",
        icon: "error",
        type: "error",
      });
    }
  }, [orderInfoId]);

  useEffect(() => {
    if (orderInfo !== undefined) {
      loadSpecificOrder();
    }
    loadCustomers();
    loadCityMaster();
  }, [orderInfo, loadSpecificOrder]);

  useEffect(() => {
    if (data.order_customer_id) {
      const selectedCustomer = customers.find(c => c._id === data.order_customer_id);
      if (selectedCustomer) {
        loadCustomerAttentionPerson(selectedCustomer);
        loadCustomerAttentionAddress(selectedCustomer);
        setData(prev => ({
          ...prev,
          order_customer_id: selectedCustomer._id,
          order_store_delivery_address1: selectedCustomer.account_Address_line_one || "",
          order_store_delivery_city: selectedCustomer.account_Address_City || "",
          order_store_delivery_country: selectedCustomer.account_Address_Country || "AU",
          order_store_delivery_postalcode: selectedCustomer.account_Address_PostalCode || "",
          order_store_delivery_state: selectedCustomer.account_Address_State || "VIC",
        }));
      }
    }
    if (orderInfo) {
      setData(prev => ({
        ...prev,
        order_store_delivery_address1: data.order_store_delivery_address1 || "",
        order_store_delivery_city: data.order_store_delivery_city || "",
        order_store_delivery_country: data.order_store_delivery_country || "AU",
        order_store_delivery_postalcode: data.order_store_delivery_postalcode || "",
        order_store_delivery_state: data.order_store_delivery_state || "VIC",
      }));
    }
  }, [
    data.order_customer_id,
    customers,
    data.order_store_delivery_address1,
    data.order_store_delivery_city,
    data.order_store_delivery_country,
    data.order_store_delivery_postalcode,
    data.order_store_delivery_state,
    orderInfo,
  ]);

  const loadCustomers = async () => {
    try {
      const url = API_BASE_URL + `fetch-account-data-dropdown`;
      const response = await axios.get(url, { headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" } });
      if (Array.isArray(response.data)) {
        const uniqueCustomers = [];
        const seenIds = new Set();
        response.data.forEach(customer => {
          if (customer?._id && !seenIds.has(customer._id)) {
            seenIds.add(customer._id);
            uniqueCustomers.push(customer);
          }
        });
        setCustomers(uniqueCustomers);
      } else {
        setCustomers([]);
      }
    } catch (error) {
      console.log(error);
      setCustomers([]);
    }
  };

  function handle(e) {
    const newData = { ...data };
    newData[e.target.id] = e.target.value;
    setData(newData);
  }
  const handleFieldChange = event => {
    setData(data => ({
      ...data,
      [event.target.name]: event.target.type === "checkbox" ? event.target.checked : event.target.value,
    }));
  };
  const submit = e => {
    e.preventDefault();
    if(!validatePONumber(data.order_customer_PO_number, AWF_ORDER_SERIES, selectedCustomer?.account_UID === AWF_CUST_ID)){
      swal.fire({
        title: "Validation Error",
        text: `Please enter a valid PO Number as it is AWF Customer. Should start with ${AWF_ORDER_SERIES} and a number of 6 digit. After 6 digit number there should be a separator (- or /) to extend. Ex: 412345, 412345/y ...etc`,
        icon: "warning",
      });
      return;
    }

    // Validate delivery date
    if (!data.order_delivery_date) {
      swal.fire({
        title: "Validation Error",
        text: "Please select a delivery date.",
        icon: "warning",
      });
      return;
    }

    // Validate time: hour + minute + meridian
    if (!customTime.hour || !customTime.minute || !customTime.meridian) {
      swal.fire({
        title: "Validation Error",
        text: "Please select delivery time (hour, minute, and AM/PM).",
        icon: "warning",
      });
      return;
    }

    const contactRaw = data.order_site_delivery_attention_contact.replace(/\s/g, "");
    if ( contactRaw && contactRaw !== "0" && !/^(03|04)\d{8}$/.test(contactRaw) ){
      swal.fire({
        title: "Validation Error",
        text: "Please enter a valid Attention Contact number (10 digits starting with 0 or 03 or 04).",
        icon: "warning",
      });
      return;
    }

    const deliveryDateSydney = dayjs(data.order_delivery_date).tz("Australia/Sydney").format("YYYY-MM-DD");
    const todayDateSydney = dayjs().tz("Australia/Sydney").format("YYYY-MM-DD");

    setBtnLoading(true);
    if (deliveryDateSydney === todayDateSydney) {
      swal
        .fire({
          title: "Confirmation",
          text: "Created date and Delivery date are the same. Do you want to proceed?",
          icon: "warning",
          showCancelButton: true,
          confirmButtonText: "Yes, Proceed",
          cancelButtonText: "No, Cancel",
          customClass: {
            confirmButton: "primary-btn",
            cancelButton: "secondary-btn",
          },
        })
        .then(result => {
          if (result.isConfirmed) {
            proceedWithSubmission();
          } else {
            setBtnLoading(false);
          }
        });
    } else {
      proceedWithSubmission();
    }
  };

  const proceedWithSubmission = () => {
    const formData = new FormData();
    const processedData = {
      ...data,
      order_inter_department_instruction: data.order_inter_department_instruction ? data.order_inter_department_instruction.trim() : "",
      order_customer_contact_verified: data?.order_customer_contact_verified || false
    };
    let deliveryDate = dayjs(data.order_delivery_date).tz("Australia/Sydney");
    let hour = parseInt(customTime.hour || "0");
    const minute = parseInt(customTime.minute || "0");
    const isPM = customTime.meridian === "PM";

    if (isPM && hour !== 12) hour += 12;
    if (!isPM && hour === 12) hour = 0;
    const mergedDateTime = deliveryDate.set("hour", hour).set("minute", minute).set("second", 0).set("millisecond", 0);
    processedData.order_delivery_date = mergedDateTime.toDate().toUTCString();
    processedData.order_delivery_time = `${customTime.hour}.${customTime.minute} ${customTime.meridian}`;
    processedData.order_delivery_session = customTime.timeSession || "";

    // Append all fields to FormData
    for (const key in processedData) {
      formData.append(key, processedData[key]);
    }
    const url = orderInfoId ? `${API_BASE_URL}update-specific-order-details/${orderInfoId}` : `${API_BASE_URL}add-order-details`;
    const method = orderInfoId ? "patch" : "post";
    axios({
      method,
      url,
      data: formData,
      headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" },
    })
      .then(res => {
        if (res.status === 200) {
          swal.fire({ text: "Successfully Saved", icon: "success", type: "success", timer: 1000 });
          //Code change by Rahul
          const orderId = res.data?.order?._id || res.data?._id;
          if (orderId && !orderInfoId) {
            navigate(`/orders/${orderId}`);
          }
          //Code change by Rahul
          handleClose();
        }
        setBtnLoading(false);
      })
      .catch(error => {
        swal.fire({ text: error.response.data, icon: "error", type: "error" });
        setBtnLoading(false);
      });
  };

  const handleDateChange = newDate => {
    if (!newDate) return;

    setData(prevData => {
      const existingDateTime = prevData.order_delivery_date ? dayjs(prevData.order_delivery_date).tz("Australia/Sydney") : dayjs().tz("Australia/Sydney").hour(0).minute(0).second(0); // Default time if empty
      const updatedDate = dayjs(newDate).tz("Australia/Sydney").hour(existingDateTime.hour()).minute(existingDateTime.minute()).second(existingDateTime.second());
      return {
        ...prevData,
        order_delivery_date: updatedDate.toDate().toUTCString(),
      };
    });
  };

  //CustomloadCityMaster Date Picker
  const [customTime, setCustomTime] = useState({ hour: "", minute: "00", meridian: "AM", timeSession: "" });
  const hours = ["12", "06", "07", "08", "09", "10", "11", "01", "02", "03", "04", "05"];
  const minutes = ["00", "15", "30", "45"];
  const meridians = ["AM", "PM"];
  const session = ["B4", "Aft"];

  const [attentionPerson, setAttentionPerson] = useState([]);
  const loadCustomerAttentionPerson = customerData => {
    if (!customerData._id) return;
    const url = API_BASE_URL + `fetch-account-contact-data/` + customerData._id + `/Site`;
    axios
      .get(url, {
        headers: {
          "x-access-token": localStorage.getItem("token"),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      })
      .then(res => {
        const contacts = res.data.map(contact => ({
          id: contact._id,
          name: contact.account_Contact_FName,
          phone: contact.account_Contact_Phone,
          order_customer_contact_verified: contact?.account_Contact_Verified || false
        }));
        setAttentionPerson(contacts);
      })
      .catch(error => { });
  };

  const [customerAddress, setCustomerAddress] = useState([]);
  const loadCustomerAttentionAddress = customerData => {
    if (!customerData || !customerData._id) return;
    const url = API_BASE_URL + `fetch-account-address-data/` + customerData._id;
    axios
      .get(url, {
        headers: {
          "x-access-token": localStorage.getItem("token"),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      })
      .then(res => {
        setCustomerAddress(res.data);
      })
      .catch(error => { });
  };

  const [cityMaster, setCityMaster] = useState([]);
  const loadCityMaster = () => {
    const url = API_BASE_URL + `fetch-city-data-dropdown/`;
    axios
      .get(url, {
        headers: {
          "x-access-token": localStorage.getItem("token"),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      })
      .then(res => {
        setCityMaster(Array.isArray(res.data) ? res.data : []);
      })
      .catch(error => { });
  };


  const handleFileSelect = e => {
    e.preventDefault();
    setBtnLoading(true);
    const formData = new FormData();
    formData.append("documents", e.target.files[0]);

    const url = `${API_BASE_URL}upload-mud-map`;

    axios
      .post(url, formData, {
        headers: {
          "x-access-token": localStorage.getItem("token"),
          Accept: "application/json",
          "Content-Type": "multipart/form-data",
        },
      })
      .then(res => {
        data.order_site_delivery_mud_map = res.data.key;
        handleFetchMudMap(res.data.key).then(url => {
          setMudMapPreview(url);
        });
      })
      .catch(error => {
        console.error("Error uploading file:", error);
      })
      .finally(() => {
        setBtnLoading(false);
        e.target.value = null;
      });
  };

  const handleFetchMudMap = async (mudMapKey) => {
    try {
      if (mudMapKey === null || mudMapKey === undefined || mudMapKey.trim() === "") {
        return null;
      }
      const url = `${API_BASE_URL}get-mud-map/?mudMapKey=${encodeURIComponent(mudMapKey)}`;
      const response = await axios.get(url, {
        headers: {
          "x-access-token": localStorage.getItem("token"),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });
      return response.data.url;
    } catch (error) {
      console.error("Error fetching mud map:", error);
    }
  };

  useEffect(() => {
    handleFetchMudMap(data.order_site_delivery_mud_map).then(url => {
      setMudMapPreview(url);
    });
  }, [data.order_site_delivery_mud_map, data.order_delivery_address_mode]);

  // Utility function
  const getFileType = (url) => {
    const urlWithoutQuery = url.split("?")[0];
    const extension = urlWithoutQuery.split(".").pop().toLowerCase();
    switch (extension) {
      case "png":
      case "jpeg":
      case "jpg":
      case "gif":
        return "image";
      case "pdf":
        return "pdf";
      default:
        return "unknown";
    }
  };

  // const renderMudMap = (mudMapUrl) => {
  //   if (!mudMapUrl || mudMapUrl.trim() === "") return null;

  //   const fileType = getFileType(mudMapUrl);

  //   // Only allow image or PDF
  //   if (fileType !== "image" && fileType !== "pdf") return null;

  //   return (
  //     <Col md={2} className="mb-3">
  //       <MyDiv>
  //         <SpanTag className="text-center">
  //           {fileType === "image" && (<img src={mudMapUrl} alt="Mud Map" />)}
  //           {fileType === "pdf" && <GrDocumentPdf className="DocIcon" />}
  //         </SpanTag>
  //         <Tooltip title="Delete Mud Map">
  //           <IconButton aria-label="delete" color="secondary" onClick={() => { setMudMapPreview(null); data.order_site_delivery_mud_map = ""; }}>
  //             <MdDelete />
  //           </IconButton>
  //         </Tooltip>
  //         <a
  //           href={mudMapUrl}
  //           download
  //           target="_blank"
  //           rel="noopener noreferrer"
  //           title="Download"
  //           style={{ marginRight: 8 }}
  //         >
  //           Download
  //         </a>
  //       </MyDiv>
  //     </Col>
  //   );
  // };

  return (
    <MyDiv className="OrderDrawerRight">
      <MyDiv className="grid-margin general-form stretch-card">
        <Card md={12}>
          <Card.Header style={{ display: "flex", justifyContent: "space-between" }}>
            <HeadingFour className="card-title">{orderInfo ? "Edit" : "Add"} Order</HeadingFour>
            {orderInfo ? (
              <HeadingFour>{data.d_order_unique_id}</HeadingFour>
              // <TextField  disabled required id="order_unique_id" value={data.order_unique_id} onChange={e => handle(e)} variant="standard" />
            ) : (
              ""
            )}
          </Card.Header>
          <Card.Body>
            <MyDiv className="DrawerForm">
              <form onSubmit={e => submit(e)}>
                <LabelTag style={{ fontWeight: 'bold' }}>Customer Details</LabelTag>
                
                <Grid container spacing={2} className="DrawerFormField">
                  <Grid item md={3}>
                    <Autocomplete
                      disablePortal
                      options={customers}
                      getOptionLabel={option => (option?.account_Name ? option.account_Name : "")}
                      isOptionEqualToValue={(option, value) => option?._id === value?._id}
                      value={customers.find(c => c._id === data.order_customer_id) || null}
                      onChange={(event, newValue) => {
                        if (newValue) {
                          setSelectedCustomer({
                            name: newValue.account_Name,
                            id: newValue._id,
                            PoNumber: data.order_customer_PO_number,
                            account_UID: newValue.account_UID
                          });
                          setCustomTime(prev => ({
                            ...prev,
                            hour: "",
                            minute: "00",
                            meridian: "AM",
                            timeSession: "",
                          }));
                          setData(prev => ({
                            ...prev,
                            order_customer_id: newValue._id,
                            order_store_delivery_address1: newValue.account_Address_line_one || "",
                            order_store_delivery_city: newValue.account_Address_City || "",
                            order_store_delivery_country: newValue.account_Address_Country || "AU",
                            order_store_delivery_postalcode: newValue.account_Address_PostalCode || "",
                            order_store_delivery_state: newValue.account_Address_State || "VIC",
                            order_customer_PO_number: "",
                            order_delivery_address_mode: "",
                            order_site_delivery_attention_person: "",
                            order_site_delivery_attention_contact: "",
                            order_site_delivery_address1: "",
                            order_site_delivery_city: "",
                            order_site_delivery_details: "",
                            order_site_delivery_mud_map: "",
                            order_site_delivery_postalcode: "",
                            order_site_delivery_country: "AU",
                            order_site_delivery_state: "",
                            order_custom_note: "",
                            order_far_suburb: false,
                            order_master_rack: "",
                            order_delivery_date: "",
                          }));
                        }
                      }}
                      renderOption={(props, option) => {
                        if (!option._id) return null;
                        return (
                          <li {...props} key={option._id}>
                            {option.account_Name}
                          </li>
                        );
                      }}
                      renderInput={params => <TextField {...params} label="Customer" required variant="standard" />}
                    />
                  </Grid>
                  <Grid item md={3}>
                    <TextField 
                      required 
                      id="order_customer_PO_number" 
                      label="Customer Po Number" 
                      value={data.order_customer_PO_number} 
                      onChange={e => handle(e)} 
                      variant="standard" 
                      inputProps={{ maxLength: 60 }} 
                    />
                  </Grid>
                  <LocalizationProvider dateAdapter={AdapterDayjs}>
                    <Grid item md={3}>
                      <DatePicker
                        label="Delivery Date"
                        format="DD-MM-YYYY"
                        required
                        disablePast
                        value={dayjs(data.order_delivery_date).tz("Australia/Sydney")}
                        onChange={handleDateChange}
                        slotProps={{ textField: { variant: "standard", required: true } }}
                      />
                    </Grid>
                  </LocalizationProvider>
                  <Grid item md={3} className="d-flex align-items-end gap-2">
                    <TextField required select label="Hour" value={customTime.hour} onChange={e => setCustomTime(prev => ({ ...prev, hour: e.target.value }))} variant="standard">
                      {hours.map(h => (
                        <MenuItem key={h} value={h}>
                          {h}
                        </MenuItem>
                      ))}
                    </TextField>
                    <TextField required select label="Minute" value={customTime.minute} onChange={e => setCustomTime(prev => ({ ...prev, minute: e.target.value }))} variant="standard">
                      {minutes.map(m => (
                        <MenuItem key={m} value={m}>
                          {m}
                        </MenuItem>
                      ))}
                    </TextField>
                    <TextField required select label="AM/PM" value={customTime.meridian} onChange={e => setCustomTime(prev => ({ ...prev, meridian: e.target.value }))} variant="standard">
                      {meridians.map(m => (
                        <MenuItem key={m} value={m}>
                          {m}
                        </MenuItem>
                      ))}
                    </TextField>
                    <TextField select label="Before/After" value={customTime?.timeSession} onChange={e => setCustomTime(prev => ({ ...prev, timeSession: e.target.value || "" }))} variant="standard">
                      <MenuItem value="">Select</MenuItem>
                      {session.map(m => (
                        <MenuItem key={m} value={m}>
                          {m}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                </Grid>

                <Grid container spacing={2}>
                  <Grid item md={10}>
                    <LabelTag style={{ fontWeight: 'bold' }}>Delivery Details</LabelTag>
                  </Grid>
                  <Grid item md={2} style={{ textAlign: "right" }}>
                      {data.order_delivery_address_mode === "1" ? (
                        <FormControlLabel
                          label="Crane Lift"
                          labelPlacement="start"
                          className="mx-0"
                          sx={{ border: '4px double #d22530', padding: "2px" }}
                          name="order_crane_lift_checker"
                          control={<Switch checked={data.order_crane_lift_checker} onChange={handleFieldChange} />}
                        />
                      ): null}
                  </Grid>
                </Grid>

                <Grid spacing={2} container className="DrawerFormField">
                  <Grid item md={3}>
                    <TextField
                      select
                      required
                      name="order_delivery_address_mode"
                      id="order_delivery_address_mode"
                      variant="standard"
                      label="Delivery Mode"
                      SelectProps={{
                        value: data.order_delivery_address_mode,
                        onChange: e => {
                          handleFieldChange(e);
                          if (e.target.value === "0") {
                            const selectedCity = cityMaster.find(city => city.city_Name?.toLowerCase() === data.order_store_delivery_city?.toLowerCase());
                            handleFieldChange({
                              target: {
                                name: "order_far_suburb",
                                value: selectedCity?.city_FarSuburb || false,
                              },
                            });
                            handleFieldChange({ target: { name: "order_crane_lift_checker", value: false } });
                            handleFieldChange({ target: { name: "order_master_rack", value: selectedCity?.city_Rack || "" } });
                            setMudMapPreview(null);
                            data.order_site_delivery_mud_map = "";
                          }
                          if (e.target.value === "2") {
                            handleFieldChange({ target: { name: "order_master_rack", value: "R2" } });
                            handleFieldChange({ target: { name: "order_far_suburb", value: false } });
                            handleFieldChange({ target: { name: "order_crane_lift_checker", value: false } });
                            setMudMapPreview(null);
                            data.order_site_delivery_mud_map = "";
                          }
                          if (e.target.value === "1") {
                            const selectedCity = cityMaster.find(city => city.city_Name?.toLowerCase() === data.order_site_delivery_city?.toLowerCase());
                            handleFieldChange({
                              target: {
                                name: "order_far_suburb",
                                value: selectedCity?.city_FarSuburb || false,
                              },
                            });
                            handleFieldChange({
                              target: {
                                name: "order_master_rack",
                                value: selectedCity?.city_Rack || "",
                              },
                            });
                            handleFetchMudMap(data.order_site_delivery_mud_map).then(url => {
                              setMudMapPreview(url);
                            });
                          }
                        },
                      }}
                    >
                      {deliveryAddress.map(deliveryAddrs => (
                        <MenuItem key={deliveryAddrs.value} value={deliveryAddrs.value}>
                          {deliveryAddrs.label}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                  {data.order_delivery_address_mode === "0" ? (
                    <>
                      <Grid item md={3}>
                        <TextField
                          required
                          id="order_store_delivery_address1"
                          disabled
                          label="Store address"
                          value={data.order_store_delivery_address1}
                          sx={{ width: 220 }}
                          onChange={e => handle(e)}
                          variant="standard"
                        />
                      </Grid>
                      <Grid item md={3}>
                        <TextField
                          required
                          id="order_store_delivery_city"
                          disabled
                          label="City"
                          value={data.order_store_delivery_city}
                          sx={{ width: 220 }}
                          onChange={e => handle(e)}
                          variant="standard"
                        />
                      </Grid>
                      <Grid item md={3}>
                        <TextField
                          helperText="Enter valid postal code (Ex:3026)"
                          disabled
                          required
                          id="order_store_delivery_postalcode"
                          label="Postal Code"
                          value={data.order_store_delivery_postalcode}
                          sx={{ width: 220 }}
                          onChange={e => handle(e)}
                          variant="standard"
                        />
                      </Grid>
                    </>) : null}
                  {(data.order_delivery_address_mode === "1" || data.order_delivery_address_mode === "2") ? (
                    <>
                      <Grid item md={3}>
                        <Autocomplete
                          freeSolo
                          options={attentionPerson}
                          getOptionLabel={option => (typeof option === "string" ? option : option.name)}
                          isOptionEqualToValue={(option, value) => option?.id === value?.id || option?.name === value?.name}
                          value={attentionValueRef.current}
                          onChange={(event, newValue) => {
                            attentionValueRef.current =
                              typeof newValue === "string"
                                ? { name: newValue }
                                : newValue;
                            if (typeof newValue === "string") {
                              // manual input confirmed (e.g., enter or blur)
                              setData(prev => ({
                                ...prev,
                                order_site_delivery_attention_person: newValue,
                                order_site_delivery_attention_contact: "",
                                order_customer_contact_verified: false
                              }));
                            } else if (newValue?.name) {
                              // dropdown selected
                              setData(prev => ({
                                ...prev,
                                order_site_delivery_attention_person: newValue.name,
                                order_site_delivery_attention_contact: newValue.phone || "",
                                order_customer_contact_verified: newValue.order_customer_contact_verified || false
                              }));
                            } else {
                              // cleared
                              setData(prev => ({
                                ...prev,
                                order_site_delivery_attention_person: "",
                                order_site_delivery_attention_contact: "",
                                order_customer_contact_verified: ""
                              }));
                            }
                          }}
                          onInputChange={(event, inputValue, reason) => {
                            if (reason === "input") {
                              // Remove special characters (allow only letters and spaces)
                              const sanitizedValue = inputValue.replace(/[^a-zA-Z0-9\s]/g, "");

                              attentionValueRef.current = { name: sanitizedValue };

                              const matchedPerson = attentionPerson.find(
                                p => p.name === sanitizedValue
                              );

                              if (!matchedPerson) {
                                setData(prev => ({
                                  ...prev,
                                  order_site_delivery_attention_person: sanitizedValue,
                                  order_site_delivery_attention_contact: "",
                                }));
                              }
                            }
                          }}
                          renderOption={(props, option) => (
                            <li {...props} key={option.id}>
                              {option.name}, {option.phone} &nbsp; { option.order_customer_contact_verified ? <MdVerified /> : null }
                            </li>
                          )}
                          renderInput={params => <TextField {...params} label="Attention Person" required variant="standard" />}
                        />
                      </Grid>
                      <Grid item md={3}>
                        <TextField
                          required
                          id="order_site_delivery_attention_contact"
                          name="order_site_delivery_attention_contact"
                          label="Attention Contact"
                          value={data.order_site_delivery_attention_contact}
                          variant="standard"
                          sx={{ width: 220 }}
                          inputProps={{
                            inputMode: "numeric",
                            pattern: "[0-9 ]*",
                            maxLength: 12,
                          }}
                          error={
                            !!data.order_site_delivery_attention_contact &&
                            data.order_site_delivery_attention_contact !== "0" &&
                            !/^(03|04)\d{8}$/.test(
                              data.order_site_delivery_attention_contact.replace(/\s/g, "")
                            )
                          }
                          onChange={e => {
                            let raw = e.target.value.replace(/\D/g, ""); // Strip non-digits

                            let formatted = "";

                            // Only allow 10 digits starting with 0
                            if (raw.length > 10) raw = raw.slice(0, 10);

                            if (/^0\d{0,9}$/.test(raw)) {
                              // Mobile format: 04XX XXX XXX or Landline: 0X XXXX XXXX
                              if (/^04/.test(raw)) {
                                if (raw.length <= 4) {
                                  formatted = raw;
                                } else if (raw.length <= 7) {
                                  formatted = `${raw.slice(0, 4)} ${raw.slice(4)}`;
                                } else if (raw.length <= 10) {
                                  formatted = `${raw.slice(0, 4)} ${raw.slice(4, 7)} ${raw.slice(7, 10)}`;
                                }
                              } else if (/^0[2378]/.test(raw)) {
                                if (raw.length <= 2) {
                                  formatted = raw;
                                } else if (raw.length <= 6) {
                                  formatted = `${raw.slice(0, 2)} ${raw.slice(2)}`;
                                } else if (raw.length <= 10) {
                                  formatted = `${raw.slice(0, 2)} ${raw.slice(2, 6)} ${raw.slice(6, 10)}`;
                                }
                              } else {
                                formatted = raw;
                              }
                            } else {
                              formatted = raw;
                            }

                            setData(prev => ({
                              ...prev,
                              order_site_delivery_attention_contact: formatted,
                              order_customer_contact_verified: false
                            }));
                          }}
                          onKeyDown={e => {
                            const invalidKeys = ["e", "E", "+", "-", ".", ","];
                            if (invalidKeys.includes(e.key)) {
                              e.preventDefault();
                            }
                          }}
                        />
                      </Grid>
                    </>) : null}
                  {/* {data.order_delivery_address_mode === "2" ? (
                    <>
                      <Grid item md={3}>
                        <Autocomplete
                          freeSolo
                          options={attentionPerson}
                          getOptionLabel={option => (typeof option === "string" ? option : option.name)}
                          isOptionEqualToValue={(option, value) => option?.id === value?.id || option?.name === value?.name}
                          value={attentionPerson.find(p => p.name === data.order_site_delivery_attention_person) || { name: data.order_site_delivery_attention_person }}
                          onChange={(event, newValue) => {
                            if (typeof newValue === "string") {
                              // manual input confirmed (e.g., enter or blur)
                              setData(prev => ({
                                ...prev,
                                order_site_delivery_attention_person: newValue,
                                order_site_delivery_attention_contact: "",
                              }));
                            } else if (newValue && newValue.name) {
                              // dropdown selected
                              setData(prev => ({
                                ...prev,
                                order_site_delivery_attention_person: newValue.name,
                                order_site_delivery_attention_contact: newValue.phone || "",
                              }));
                            } else {
                              // cleared
                              setData(prev => ({
                                ...prev,
                                order_site_delivery_attention_person: "",
                                order_site_delivery_attention_contact: "",
                              }));
                            }
                          }}
                          onInputChange={(event, inputValue, reason) => {
                            if (reason === "input") {
                              const matchedPerson = attentionPerson.find(p => p.name === inputValue);
                              if (!matchedPerson) {
                                setData(prev => ({
                                  ...prev,
                                  order_site_delivery_attention_person: inputValue,
                                  order_site_delivery_attention_contact: "",
                                }));
                              }
                            }
                          }}
                          renderOption={(props, option) => (
                            <li {...props} key={option.id}>
                              {option.name}, {option.phone}
                            </li>
                          )}
                          renderInput={params => <TextField {...params} label="Attention Person" required variant="standard" />}
                        />
                      </Grid>
                      <Grid item md={3}>
                        <TextField
                          required
                          id="order_site_delivery_attention_contact"
                          name="order_site_delivery_attention_contact"
                          label="Attention Contact"
                          value={data.order_site_delivery_attention_contact}
                          variant="standard"
                          sx={{ width: 220 }}
                          inputProps={{
                            inputMode: "numeric",
                            pattern: "[0-9 ]*",
                            maxLength: 12,
                          }}
                          onChange={e => {
                            let raw = e.target.value.replace(/\D/g, ""); // Strip non-digits

                            let formatted = "";

                            // Handle "0" as no number
                            if (raw === "0") {
                              formatted = "0";
                            } else if (/^04/.test(raw)) {
                              // Mobile format: 04XX XXX XXX
                              if (raw.length <= 4) {
                                formatted = raw;
                              } else if (raw.length <= 7) {
                                formatted = `${raw.slice(0, 4)} ${raw.slice(4)}`;
                              } else if (raw.length <= 10) {
                                formatted = `${raw.slice(0, 4)} ${raw.slice(4, 7)} ${raw.slice(7, 10)}`;
                              } else {
                                formatted = `${raw.slice(0, 4)} ${raw.slice(4, 7)} ${raw.slice(7, 10)}`;
                              }
                            } else if (/^0[2378]/.test(raw)) {
                              // Landline format: 0X XXXX XXXX
                              if (raw.length <= 2) {
                                formatted = raw;
                              } else if (raw.length <= 6) {
                                formatted = `${raw.slice(0, 2)} ${raw.slice(2)}`;
                              } else if (raw.length <= 10) {
                                formatted = `${raw.slice(0, 2)} ${raw.slice(2, 6)} ${raw.slice(6, 10)}`;
                              } else {
                                formatted = `${raw.slice(0, 2)} ${raw.slice(2, 6)} ${raw.slice(6, 10)}`;
                              }
                            } else {
                              // Invalid prefix — keep raw input
                              formatted = raw;
                            }

                            setData(prev => ({
                              ...prev,
                              order_site_delivery_attention_contact: formatted,
                            }));
                          }}
                          onKeyDown={e => {
                            const invalidKeys = ["e", "E", "+", "-", ".", ","];
                            if (invalidKeys.includes(e.key)) {
                              e.preventDefault();
                            }
                          }}
                        />
                      </Grid>
                    </>
                  ) : null} */}
                </Grid>
                {data.order_delivery_address_mode === "0" || data.order_delivery_address_mode === "1" ?
                  (
                    <Grid spacing={2} container className="DrawerFormField">
                      {data.order_delivery_address_mode === "1" ? (
                        <>
                          <Grid item md={3}>
                            <Autocomplete
                              freeSolo
                              options={customerAddress}
                              getOptionLabel={option => (typeof option === "string" ? option : option.account_Site_Address_line_one)}
                              isOptionEqualToValue={(option, value) => option?.order_site_delivery_address1 === value?.account_Site_Address_line_one}
                              //  value={
                              //         customerAddress.find(p => p.account_Site_Address_line_one === data.order_site_delivery_address1) ||
                              //         { account_Site_Address_line_one: data.order_site_delivery_address1 }
                              //     }
                              value={
                                data.order_site_delivery_address1 === "-" || !data.order_site_delivery_address1
                                  ? null
                                  : customerAddress.find(p => p.account_Site_Address_line_one === data.order_site_delivery_address1) || { account_Site_Address_line_one: data.order_site_delivery_address1 }
                              }
                              onChange={(event, newValue) => {
                                if (typeof newValue === "string") {
                                  setData(prev => ({
                                    ...prev,
                                    order_site_delivery_address1: newValue,
                                    order_site_delivery_city: "",
                                    order_site_delivery_postalcode: "",
                                    order_site_delivery_country: "AU",
                                    order_site_delivery_state: "",
                                    order_custom_note: "",
                                    order_far_suburb: false,
                                    order_site_delivery_details: "",
                                    order_site_delivery_mud_map: "",
                                    order_master_rack: "",
                                  }));
                                } else if (newValue) {
                                  const cityName = newValue.account_Site_City || "";
                                  const matchedCity = cityMaster.find(c => c.city_Name === cityName);
                                  setData(prev => ({
                                    ...prev,
                                    order_site_delivery_address1: newValue.account_Site_Address_line_one || "",
                                    order_site_delivery_city: cityName,
                                    order_site_delivery_postalcode: newValue.account_Site_Postalcode || "",
                                    order_site_delivery_country: newValue.account_Site_Country || "AU",
                                    order_site_delivery_state: newValue.account_Site_State || "",
                                    order_custom_note: "",
                                    order_master_rack: matchedCity?.city_Rack || "",
                                    order_far_suburb: matchedCity?.city_FarSuburb || false,
                                    order_site_delivery_details: newValue.account_Site_Details || "",
                                    order_site_delivery_mud_map: newValue.account_Mud_Map || "",
                                  }))
                                }
                              }}
                              onInputChange={(event, inputValue, reason) => {
                                if (reason === "input") {
                                  const matched = customerAddress.find(p => p.order_site_delivery_address1 === inputValue);
                                  if (!matched) {
                                    setData(prev => ({
                                      ...prev,
                                      order_site_delivery_address1: inputValue,
                                    }));
                                  }
                                }
                              }}
                              renderOption={(props, option) => (
                                <li {...props} key={option._id}>
                                  {option.account_Site_Address_line_one}, {option.account_Site_City}, {option.account_Site_Postalcode}
                                </li>
                              )}
                              renderInput={params => <TextField {...params} label="Site Address" required variant="standard" />}
                            />
                          </Grid>
                          <Grid item md={3}>
                            <Autocomplete
                              options={cityMaster}
                              getOptionLabel={option => (typeof option === "string" ? option : option.city_Name)}
                              isOptionEqualToValue={(option, value) => option?.city_Name === value?.city_Name}
                              value={data.order_site_delivery_city === "-" || !data.order_site_delivery_city ? null : cityMaster.find(p => p.city_Name === data.order_site_delivery_city) || null}
                              onChange={(event, newValue) => {
                                if (newValue.city_Name) {
                                  setData(prev => ({
                                    ...prev,
                                    order_site_delivery_city: newValue.city_Name,
                                    order_site_delivery_postalcode: newValue.city_Pincode || "",
                                    order_site_delivery_country: newValue.city_Country || "AU",
                                    order_site_delivery_state: newValue.city_State || "",
                                    order_master_rack: newValue.city_Rack || "",
                                    order_far_suburb: newValue.city_FarSuburb || false,
                                  }));
                                } else {
                                  setData(prev => ({
                                    ...prev,
                                    order_site_delivery_city: "",
                                    order_site_delivery_postalcode: "",
                                    order_site_delivery_country: "AU",
                                    order_site_delivery_state: "",
                                    order_master_rack: "",
                                    order_far_suburb: false,
                                  }));
                                }
                              }}
                              renderOption={(props, option) => (
                                <li {...props} key={option._id}>
                                  {option.city_Name}, {option.city_Pincode}, {option.city_Rack}
                                </li>
                              )}
                              renderInput={params => <TextField {...params} label="City" required variant="standard" />}
                            />
                          </Grid >
                          <Grid item md={3}>
                            <TextField
                              helperText="Enter site details"
                              id="order_site_delivery_details"
                              label="Site Details"
                              value={data.order_site_delivery_details}
                              sx={{ width: 220 }}
                              onChange={(e => handle(e))}
                              variant="standard"
                            />
                          </Grid>
                          <Grid item md={3}>
                            <label style={{ fontWeight: 500, marginBottom: 4 }}>Mud Map Location (Image)</label><br/>
                            {!data.order_site_delivery_mud_map ? (
                              <input
                                disabled={data.order_site_delivery_mud_map}
                                accept="application/pdf,image/*"
                                type="file"
                                onChange={handleFileSelect}
                              />
                            ):(
                              <React.Fragment>
                                  <a href={mudMapPreview} download target="_blank" rel="noopener noreferrer" title="Download">
                                      <MdFilePresent fontSize={25} title={data.order_site_delivery_mud_map} />
                                  </a>
                                  <Tooltip title="Remove">
                                      <IconButton size="small" onClick={() => { setMudMapPreview(null); data.order_site_delivery_mud_map = ""; }}>
                                          <MdClose fontSize={15} />
                                      </IconButton>
                                  </Tooltip>
                              </React.Fragment>
                            )}
                          </Grid>
                        </>
                      ) : null}
                    </Grid>)
                  : <></>
                }
                <LabelTag style={{ fontWeight: 'bold' }}>Other Details</LabelTag>
                
                <Grid container spacing={2} className="DrawerFormField" alignItems={"flex-end"}>
                  <Grid item md={3}>
                    <TextField  
                      multiline
                      minRows={2}   // 👈 sets minimum visible rows
                      maxRows={5} 
                      id="order_custom_note" 
                      label="Drivers Info" 
                      value={data.order_custom_note} 
                      variant="standard" 
                      onChange={e => handle(e)} 
                    />
                  </Grid>
                  <Grid item md={3}>
                    <TextField 
                      multiline
                      minRows={2}   // 👈 sets minimum visible rows
                      maxRows={5} 
                      id="order_loaders_info" 
                      label="Loaders Info" 
                      value={data.order_loaders_info} 
                      variant="standard" 
                      onChange={e => handle(e)} 
                    />
                  </Grid>
                  <Grid item md={3}>
                    <TextField 
                      multiline
                      minRows={2}   // 👈 sets minimum visible rows
                      maxRows={5} 
                      id="order_inter_department_instruction" 
                      label="MYOB Description" 
                      value={data.order_inter_department_instruction} 
                      variant="standard" 
                      onChange={e => handle(e)} 
                    />
                  </Grid>
                  <Grid item md={3}>
                    <TextField
                      select
                      required
                      name="order_master_rack"
                      disabled={data.order_delivery_address_mode === "2"}
                      id="order_master_rack"
                      variant="standard"
                      label="Master Rack"
                      SelectProps={{ value: data.order_master_rack, onChange: handleFieldChange }}
                    >
                      {rackList.map(rackList => (
                        <MenuItem key={rackList.value} value={rackList.value}>
                          {rackList.label}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                </Grid>
                <Grid container spacing={2} className="DrawerFormField">
                  <Grid item md={3}></Grid>
                </Grid>
                <Grid container spacing={2} className="DrawerFormField">
                  <Grid item md={3}>
                    <Box sx={{ border: '4px double #000', padding: "5px", boxShadow: '0px 0px 10px #000', backgroundColor: "#d22530" }}>
                      <FormControlLabel
                        label="This Order Has Flashing"
                        labelPlacement="start"
                        slotProps={{
                          typography: {
                            fontSize: 20,
                            fontWeight: 'bold',
                            color: "#fff"
                          }
                        }}
                        // className="mx-0"
                        name="order_flashing_checker"
                        control={<Switch checked={data.order_flashing_checker} onChange={handleFieldChange} />}
                      />
                    </Box>
                    {/* <Box sx={{ border: '4px double #d22530', padding: "5px", boxShadow: '0px 0px 5px #9b1921' }}>
                      <FormControlLabel
                        label="This Order Has Flashing"
                        labelPlacement="start"
                        slotProps={{
                          typography: {
                            fontSize: 20,
                            fontWeight: 'bold'
                          }
                        }}
                        // className="mx-0"
                        name="order_flashing_checker"
                        control={<Switch checked={data.order_flashing_checker} onChange={handleFieldChange} />}
                      />
                    </Box> */}
                  </Grid>
                  
                  <Grid item md={3}>
                    {(data.order_delivery_address_mode === "0" || data.order_delivery_address_mode === "1" )? (
                      <FormControlLabel
                        label="Far Suburb"
                        disabled
                        labelPlacement="start"
                        className="mx-0"
                        name="order_far_suburb"
                        control={<Switch checked={data.order_far_suburb} onChange={handleFieldChange} />}
                      />
                     ): (null)}
                  </Grid>
                  <Grid item md={3}></Grid>
                  <Grid item md={3} className="text-end">
                      <Button type="submit" disabled={btnLoading} className="btn primary-btn" fullWidth size="large">
                        {btnLoading ? (<Spinner as="span" title="Please Wait..." animation="border" size="sm" role="status" aria-hidden="true" className="mx-2" />
                         ) : ("Submit")}
                      </Button>
                  </Grid>
                </Grid>
              </form>
            </MyDiv>
          </Card.Body>
        </Card>
      </MyDiv>
    </MyDiv>
  );
}

export default FormOrder;

FormOrder.propTypes = {
  handleClose: PropTypes.any,
  orderInfo: PropTypes.any,
};
