import React, { useState, useEffect } from 'react';
import { HeadingFour, MyDiv } from "../../Common/Components";
import { Row, Col, Card, Spinner, Button } from "react-bootstrap";
import { TextField, MenuItem, Switch, Autocomplete } from '@mui/material';
import axios from 'axios';
import swal from "sweetalert2";
import { rackList, orderTypes } from '../../Common/staticjson';
import FormControlLabel from '@mui/material/FormControlLabel';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { DatePicker } from '@mui/x-date-pickers';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function FormOrder({ handleClose, rowData }) {
    const [btnLoading, setBtnLoading] = useState(false);

    const [data, setData] = useState({
        order_number:'',
        order_customer_name: '',
        order_customer_po_number: '',
        order_delivery_date: '',
        order_delivery_time: '',
        order_delivery_session: '',
        order_crane_lift_checker: false,
        order_master_rack: '',
        order_overall_price: '',
        order_city: '',
        order_postal_code: '',
        order_delivery_address: '',
        order_loaders_info: '',
        order_drivers_info: '',
        order_length: '',
        order_type: 'External'
    })

        //CustomloadCityMaster Date Picker
    const [customTime, setCustomTime] = useState({ hour: "", minute: "00", meridian: "AM", timeSession: "" });
    const hours = ["12", "06", "07", "08", "09", "10", "11", "01", "02", "03", "04", "05",];
    const minutes = ["00", "15", "30", "45"];
    const meridians = ["AM", "PM"];
    const session = ["B4", "Aft"];

    useEffect(() => {
        if (rowData?._id) {
             if (rowData.order_delivery_time) {
                const [timePart, meridian] = rowData.order_delivery_time.split(" ");
                const [hour, minute] = timePart.split(".");
                setCustomTime({
                hour: hour?.padStart(2, "0") || "12",
                minute: minute?.padStart(2, "0") || "00",
                meridian: meridian || "AM",
                timeSession: rowData.order_delivery_session || "",
                });
            } else {
                setCustomTime({
                hour: "12",
                minute: "00",
                meridian: "AM",
                timeSession: rowData.order_delivery_session || "",
                });
            }
            setData(rowData);
        }
        loadCityMaster();
    }, [rowData]);


    function handle(e) {
        const newData = { ...data };
        newData[e.target.id] = e.target.value;
        setData(newData);
    }
    const handleFieldChange = event => {
        setData(data => ({
            ...data,
            [event.target.name]:
                event.target.type === "checkbox"
                    ? event.target.checked
                    : event.target.value
        }));
    };
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
        data.order_delivery_date = mergedDateTime.toDate().toUTCString();
        data.order_delivery_time = `${customTime.hour}.${customTime.minute} ${customTime.meridian}`;
        data.order_delivery_session = customTime.timeSession || "";

        // Append all fields to FormData
        for (const key in data) { formData.append(key, data[key]); }
        // API call setup
        const url = rowData?._id ? `${API_BASE_URL}update-ext-order/${rowData?._id}` : `${API_BASE_URL}add-ext-order`;
        const method = rowData?._id ? 'patch' : 'post';
        axios({
            method, url, data: formData,
            headers: { "x-access-token": localStorage.getItem("token"), 'Accept': 'application/json', 'Content-Type': 'application/json' }
        })
            .then((res) => {
                if (res.status === 200) {
                    swal.fire({ text: "Successfully Saved", icon: "success", type: "success" });
                    handleClose(res.status);
                }
                setBtnLoading(false);
            })
            .catch((error) => {
                const errorMessages = error?.response?.data?.errors?.join('\n') || error?.response?.data;
                swal.fire({ text: errorMessages, icon: "error", type: "error" });
                setBtnLoading(false);
            });
    };



    const handleDateChange = (newDate) => {
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
                    <Card.Header style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <HeadingFour className="card-title">
                            {rowData?._id ? "Edit" : "Add"} Order
                        </HeadingFour>
                        {rowData?._id && 
                            <HeadingFour className="card-title">
                                {data.order_number}
                            </HeadingFour>
                        }
                    </Card.Header>
                    <Card.Body>
                        <MyDiv className="DrawerForm">
                            <form onSubmit={(e) => submit(e)}>
                                <Row className="DrawerFormField">
                                    {!rowData?._id &&
                                    <Col md={12}>
                                        <TextField select name="order_type" id="order_type" variant="standard" label="Order Type" SelectProps={{ value: data.order_type, onChange: handleFieldChange }} >
                                            {orderTypes.map((item) => (
                                                <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>
                                            ))}
                                        </TextField>
                                    </Col>
                                    }
                                    {(data.order_type !== "Pickup" && !rowData?._id) &&
                                        <Col md={12}>
                                            <TextField required id="order_number" label="Order Number" value={data.order_number} onChange={(e) => handle(e)} variant="standard" />
                                        </Col>
                                    }
                                    <Col md={12}>
                                        <TextField required id="order_customer_name" label="Customer Name" value={data.order_customer_name} onChange={(e) => handle(e)} variant="standard" />
                                    </Col>
                                    <Col md={12}>
                                        <TextField required id="order_customer_po_number" label="Customer Po Number" value={data.order_customer_po_number} onChange={(e) => handle(e)} variant="standard" />
                                    </Col>
                                    <LocalizationProvider dateAdapter={AdapterDayjs}>
                                        <Col md={12}>
                                            <DatePicker label="Delivery Date" format="DD-MM-YYYY" required disablePast value={dayjs(data.order_delivery_date).tz("Australia/Sydney")} onChange={handleDateChange} slotProps={{ textField: { variant: "standard", required: true } }} />
                                        </Col>
                                    </LocalizationProvider>
                                    <Col md={12} className="d-flex align-items-end gap-2">
                                        <TextField required select label="Hour" value={customTime.hour} onChange={(e) => setCustomTime(prev => ({ ...prev, hour: e.target.value }))} variant="standard" >
                                            {hours.map(h => (
                                                <MenuItem key={h} value={h}>{h}</MenuItem>
                                            ))}
                                        </TextField>
                                        <TextField required select label="Minute" value={customTime.minute} onChange={(e) => setCustomTime(prev => ({ ...prev, minute: e.target.value }))} variant="standard" >
                                            {minutes.map(m => (
                                                <MenuItem key={m} value={m}>{m}</MenuItem>
                                            ))}
                                        </TextField>
                                        <TextField required select label="AM/PM" value={customTime.meridian} onChange={(e) => setCustomTime(prev => ({ ...prev, meridian: e.target.value }))} variant="standard"   >
                                            {meridians.map(m => (
                                                <MenuItem key={m} value={m}>{m}</MenuItem>
                                            ))}
                                        </TextField>
                                        <TextField select label="Before/After" value={customTime?.timeSession}
                                            onChange={(e) => setCustomTime(prev => ({ ...prev, timeSession: e.target.value || "" }))} variant="standard" >
                                            <MenuItem value="">Select</MenuItem>
                                            {session.map(m => (<MenuItem key={m} value={m}>{m}</MenuItem>))}
                                        </TextField>
                                    </Col>
                                    <Col md={12}>
                                        <TextField required id="order_delivery_address" label="Delivery Address" value={data.order_delivery_address} onChange={(e) => handle(e)} variant="standard" />
                                    </Col>
                                    <Col md={12}>
                                        <Autocomplete
                                            options={cityMaster}
                                            getOptionLabel={option => (typeof option === "string" ? option : option.city_Name)}
                                            isOptionEqualToValue={(option, value) => option?.city_Name === value?.city_Name}
                                            value={cityMaster.find(p => p.city_Name === data.order_city) || null}
                                            onChange={(event, newValue) => {
                                            if (newValue?.city_Name) {
                                                setData(prev => ({
                                                ...prev,
                                                order_city : newValue.city_Name,
                                                order_postal_code: newValue.city_Pincode || "",
                                                order_master_rack: newValue.city_Rack || ""
                                                }));
                                            } else {
                                                setData(prev => ({
                                                ...prev,
                                                order_city: "",
                                                order_postal_code: "",
                                                order_master_rack: "",
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
                                        <TextField helperText="Enter valid postal code (Ex:3026)" required id="order_postal_code" label="Postal Code" value={data.order_postal_code} disabled={true} onChange={(e) => handle(e)} variant="standard" />
                                    </Col>
                                    {/* <Col md={12}>
                                        <TextField helperText="Enter valid country code (Ex:AU)" disabled required id="order_country" label="Country" value={data.order_country} onChange={(e) => handle(e)} variant="standard" />
                                    </Col> */}
                                    {/* <Col md={12}>
                                        <TextField helperText="Enter valid state (Ex:VIC)" disabled required id="order_state" label="State" value={data.order_state} onChange={(e) => handle(e)} variant="standard" />
                                    </Col> */}
                                    <Col md={12}>
                                        <TextField select name="order_master_rack" id="order_master_rack" variant="standard" label="Master Rack" SelectProps={{ value: data.order_master_rack, onChange: handleFieldChange }} >
                                            {rackList.map((rackList) => (
                                                <MenuItem key={rackList.value} value={rackList.value}>{rackList.label}</MenuItem>
                                            ))}
                                        </TextField>
                                    </Col>
                                    <Col md={12}>
                                        <TextField required id="order_length" label="Order Length" value={data.order_length}  onChange={(e) => handle(e)} variant="standard" />
                                    </Col>
                                    <Col md={12}>
                                        <TextField required id="order_overall_price" label="Overall Price" value={data.order_overall_price}  onChange={(e) => handle(e)} variant="standard" />
                                    </Col>
                                    <Col md={6}>
                                        <FormControlLabel label="Crane Lift" labelPlacement="start" className="mx-0" name="order_crane_lift_checker" control={<Switch checked={data.order_crane_lift_checker} onChange={handleFieldChange} />} />
                                    </Col>
                                    <Col md={12}>
                                        <TextField id="order_loaders_info" label="Loaders Info" value={data.order_loaders_info} variant="standard" onChange={(e) => handle(e)} />
                                    </Col>
                                    <Col md={12}>
                                        <TextField id="order_drivers_info" label="Drivers Info" value={data.order_drivers_info} variant="standard" onChange={(e) => handle(e)} />
                                    </Col>

                                    <Col md={12} className="text-end">
                                        {btnLoading ? (
                                            <Button variant="primary" disabled className='mt-4 w-100'>
                                                <Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" className='mx-2' />
                                                Please Wait...
                                            </Button>
                                        ) : (
                                            <button type="submit" className="FormBtn">Submit</button>
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
