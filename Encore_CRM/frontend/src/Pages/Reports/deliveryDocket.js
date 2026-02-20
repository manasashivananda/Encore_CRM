import React, { useState, useCallback } from "react";
import { useDispatch } from "react-redux";
import { setFilters } from "../../store/orderReportSlice";
import { Link, useNavigate } from "react-router-dom";
import { TextField, MenuItem, Button, TextareaAutosize, IconButton } from "@mui/material";
import { IoMdArrowBack } from "react-icons/io";
import { Row, Col } from "react-bootstrap";
import { HeadingTwo, MyDiv, SpanTag } from "../Common/Components";
import { DateTime } from "luxon";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterLuxon } from "@mui/x-date-pickers/AdapterLuxon";
import axios from "axios";
import swal from "sweetalert2";
import { FiLoader } from "react-icons/fi";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function DeliveryDocket() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [selectedMode, setSelectedMode] = useState("");
  const [dateFilter, setDateFilter] = useState(DateTime.now().toISODate());
  const [orderNumber, setOrderNumber] = useState("");
  const [range, setRange] = useState({ from: "", to: "" });
  const [groupOrders, setGroupOrders] = useState("");
  const handleModeChange = event => {
    const { value } = event.target;
    setSelectedMode(value);
    dispatch(setFilters({ mode: value }));
  };
  const [loading, setLoading] = useState(false);
  const loadFilterOrdersExport = useCallback(async () => {
    setLoading(true);
    const startDate = DateTime.fromISO(dateFilter).set({ hour: 0, minute: 0, second: 0, millisecond: 0 });
    const endDate = DateTime.fromISO(dateFilter).set({ hour: 23, minute: 59, second: 59, millisecond: 999 });
    const toAEST = date => date.setZone("Australia/Sydney", { keepLocalTime: true }).toUTC();
    const fromTimeUTC = toAEST(startDate).toISO();
    const toTimeUTC = toAEST(endDate).toISO();
    let url = `${API_BASE_URL}generate-docket-pdf-docketwise?mode=${selectedMode}`;
    if (selectedMode === "individual-order") {
      url += `&orderUID=${orderNumber}`;
    } else if (selectedMode === "range") {
      url += `&fromOrder=${range.from}&toOrder=${range.to}`;
    } else if (selectedMode === "group-orders") {
      const formattedOrders = groupOrders
        .split("\n")
        .map(order => order.trim())
        .filter(order => order);
      url += `&groupOrders=${encodeURIComponent(formattedOrders.join(","))}`;
    } else {
      url += `&fromTime=${fromTimeUTC}&toTime=${toTimeUTC}`;
    }
    try {
      const response = await axios.get(url, {
        headers: {
          "x-access-token": localStorage.getItem("token"),
          Accept: "application/json",
          "Content-Type": "application/json",
        },
      });
      if (response.status === 200) {
        const filePath = response.data;
        if (filePath) {
          const pdfUrl = `${API_BASE_URL}${filePath}`;
          window.open(pdfUrl, "_blank");
          swal.fire({ text: "Successfully Exported", icon: "success" });
        } else {
          swal.fire({ text: "No data to export", icon: "info" });
        }
      }
    } catch (error) {
      swal.fire({ text: error.response?.data || "Error exporting", icon: "error" });
    } finally {
      setLoading(false);
    }
  }, [dateFilter, selectedMode, orderNumber, range, groupOrders]);

  return (
    <React.Fragment>
      <Row className="GeneralHeading withBackArrow">
        <Col md={6}>
          <HeadingTwo>
            <Link className="arrow-btn" onClick={() => navigate(-1)}>
              <IoMdArrowBack />
            </Link>
            Delivery Docket
          </HeadingTwo>
        </Col>
      </Row>
      {loading ? (
        <MyDiv className="BulkUploadLoader">
          <SpanTag>
            <IconButton aria-label="fingerprint" color="info" className="IconBtnLoader">
              <FiLoader />
            </IconButton>
            <br />
            Generating PDF Dockets
            <br /> Please Wait. Don't Press Back or Refresh. <br /> This Process May Take Some Seconds to Complete
          </SpanTag>
        </MyDiv>
      ) : (
        <Row>
          <Col md={12}>
            <MyDiv className="searchBar GeneralHeading mt-2 d-block">
              <Row>
                <Col md={2}>
                  <TextField select variant="outlined" size="small" label="Select Mode" name="mode" className="form-control" value={selectedMode} onChange={handleModeChange}>
                    <MenuItem value="created-date">Created Date</MenuItem>
                    <MenuItem value="promised-date">Promised Date</MenuItem>
                    <MenuItem value="pickup-created-date">Pickup orders - By Created Date</MenuItem>
                    <MenuItem value="pickup-promised-date">Pickup orders - By Promised Date</MenuItem>
                    <MenuItem value="individual-order">Individual Order</MenuItem>
                    <MenuItem value="range">Range</MenuItem>
                    <MenuItem value="group-orders">Group of Orders</MenuItem>
                  </TextField>
                </Col>
                {(selectedMode === "created-date" || selectedMode === "promised-date" || selectedMode === "pickup-created-date" || selectedMode === "pickup-promised-date") && (
                  <Col md={2} className="SearchTextBox dateRangePicker">
                    <LocalizationProvider dateAdapter={AdapterLuxon}>
                      <DatePicker
                        label="Date"
                        slotProps={{ textField: { size: "small" } }}
                        value={DateTime.fromISO(dateFilter)}
                        onChange={newValue => setDateFilter(newValue.toISODate())}
                        renderInput={params => <TextField {...params} fullWidth size="small" />}
                      />
                    </LocalizationProvider>
                  </Col>
                )}
                {selectedMode === "individual-order" && (
                  <Col md={2} className="SearchTextBox">
                    <TextField label="Enter Full Order No" variant="outlined" size="small" value={orderNumber} onChange={e => setOrderNumber(e.target.value)} />
                  </Col>
                )}
                {selectedMode === "range" && (
                  <>
                    <Col md={2}>
                      <TextField label="From Order No" variant="outlined" size="small" value={range.from} onChange={e => setRange(prev => ({ ...prev, from: e.target.value }))} />
                    </Col>
                    <Col md={2}>
                      <TextField label="To Order No" variant="outlined" size="small" value={range.to} onChange={e => setRange(prev => ({ ...prev, to: e.target.value }))} />
                    </Col>
                  </>
                )}
                {selectedMode === "group-orders" && (
                  <Col md={4}>
                    <TextareaAutosize
                      minRows={3}
                      label="Enter order numbers in individual rows"
                      value={groupOrders}
                      onChange={e => setGroupOrders(e.target.value)}
                      style={{ width: "100%", padding: "8px" }}
                    />
                  </Col>
                )}
                <Col>
                  <Button className="primary-btn" onClick={loadFilterOrdersExport}>
                    Download
                  </Button>
                </Col>
              </Row>
            </MyDiv>
          </Col>
        </Row>
      )}
    </React.Fragment>
  );
}

export default DeliveryDocket;
