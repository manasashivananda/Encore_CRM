import React, { useState, useEffect } from "react";
import { HeadingFour, MyDiv } from "../Common/Components";
import { Row, Col, Card, Spinner, Button } from "react-bootstrap";
import { TextField, MenuItem, Autocomplete } from "@mui/material";
import axios from "axios";
import swal from "sweetalert2";
import { deliveryAddress, stateList } from "../Common/staticjson";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { DatePicker } from "@mui/x-date-pickers";

import dayjs from "dayjs";

import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function FormOrder({ handleClose, quoteInfo }) {
  const [customers, setCustomers] = useState([]);
  const [, setSelectedCustomer] = useState({ name: "", id: "", PoNumber: "" });
  const [btnLoading, setBtnLoading] = useState(false);

  let quoteInfoId = quoteInfo;
  const [data, setData] = useState({
    quote_customer_id: "",
    quote_customer_contact_id: "",
    quote_customer_PO_number: "",
    quote_delivery_date: "",
    quote_delivery_time: "",
    quote_delivery_session: "",
    quote_delivery_address_mode: "",
    quote_site_delivery_attention_person: "",
    quote_site_delivery_attention_contact: "",
    quote_site_delivery_address1: "",
    quote_site_delivery_city: "",
    quote_site_delivery_country: "AU",
    quote_site_delivery_postalcode: "",
    quote_site_delivery_state: "VIC",
    quote_store_delivery_address1: "",
    quote_store_delivery_city: "",
    quote_store_delivery_country: "AU",
    quote_store_delivery_postalcode: "",
    quote_store_delivery_state: "VIC",
    quote_department: "",
    quote_inter_department_instruction: "",
    quote_unique_id: "",
    quote_flashing_checker: false,
    quote_far_suburb: false,
  });

  useEffect(() => {
    if (quoteInfo !== undefined) {
      const loadSpecificOrder = async () => {
        const url = API_BASE_URL + `fetch-specific-quotation-details/` + quoteInfoId;
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
              const specificOrder = res.data[0];
              specificOrder.quote_delivery_date = dayjs.utc(specificOrder.quote_delivery_date);
              setData(specificOrder);
              if (specificOrder.quote_delivery_time) {
                const [timePart, meridian] = specificOrder.quote_delivery_time.split(" ");
                const [hour, minute] = timePart.split(".");
                setCustomTime({
                  hour: hour?.padStart(2, "0") || "12",
                  minute: minute?.padStart(2, "0") || "00",
                  meridian: meridian || "AM",
                  timeSession: specificOrder.quote_delivery_session || "",
                });
              } else {
                setCustomTime({
                  hour: "12",
                  minute: "00",
                  meridian: "AM",
                  timeSession: specificOrder.quote_delivery_session || "",
                });
              }
            },
            error => {
              swal.fire({
                text: error.response.data,
                icon: "error",
                type: "error",
              });
            }
          );
      };
      loadSpecificOrder();
    }
    loadCustomers();
    loadCityMaster();
  }, [quoteInfo, quoteInfoId]);

  useEffect(() => {
    if (data.quote_customer_id) {
      const selectedCustomer = customers.find(c => c._id === data.quote_customer_id);
      if (selectedCustomer) {
        loadCustomerAttentionPerson(selectedCustomer);
        loadCustomerAttentionAddress(selectedCustomer);
        setData(prev => ({
          ...prev,
          quote_customer_id: selectedCustomer._id,
          quote_store_delivery_address1: selectedCustomer.account_Address_line_one || "",
          quote_store_delivery_address2: selectedCustomer.account_Address_line_two || "",
          quote_store_delivery_city: selectedCustomer.account_Address_City || "",
          quote_store_delivery_country: selectedCustomer.account_Address_Country || "AU",
          quote_store_delivery_postalcode: selectedCustomer.account_Address_PostalCode || "",
          quote_store_delivery_state: selectedCustomer.account_Address_State || "VIC",
        }));
      }
    }
    if (quoteInfo) {
      setData(prev => ({
        ...prev,
        quote_store_delivery_address1: data.quote_store_delivery_address1 || "",
        quote_store_delivery_city: data.quote_store_delivery_city || "",
        quote_store_delivery_country: data.quote_store_delivery_country || "AU",
        quote_store_delivery_postalcode: data.quote_store_delivery_postalcode || "",
        quote_store_delivery_state: data.quote_store_delivery_state || "VIC",
      }));
    }
  }, [
    data.quote_customer_id,
    customers,
    data.quote_store_delivery_address1,
    data.quote_store_delivery_city,
    data.quote_store_delivery_country,
    data.quote_store_delivery_postalcode,
    data.quote_store_delivery_state,
    quoteInfo,
  ]);

  const loadCustomers = async () => {
    try {
      const url = API_BASE_URL + `fetch-account-data-dropdown`;
      const response = await axios.get(url, { headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" } });
      if (Array.isArray(response.data)) {
        const uniqueCustomers = [];
        const seenIds = new Set();
        response.data.forEach(customer => {
          if (customer && customer._id && !seenIds.has(customer._id)) {
            seenIds.add(customer._id);
            uniqueCustomers.push(customer);
          }
        });
        setCustomers(uniqueCustomers);
      } else {
        setCustomers([]);
      }
    } catch (error) {
      setCustomers([]);
    }
  };

  // const loadCustomerContact = (customerData) => {
  //     if (!customerData || !customerData._id) {
  //         console.warn("loadCustomerContact called with undefined customerData or missing _id");
  //         return;
  //     }
  //     const url =API_BASE_URL + `fetch-account-contact-data/` + (quoteInfoId ? data.quote_customer_id : customerData._id);
  //     axios.get(url, { headers: { "x-access-token": localStorage.getItem("token"), 'Accept': 'application/json', 'Content-Type': 'application/json' } })
  //         .then(res => {
  //             setContacts(res.data);
  //         })
  //         .catch(error => {

  //         });
  // };

  // function handle(e) {
  //     const newData = { ...data }
  //     newData[e.target.id] = e.target.value
  //     setData(newData)
  // }

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

    const deliveryDateSydney = dayjs(data.quote_delivery_date).tz("Australia/Sydney").format("YYYY-MM-DD");
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

  // const proceedWithSubmission = () => {
  //     const formData = new FormData();
  //     const processedData = {
  //         ...data,
  //         quote_inter_department_instruction: data.quote_inter_department_instruction
  //             ? data.quote_inter_department_instruction.trim()
  //             : "Nill"
  //     };
  //     for (const key in data) {
  //         formData.append(key, data[key]);
  //     }
  //     const url = quoteInfoId ? API_BASE_URL + 'update-specific-quotation-details/' + quoteInfoId : API_BASE_URL + 'add-quotation-details';
  //     const method = quoteInfoId ? 'patch' : 'post';
  //     axios({method,  url,  data: formData,
  //          headers: { "x-access-token": localStorage.getItem("token"),'Accept': 'application/json','Content-Type': 'application/json'}
  //     })
  //         .then((res) => {
  //             if (res.status === 200) {
  //                 swal.fire({ text: "Successfully Saved",icon: "success", type: "success" });
  //                 handleClose();
  //             }
  //             setBtnLoading(false);
  //         })
  //         .catch((error) => {
  //             swal.fire({text: error.response.data, icon: "error", type: "error"});
  //             setBtnLoading(false);
  //         });
  // };

  const proceedWithSubmission = () => {
    const formData = new FormData();

    // Sanitize/trim fields
    const processedData = {
      ...data,
      quote_inter_department_instruction: data.quote_inter_department_instruction ? data.quote_inter_department_instruction.trim() : "",
    };

    // Get the base delivery date in Australia/Sydney timezone
    let deliveryDate = dayjs(data.quote_delivery_date).tz("Australia/Sydney");

    // Extract and convert custom time
    let hour = parseInt(customTime.hour || "0");
    const minute = parseInt(customTime.minute || "0");
    const isPM = customTime.meridian === "PM";

    if (isPM && hour !== 12) hour += 12;
    if (!isPM && hour === 12) hour = 0;

    // Merge date and time
    const mergedDateTime = deliveryDate.set("hour", hour).set("minute", minute).set("second", 0).set("millisecond", 0);
    processedData.quote_delivery_date = mergedDateTime.toDate().toUTCString();
    processedData.quote_delivery_time = `${customTime.hour}.${customTime.minute} ${customTime.meridian}`;
    processedData.quote_delivery_session = customTime.timeSession || "";

    // Append all fields to FormData
    for (const key in processedData) {
      formData.append(key, processedData[key]);
    }

    // API call setup
    const url = quoteInfoId ? `${API_BASE_URL}update-specific-quotation-details/${quoteInfoId}` : `${API_BASE_URL}add-quotation-details`;
    const method = quoteInfoId ? "patch" : "post";

    axios({
      method,
      url,
      data: formData,
      headers: {
        "x-access-token": localStorage.getItem("token"),
        Accept: "application/json",
        "Content-Type": "application/json",
      },
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
      const existingDateTime = prevData.quote_delivery_date ? dayjs(prevData.quote_delivery_date).tz("Australia/Sydney") : dayjs().tz("Australia/Sydney").hour(0).minute(0).second(0);
      const updatedDate = dayjs(newDate).tz("Australia/Sydney").hour(existingDateTime.hour()).minute(existingDateTime.minute()).second(existingDateTime.second());

      return {
        ...prevData,
        quote_delivery_date: updatedDate.toDate().toUTCString(),
      };
    });
  };

  //Custom Date Picker
  const [customTime, setCustomTime] = useState({ hour: "", minute: "00", meridian: "AM", timeSession: "" });
  const hours = ["12", "06", "07", "08", "09", "10", "11", "01", "02", "03", "04", "05"];
  const minutes = ["00", "15", "30", "45"];
  const meridians = ["AM", "PM"];
  const session = ["B4", "Aft"];

  const [attentionPerson, setAttentionPerson] = useState([]);
  const loadCustomerAttentionPerson = customerData => {
    if (!customerData || !customerData._id) return;
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
        }));
        setAttentionPerson(contacts);
      })
      .catch(error => {});
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
      .catch(error => {});
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
      .catch(error => {});
  };

  return (
    <MyDiv className="DrawerRight">
      <MyDiv className="grid-margin general-form stretch-card">
        <Card md={12}>
          <Card.Header>
            <HeadingFour className="card-title">{quoteInfo ? "Edit" : "Add"} Quotation</HeadingFour>
          </Card.Header>
          <Card.Body>
            <MyDiv className="DrawerForm">
              <form onSubmit={e => submit(e)}>
                <Row className="DrawerFormField">
                  {quoteInfo ? (
                    <Col md={12}>
                      <TextField disabled required id="quote_unique_id" label="Quotation Number" value={data.quote_unique_id} onChange={e => handle(e)} variant="standard" />
                    </Col>
                  ) : (
                    ""
                  )}
                  <Col md={12}>
                    <Autocomplete
                      disablePortal
                      options={customers} // Ensure it's always an array
                      getOptionLabel={option => (option && option.account_Name ? option.account_Name : "")}
                      isOptionEqualToValue={(option, value) => option?._id === value?._id}
                      value={customers.find(c => c._id === data.quote_customer_id) || null}
                      onChange={(event, newValue) => {
                        if (newValue) {
                          setSelectedCustomer({
                            name: newValue.account_Name,
                            id: newValue._id,
                            PoNumber: data.quote_customer_PO_number,
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
                            quote_customer_id: newValue._id,
                            quote_store_delivery_address1: newValue.account_Address_line_one || "",
                            quote_store_delivery_address2: newValue.account_Address_line_two || "",
                            quote_store_delivery_city: newValue.account_Address_City || "",
                            quote_store_delivery_country: newValue.account_Address_Country || "AU",
                            quote_store_delivery_postalcode: newValue.account_Address_PostalCode || "",
                            quote_store_delivery_state: newValue.account_Address_State || "VIC",
                            quote_customer_PO_number: "",
                            quote_delivery_address_mode: "",
                            quote_site_delivery_attention_person: "",
                            quote_site_delivery_attention_contact: "",
                            quote_site_delivery_address1: "",
                            quote_site_delivery_city: "",
                            quote_site_delivery_postalcode: "",
                            quote_site_delivery_country: "AU",
                            quote_site_delivery_state: "",
                            quote_custom_note: "",
                            quote_far_suburb: false,
                            quote_delivery_date: "",
                            // quote_myob_row_id: newValue.SORowKey || ""
                          }));
                          // loadCustomerContact(newValue);
                        }
                      }}
                      renderOption={(props, option) => {
                        if (!option || !option._id) return null;
                        return (
                          <li {...props} key={option._id}>
                            {option.account_Name}
                          </li>
                        );
                      }}
                      renderInput={params => <TextField {...params} label="Customer" required variant="standard" />}
                    />
                  </Col>
                  {/* <Col md={12}>
                                        <TextField select required name="quote_customer_contact_id" id="quote_customer_contact_id" variant="standard" label="Contact person name" 
                                            SelectProps={{multiple: false, value: data.quote_customer_contact_id, onChange: handleFieldChange}}  >
                                            {contacts.length ? contacts.map((contact) => (
                                                <MenuItem key={contact._id} value={contact._id}>
                                                    {contact.account_Contact_FName}
                                                </MenuItem>
                                            )) : <MenuItem>No contacts available</MenuItem>}
                                        </TextField>
                                    </Col>                                     */}
                  <Col md={12}>
                    <TextField required id="quote_customer_PO_number" label="Customer Po Number" value={data.quote_customer_PO_number} onChange={e => handle(e)} variant="standard" />
                  </Col>
                  <LocalizationProvider dateAdapter={AdapterDayjs}>
                    <Col md={12}>
                      <DatePicker
                        disablePast
                        label="Delivery Date"
                        format="DD-MM-YYYY"
                        required
                        value={dayjs(data.quote_delivery_date).tz("Australia/Sydney")}
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
                    <TextField
                      select
                      label="Before/After"
                      value={customTime?.timeSession}
                      onChange={e =>
                        setCustomTime(prev => ({
                          ...prev,
                          timeSession: e.target.value || "",
                        }))
                      }
                      variant="standard"
                    >
                      <MenuItem value="">Select</MenuItem>
                      {session.map(m => (
                        <MenuItem key={m} value={m}>
                          {m}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Col>
                  <Col md={12}>
                    {/* <TextField select required name="quote_delivery_address_mode" id="quote_delivery_address_mode" variant="standard" label="Delivery Address" SelectProps={{ value: data.quote_delivery_address_mode, onChange: handleFieldChange }} >
                                            {deliveryAddress.map((deliveryAddrs) => (
                                                <MenuItem key={deliveryAddrs.value} value={deliveryAddrs.value}>{deliveryAddrs.label}</MenuItem>
                                            ))}
                                        </TextField> */}
                    <TextField
                      select
                      required
                      name="quote_delivery_address_mode"
                      id="quote_delivery_address_mode"
                      variant="standard"
                      label="Delivery Address"
                      SelectProps={{
                        value: data.quote_delivery_address_mode,
                        onChange: e => {
                          handleFieldChange(e);
                          if (e.target.value === "0") {
                            handleFieldChange({ target: { name: "quote_far_suburb", value: false } });
                            // handleFieldChange({ target: { name: "quote_crane_lift_checker", value: false } });
                            // handleFieldChange({ target: { name: "quote_master_rack", value: "" } });
                          }
                          if (e.target.value === "2") {
                            // handleFieldChange({ target: { name: "quote_master_rack", value: "R2" } });
                            handleFieldChange({ target: { name: "quote_far_suburb", value: false } });
                            handleFieldChange({ target: { name: "quote_crane_lift_checker", value: false } });
                          }
                          if (e.target.value === "1") {
                            const selectedCity = cityMaster.find(city => city.city_Name === data.quote_site_delivery_city);
                            handleFieldChange({
                              target: {
                                name: "quote_far_suburb",
                                value: selectedCity?.city_FarSuburb || false,
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
                  {data.quote_delivery_address_mode === "0" ? (
                    <>
                      <Col md={12}>
                        <TextField
                          required
                          id="quote_store_delivery_address1"
                          disabled
                          label="Store address"
                          value={data.quote_store_delivery_address1}
                          sx={{ width: 220 }}
                          onChange={e => handle(e)}
                          variant="standard"
                        />
                      </Col>
                      <Col md={12}>
                        <TextField
                          required
                          id="quote_store_delivery_city"
                          disabled
                          label="City"
                          value={data.quote_store_delivery_city}
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
                          id="quote_store_delivery_postalcode"
                          label="Postal Code"
                          value={data.quote_store_delivery_postalcode}
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
                          id="quote_store_delivery_state"
                          label="Site State"
                          value={data.quote_store_delivery_state}
                          sx={{ width: 220 }}
                          onChange={e => handle(e)}
                          variant="standard"
                        />
                      </Col>
                      <Col md={12}>
                        <TextField
                          disabled
                          helperText="Enter valid country code (Ex:AU)"
                          required
                          id="quote_store_delivery_country"
                          label="Site Country"
                          value={data.quote_store_delivery_country}
                          sx={{ width: 220 }}
                          onChange={e => handle(e)}
                          variant="standard"
                        />
                      </Col>
                    </>
                  ) : null}
                  {data.quote_delivery_address_mode === "1" ? (
                    <>
                      <Col md={12}>
                        <Autocomplete
                          freeSolo
                          options={attentionPerson}
                          getOptionLabel={option => (typeof option === "string" ? option : option.name)}
                          isOptionEqualToValue={(option, value) => option?.id === value?.id || option?.name === value?.name}
                          value={
                            data.quote_site_delivery_attention_person === "-" || !data.quote_site_delivery_attention_person
                              ? null
                              : attentionPerson.find(p => p.name === data.quote_site_delivery_attention_person) || { name: data.quote_site_delivery_attention_person }
                          }
                          onChange={(event, newValue) => {
                            if (typeof newValue === "string") {
                              // manual input confirmed (e.g., enter or blur)
                              setData(prev => ({
                                ...prev,
                                quote_site_delivery_attention_person: newValue,
                                quote_site_delivery_attention_contact: "",
                              }));
                            } else if (newValue && newValue.name) {
                              // dropdown selected
                              setData(prev => ({
                                ...prev,
                                quote_site_delivery_attention_person: newValue.name,
                                quote_site_delivery_attention_contact: newValue.phone || "",
                              }));
                            } else {
                              // cleared
                              setData(prev => ({
                                ...prev,
                                quote_site_delivery_attention_person: "",
                                quote_site_delivery_attention_contact: "",
                              }));
                            }
                          }}
                          onInputChange={(event, inputValue, reason) => {
                            if (reason === "input") {
                              const matchedPerson = attentionPerson.find(p => p.name === inputValue);
                              if (!matchedPerson) {
                                setData(prev => ({
                                  ...prev,
                                  quote_site_delivery_attention_person: inputValue,
                                  quote_site_delivery_attention_contact: "",
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
                          id="quote_site_delivery_attention_contact"
                          name="quote_site_delivery_attention_contact"
                          label="Attention Contact"
                          value={data.quote_site_delivery_attention_contact}
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
                              quote_site_delivery_attention_contact: formatted,
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
                          isOptionEqualToValue={(option, value) => option?.quote_site_delivery_address1 === value?.account_Site_Address_line_one}
                          // value={
                          //     customerAddress.find(p => p.account_Site_Address_line_one === data.quote_site_delivery_address1) ||
                          //     { account_Site_Address_line_one: data.quote_site_delivery_address1 }
                          // }
                          value={
                            data.quote_site_delivery_address1 === "-" || !data.quote_site_delivery_address1
                              ? null
                              : customerAddress.find(p => p.account_Site_Address_line_one === data.quote_site_delivery_address1) || { account_Site_Address_line_one: data.quote_site_delivery_address1 }
                          }
                          onChange={(event, newValue) => {
                            const cityName = newValue.account_Site_City || "";
                            const matchedCity = cityMaster.find(c => c.city_Name === cityName);
                            if (typeof newValue === "string") {
                              setData(prev => ({
                                ...prev,
                                quote_site_delivery_address1: newValue,
                                quote_site_delivery_city: "",
                                quote_site_delivery_postalcode: "",
                                quote_site_delivery_country: "AU",
                                quote_site_delivery_state: "",
                                quote_far_suburb: false,
                              }));
                            } else if (newValue) {
                              setData(prev => ({
                                ...prev,
                                quote_site_delivery_address1: newValue.account_Site_Address_line_one || "",
                                quote_site_delivery_city: newValue.account_Site_City || "",
                                quote_site_delivery_postalcode: newValue.account_Site_Postalcode || "",
                                quote_site_delivery_country: newValue.account_Site_Country || "AU",
                                quote_site_delivery_state: newValue.account_Site_State || "",
                                quote_far_suburb: matchedCity?.city_FarSuburb || false,
                              }));
                            }
                          }}
                          onInputChange={(event, inputValue, reason) => {
                            if (reason === "input") {
                              const matched = customerAddress.find(p => p.quote_site_delivery_address1 === inputValue);
                              if (!matched) {
                                setData(prev => ({
                                  ...prev,
                                  quote_site_delivery_address1: inputValue,
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
                          //freeSolo
                          options={cityMaster}
                          getOptionLabel={option => (typeof option === "string" ? option : option.city_Name)}
                          isOptionEqualToValue={(option, value) => option?.id === value?.id || option?.name === value?.name}
                          // value={
                          //     customerAddress.find(p => p.city_Name === data.quote_site_delivery_city) ||
                          //     { city_Name: data.quote_site_delivery_city }
                          // }

                          value={
                            data.quote_site_delivery_city === "-" || !data.quote_site_delivery_city
                              ? null
                              : customerAddress.find(p => p.city_Name === data.quote_site_delivery_city) || { city_Name: data.quote_site_delivery_city }
                          }
                          onChange={(event, newValue) => {
                            if (typeof newValue === "string") {
                              setData(prev => ({
                                ...prev,
                                quote_site_delivery_city: newValue,
                                quote_site_delivery_postalcode: "",
                                quote_site_delivery_country: "AU",
                                quote_site_delivery_state: "",
                                quote_master_rack: "",
                              }));
                            } else if (newValue && newValue.city_Name) {
                              setData(prev => ({
                                ...prev,
                                quote_site_delivery_city: newValue.city_Name,
                                quote_site_delivery_postalcode: newValue.city_Pincode || "",
                                quote_site_delivery_country: newValue.city_Country || "AU",
                                quote_site_delivery_state: newValue.city_State || "",
                                quote_master_rack: newValue.city_Rack || "",
                                quote_far_suburb: newValue.city_FarSuburb || false,
                              }));
                            } else {
                              setData(prev => ({
                                ...prev,
                                quote_site_delivery_city: "",
                                quote_site_delivery_postalcode: "",
                                quote_site_delivery_country: "AU",
                                quote_site_delivery_state: "",
                                quote_master_rack: "",
                                quote_far_suburb: false,
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
                          id="quote_site_delivery_postalcode"
                          label="Postal Code"
                          value={data.quote_site_delivery_postalcode === "-" ? "" : data.quote_site_delivery_postalcode}
                          sx={{ width: 220 }}
                          onChange={e => handle(e)}
                          variant="standard"
                        />
                      </Col>
                      <Col md={12}>
                        <TextField
                          disabled
                          helperText="Enter valid country code (Ex:AU)"
                          required
                          id="quote_site_delivery_country"
                          label="Site Country"
                          value={data.quote_site_delivery_country}
                          sx={{ width: 220 }}
                          onChange={e => handle(e)}
                          variant="standard"
                        />
                      </Col>
                      <Col md={12}>
                        <TextField
                          disabled
                          select
                          required
                          name="quote_site_delivery_state"
                          id="quote_site_delivery_state"
                          variant="standard"
                          label="Site State"
                          SelectProps={{ value: data.quote_site_delivery_state, onChange: handleFieldChange }}
                        >
                          {stateList.map(stateList => (
                            <MenuItem key={stateList.value} value={stateList.value}>
                              {stateList.label}
                            </MenuItem>
                          ))}
                        </TextField>
                      </Col>
                    </>
                  ) : null}
                  {data.quote_delivery_address_mode === "2" ? (
                    <>
                      <Col md={12}>
                        <Autocomplete
                          freeSolo
                          options={attentionPerson}
                          getOptionLabel={option => (typeof option === "string" ? option : option.name)}
                          isOptionEqualToValue={(option, value) => option?.id === value?.id || option?.name === value?.name}
                          value={attentionPerson.find(p => p.name === data.quote_site_delivery_attention_person) || { name: data.quote_site_delivery_attention_person }}
                          onChange={(event, newValue) => {
                            if (typeof newValue === "string") {
                              setData(prev => ({
                                ...prev,
                                quote_site_delivery_attention_person: newValue,
                                quote_site_delivery_attention_contact: "",
                              }));
                            } else if (newValue && newValue.name) {
                              setData(prev => ({
                                ...prev,
                                quote_site_delivery_attention_person: newValue.name,
                                quote_site_delivery_attention_contact: newValue.phone || "",
                              }));
                            } else {
                              setData(prev => ({
                                ...prev,
                                quote_site_delivery_attention_person: "",
                                quote_site_delivery_attention_contact: "",
                              }));
                            }
                          }}
                          onInputChange={(event, inputValue, reason) => {
                            if (reason === "input") {
                              const matchedPerson = attentionPerson.find(p => p.name === inputValue);
                              if (!matchedPerson) {
                                setData(prev => ({
                                  ...prev,
                                  quote_site_delivery_attention_person: inputValue,
                                  quote_site_delivery_attention_contact: "",
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
                          id="quote_site_delivery_attention_contact"
                          name="quote_site_delivery_attention_contact"
                          label="Attention Contact"
                          value={data.quote_site_delivery_attention_contact}
                          variant="standard"
                          sx={{ width: 220 }}
                          inputProps={{
                            inputMode: "numeric",
                            pattern: "[0-9 ]*",
                            maxLength: 12,
                          }}
                          onChange={e => {
                            let raw = e.target.value.replace(/\D/g, "");
                            let formatted = "";
                            if (raw === "0") {
                              formatted = "0";
                            } else if (/^04/.test(raw)) {
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
                              formatted = raw;
                            }

                            setData(prev => ({
                              ...prev,
                              quote_site_delivery_attention_contact: formatted,
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
                    <TextField id="quote_inter_department_instruction" label="Internal Instructions" value={data.quote_inter_department_instruction} variant="standard" onChange={e => handle(e)} />
                  </Col>
                  <Col md={12}>
                    <FormControlLabel
                      label="This Quotation Has Flashing"
                      labelPlacement="start"
                      className="mx-0"
                      name="quote_flashing_checker"
                      control={<Switch checked={data.quote_flashing_checker} onChange={handleFieldChange} />}
                    />
                  </Col>
                  {data.quote_delivery_address_mode === "1" ? (
                    <>
                      <Col md={6}>
                        <FormControlLabel
                          label="Far Suburb"
                          disabled
                          labelPlacement="start"
                          className="mx-0"
                          name="quote_far_suburb"
                          control={<Switch checked={data.quote_far_suburb} onChange={handleFieldChange} />}
                        />
                      </Col>
                    </>
                  ) : (
                    ""
                  )}

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

export default FormOrder;
