import React, { useState, useEffect, useCallback, useRef } from "react";
import { HeadingFour, MyDiv } from "../Common/Components";
import { Row, Col, Card, Spinner, Button } from "react-bootstrap";
import { TextField, MenuItem, Autocomplete, Switch, FormControlLabel } from "@mui/material";
import axios from "axios";
import swal from "sweetalert2";
import { useParams } from "react-router-dom";

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL;


function FormCustomQuoteItem({ handleClose, userInfo, customerId, handleOrderItemsUpdated }) {
  const [customItem, setCustomItem] = useState([]);
  const [department, setDepartment] = useState([]);
  const [btnLoading, setBtnLoading] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [rows, setRows] = useState([]);
  const [showGrid, setShowGrid] = useState(false);
  const descriptionRef = useRef(null);
  const addPiecesRef = useRef(null);
  const [showDiscount, setShowDiscount] = useState(false);

  let { id } = useParams();
  let quoteId = userInfo ? userInfo._id : "";
  const [data, setData] = useState({
    quote_item_me_code: [],
    quote_item_me_description: "",
    quote_item_me_department: "",
    quote_item_me_length: "1",
    quote_item_me_uom: "",
    quote_item_me_uom_value: "1",
    quote_item_qty_me_price: "",
    quote_item_me_discount: "0",
    quote_item_me_quantity: "1",
  });
  useEffect(() => {
    if (userInfo !== undefined) {
      const loadSpecificOrderItem = async () => {
        const url = API_BASE_URL + `fetch-specific-manual-entry-quotation-item/${quoteId}/${customerId}`;
        axios.get(url, { headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" } }).then(
          res => {
            setData(res.data[0]);
            if (parseFloat(res.data[0].quote_item_me_discount) > 0) {
              setShowDiscount(true);
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
      loadSpecificOrderItem();
    }
    loadDepartment();
  }, [customerId, quoteId, userInfo]);
  const handleFieldChange = event => {
    const { name, value } = event.target;

    if (name === "quote_item_me_department") {
      setRows([]);
      setShowGrid(false);
      setShowDiscount(false);

      setData(prev => ({
        ...prev,
        [name]: value,
        quote_item_me_uom_value: "1",
        quote_item_me_length: "1",
        quote_item_me_quantity: "1",
      }));
      return;
    }
    if ((name === "quote_item_me_uom_value" || name === "quote_item_me_length") && (data.quote_item_me_department === process.env.REACT_APP_GBIDepartmentId || data.quote_item_me_department === process.env.REACT_APP_GBILDepartmentId)) {
      const updated = {
        ...data,
        [name]: value,
      };

      const pieces = parseFloat(updated.quote_item_me_uom_value || "0");
      const length = parseFloat(updated.quote_item_me_length || "0");
      const quantity = !isNaN(pieces) && !isNaN(length) ? (pieces * length).toFixed(3) : "";

      setData({
        ...updated,
        quote_item_me_quantity: quantity,
      });
      return;
    }

    setData(prev => ({
      ...prev,
      [name]: event.target.type === "checkbox" ? event.target.checked : value,
    }));
  };

  const cancelToken = useRef(null);

  const loadCustomItem = useCallback(async () => {
    if (cancelToken.current) {
      cancelToken.current.cancel("Operation canceled due to new request.");
    }
    const source = axios.CancelToken.source();
    cancelToken.current = source;
    try {
      const url = `${API_BASE_URL}fetch-custom-product-data-on-entry/${customerId}?query=${inputValue}`;
      const response = await axios.get(url, { headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" }, cancelToken: source.token });
      setCustomItem(response.data);
    } catch (error) {
      console.log(error);
    }
  }, [customerId, inputValue]);

  useEffect(() => {
    if (inputValue !== "") {
      loadCustomItem();
    }
  }, [inputValue, loadCustomItem]);

  const loadDepartment = async () => {
    const url = API_BASE_URL + `fetch-department-data`;
    axios.get(url, { headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" } }).then(
      res => {
        setDepartment(res.data);
      },
      error => {
        console.log(error);
      }
    );
  };

  const handleChangeWhiteSpace = e => {
    const { id, value } = e.target;
    const updatedData = {
      ...data,
      [id]: value,
    };

    if ((id === "quote_item_me_uom_value" || id === "quote_item_me_length") && (data.quote_item_me_department === process.env.REACT_APP_GBIDepartmentId || data.quote_item_me_department === process.env.REACT_APP_GBILDepartmentId)) {
      const pieces = parseFloat(id === "quote_item_me_uom_value" ? value : updatedData.quote_item_me_uom_value);
      const length = parseFloat(id === "quote_item_me_length" ? value : updatedData.quote_item_me_length);
      const quantity = !isNaN(pieces) && !isNaN(length) ? pieces * length : "";
      updatedData.quote_item_me_quantity = quantity;
    }

    setData(updatedData);
  };

  const handleSaveAndAddNew = async e => {
    e.preventDefault();
    setBtnLoading(true);
    if (!validateForm() || !validateRows()) {
      swal.fire({
        text: "Please fill all required fields correctly.",
        icon: "error",
      });
      setBtnLoading(false);
      return;
    }
    const nonEmptyRows = rows.filter(row => row.pieces.trim() || row.length.trim());
    const updatedData = {
      ...data,
      quote_item_me_code: data.quote_item_me_code || customItem?.custom_Product_Code || "",
      additionalRows: nonEmptyRows,
      quote_item_me_discount: showDiscount ? data.quote_item_me_discount : "0",
    };
    const url = quoteId ? API_BASE_URL + "update-manual-entry-quotation-item/" + quoteId : API_BASE_URL + "add-manual-entry-quotation-item/" + id;
    const method = quoteId ? "patch" : "post";

    try {
      const res = await axios({ method, url, data: updatedData, headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" } });
      if (res.status === 200) {
        swal.fire({ text: "Successfully Saved", icon: "success", type: "success", timer: 1000, showConfirmButton: false });
        setRows([]);
        setData({ ...data, quote_item_me_code: "", quote_item_me_description: "", quote_item_me_length: "", quote_item_me_uom: "", quote_item_me_uom_value: "", quote_item_qty_me_price: "" });
        handleOrderItemsUpdated();
        setShowGrid(false);
      }
    } catch (error) {
      swal.fire({ text: error.response.data, icon: "error", type: "error" });
    } finally {
      setBtnLoading(false);
    }
  };

  const handleSaveAndCopy = async e => {
    e.preventDefault();
    setBtnLoading(true);

    if (!validateRows()) {
      swal.fire({
        text: "Please fill all required fields in the rows.",
        icon: "error",
      });
      return;
    }
    const nonEmptyRows = rows.filter(row => row.pieces.trim() || row.length.trim());
    const updatedData = {
      ...data,
      quote_item_me_code: data.quote_item_me_code || customItem?.custom_Product_Code || "",
      additionalRows: nonEmptyRows,
      quote_item_me_discount: showDiscount ? data.quote_item_me_discount : "0",
    };
    const url = quoteId ? API_BASE_URL + "update-manual-entry-quotation-item/" + quoteId : API_BASE_URL + "add-manual-entry-quotation-item/" + id;
    const method = quoteId ? "patch" : "post";

    try {
      const res = await axios({ method, url, data: updatedData, headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" } });
      if (res.status === 200) {
        swal.fire({ text: "Successfully Saved", icon: "success", type: "success", timer: 1000, showConfirmButton: false });
        setRows([]);
        setData({ ...data, quote_item_me_length: "", quote_item_me_uom_value: "" });
        handleOrderItemsUpdated();
      }
      setShowGrid(false);
    } catch (error) {
      swal.fire({ text: error.response.data, icon: "error", type: "error" });
    } finally {
      setBtnLoading(false);
    }
  };

  function submit(e) {
    e.preventDefault();
    setBtnLoading(true);
    if (!validateForm() || !validateRows()) {
      setBtnLoading(false);
      swal.fire({
        text: "Please fill all required fields correctly.",
        icon: "error",
      });
      return;
    }
    const nonEmptyRows = rows.filter(row => row.pieces.trim() || row.length.trim());
    const updatedData = {
      ...data,
      quote_item_me_code: data.quote_item_me_code || customItem?.custom_Product_Code || "",
      additionalRows: nonEmptyRows,
      quote_item_me_discount: showDiscount ? data.quote_item_me_discount : "0",
    };
    const url = quoteId ? API_BASE_URL + "update-manual-entry-quotation-item/" + quoteId : API_BASE_URL + "add-manual-entry-quotation-item/" + id;
    const method = quoteId ? "patch" : "post";
    axios({ method, url, data: updatedData, headers: { "x-access-token": localStorage.getItem("token"), Accept: "application/json", "Content-Type": "application/json" } })
      .then(res => {
        if (res.status === 200) {
          swal.fire({
            text: "Successfully Saved",
            icon: "success",
            type: "success",
            timer: 1000,
            showConfirmButton: false,
          });
          handleClose();
        }
        setBtnLoading(false);
      })
      .catch(error => {
        swal.fire({
          text: error.response.data,
          icon: "error",
          type: "error",
        });
        setBtnLoading(false);
      });
  }

  const handleCustomItemChange = (event, selectedOption) => {
    if (selectedOption) {
      setData(prevData => ({
        ...prevData,
        quote_item_me_code: selectedOption.custom_Product_Code || "",
        quote_item_me_description: selectedOption.custom_Product_Description,
        quote_item_qty_me_price: selectedOption.custom_Product_Price,
        quote_item_me_uom: selectedOption.custom_Product_UOM,
      }));
    } else {
      setData(prevData => ({
        ...prevData,
        quote_item_me_code: "",
        quote_item_me_description: "",
        quote_item_qty_me_price: "",
        quote_item_me_uom: "",
      }));
    }
  };

  const [rowErrors, setRowErrors] = useState([]);
  const handleRowChange = (index, field, value) => {
    setRows(prevRows => prevRows.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
    setRowErrors(prevErrors => {
      const updatedErrors = Array.isArray(prevErrors) ? [...prevErrors] : [];
      if (!updatedErrors[index]) {
        updatedErrors[index] = {};
      }
      if (field === "pieces") {
        updatedErrors[index].pieces = "";
        updatedErrors[index].length = value.trim() !== "" && !rows[index]?.length?.trim() ? "This field is required" : "";
      }
      if (field === "length") {
        updatedErrors[index].length = value.trim() === "" && rows[index]?.pieces.trim() !== "" ? "This field is required" : "";
      }
      return updatedErrors;
    });
  };

  const validateRows = () => {
    const errors = rows.map(row => ({
      pieces: "",
      length: row.pieces.trim() !== "" && row.length.trim() === "" ? "This field is required" : "",
    }));
    setRowErrors(errors);
    return errors.every(error => !error.length);
  };
  const rowRefs = useRef([]);

  const handleAddRows = () => {
    setShowGrid(true);
    setRows(prevRows => {
      const lastId = prevRows.length ? prevRows[prevRows.length - 1].id : 1;
      const newRows = Array.from({ length: 5 }, (_, i) => ({
        id: lastId + i + 1,
        pieces: "",
        length: "",
      }));

      setTimeout(() => {
        if (rowRefs.current[prevRows.length]) {
          rowRefs.current[prevRows.length].focus();
        }
      }, 0);

      return [...prevRows, ...newRows];
    });
  };

  const validateForm = () => {
    const errors = {};

    if (!data.quote_item_me_department) errors.quote_item_me_department = "Department is required";
    if (!data.quote_item_me_code || data.quote_item_me_code.length === 0) errors.quote_item_me_code = "Inventory ID is required";
    if (!data.quote_item_me_description) errors.quote_item_me_description = "Description is required";
    if (!data.quote_item_me_uom_value || isNaN(data.quote_item_me_uom_value) || data.quote_item_me_uom_value <= 0) errors.quote_item_me_uom_value = "Valid Pieces are required";
    if (!data.quote_item_me_length || isNaN(data.quote_item_me_length) || data.quote_item_me_length <= 0) errors.quote_item_me_length = "Valid Length is required";
    if (!data.quote_item_me_uom) errors.quote_item_me_uom = "Units Of Measurement is required";
    setRowErrors(errors);

    return Object.keys(errors).length === 0;
  };

  return (
    <MyDiv className="DrawerRight">
      <MyDiv className="grid-margin general-form stretch-card">
        <Card md={12}>
          <Card.Header>
            <HeadingFour className="card-title">{userInfo ? "Edit" : "Add"} Custom Order Item</HeadingFour>
          </Card.Header>
          <Card.Body>
            <MyDiv className="DrawerForm">
              <form>
                <Row className="DrawerFormField">
                  <Col md={12}>
                    <TextField select required name="quote_item_me_department" id="quote_item_me_department" variant="standard" label="Department" SelectProps={{ multiple: false, value: data.quote_item_me_department, onChange: handleFieldChange }}>
                      {department.length ? (
                        department.map(depart => (
                          <MenuItem key={depart._id} value={depart._id}>
                            {depart.department_name}
                          </MenuItem>
                        ))
                      ) : (
                        <MenuItem>You don't have customer access or Department empty</MenuItem>
                      )}
                    </TextField>
                  </Col>
                  <Col md={12}>
                    <Autocomplete
                      disablePortal
                      options={customItem}
                      getOptionLabel={option => (typeof option === "string" ? option : option.custom_Product_Code || "")}
                      isOptionEqualToValue={(option, value) => (typeof value === "string" ? option.custom_Product_Code === value : option.custom_Product_Code === value?.custom_Product_Code)}
                      value={customItem.find(item => item.custom_Product_Code === data.quote_item_me_code) || data.quote_item_me_code || null}
                      onChange={(event, newValue) => {
                        handleCustomItemChange(event, newValue);
                        setTimeout(() => {
                          descriptionRef.current?.focus();
                        }, 0);
                      }}
                      onInputChange={(event, newInputValue) => {
                        setInputValue(newInputValue);
                      }}
                      renderInput={params => <TextField {...params} label="Inventory ID" required variant="standard" />}
                    />
                  </Col>
                  {data.quote_item_me_department !== process.env.REACT_APP_DeliveryChargeDepartmentId ? (
                    <>
                      <Col md={12}>
                        <TextField required id="quote_item_me_description" label="Description" inputRef={descriptionRef} value={data ? data.quote_item_me_description : ""} variant="standard" onChange={e => handleChangeWhiteSpace(e)} />
                      </Col>
                      <Col md={12}>
                        <TextField
                          id="quote_item_me_uom_value"
                          type="text"
                          required
                          label="Pieces"
                          variant="standard"
                          value={data.quote_item_me_uom_value}
                          inputProps={{ maxLength: 3, inputMode: "numeric", pattern: "[0-9]*" }}
                          onKeyDown={e => {
                            if (["e", "E", "+", "-", "."].includes(e.key)) {
                              e.preventDefault();
                            }
                          }}
                          onChange={e => {
                            const value = e.target.value;
                            if (/^\d{0,3}$/.test(value)) {
                              handleChangeWhiteSpace(e);
                            }
                          }}
                        />
                      </Col>
                      <Col md={12}>
                        <TextField
                          id="quote_item_me_length"
                          type="text"
                          required
                          label="Length"
                          value={data.quote_item_me_length}
                          variant="standard"
                          inputProps={{ inputMode: "decimal" }}
                          // onKeyDown={(e) => {
                          //     const invalidKeys = ['e', 'E', '+', '-'];
                          //     if (invalidKeys.includes(e.key)) { e.preventDefault(); }
                          //     if (e.key === 'Tab' && !e.shiftKey && !userInfo) {
                          //         e.preventDefault();
                          //         setTimeout(() => { addPiecesRef.current?.focus(); }, 0);
                          //     }
                          // }}
                          onKeyDown={e => {
                            const invalidKeys = ["e", "E", "+", "-"];
                            if (invalidKeys.includes(e.key)) {
                              e.preventDefault();
                            }

                            const isGBIDepartment = data.quote_item_me_department === process.env.REACT_APP_GBIDepartmentId;
                            const isGBILDepartment = data.quote_item_me_department === process.env.REACT_APP_GBILDepartmentId;

                            if (e.key === "Tab" && !e.shiftKey && !userInfo && !isGBIDepartment && !isGBILDepartment) {
                              e.preventDefault();
                              setTimeout(() => {
                                addPiecesRef.current?.focus();
                              }, 0);
                            }
                          }}
                          onChange={e => {
                            let value = e.target.value;
                            if (value.startsWith(".")) {
                              value = "0" + value;
                            }
                            const regex = /^\d{0,2}(\.\d{0,3})?$/;
                            if (regex.test(value) || value === "") {
                              e.target.value = value;
                              handleChangeWhiteSpace(e);
                            }
                          }}
                        />
                      </Col>
                      {/* Grid for Additional Rows */}
                      {showGrid && (
                        <Col md={12}>
                          <table className="table">
                            <thead>
                              <tr>
                                <th>S.No</th>
                                <th>Pieces</th>
                                <th>Length</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rows.map((row, index) => (
                                <tr key={row.id}>
                                  <td>{row.id}</td>
                                  <td>
                                    <TextField
                                      value={row.pieces}
                                      type="text"
                                      inputRef={el => (rowRefs.current[index] = el)}
                                      inputProps={{ maxLength: 3, inputMode: "numeric", pattern: "[0-9]*" }}
                                      onKeyDown={e => {
                                        if (["e", "E", "+", "-", "."].includes(e.key)) {
                                          e.preventDefault();
                                        }
                                      }}
                                      onChange={e => {
                                        const value = e.target.value;
                                        if (/^\d{0,3}$/.test(value)) {
                                          handleRowChange(index, "pieces", value);
                                        }
                                      }}
                                      variant="standard"
                                      error={!!rowErrors[index]?.pieces}
                                      helperText={rowErrors[index]?.pieces}
                                    />
                                  </td>
                                  <td>
                                    <TextField
                                      value={row.length}
                                      type="text"
                                      inputProps={{ inputMode: "decimal" }}
                                      onChange={e => {
                                        let value = e.target.value;
                                        if (value.startsWith(".")) {
                                          value = "0" + value;
                                        }
                                        const regex = /^\d{0,2}(\.\d{0,3})?$/;
                                        if (regex.test(value) || value === "") {
                                          handleRowChange(index, "length", value);
                                        }
                                      }}
                                      onKeyDown={e => {
                                        const invalidKeys = ["e", "E", "+", "-"];
                                        if (invalidKeys.includes(e.key)) {
                                          e.preventDefault();
                                        }
                                      }}
                                      variant="standard"
                                      error={!!rowErrors[index]?.length}
                                      helperText={rowErrors[index]?.length}
                                    />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </Col>
                      )}
                      {/* Add More Rows Button */}
                      {data.quote_item_me_department !== process.env.REACT_APP_GBIDepartmentId && data.quote_item_me_department !== process.env.REACT_APP_GBILDepartmentId && !userInfo && (
                        <Col md={12} className="text-end">
                          <button
                            onClick={handleAddRows}
                            type="button"
                            ref={addPiecesRef}
                            tabIndex={0}
                            className="btn cursor-pointer text-danger addPiecesBtn"
                            onKeyDown={e => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleAddRows();
                              }
                            }}>
                            Add Pieces and length
                          </button>
                        </Col>
                      )}
                      <Col md={12}>
                        <TextField disabled required id="quote_item_me_uom" label="Units Of Measurement" value={data.quote_item_me_uom} variant="standard" onChange={e => handleChangeWhiteSpace(e)} />
                      </Col>
                    </>
                  ) : null}
                  {data.quote_item_me_department === process.env.REACT_APP_GBIDepartmentId || data.quote_item_me_department === process.env.REACT_APP_GBILDepartmentId ? (
                    <Col md={12}>
                      <TextField
                        id="quote_item_me_quantity"
                        label="Quantity"
                        value={data ? data.quote_item_me_quantity : ""}
                        variant="standard"
                        inputProps={{
                          inputMode: "decimal",
                          pattern: "^[0-9]*\\.?[0-9]*$",
                        }}
                        onKeyDown={e => {
                          const invalidKeys = ["e", "E", "+", "-"];
                          if (invalidKeys.includes(e.key)) {
                            e.preventDefault();
                          }
                        }}
                        onChange={e => {
                          const value = e.target.value;
                          const regex = /^\d*\.?\d*$/;
                          if (regex.test(value) || value === "") {
                            handleChangeWhiteSpace(e);
                          }
                        }}
                      />
                    </Col>
                  ) : (
                    ""
                  )}
                  <Col md={12}>
                    <TextField
                      required
                      id="quote_item_qty_me_price"
                      label="Unit Price"
                      value={data ? data.quote_item_qty_me_price : ""}
                      variant="standard"
                      inputProps={{
                        inputMode: "decimal",
                        pattern: "^[0-9]*\\.?[0-9]*$",
                      }}
                      onKeyDown={e => {
                        const invalidKeys = ["e", "E", "+", "-"];
                        if (invalidKeys.includes(e.key)) {
                          e.preventDefault();
                        }
                      }}
                      onChange={e => {
                        const value = e.target.value;
                        const regex = /^\d*\.?\d*$/;
                        if (regex.test(value) || value === "") {
                          handleChangeWhiteSpace(e);
                        }
                      }}
                    />
                  </Col>
                  <Col md={12}>
                    <FormControlLabel control={<Switch checked={showDiscount} onChange={() => setShowDiscount(prev => !prev)} name="toggleDiscount" color="primary" />} label="Add Discount" />
                  </Col>
                  {showDiscount && (
                    <Col md={12}>
                      <TextField
                        id="quote_item_me_discount"
                        label="Discount Percentage"
                        value={data.quote_item_me_discount}
                        variant="standard"
                        inputProps={{
                          inputMode: "decimal",
                          pattern: "^\\d{1,3}(\\.\\d{0,2})?$",
                        }}
                        onKeyDown={e => {
                          const invalidKeys = ["e", "E", "+", "-"];
                          if (invalidKeys.includes(e.key)) {
                            e.preventDefault();
                          }
                        }}
                        onChange={e => {
                          let value = e.target.value;
                          const regex = /^\d{0,3}(\.\d{0,2})?$/;
                          if (regex.test(value) || value === "") {
                            const floatVal = parseFloat(value);
                            if (value === "" || (!isNaN(floatVal) && floatVal <= 100)) {
                              handleChangeWhiteSpace(e);
                            }
                          }
                        }}
                      />
                    </Col>
                  )}

                  <Col md={12} className="text-end">
                    {btnLoading ? (
                      <Button variant="primary" disabled className="mt-4 w-100">
                        <span aria-live="polite" className="d-inline-flex align-items-center">
                          <Spinner as="span" animation="border" size="sm" aria-hidden="true" className="mx-2" />
                          <span className="visually-hidden">Please wait...</span>
                        </span>
                      </Button>
                    ) : (
                      <>
                        <Button type="submit" className="FormBtn px-3 me-2" onClick={submit}>
                          Save
                        </Button>
                        {userInfo ? null : (
                          <>
                            <Button type="button" className="FormBtn px-3 me-2" onClick={handleSaveAndAddNew}>
                              Save & Add New
                            </Button>
                            <Button type="button" className="FormBtn px-3 me-2" onClick={handleSaveAndCopy}>
                              Save & Copy
                            </Button>
                          </>
                        )}
                      </>
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
export default FormCustomQuoteItem;
