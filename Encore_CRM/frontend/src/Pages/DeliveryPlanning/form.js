import React, { useState, useEffect } from "react";
import { HeadingFour, MyDiv } from "../Common/Components";
import { Row, Col, Card, Spinner, Button } from "react-bootstrap";
import { TextField, MenuItem, Autocomplete } from "@mui/material";
import axios from "axios";
import swal from "sweetalert2";
import { deliveryAddress, stateList } from "../Common/staticjson";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { DatePicker } from "@mui/x-date-pickers";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function FormSplitOrder({ handleClose, orderInfo }) {
  const [btnLoading, setBtnLoading] = useState(false);

  const [data, setData] = useState({
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
    info: ""
  });

  useEffect(() => {
    loadCityMaster();
  }, []);

  useEffect(() => {
    if (orderInfo._id) {
      loadCustomerAttentionPerson(orderInfo);
      loadCustomerAttentionAddress(orderInfo);
      setData(orderInfo);
      if (orderInfo.order_delivery_time) {
        const [timePart, meridian] = orderInfo.order_delivery_time.split(" ");
        const [hour, minute] = timePart.split(".");
        setCustomTime({
          hour: hour?.padStart(2, "0") || "12",
          minute: minute?.padStart(2, "0") || "00",
          meridian: meridian || "AM",
          timeSession: orderInfo.order_delivery_session !== "A/T" ? orderInfo.order_delivery_session : "",
        });
      } else {
        setCustomTime({
          hour: "12",
          minute: "00",
          meridian: "AM",
          timeSession: orderInfo.order_delivery_session !== "A/T" ? orderInfo.order_delivery_session : "",
        });
      }
    }
  }, [orderInfo]);

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

    const deliveryDateSydney = dayjs(data.order_delivery_date).tz("Australia/Sydney").format("YYYY-MM-DD");
    const todayDateSydney = dayjs().tz("Australia/Sydney").format("YYYY-MM-DD");

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

    // Sanitize/trim fields
    const processedData = {
      ...data
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
    for (const key in processedData) {
      formData.append(key, processedData[key]);
    }
    // API call setup
    const url = `${API_BASE_URL}update-split-order-by-id/${orderInfo._id}`;
    const method = "patch";
    axios({
      method,
      url,
      data: formData,
      headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" },
    })
      .then(res => {
        if (res.status === 200) {
          swal.fire({ text: "Successfully Saved", icon: "success", type: "success" });
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

      // Set new date, keeping the original or default time
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
    if (!customerData || !customerData.order_customer_id) return;
    const url = API_BASE_URL + `fetch-account-contact-data/` + customerData.order_customer_id + `/Site`;
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
        }));
        setAttentionPerson(contacts);
      })
      .catch(error => {

      });
  };

  const [customerAddress, setCustomerAddress] = useState([]);
  const loadCustomerAttentionAddress = customerData => {
    if (!customerData || !customerData.order_customer_id) return;
    const url = API_BASE_URL + `fetch-account-address-data/` + customerData.order_customer_id;
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
      .catch(error => {

      });
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
      .catch(error => {

      });
  };

  return (
    <MyDiv className="DrawerRight">
      <MyDiv className="grid-margin general-form stretch-card">
        <Card md={12}>
          <Card.Header>
            <HeadingFour className="card-title">Edit Split Order</HeadingFour>
          </Card.Header>
          <Card.Body>
            <MyDiv className="DrawerForm">
              <form onSubmit={e => submit(e)}>
                <Row className="DrawerFormField">
                  {orderInfo._id ? (
                    <Col md={12}>
                      <TextField disabled required id="order_unique_id" label="Sale Order Number" value={data.order_unique_id} onChange={e => handle(e)} variant="standard" />
                    </Col>
                  ) : (
                    ""
                  )}

                  <LocalizationProvider dateAdapter={AdapterDayjs}>
                    <Col md={12}>
                      <DatePicker
                        label="Delivery Date"
                        format="DD-MM-YYYY"
                        required
                        disablePast
                        value={dayjs(data.order_delivery_date).tz("Australia/Sydney")}
                        onChange={handleDateChange}
                        slotProps={{ textField: { variant: "standard" } }}
                      />
                    </Col>
                  </LocalizationProvider>
                  <Col md={12} className="d-flex align-items-end gap-2">
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
                    <TextField select label="Before/After" value={customTime?.timeSession || ""} onChange={e => setCustomTime(prev => ({ ...prev, timeSession: e.target.value || "" }))} variant="standard">
                      <MenuItem value="">Select</MenuItem>
                      {session.map(m => (
                        <MenuItem key={m} value={m}>
                          {m}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Col>
                  <Col md={12}>
                    <TextField
                      select
                      required
                      name="order_delivery_address_mode"
                      id="order_delivery_address_mode"
                      variant="standard"
                      label="Delivery Address"
                      SelectProps={{
                        value: data.order_delivery_address_mode,
                        onChange: e => {
                          handleFieldChange(e);
                          if (e.target.value === "0") {
                            handleFieldChange({ target: { name: "order_far_suburb", value: false } });
                            handleFieldChange({ target: { name: "order_crane_lift_checker", value: false } });
                            handleFieldChange({ target: { name: "order_master_rack", value: "" } });
                          }
                          if (e.target.value === "2") {
                            handleFieldChange({ target: { name: "order_master_rack", value: "R2" } });
                            handleFieldChange({ target: { name: "order_far_suburb", value: false } });
                            handleFieldChange({ target: { name: "order_crane_lift_checker", value: false } });
                          }
                          if (e.target.value === "1") {
                            const selectedCity = cityMaster.find(city => city.city_Name === data.order_site_delivery_city);
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
                  </Col>
                  {data.order_delivery_address_mode === "0" ? (
                    <>
                      <Col md={12}>
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
                      </Col>
                      <Col md={12}>
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
                      </Col>
                      <Col md={12}>
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
                      </Col>
                      <Col md={12}>
                        <TextField
                          helperText="Enter valid country code (Ex:AU)"
                          disabled
                          required
                          id="order_store_delivery_country"
                          label="Site Country"
                          value={data.order_store_delivery_country}
                          sx={{ width: 220 }}
                          onChange={e => handle(e)}
                          variant="standard"
                        />
                      </Col>
                      <Col md={12}>
                        <TextField
                          helperText="Enter valid state (Ex:VIC)"
                          disabled
                          required
                          id="order_store_delivery_state"
                          label="Site State"
                          value={data.order_store_delivery_state}
                          sx={{ width: 220 }}
                          onChange={e => handle(e)}
                          variant="standard"
                        />
                      </Col>
                    </>
                  ) : null}
                  {data.order_delivery_address_mode === "1" ? (
                    <>
                      <Col md={12}>
                        <Autocomplete
                          freeSolo
                          options={attentionPerson}
                          getOptionLabel={option => (typeof option === "string" ? option : option.name)}
                          isOptionEqualToValue={(option, value) => option?.id === value?.id || option?.name === value?.name}
                          value={
                            data.order_site_delivery_attention_person === "-" || !data.order_site_delivery_attention_person
                              ? null
                              : attentionPerson.find(p => p.name === data.order_site_delivery_attention_person) || { name: data.order_site_delivery_attention_person }
                          }
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
                      </Col>
                      <Col md={12}>
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
                      </Col>

                      <Col md={12}>
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
                              }));
                            } else if (newValue) {
                              const cityName = newValue.account_Site_City || "";
                              const matchedCity = cityMaster.find(c => c.city_Name === cityName);
                              // setData(prev => ({
                              //     ...prev,
                              //     order_site_delivery_address1: newValue.account_Site_Address_line_one || "",
                              //     order_site_delivery_city: newValue.account_Site_City || "",
                              //     order_site_delivery_postalcode: newValue.account_Site_Postalcode || "",
                              //     order_site_delivery_country: newValue.account_Site_Country || "AU",
                              //     order_site_delivery_state: newValue.account_Site_State || "",
                              //     order_custom_note: newValue.account_Site_Notes || "",
                              // }));
                              setData(prev => ({
                                ...prev,
                                order_site_delivery_address1: newValue.account_Site_Address_line_one || "",
                                order_site_delivery_city: cityName,
                                order_site_delivery_postalcode: newValue.account_Site_Postalcode || "",
                                order_site_delivery_country: newValue.account_Site_Country || "AU",
                                order_site_delivery_state: newValue.account_Site_State || "",
                                order_custom_note: newValue.account_Site_Notes || "",
                                order_master_rack: matchedCity?.city_Rack || "",
                                order_far_suburb: matchedCity?.city_FarSuburb || false,
                              }));
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
                      </Col>
                      <Col md={12}>
                        <Autocomplete
                          options={cityMaster}
                          getOptionLabel={option => (typeof option === "string" ? option : option.city_Name)}
                          isOptionEqualToValue={(option, value) => option?.city_Name === value?.city_Name}
                          value={data.order_site_delivery_city === "-" || !data.order_site_delivery_city ? null : cityMaster.find(p => p.city_Name === data.order_site_delivery_city) || null}
                          onChange={(event, newValue) => {
                            if (newValue && newValue.city_Name) {
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
                      </Col>
                      <Col md={12}>
                        <TextField
                          disabled
                          helperText="Enter valid postal code (Ex:3026)"
                          required
                          id="order_site_delivery_postalcode"
                          label="Postal Code"
                          value={data.order_site_delivery_postalcode === "-" ? "" : data.order_site_delivery_postalcode}
                          sx={{ width: 220 }}
                          onChange={e => handle(e)}
                          variant="standard"
                        />
                      </Col>
                      <Col md={12}>
                        <TextField
                          select
                          disabled
                          required
                          name="order_site_delivery_state"
                          id="order_site_delivery_state"
                          variant="standard"
                          label="Site State"
                          SelectProps={{ value: data.order_site_delivery_state, onChange: handleFieldChange }}
                        >
                          {stateList.map(stateList => (
                            <MenuItem key={stateList.value} value={stateList.value}>
                              {stateList.label}
                            </MenuItem>
                          ))}
                        </TextField>
                      </Col>
                      <Col md={12}>
                        <TextField
                          disabled
                          helperText="Enter valid country code (Ex:AU)"
                          required
                          id="order_site_delivery_country"
                          label="Site Country"
                          value={data.order_site_delivery_country}
                          sx={{ width: 220 }}
                          onChange={e => handle(e)}
                          variant="standard"
                        />
                      </Col>
                    </>
                  ) : null}
                  {data.order_delivery_address_mode === "2" ? (
                    <>
                      <Col md={12}>
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
                      </Col>
                      <Col md={12}>
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
                      </Col>
                    </>
                  ) : null}
                  <Col md={12}>
                    <TextField
                      id="info"
                      label="Info"
                      value={data.info}
                      helperText={"Info to display in Delivery Docket bottom page"}
                      onChange={e => handle(e)}
                      variant="standard"
                    />
                  </Col>
                  <Col md={12} className="text-end">
                    {btnLoading ? (
                      <Button variant="primary" disabled className="mt-4 w-100">
                        <Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" className="mx-2" />
                        Please Wait...
                      </Button>
                    ) : (
                      <button type="submit" className="FormBtn">
                        Submit
                      </button>
                    )}
                  </Col>
                </Row>
              </form>
            </MyDiv>
          </Card.Body>
        </Card>
      </MyDiv>
    </MyDiv>
  );
}

export default FormSplitOrder;
